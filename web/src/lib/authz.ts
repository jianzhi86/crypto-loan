import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getAuthUser } from '@/lib/auth-jwt';

/**
 * Server-side authorization for API routes and server components.
 *
 * SCOPE — READ THIS BEFORE RELYING ON `RESTRICTED`:
 * Everything here is *off-chain* enforcement. It governs what this application
 * will do on a user's behalf: its API routes, its pages, its database. It does
 * NOT and cannot stop a user from calling the CryptoLoan contract directly from
 * their own wallet (MetaMask, cast, a script). The only on-chain levers are the
 * contract's own `onlyOwner` functions — `setKYC`, `pause`, `setEthPrice` — and
 * this admin surface deliberately does not expose the state-changing ones
 * beyond the existing KYC approval flow. On-chain data is read-only here.
 */

/** Normal account. */
export const STATUS_ACTIVE = 'ACTIVE';
/** May sign in and read, but every write route refuses. */
export const STATUS_RESTRICTED = 'RESTRICTED';

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
  walletAddress: string | null;
  isAdmin: boolean;
  status: string;
  statusReason: string | null;
}

export type Guard =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

const deny = (status: number, error: string, extra?: Record<string, unknown>): Guard => ({
  ok: false,
  response: NextResponse.json({ error, ...extra }, { status }),
});

/**
 * Resolve the caller from the auth cookie, then re-read the live user row.
 *
 * The DB round-trip is deliberate: a JWT is a 7-day snapshot, so a suspension
 * or password reset would otherwise not take effect until it expired. Returns
 * null when the token is missing, invalid, points at a deleted user, or was
 * revoked by a sessionEpoch bump.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const payload = await getAuthUser();
  if (!payload?.id) return null;

  const row = await prisma.user.findUnique({
    where: { id: payload.id },
    select: {
      id: true, email: true, name: true, walletAddress: true,
      isAdmin: true, status: true, statusReason: true, sessionEpoch: true,
    },
  });
  if (!row) return null;

  // Tokens minted before session revocation existed carry no epoch; treat as 0
  // so existing sessions survive this deploy instead of all logging out at once.
  if ((payload.epoch ?? 0) !== row.sessionEpoch) return null;

  const { sessionEpoch: _epoch, ...user } = row;
  void _epoch;
  return user;
}

/** Any signed-in, non-revoked user. */
export async function requireUser(): Promise<Guard> {
  const user = await getSessionUser();
  if (!user) return deny(401, 'Unauthorized');
  return { ok: true, user };
}

/**
 * A signed-in user who is allowed to *write*. Use on every mutating route.
 * RESTRICTED users pass requireUser but fail here — that is what "suspended,
 * read-only" means in this app.
 */
export async function requireActiveUser(): Promise<Guard> {
  const guard = await requireUser();
  if (!guard.ok) return guard;
  if (guard.user.status === STATUS_RESTRICTED) {
    return deny(403, 'Your account is restricted — read-only access.', {
      code: 'ACCOUNT_RESTRICTED',
      reason: guard.user.statusReason ?? null,
    });
  }
  return guard;
}

/**
 * Admin only. Note this checks the live DB row, not the JWT claim, so demoting
 * an admin takes effect on their next request rather than in seven days.
 */
export async function requireAdmin(): Promise<Guard> {
  const guard = await requireUser();
  if (!guard.ok) return guard;
  if (!guard.user.isAdmin) return deny(403, 'Forbidden — admin only');
  // An admin who has been restricted keeps read access but loses admin writes;
  // callers that mutate should still be behind requireAdmin + this check.
  if (guard.user.status === STATUS_RESTRICTED) {
    return deny(403, 'Your admin account is restricted — read-only access.', {
      code: 'ACCOUNT_RESTRICTED',
    });
  }
  return guard;
}

export type AuditAction =
  | 'USER_UPDATE'
  | 'USER_RESTRICT'
  | 'USER_UNRESTRICT'
  | 'USER_RESET_PASSWORD'
  | 'USER_RESET_KYC'
  | 'USER_LINK_WALLET'
  | 'USER_UNLINK_WALLET'
  | 'USER_CLEAR_BANK'
  | 'USER_SET_ADMIN'
  | 'KYC_APPROVE'
  | 'KYC_DELETE'
  | 'FLAG_UPDATE'
  | 'PRICE_SYNC';

/**
 * Append an entry to the admin audit trail. Never throws — an audit write
 * failing must not roll back or mask the action the admin actually took, so
 * failures are logged to the server console and swallowed.
 */
export async function audit(
  actor: SessionUser,
  action: AuditAction,
  targetType: 'user' | 'kyc' | 'flag' | 'system',
  targetId: string,
  detail?: unknown,
): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorId: actor.id,
        actorEmail: actor.email,
        action,
        targetType,
        targetId,
        detail: detail === undefined ? null : JSON.stringify(detail),
      },
    });
  } catch (err) {
    console.error('[audit] failed to record', action, targetId, err);
  }
}
