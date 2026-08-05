import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/authz';
import { buildTxWhere, parseTxFilters } from '@/lib/tx-query';

/**
 * GET /api/admin/transactions — the full ledger, with identity joined on.
 *
 * On-chain events mirrored into LoanTransaction, and nothing else. READ-ONLY:
 * there is no PATCH/DELETE here and there never should be — the chain is the
 * record of truth and this table is a copy.
 *
 * Supports `format=csv` for export.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const sp       = req.nextUrl.searchParams;
  const filters  = parseTxFilters(sp);
  const page     = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(10, Number(sp.get('pageSize') ?? 50) || 50));
  const csv      = sp.get('format') === 'csv';

  try {
    return await loans(filters, page, pageSize, csv);
  } catch (err) {
    console.error('[GET /api/admin/transactions]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

async function loans(
  filters: ReturnType<typeof parseTxFilters>,
  page: number, pageSize: number, csv: boolean,
) {
  const where = buildTxWhere(filters);

  const [total, rows] = await Promise.all([
    prisma.loanTransaction.count({ where }),
    prisma.loanTransaction.findMany({
      where,
      orderBy: [{ blockNumber: 'desc' }, { createdAt: 'desc' }],
      // An export should be the whole filtered set, not just the visible page,
      // but still bounded so a wide filter cannot exhaust memory.
      skip: csv ? 0 : (page - 1) * pageSize,
      take: csv ? 10_000 : pageSize,
    }),
  ]);

  // Attach the owning account where one exists. LoanTransaction has no FK to
  // User — it is keyed by wallet — so this is a lookup, not a join.
  const wallets = [...new Set(rows.map(r => r.wallet))];
  const users = wallets.length
    ? await prisma.user.findMany({
        where: { walletAddress: { in: wallets, mode: 'insensitive' } },
        select: { id: true, name: true, email: true, walletAddress: true, status: true },
      })
    : [];
  const byWallet = new Map(users.map(u => [u.walletAddress!.toLowerCase(), u]));

  const shaped = rows.map(r => ({
    ...r,
    user: byWallet.get(r.wallet.toLowerCase()) ?? null,
  }));

  if (csv) {
    return csvResponse(
      'loan-transactions',
      ['id', 'type', 'wallet', 'amount_raw', 'txHash', 'blockNumber', 'createdAt', 'userEmail', 'userName'],
      shaped.map(r => [
        r.id, r.type, r.wallet, r.amount, r.txHash, r.blockNumber,
        r.createdAt.toISOString(), r.user?.email ?? '', r.user?.name ?? '',
      ]),
    );
  }

  return NextResponse.json({
    source: 'loan',
    txs: shaped,
    total, page, pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    readOnly: true,
  });
}

function csvResponse(name: string, headers: string[], rows: (string | number)[][]): NextResponse {
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    // Quote anything containing a delimiter, quote or newline; double inner quotes.
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [headers.join(','), ...rows.map(r => r.map(escape).join(','))].join('\r\n');

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
