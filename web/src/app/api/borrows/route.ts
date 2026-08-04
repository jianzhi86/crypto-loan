import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/authz';

// POST /api/borrows — record one confirmed borrow as a ledger tranche:
// its principal plus the APR captured at borrow time. Like /api/loan-tx this
// only mirrors a transaction that already settled on-chain, so requireUser
// (not requireActiveUser) is the right gate. Keyed by txHash so retries are
// idempotent.
export async function POST(req: NextRequest) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const { wallet, principal, aprBps, txHash } = await req.json();
  if (!wallet || !principal || !txHash || aprBps == null) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  try {
    const row = await prisma.borrowPosition.upsert({
      where:  { txHash },
      update: {},
      create: {
        wallet:    String(wallet).toLowerCase(),
        principal: String(principal),
        aprBps:    Math.round(Number(aprBps)),
        txHash,
      },
    });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (err) {
    console.error('[POST /api/borrows]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}

// GET /api/borrows?wallet=0x… — the wallet's open tranches, oldest first.
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 });

  try {
    const borrows = await prisma.borrowPosition.findMany({
      where:   { wallet: wallet.toLowerCase(), status: 'OPEN' },
      orderBy: { borrowedAt: 'asc' },
      select:  { id: true, principal: true, aprBps: true, borrowedAt: true, txHash: true },
    });
    return NextResponse.json({ borrows });
  } catch (err) {
    console.error('[GET /api/borrows]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
