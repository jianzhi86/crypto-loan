import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getFlags } from '@/lib/features-server';
import { isHidden } from '@/lib/features';
import { buildTxWhere, parseTxFilters, shortWallet } from '@/lib/tx-query';

/**
 * GET /api/explorer — the public transaction feed.
 *
 * WHY THIS IS PUBLIC (and what is deliberately withheld):
 *
 * Every row here mirrors an event already emitted by the CryptoLoan contract.
 * On a real network anyone can read those events with Etherscan or an RPC call,
 * so withholding them would buy no privacy — it would only make this app a
 * worse window onto data that is public regardless. That is why block explorers
 * exist and why lending protocols publish their activity.
 *
 * The line is drawn at *identity*, not at transactions. This endpoint never
 * returns anything that ties a wallet to a person: no name, email, phone, IC
 * number, KYC record, bank account, or off-chain bank transfer. Wallets are
 * truncated for display. Those joins exist only behind /api/admin/transactions.
 */
export async function GET(req: NextRequest) {
  const flags = await getFlags();
  if (isHidden(flags, 'page.explorer')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sp      = req.nextUrl.searchParams;
  const filters = parseTxFilters(sp);
  const page    = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(sp.get('pageSize') ?? 25) || 25));
  // Chronological (oldest first) by default — reads like a ledger; the UI
  // offers newest-first as an option.
  const order: 'asc' | 'desc' = sp.get('order') === 'desc' ? 'desc' : 'asc';

  const where = buildTxWhere(filters);

  try {
    const [total, rows, stats] = await Promise.all([
      prisma.loanTransaction.count({ where }),
      prisma.loanTransaction.findMany({
        where,
        orderBy: [{ blockNumber: order }, { createdAt: order }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, wallet: true, type: true, amount: true, txHash: true, blockNumber: true, createdAt: true },
      }),
      prisma.loanTransaction.groupBy({ by: ['type'], _count: { _all: true } }),
    ]);

    return NextResponse.json({
      txs: rows.map(t => ({
        id:          t.id,
        type:        t.type,
        amount:      t.amount,
        blockNumber: t.blockNumber,
        createdAt:   t.createdAt,
        // Truncated server-side: the full address is never sent to a public
        // client, so it cannot be recovered from the network tab.
        wallet:      shortWallet(t.wallet),
        txHash:      `${t.txHash.slice(0, 12)}…${t.txHash.slice(-8)}`,
      })),
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      byType: Object.fromEntries(stats.map(s => [s.type, s._count._all])),
    });
  } catch (err) {
    console.error('[GET /api/explorer]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
