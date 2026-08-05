import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin, audit, STATUS_ACTIVE, STATUS_RESTRICTED, type SessionUser } from '@/lib/authz';
import { setKycOnChain, isKycOnChain, getOnChainPosition } from '@/lib/kyc/chain';

/**
 * Admin operations on a single user.
 *
 * Everything here is off-chain. None of it touches the CryptoLoan contract:
 * restricting a user stops this application from acting for them, but their
 * wallet can still call the contract directly. See lib/authz.ts.
 */

type Ctx = { params: Promise<{ id: string }> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Human-readable temporary password: 16 URL-safe chars, ~95 bits of entropy. */
function tempPassword(): string {
  return crypto.randomBytes(12).toString('base64url');
}

/** PATCH /api/admin/users/[id] — edit off-chain profile fields. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;

  const body = await req.json() as {
    name?: string | null;
    email?: string | null;
    isAdmin?: boolean;
  };

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, isAdmin: true, walletAddress: true },
  });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const data: { name?: string | null; email?: string | null; isAdmin?: boolean } = {};

  if (body.name !== undefined) data.name = body.name?.trim() || null;

  if (body.email !== undefined) {
    const email = body.email?.trim().toLowerCase() || null;
    if (email && !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }
    // An account must always keep at least one login method — removing the
    // email from a wallet-less account would leave it unreachable.
    if (!email && target.email && !target.walletAddress) {
      return NextResponse.json({
        error: 'Cannot remove the email: this account has no linked wallet, so email is its only login method.',
      }, { status: 409 });
    }
    if (email) {
      const clash = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (clash && clash.id !== id) {
        return NextResponse.json({ error: 'That email is already used by another account' }, { status: 409 });
      }
    }
    data.email = email;
  }

  if (body.isAdmin !== undefined && body.isAdmin !== target.isAdmin) {
    // Guard against an admin removing the last admin and locking everyone out
    // of this panel — there would be no way back in through the UI.
    if (target.isAdmin && !body.isAdmin) {
      const admins = await prisma.user.count({ where: { isAdmin: true } });
      if (admins <= 1) {
        return NextResponse.json({ error: 'Cannot remove the last remaining admin' }, { status: 409 });
      }
    }
    data.isAdmin = body.isAdmin;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, isAdmin: true, status: true },
  });

  // Demotion must take back what the admin bypass granted: an admin's linked
  // wallet holds the on-chain KYC flag with no submission behind it, and no
  // other path ever revokes it. Without this, an ex-admin keeps on-chain
  // borrowing rights forever with zero KYC.
  let chainRevoked = false;
  if (target.isAdmin && data.isAdmin === false && target.walletAddress) {
    const kycRow = await prisma.kycSubmission.findUnique({ where: { userId: id }, select: { status: true } });
    if (kycRow?.status !== 'approved') {
      try {
        const w = target.walletAddress.toLowerCase();
        if (await isKycOnChain(w)) {
          await setKycOnChain(w, false);
          chainRevoked = true;
        }
      } catch (err) {
        console.warn('[admin demote] on-chain KYC revoke failed (continuing):', err);
      }
    }
  }

  await audit(guard.user, data.isAdmin !== undefined ? 'USER_SET_ADMIN' : 'USER_UPDATE', 'user', id, {
    before: target, after: updated, ...(data.isAdmin === false ? { chainRevoked } : {}),
  });

  return NextResponse.json({ user: updated });
}

/**
 * POST /api/admin/users/[id] — run a named action.
 * { action: 'restrict' | 'unrestrict' | 'reset-password' | 'reset-kyc' | 'unlink-wallet' }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;

  const { action, reason } = await req.json() as { action?: string; reason?: string };

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, walletAddress: true, isAdmin: true, status: true },
  });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  switch (action) {
    case 'restrict':      return restrict(guard.user, target, reason ?? '');
    case 'unrestrict':    return unrestrict(guard.user, target);
    case 'reset-password': return resetPassword(guard.user, target);
    case 'reset-kyc':     return resetKyc(guard.user, target);
    case 'unlink-wallet': return unlinkWallet(guard.user, target);
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}

type Target = { id: string; email: string | null; name: string | null; walletAddress: string | null; isAdmin: boolean; status: string };

async function restrict(actor: SessionUser, target: Target, reason: string) {
  if (target.id === actor.id) {
    return NextResponse.json({ error: 'You cannot restrict your own account' }, { status: 409 });
  }
  if (target.isAdmin) {
    const admins = await prisma.user.count({ where: { isAdmin: true, status: STATUS_ACTIVE } });
    if (admins <= 1) {
      return NextResponse.json({ error: 'Cannot restrict the last active admin' }, { status: 409 });
    }
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { status: STATUS_RESTRICTED, statusReason: reason.trim() || null, statusChangedAt: new Date() },
  });
  // Session is deliberately left intact: a restricted user keeps read access,
  // so forcing them out would contradict what "read-only" means here.
  await audit(actor, 'USER_RESTRICT', 'user', target.id, { reason });
  return NextResponse.json({ ok: true, status: STATUS_RESTRICTED });
}

async function unrestrict(actor: SessionUser, target: Target) {
  await prisma.user.update({
    where: { id: target.id },
    data: { status: STATUS_ACTIVE, statusReason: null, statusChangedAt: new Date() },
  });
  await audit(actor, 'USER_UNRESTRICT', 'user', target.id);
  return NextResponse.json({ ok: true, status: STATUS_ACTIVE });
}

async function resetPassword(actor: SessionUser, target: Target) {
  if (!target.email) {
    return NextResponse.json(
      { error: 'This is a wallet-only account with no email — there is no password to reset.' },
      { status: 400 },
    );
  }

  const temp = tempPassword();
  await prisma.user.update({
    where: { id: target.id },
    data: {
      password: await bcrypt.hash(temp, 12),
      // Bumping the epoch invalidates every JWT already issued to this user, so
      // an attacker holding a live session is logged out by the reset.
      sessionEpoch: { increment: 1 },
    },
  });

  // The plaintext is returned exactly once and never stored or logged — the
  // audit entry records that a reset happened, not what it was set to.
  await audit(actor, 'USER_RESET_PASSWORD', 'user', target.id, { email: target.email });
  return NextResponse.json({ ok: true, tempPassword: temp });
}

async function resetKyc(actor: SessionUser, target: Target) {
  // KYC belongs to the account, not the wallet — it exists (and can be reset)
  // even while no wallet is linked.
  const existing = await prisma.kycSubmission.findUnique({
    where: { userId: target.id },
    select: { status: true, wallet: true },
  });
  if (!existing) return NextResponse.json({ error: 'No KYC submission found for this account.' }, { status: 404 });

  await prisma.kycSubmission.update({
    where: { userId: target.id },
    data: { status: 'pending' },
  });

  await audit(actor, 'USER_RESET_KYC', 'user', target.id, { wallet: existing.wallet, from: existing.status });
  return NextResponse.json({
    ok: true,
    // Say this plainly in the response so the UI can surface it rather than
    // letting an admin assume the on-chain flag was revoked too.
    note: 'KYC set back to pending off-chain. The on-chain KYC flag is unchanged — reset does not write to the contract.',
  });
}

/**
 * Admin override for detaching a user's wallet (a support tool — users can
 * also unlink themselves in Settings at any time). The account keeps its KYC
 * record; linking a new wallet re-grants on-chain borrowing automatically.
 */
async function unlinkWallet(actor: SessionUser, target: Target) {
  if (!target.walletAddress) {
    return NextResponse.json({ error: 'No wallet is linked to this account.' }, { status: 400 });
  }
  if (!target.email) {
    return NextResponse.json(
      { error: 'This account signs in by wallet only — unlinking would leave it with no way to log in.' },
      { status: 409 },
    );
  }
  const wallet = target.walletAddress.toLowerCase();

  // No wallet changes while the wallet has active loans or locked collateral —
  // detaching it would strand funds on an address no account owns here. Fail
  // closed: if the chain cannot be read, fix the node rather than unlink blind.
  try {
    const pos = await getOnChainPosition(wallet);
    if (pos.collateral > BigInt(0) || pos.principal > BigInt(0)) {
      return NextResponse.json({
        error: 'This wallet has locked collateral or an outstanding loan on the contract. The user must repay and withdraw before the wallet can be changed.',
      }, { status: 409 });
    }
  } catch (err) {
    console.error('[admin unlink-wallet] on-chain position check failed:', err);
    return NextResponse.json({
      error: 'Could not verify on-chain loans/collateral for this wallet — is the Hardhat node running? Unlinking is blocked until the check succeeds.',
    }, { status: 502 });
  }

  // Revoke the freed wallet's on-chain borrow permission (best-effort) — a
  // detached address must not keep the approval for its next owner.
  let chainRevoked = false;
  try {
    if (await isKycOnChain(wallet)) {
      await setKycOnChain(wallet, false);
      chainRevoked = true;
    }
  } catch (err) {
    console.warn('[admin unlink-wallet] on-chain KYC revoke failed (continuing):', err);
  }

  await prisma.user.update({ where: { id: target.id }, data: { walletAddress: null } });
  // Clear the submission's on-chain anchor too — left stale, an auto-resync
  // could later target a wallet someone else now owns.
  await prisma.kycSubmission.updateMany({ where: { userId: target.id }, data: { wallet: null } });
  await audit(actor, 'USER_UNLINK_WALLET', 'user', target.id, { wallet, chainRevoked });
  return NextResponse.json({
    ok: true,
    note: 'Wallet unlinked. The account keeps its KYC approval; when the user links a new wallet, on-chain borrowing is granted for it automatically.',
  });
}
