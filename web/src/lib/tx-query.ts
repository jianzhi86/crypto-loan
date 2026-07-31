import type { Prisma } from '@prisma/client';

/**
 * Shared filtering for the transaction ledger, used by both the admin view and
 * the public explorer so the two can never drift apart in what they consider a
 * match. Only the *projection* differs between them, never the predicate.
 */

export const TX_TYPES = [
  'CollateralDeposited',
  'CollateralWithdrawn',
  'Borrowed',
  'Repaid',
  'MYRPurchased',
] as const;

export type TxTypeName = (typeof TX_TYPES)[number];

export const TX_LABELS: Record<string, string> = {
  CollateralDeposited: 'Deposited ETH',
  CollateralWithdrawn: 'Withdrew ETH',
  Borrowed:            'Borrowed MYR',
  Repaid:              'Repaid MYR',
  MYRPurchased:        'Bought MYR',
};

/** Which unit the stored `amount` is denominated in, per event type. */
export const TX_UNIT: Record<string, 'ETH' | 'MYR'> = {
  CollateralDeposited: 'ETH',
  CollateralWithdrawn: 'ETH',
  Borrowed:            'MYR',
  Repaid:              'MYR',
  MYRPurchased:        'MYR',
};

/**
 * Decimal scale of the stored `amount`, per event type.
 *
 * These differ: ETH collateral is 18-decimal wei, while the MYR token is
 * 6-decimal (the dashboard divides those by 1e6). Formatting everything as 18
 * silently renders every ringgit figure as 0.0000, so the scale has to be
 * chosen per event type rather than assumed.
 */
export const TX_DECIMALS: Record<string, number> = {
  CollateralDeposited: 18,
  CollateralWithdrawn: 18,
  Borrowed:            6,
  Repaid:              6,
  MYRPurchased:        6,
};

/** Format a stored amount using the right scale for its event type. */
export function formatTxAmount(type: string, raw: string): string {
  return formatUnitsStr(raw, TX_DECIMALS[type] ?? 18, TX_DECIMALS[type] === 6 ? 2 : 4);
}

export interface TxFilters {
  q?: string;
  type?: string;
  from?: string;
  to?: string;
}

export function parseTxFilters(sp: URLSearchParams): TxFilters {
  return {
    q:    sp.get('q')?.trim() || undefined,
    type: sp.get('type')?.trim() || undefined,
    from: sp.get('from')?.trim() || undefined,
    to:   sp.get('to')?.trim() || undefined,
  };
}

export function buildTxWhere(f: TxFilters): Prisma.LoanTransactionWhereInput {
  const where: Prisma.LoanTransactionWhereInput = {};

  if (f.type && (TX_TYPES as readonly string[]).includes(f.type)) {
    where.type = f.type;
  }

  if (f.q) {
    const q = f.q;
    where.OR = [
      { wallet: { contains: q.toLowerCase() } },
      { txHash: { contains: q, mode: 'insensitive' } },
      // A bare number is almost always someone pasting a block height.
      ...(/^\d+$/.test(q) ? [{ blockNumber: Number(q) }] : []),
    ];
  }

  // Dates arrive as yyyy-mm-dd from <input type="date">. `to` is pushed to the
  // end of that day so a single-day range actually includes that day.
  const createdAt: Prisma.DateTimeFilter = {};
  if (f.from) {
    const d = new Date(`${f.from}T00:00:00`);
    if (!Number.isNaN(d.getTime())) createdAt.gte = d;
  }
  if (f.to) {
    const d = new Date(`${f.to}T23:59:59.999`);
    if (!Number.isNaN(d.getTime())) createdAt.lte = d;
  }
  if (createdAt.gte || createdAt.lte) where.createdAt = createdAt;

  return where;
}

/** 0x1234abcd…9f21 — the form used everywhere a wallet is shown publicly. */
export function shortWallet(w: string): string {
  return w.length > 14 ? `${w.slice(0, 10)}…${w.slice(-4)}` : w;
}

/** Stored amounts are wei-scale decimal strings; render without float error. */
export function formatUnitsStr(raw: string, decimals = 18, dp = 4): string {
  let v: bigint;
  try { v = BigInt(raw); } catch { return raw; }

  // BigInt literals (0n, 10n) need an ES2020 target; this project targets
  // ES2017, so the constructor form is used throughout.
  const ZERO  = BigInt(0);
  const neg   = v < ZERO;
  if (neg) v = -v;
  const base  = BigInt(10) ** BigInt(decimals);
  const whole = v / base;
  const frac  = (v % base).toString().padStart(decimals, '0').slice(0, dp).replace(/0+$/, '');

  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${grouped}${frac ? '.' + frac : ''}`;
}
