import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireActiveUser, audit } from '@/lib/authz';
import { setKycOnChain } from '@/lib/kyc/chain';

/**
 * POST /api/wallet/unlink — detach the signed-in account's linked wallet.
 *
 * The wallet is the account's KYC identity anchor, so unlinking cannot leave
 * the verification behind: a freed wallet with a standing approved submission
 * would hand that approval to the next account that claims the wallet — the
 * exact cross-account leak the per-account KYC model exists to prevent. So
 * unlinking also deletes the KYC submission and (best-effort) revokes the
 * on-chain flag. The user's funds are untouched — the wallet itself, and any
 * position it holds on the contract, remain fully theirs in MetaMask.
 */
export async function POST() {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const wallet = guard.user.walletAddress?.toLowerCase();
  if (!wallet) {
    return NextResponse.json({ error: 'No wallet is linked to this account.' }, { status: 400 });
  }

  try {
    const existing = await prisma.kycSubmission.findUnique({ where: { wallet }, select: { status: true } });
    if (existing) {
      await prisma.kycSubmission.delete({ where: { wallet } });
    }

    // Revoke the on-chain borrow permission. Best-effort: a dead Hardhat node
    // must not trap the user in a wallet they want detached — the off-chain
    // unlink is what stops any future account from inheriting the approval,
    // and an admin re-approval is required either way before borrowing again.
    let chainRevoked = false;
    if (existing?.status === 'approved') {
      try {
        await setKycOnChain(wallet, false);
        chainRevoked = true;
      } catch (err) {
        console.warn('[wallet/unlink] on-chain KYC revoke failed (continuing):', err);
      }
    }

    await prisma.user.update({
      where: { id: guard.user.id },
      data: { walletAddress: null },
    });

    // Self-service action, recorded with the user as their own actor.
    await audit(guard.user, 'USER_UNLINK_WALLET', 'user', guard.user.id, {
      wallet, self: true, kycRemoved: !!existing, chainRevoked,
    });

    return NextResponse.json({ success: true, wallet, kycRemoved: !!existing });
  } catch (err) {
    console.error('[POST /api/wallet/unlink]', err);
    return NextResponse.json({ error: 'Failed to unlink wallet' }, { status: 500 });
  }
}
