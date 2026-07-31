import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/authz';
import { buildTxWhere, parseTxFilters } from '@/lib/tx-query';
import type { Prisma } from '@prisma/client';

/**
 * GET /api/admin/transactions — the full ledger, with identity joined on.
 *
 * Covers both halves of the system:
 *  - `loan`     : on-chain events mirrored into LoanTransaction. READ-ONLY.
 *                 There is no PATCH/DELETE here and there never should be —
 *                 the chain is the record of truth and this table is a copy.
 *  - `transfer` : off-chain BankTransfer rows, which admins may act on.
 *
 * Supports `format=csv` for export.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const sp       = req.nextUrl.searchParams;
  const source   = sp.get('source') ?? 'loan';
  const filters  = parseTxFilters(sp);
  const page     = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(10, Number(sp.get('pageSize') ?? 50) || 50));
  const csv      = sp.get('format') === 'csv';

  try {
    if (source === 'transfer') return transfers(sp, page, pageSize, csv);
    return loans(filters, page, pageSize, csv);
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

async function transfers(sp: URLSearchParams, page: number, pageSize: number, csv: boolean) {
  const q      = sp.get('q')?.trim();
  const status = sp.get('status')?.trim();

  const where: Prisma.BankTransferWhereInput = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { referenceNo: { contains: q, mode: 'insensitive' } },
      { bankName:    { contains: q, mode: 'insensitive' } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
      { user: { name:  { contains: q, mode: 'insensitive' } } },
    ];
  }

  const from = sp.get('from');
  const to   = sp.get('to');
  const createdAt: Prisma.DateTimeFilter = {};
  if (from) { const d = new Date(`${from}T00:00:00`);     if (!Number.isNaN(d.getTime())) createdAt.gte = d; }
  if (to)   { const d = new Date(`${to}T23:59:59.999`);   if (!Number.isNaN(d.getTime())) createdAt.lte = d; }
  if (createdAt.gte || createdAt.lte) where.createdAt = createdAt;

  const [total, rows] = await Promise.all([
    prisma.bankTransfer.count({ where }),
    prisma.bankTransfer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: csv ? 0 : (page - 1) * pageSize,
      take: csv ? 10_000 : pageSize,
      include: { user: { select: { id: true, name: true, email: true, status: true } } },
    }),
  ]);

  if (csv) {
    return csvResponse(
      'bank-transfers',
      ['id', 'referenceNo', 'amountMYR', 'status', 'bankName', 'accountLast4', 'createdAt', 'completedAt', 'userEmail'],
      rows.map(r => [
        r.id, r.referenceNo, r.amountMYR, r.status, r.bankName, r.accountLast4,
        r.createdAt.toISOString(), r.completedAt?.toISOString() ?? '', r.user?.email ?? '',
      ]),
    );
  }

  return NextResponse.json({
    source: 'transfer',
    txs: rows,
    total, page, pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    readOnly: false,
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
