import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// POST /api/loan-tx — save a transaction after it's confirmed on-chain
export async function POST(req: NextRequest) {
  const { wallet, type, amount, txHash, blockNumber } = await req.json();
  if (!wallet || !type || !amount || !txHash || blockNumber == null) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  try {
    const tx = await prisma.loanTransaction.upsert({
      where:  { txHash },
      update: {},
      create: { wallet: wallet.toLowerCase(), type, amount: String(amount), txHash, blockNumber },
    });
    return NextResponse.json({ ok: true, id: tx.id });
  } catch (err) {
    console.error('[POST /api/loan-tx]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

// GET /api/loan-tx?wallet=0x... — fetch history for a wallet
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 });

  try {
    const txs = await prisma.loanTransaction.findMany({
      where:   { wallet: wallet.toLowerCase() },
      orderBy: { blockNumber: 'desc' },
      take:    100,
    });
    return NextResponse.json({ txs });
  } catch (err) {
    console.error('[GET /api/loan-tx]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
