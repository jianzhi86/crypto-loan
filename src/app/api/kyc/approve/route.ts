import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { prisma } from '@/lib/db/prisma';
import { CONTRACT_ADDRESSES } from '@/lib/contractConfig';

const RPC_URL     = process.env.HARDHAT_RPC_URL ?? 'http://127.0.0.1:8545';
const LOAN_ADDR   = CONTRACT_ADDRESSES.CryptoLoan;
const SET_KYC_ABI = ['function setKYC(address user, bool approved) external'];

// POST /api/kyc/approve — admin approves a KYC submission on-chain
export async function POST(req: NextRequest) {
  const { wallet } = await req.json();
  if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 });

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer   = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY!, provider);
    const contract = new ethers.Contract(LOAN_ADDR, SET_KYC_ABI, signer);
    const tx = await (contract.setKYC as (u: string, a: boolean) => Promise<ethers.TransactionResponse>)(wallet, true);
    await tx.wait();

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
