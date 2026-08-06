import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { readChainStats } from '@/lib/contract-read';

/**
 * GET /api/protocol-stats — protocol-wide figures for the dashboard and markets
 * banners.
 *
 * Public, for the same reason /api/explorer is: everything here mirrors
 * contract state that anyone can read on-chain anyway, so gating it would
 * protect nothing. The per-wallet counts are aggregates only — no identity, no
 * addresses, nothing that isn't already visible in the event log.
 *
 * These pages are client components, and useWallet() returns early when no
 * wallet is connected, so a signed-in visitor without MetaMask had no source of
 * live protocol numbers at all. That gap is what the invented "RM 892M TVL"
 * placeholders used to fill.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const chain = await readChainStats();

  let openBorrows = 0;
  let borrowers = 0;
  try {
    const [count, wallets] = await Promise.all([
      prisma.borrowPosition.count({ where: { status: 'OPEN' } }),
      prisma.borrowPosition.groupBy({ by: ['wallet'], where: { status: 'OPEN' } }),
    ]);
    openBorrows = count;
    borrowers = wallets.length;
  } catch (err) {
    // A DB hiccup must not blank the on-chain half of the response — the
    // caller renders "—" per tile, so partial data is strictly better than none.
    console.error('[GET /api/protocol-stats] ledger counts failed:', err);
  }

  return NextResponse.json({ chain, openBorrows, borrowers });
}
