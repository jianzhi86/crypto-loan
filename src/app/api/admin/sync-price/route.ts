import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES } from '@/lib/contractConfig';

const RPC_URL       = process.env.HARDHAT_RPC_URL ?? 'http://127.0.0.1:8545';
const LOAN_ADDR     = CONTRACT_ADDRESSES.CryptoLoan;
const SET_PRICE_ABI = ['function setEthPrice(uint256 _price) external'];

// POST /api/admin/sync-price — fetch live ETH/MYR from CoinGecko and push on-chain
export async function POST() {
  try {
    const cgRes = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=myr',
      { cache: 'no-store' },
    );
    if (!cgRes.ok) throw new Error('CoinGecko request failed');
    const cgData = await cgRes.json() as { ethereum: { myr: number } };
    const myrPrice = Math.round(cgData.ethereum.myr);
    if (!myrPrice || myrPrice <= 0) throw new Error('Invalid price from CoinGecko');

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer   = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY!, provider);
    const contract = new ethers.Contract(LOAN_ADDR, SET_PRICE_ABI, signer);
    const tx = await (contract.setEthPrice as (p: bigint) => Promise<ethers.TransactionResponse>)(BigInt(myrPrice));
    await tx.wait();

    return NextResponse.json({ success: true, newPrice: myrPrice });
  } catch (err) {
    console.error('[POST /api/admin/sync-price]', err);
    return NextResponse.json(
      { error: 'Sync failed — check Hardhat node and OWNER_PRIVATE_KEY' },
      { status: 500 },
    );
  }
}
