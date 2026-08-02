import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireActiveUser, audit } from '@/lib/authz';
import { setKycOnChain, isKycOnChain, getOnChainPosition } from '@/lib/kyc/chain';

/**
 * POST /api/wallet/unlink — detach the signed-in account's linked wallet.
 *
 * Rules enforced here:
 *  1. The account must keep at least one login method (email + password), so a
 *     wallet-only account can never unlink its way into being unreachable.
 *  2. Once KYC is approved, the wallet is the account's verified identity —
 *     self-service unlinking is disabled and changes go through an admin
 *     (POST /api/admin/users/[id] { action: 'unlink-wallet' }).
 *  3. A wallet with locked collateral or an outstanding loan cannot be
 *     detached.
 *
 * KYC belongs to the account, not the wallet: a pending submission stays with
 * the account after unlinking (no re-filling the form after re-linking), and
 * nothing is handed to the wallet's next owner because submissions are keyed
 * by userId.
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
        error: 'You cannot unlink this wallet because it is your only way to log in. Add an email and password to your account first.',
        code: 'ONLY_LOGIN_METHOD',
      }, { status: 409 });
    }

    // Rule 2: approved KYC locks the wallet to the account.
    const kyc = await prisma.kycSubmission.findUnique({
      where: { userId: guard.user.id },
      select: { status: true },
    });
    if (kyc?.status === 'approved') {
      return NextResponse.json({
        error: 'Your wallet is linked to a KYC-approved account. Wallet changes require administrator review.',
        code: 'KYC_APPROVED_LOCK',
      }, { status: 403 });
    }

    // Rule 3: no unlinking while funds are locked on the contract. Best-effort:
    // a pre-approval wallet cannot normally hold a position (the contract is
    // onlyKYC), so a dead Hardhat node must not trap the user here.
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

    // The on-chain flag can be set even though the DB status is pending (an
    // admin reset it). A freed wallet must not keep borrow permission, or the
    // next account to claim it inherits the approval on-chain.
    let chainRevoked = false;
    try {
      if (await isKycOnChain(wallet)) {
        await setKycOnChain(wallet, false);
        chainRevoked = true;
      }
    } catch (err) {
      console.warn('[wallet/unlink] on-chain KYC revoke failed (continuing):', err);
    }

    await prisma.user.update({
      where: { id: guard.user.id },
      data: { walletAddress: null },
    });

    // Self-service action, recorded with the user as their own actor.
    await audit(guard.user, 'USER_UNLINK_WALLET', 'user', guard.user.id, {
      wallet, self: true, kycKept: !!kyc, chainRevoked,
    });

    return NextResponse.json({ success: true, wallet, kycKept: !!kyc });
  } catch (err) {
    console.error('[POST /api/wallet/unlink]', err);
    return NextResponse.json({ error: 'Failed to unlink wallet' }, { status: 500 });
  }
}
