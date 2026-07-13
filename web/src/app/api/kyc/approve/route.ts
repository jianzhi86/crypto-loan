import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { setKycOnChain } from '@/lib/kyc/chain';

// POST /api/kyc/approve — admin approves a KYC submission on-chain,
// OR re-syncs on-chain KYC for a wallet that is already DB-approved (resync flow).
export async function POST(req: NextRequest) {
  const { wallet } = await req.json();
  if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 });

  try {
    const walletKey = (wallet as string).toLowerCase();

    // Ensure a KYC record exists before touching the chain. This prevents
    // a direct API call from setting on-chain KYC for a wallet that never submitted.
    const record = await prisma.kycSubmission.findUnique({ where: { wallet: walletKey } });
    if (!record) return NextResponse.json({ error: 'No KYC submission found for this wallet' }, { status: 404 });

    // Update DB first so if the chain call fails we don't have a phantom approval.
    await prisma.kycSubmission.update({
      where: { wallet: walletKey },
      data:  { status: 'approved' },
    });

    await setKycOnChain(wallet, true);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/kyc/approve]', err);
    return NextResponse.json({ error: 'Approval failed — check Hardhat node and OWNER_PRIVATE_KEY' }, { status: 500 });
  }
}
