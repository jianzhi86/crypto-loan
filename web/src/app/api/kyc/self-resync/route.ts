import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireActiveUser } from '@/lib/authz';
import { setKycOnChain } from '@/lib/kyc/chain';

/**
 * POST /api/kyc/self-resync
 *
 * Any signed-in user can call this to restore their own on-chain KYC flag.
 * Typical trigger: contract was redeployed (Hardhat restart) and wiped state,
 * but the DB still shows approved.
 *
 * Safety: only sets the flag for the CALLER's own linked wallet, and only
 * when the DB already says approved (or caller is admin). Cannot approve
 * other users or grant KYC that wasn't already in the DB.
 */
export async function POST() {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const user = await prisma.user.findUnique({
    where: { id: guard.user.id },
    select: {
      walletAddress: true,
      isAdmin: true,
      kyc: { select: { status: true } },
    },
  });

  if (!user?.walletAddress) {
    return NextResponse.json({ error: 'No wallet linked to your account.' }, { status: 400 });
  }

  const entitled = user.isAdmin || user.kyc?.status === 'approved';
  if (!entitled) {
    return NextResponse.json({ error: 'KYC not approved.' }, { status: 403 });
  }

  try {
    await setKycOnChain(user.walletAddress.toLowerCase(), true);
    return NextResponse.json({ success: true, wallet: user.walletAddress.toLowerCase() });
  } catch (err) {
    console.error('[POST /api/kyc/self-resync]', err);
    return NextResponse.json(
      { error: 'Failed to set on-chain KYC — check Hardhat node is running.' },
      { status: 502 },
    );
  }
}
