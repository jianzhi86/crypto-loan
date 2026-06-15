import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { setKycOnChain } from '@/lib/kyc/chain';

// POST /api/kyc/approve — admin approves a KYC submission on-chain
export async function POST(req: NextRequest) {
  const { wallet } = await req.json();
  if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 });

  try {
    await setKycOnChain(wallet, true);

    await prisma.kycSubmission.update({
      where: { wallet: wallet.toLowerCase() },
      data:  { status: 'approved' },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/kyc/approve]', err);
    return NextResponse.json({ error: 'Approval failed — check Hardhat node and OWNER_PRIVATE_KEY' }, { status: 500 });
  }
}
