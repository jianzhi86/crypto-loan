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

  const { wallet, principal, aprBps, txHash, termMonths } = await req.json();
  if (!wallet || !principal || !txHash || aprBps == null) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  // Only the plan lengths the Borrow tab's own term selector offers — an
  // unrecognized value falls back to 1 (pay-in-full-this-cycle) rather than
  // trusting an arbitrary client-supplied divisor for the installment math.
  const VALID_TERM_MONTHS = [1, 3, 6, 12];
  const resolvedTermMonths = VALID_TERM_MONTHS.includes(Number(termMonths)) ? Number(termMonths) : 1;

  try {
    const row = await prisma.borrowPosition.upsert({
      where:  { txHash },
      update: {},
      create: {
        wallet:            String(wallet).toLowerCase(),
        principal:         String(principal),
        originalPrincipal: String(principal),
        aprBps:            Math.round(Number(aprBps)),
        termMonths:        resolvedTermMonths,
        txHash,
      },
    });
    return NextResponse.json({ ok: true, id: row.id });
  } catch (err) {
    // Same non-atomic-upsert race as /api/loan-tx: a concurrent duplicate call
    // for the same txHash can lose to a unique-constraint error instead of the
    // no-op an upsert implies. The row exists either way — success either way.
    if ((err as { code?: string }).code === 'P2002') {
      const existing = await prisma.borrowPosition.findUnique({ where: { txHash } });
      if (existing) return NextResponse.json({ ok: true, id: existing.id });
    }
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
      select:  { id: true, principal: true, originalPrincipal: true, aprBps: true, termMonths: true, borrowedAt: true, txHash: true },
    });
    return NextResponse.json({ borrows });
  } catch (err) {
    console.error('[GET /api/borrows]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
