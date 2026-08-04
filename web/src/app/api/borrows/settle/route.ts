import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/authz';

// POST /api/borrows/settle — apply a confirmed on-chain repayment to the
// itemized ledger tranches it was meant to cover, after the repay tx confirmed.
// `ids` are the OPEN rows this payment applies to, given oldest-first — the
// same order used for display, so a partial payment pays down the oldest
// debt first. `principalPaid` (MYR 1e6 units, from the chain's Repaid event —
// the authoritative amount, not the requested one) is distributed across
// those rows in order: a row whose principal is fully covered flips to
// REPAID; a row only partially covered has its principal reduced and its
// interest-accrual clock reset (mirrors the contract's own lastRepayTime
// reset on a partial repay), staying OPEN. Only OPEN rows move, so retries
// are safe, and each row's own current `principal` is read from the DB —
// never trusted from the client — so a partial payment can't be gamed into
// clearing more debt than it actually paid.
export async function POST(req: NextRequest) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const { ids, principalPaid, repayTxHash } = await req.json() as {
    ids?: string[];
    principalPaid?: string;
    repayTxHash?: string | null;
  };
  if (!Array.isArray(ids) || ids.length === 0 || ids.some(id => typeof id !== 'string')) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 });
  }
  let remaining: bigint;
  try {
    remaining = BigInt(principalPaid ?? '0');
  } catch {
    return NextResponse.json({ error: 'invalid principalPaid' }, { status: 400 });
  }
  if (remaining <= BigInt(0)) {
    return NextResponse.json({ error: 'principalPaid must be > 0' }, { status: 400 });
  }

  try {
    const rows = await prisma.borrowPosition.findMany({
      where: { id: { in: ids }, status: 'OPEN' },
      select: { id: true, principal: true },
    });
    const byId = new Map(rows.map(r => [r.id, r]));
    const now = new Date();

    const ops = [];
    for (const id of ids) {
      if (remaining <= BigInt(0)) break;
      const row = byId.get(id);
      if (!row) continue; // already settled or unknown — skip, never trust the client's copy
      const rowPrincipal = BigInt(row.principal);
      if (rowPrincipal <= BigInt(0)) continue;
      const pay = remaining < rowPrincipal ? remaining : rowPrincipal;
      remaining -= pay;
      if (pay >= rowPrincipal) {
        ops.push(prisma.borrowPosition.updateMany({
          where: { id, status: 'OPEN' },
          data: { status: 'REPAID', repaidAt: now, repayTxHash: repayTxHash ?? null },
        }));
      } else {
        ops.push(prisma.borrowPosition.updateMany({
          where: { id, status: 'OPEN' },
          data: { principal: (rowPrincipal - pay).toString(), borrowedAt: now },
        }));
      }
    }
    if (ops.length > 0) await prisma.$transaction(ops);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/borrows/settle]', err);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }
}
