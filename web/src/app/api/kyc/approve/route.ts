import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { setKycOnChain } from '@/lib/kyc/chain';
import { requireAdmin, audit } from '@/lib/authz';

// POST /api/kyc/approve — admin approves a KYC submission on-chain,
// OR re-syncs on-chain KYC for a wallet that is already DB-approved (resync flow).
export async function POST(req: NextRequest) {
  // This route hands out on-chain KYC via the contract owner key, so it is the
  // single most privileged endpoint in the app. Admin check comes first.
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { wallet } = await req.json();
  if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 });

  try {
    const walletKey = (wallet as string).toLowerCase();

    // Ensure a KYC record exists before touching the chain. This prevents
    // a direct API call from setting on-chain KYC for a wallet that never submitted.
    const record = await prisma.kycSubmission.findFirst({
      where: { wallet: walletKey },
      select: { id: true, userId: true, fullName: true },
    });
    if (!record) return NextResponse.json({ error: 'No KYC submission found for this wallet' }, { status: 404 });

    // The wallet must still be linked to the account that submitted. Approving
    // a wallet the submitter no longer holds would grant on-chain borrow
    // permission to an address owned by nobody — or by someone else entirely.
    const holder = await prisma.user.findFirst({
      where: { walletAddress: { equals: walletKey, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!holder || holder.id !== record.userId) {
      return NextResponse.json({
        error: 'This wallet is no longer linked to the account that submitted the KYC. Ask the user to re-link a wallet first.',
      }, { status: 409 });
    }

    // Update DB first so if the chain call fails we don't have a phantom approval.
    await prisma.kycSubmission.update({
      where: { id: record.id },
      data:  { status: 'approved' },
    });

    await setKycOnChain(wallet, true);

    await audit(guard.user, 'KYC_APPROVE', 'kyc', walletKey, { fullName: record.fullName });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/kyc/approve]', err);
    return NextResponse.json({ error: 'Approval failed — check Hardhat node and OWNER_PRIVATE_KEY' }, { status: 500 });
  }
}
