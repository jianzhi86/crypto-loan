import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/authz';
import { getOnChainPosition } from '@/lib/kyc/chain';

/// Sub-sen residue is not a debt. Interest is charged before principal and the
/// payoff quote is rounded up, so what a full payoff can leave on a row is a
/// handful of 1e6-units. A row left OPEN holding principal "1" (RM 0.000001) is
/// dust no user will ever repay, and it keeps the loan looking active forever.
/// Anything at or under this closes the row.
const DUST_UNITS = BigInt(10_000);   // RM 0.01 in MYR 1e6 units

// POST /api/borrows/settle — apply a confirmed on-chain repayment to the
// itemized ledger tranches it was meant to cover, after the repay tx confirmed.
// `ids` are the OPEN rows this payment applies to, given oldest-first — the
// same order used for display, so a partial payment pays down the oldest
// debt first. `principalPaid` (MYR 1e6 units, from the chain's Repaid event —
// the authoritative amount, not the requested one) is distributed across
// those rows in order: a row whose principal is fully covered flips to
// REPAID; a row only partially covered has its principal reduced, staying
// OPEN. `borrowedAt` is never touched: it anchors the installment month
// counter, and the interest clock is derived client-side from the chain's
// own lastRepayTime (the contract charges all accrued interest on every
// repay). Optional `allocations` caps how much principal lands on each row —
// installment ("pay this month") payments use it so every selected plan pays
// its own share instead of the whole amount draining the oldest plan. Only
// OPEN rows move, so retries are safe, and each row's own current
// `principal` is read from the DB — never trusted from the client — so a
// partial payment can't be gamed into clearing more debt than it actually
// paid.
export async function POST(req: NextRequest) {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const { ids, principalPaid, repayTxHash, allocations, closeAll, wallet } = await req.json() as {
    ids?: string[];
    principalPaid?: string;
    repayTxHash?: string | null;
    allocations?: { id?: string; principal?: string }[];
    closeAll?: boolean;
    wallet?: string;
  };

  // Escape hatch for a full payoff: when the chain says the position is clear,
  // every OPEN row for that wallet is settled regardless of what the allocation
  // arithmetic worked out to. Verified here with a server-side RPC read — the
  // client's claim is never taken on its own word, so this cannot be used to
  // wipe a ledger that still has real debt behind it.
  if (closeAll && typeof wallet === 'string' && wallet) {
    const walletKey = wallet.toLowerCase();
    try {
      const pos = await getOnChainPosition(walletKey);
      if (pos.principal !== BigInt(0)) {
        return NextResponse.json({ ok: false, reason: 'chain still shows debt' });
      }
    } catch (err) {
      // Fail closed: an unreadable chain is not evidence the loan is clear.
      console.error('[POST /api/borrows/settle] closeAll chain read failed:', err);
      return NextResponse.json({ error: 'Could not verify the on-chain position' }, { status: 502 });
    }
    try {
      const res = await prisma.borrowPosition.updateMany({
        where: { wallet: walletKey, status: 'OPEN' },
        data: { status: 'REPAID', repaidAt: new Date(), repayTxHash: repayTxHash ?? null },
      });
      return NextResponse.json({ ok: true, closedAll: true, closed: res.count });
    } catch (err) {
      console.error('[POST /api/borrows/settle] closeAll', err);
      return NextResponse.json({ error: 'DB error' }, { status: 500 });
    }
  }

  if (!Array.isArray(ids) || ids.length === 0 || ids.some(id => typeof id !== 'string')) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 });
  }
  let allocMap: Map<string, bigint> | null = null;
  if (allocations !== undefined) {
    try {
      if (!Array.isArray(allocations) || allocations.length === 0
        || allocations.some(a => !a || typeof a.id !== 'string' || typeof a.principal !== 'string')) {
        throw new Error('shape');
      }
      allocMap = new Map(allocations.map(a => [a.id as string, BigInt(a.principal as string)]));
      if (Array.from(allocMap.values()).some(v => v < BigInt(0))) throw new Error('negative');
    } catch {
      return NextResponse.json({ error: 'invalid allocations' }, { status: 400 });
    }
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

    const spent = new Map<string, bigint>();

    // Pass 1 — allocation caps respected, so an installment payment spreads
    // across the selected plans instead of draining the oldest one.
    for (const id of ids) {
      if (remaining <= BigInt(0)) break;
      const row = byId.get(id);
      if (!row) continue; // already settled or unknown — skip, never trust the client's copy
      const rowPrincipal = BigInt(row.principal);
      if (rowPrincipal <= BigInt(0)) continue;
      const cap = allocMap ? (allocMap.get(id) ?? BigInt(0)) : rowPrincipal;
      let pay = remaining < rowPrincipal ? remaining : rowPrincipal;
      if (cap < pay) pay = cap;
      if (pay <= BigInt(0)) continue;
      remaining -= pay;
      spent.set(id, pay);
    }

    // Pass 2 — the caps are a fairness device, not a refund. Whatever they left
    // unspent is money the contract has already taken; dropping it (as this
    // loop used to) made the ledger drift permanently above the chain's real
    // principal, which is the other half of the leftover-cents bug. Apply it
    // oldest-first across whatever capacity remains.
    if (remaining > BigInt(0)) {
      for (const id of ids) {
        if (remaining <= BigInt(0)) break;
        const row = byId.get(id);
        if (!row) continue;
        const left = BigInt(row.principal) - (spent.get(id) ?? BigInt(0));
        if (left <= BigInt(0)) continue;
        const pay = remaining < left ? remaining : left;
        remaining -= pay;
        spent.set(id, (spent.get(id) ?? BigInt(0)) + pay);
      }
    }

    const ops = [];
    for (const [id, pay] of spent) {
      const rowPrincipal = BigInt(byId.get(id)!.principal);
      // `+ DUST_UNITS` rather than an exact `>=`: see DUST_UNITS above.
      if (pay + DUST_UNITS >= rowPrincipal) {
        ops.push(prisma.borrowPosition.updateMany({
          where: { id, status: 'OPEN' },
          data: { status: 'REPAID', repaidAt: now, repayTxHash: repayTxHash ?? null },
        }));
      } else {
        ops.push(prisma.borrowPosition.updateMany({
          where: { id, status: 'OPEN' },
          data: { principal: (rowPrincipal - pay).toString() },
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
