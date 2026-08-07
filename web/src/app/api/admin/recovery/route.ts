import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/authz';
import { findBorrowerWallets, findRecoverable, readContract, RecoveryUnavailable } from '@/lib/admin/recovery';

// GET /api/admin/recovery — every loan the protocol could act on right now.
//
// This is the "notification" the admin panel badges: a loan appears here the
// moment it passes its due date + 7-day grace, or the moment the account's
// health factor drops below 1.
//
// Candidates AND figures both come from the chain. Using the DB ledger to pick
// which wallets to check was wrong twice over: it holds other machines' chains,
// and after a redeploy its rows for this wallet still read REPAID/LIQUIDATED
// from a chain that is gone — so it reported nobody owing anything while the
// contract held a live loan at health factor 0.90. The DB is now used only to
// put a name against a wallet.
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const wallets = await findBorrowerWallets();
    const c = await readContract();
    const [loans, penaltyBps, ethPrice] = await Promise.all([
      findRecoverable(wallets),
      (c.latePenaltyBps as () => Promise<bigint>)().then(Number).catch(() => 0),
      (c.ethPrice as () => Promise<bigint>)().then(Number).catch(() => 0),
    ]);

    // Emails let the admin see who they are about to act on, joined here rather
    // than in the loop above so one query covers every wallet.
    const users = await prisma.user.findMany({
      where: { walletAddress: { in: loans.map(l => l.wallet) } },
      select: { walletAddress: true, email: true },
    });
    const emailByWallet = new Map(
      users.filter(u => u.walletAddress).map(u => [u.walletAddress!.toLowerCase(), u.email]),
    );

    return NextResponse.json({
      loans: loans.map(l => ({ ...l, email: emailByWallet.get(l.wallet) ?? null })),
      latePenaltyBps: penaltyBps,
      ethPriceMYR: ethPrice,
      overdueCount:   loans.filter(l => l.overdue).length,
      unhealthyCount: loans.filter(l => l.unhealthy && !l.overdue).length,
    });
  } catch (err) {
    if (err instanceof RecoveryUnavailable) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin/recovery] GET', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
