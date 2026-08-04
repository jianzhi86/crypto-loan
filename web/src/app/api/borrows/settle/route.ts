import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/authz';

// POST /api/borrows/settle — mark ledger tranches repaid after the on-chain
// repay transaction confirmed. `interest` (optional) carries the per-tranche
// ledger interest (MYR units, stringified) that was included in the payment,
// so history shows what each borrow cost. Only OPEN rows flip — settling an
// already-settled id is a no-op, which makes client retries safe.
export async function POST(req: NextRequest) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const { ids, interest, repayTxHash } = await req.json() as {
    ids?: string[];
    interest?: Record<string, string>;
    repayTxHash?: string | null;
  };
  if (!Array.isArray(ids) || ids.length === 0 || ids.some(id => typeof id !== 'string')) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 });
  }

  try {
    const now = new Date();
    await prisma.$transaction(ids.map(id =>
      prisma.borrowPosition.updateMany({
        where: { id, status: 'OPEN' },
        data: {
          status:       'REPAID',
          repaidAt:     now,
          repayTxHash:  repayTxHash ?? null,
          interestPaid: typeof interest?.[id] === 'string' ? interest[id] : null,
        },
      }),
    ));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/borrows/settle]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
