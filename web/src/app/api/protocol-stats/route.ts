import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { readChainStats } from '@/lib/contract-read';
import { getOnChainPosition } from '@/lib/kyc/chain';

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
    const wallets = await prisma.borrowPosition.groupBy({ by: ['wallet'], where: { status: 'OPEN' } });

    // Reconcile each open wallet against the chain before counting: a
    // redeployed/reset contract wipes on-chain debt but the DB ledger has no
    // way to know, so a stale row would otherwise inflate this tile forever.
    // Wallet count here is small (dev/demo scale) so a bounded per-wallet RPC
    // read is cheap; a read failure just leaves that wallet's rows as-is.
    const staleWallets: string[] = [];
    await Promise.all(wallets.map(async ({ wallet }) => {
      try {
        const pos = await getOnChainPosition(wallet);
        if (pos.principal === BigInt(0)) staleWallets.push(wallet);
      } catch (err) {
        console.error('[GET /api/protocol-stats] chain reconcile failed for', wallet, err);
      }
    }));
    if (staleWallets.length > 0) {
      await prisma.borrowPosition.updateMany({
        where: { wallet: { in: staleWallets }, status: 'OPEN' },
        data:  { status: 'REPAID', repaidAt: new Date() },
      });
    }

    const count = await prisma.borrowPosition.count({ where: { status: 'OPEN' } });
    openBorrows = count;
    borrowers = wallets.length - staleWallets.length;
  } catch (err) {
    // A DB hiccup must not blank the on-chain half of the response — the
    // caller renders "—" per tile, so partial data is strictly better than none.
    console.error('[GET /api/protocol-stats] ledger counts failed:', err);
  }

  return NextResponse.json({ chain, openBorrows, borrowers });
}
