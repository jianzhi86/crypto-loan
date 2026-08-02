import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireActiveUser, audit } from '@/lib/authz';
import { setKycOnChain, isKycOnChain, getOnChainPosition } from '@/lib/kyc/chain';

/**
 * POST /api/wallet/unlink — detach the signed-in account's linked wallet.
 * Self-service at any time, no admin involved.
 *
 * Rules enforced here:
 *  1. The account must keep at least one login method (email + password), so a
 *     wallet-only account can never unlink its way into being unreachable.
 *  2. A wallet with locked collateral or an outstanding loan cannot be
 *     detached — repay and withdraw first.
 *
 * KYC belongs to the account, not the wallet: the submission (and its
 * approval) stays with the account after unlinking, and linking a new wallet
 * re-grants the on-chain permission automatically — no re-verification, no
 * admin review, no waiting. Nothing is handed to the wallet's next owner
 * because submissions are keyed by userId and the freed wallet's on-chain
 * flag is revoked below.
 */
export async function POST() {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const wallet = guard.user.walletAddress?.toLowerCase();
  if (!wallet) {
    return NextResponse.json({ error: 'No wallet is linked to this account.' }, { status: 400 });
  }

  try {
    // Rule 1: at least one login method must remain.
    const creds = await prisma.user.findUnique({
      where: { id: guard.user.id },
      select: { email: true, password: true },
    });
    if (!creds?.email || !creds.password) {
      return NextResponse.json({
        error: 'You cannot unlink this wallet because it is your only way to log in. Add an email and password under Settings → Account & sign-in first.',
        code: 'ONLY_LOGIN_METHOD',
      }, { status: 409 });
    }

    const kyc = await prisma.kycSubmission.findUnique({
      where: { userId: guard.user.id },
      select: { status: true },
    });

    // Rule 2: no unlinking while funds are locked on the contract. Best-effort:
    // if the node is unreachable the unlink proceeds — the position belongs to
    // the address itself, so nothing is lost; the user can re-link the same
    // wallet at any time to manage it.
    try {
      const pos = await getOnChainPosition(wallet);
      if (pos.collateral > BigInt(0) || pos.principal > BigInt(0)) {
        return NextResponse.json({
          error: 'This wallet still has collateral or an outstanding loan on the contract. Repay and withdraw before unlinking.',
          code: 'ACTIVE_OBLIGATIONS',
        }, { status: 409 });
      }
    } catch (err) {
      console.warn('[wallet/unlink] on-chain position check failed (continuing):', err);
    }

    // The freed wallet must not keep on-chain borrow permission — the next
    // account to claim it would inherit the approval. If we can SEE the flag
    // is set but cannot revoke it, fail closed: releasing the wallet in that
    // state is exactly the leak this exists to prevent. Only a completely
    // unreachable node (flag unknown, most likely wiped with it) lets the
    // unlink proceed — and link-time healing clears any survivor (see
    // /api/wallet/link).
    let chainRevoked = false;
    try {
      if (await isKycOnChain(wallet)) {
        await setKycOnChain(wallet, false);
        chainRevoked = true;
      }
    } catch (err) {
      console.warn('[wallet/unlink] on-chain KYC revoke failed:', err);
      let flagKnownSet = false;
      try { flagKnownSet = await isKycOnChain(wallet); } catch { /* node down — unknown */ }
      if (flagKnownSet) {
        return NextResponse.json({
          error: 'Could not revoke this wallet’s on-chain borrow permission. Please try again in a moment.',
        }, { status: 502 });
      }
    }

    await prisma.user.update({
      where: { id: guard.user.id },
      data: { walletAddress: null },
    });

    // Clear the submission's on-chain anchor (best-effort — a stale anchor is
    // cosmetic; link-time healing fixes it on the next link).
    try {
      await prisma.kycSubmission.updateMany({
        where: { userId: guard.user.id },
        data:  { wallet: null },
      });
    } catch (err) {
      console.warn('[wallet/unlink] kycSubmission anchor clear failed (non-fatal):', err);
    }

    // Self-service action, recorded with the user as their own actor.
    await audit(guard.user, 'USER_UNLINK_WALLET', 'user', guard.user.id, {
      wallet, self: true, kycKept: !!kyc, chainRevoked,
    });

    return NextResponse.json({ success: true, wallet, kycKept: !!kyc });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/wallet/unlink] unexpected error:', msg, err);
    return NextResponse.json({
      error: 'Something went wrong while unlinking the wallet. Please try again in a moment.',
    }, { status: 500 });
  }
}
