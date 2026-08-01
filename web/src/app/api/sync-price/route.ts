import { NextResponse } from 'next/server';
import { requireUser, audit } from '@/lib/authz';
import { syncEthPriceDeduped } from '@/lib/price-sync';

// POST /api/sync-price — keeper endpoint: nudge the on-chain ETH price to the
// live market price. Open to every signed-in user (and triggered automatically
// by the dashboard when it notices a drift) because the caller has no say in
// the outcome — the target price is fetched from CoinGecko on the server and
// the walk is capped at the contract's 20%-per-step guard. The admin panel's
// button uses /api/admin/sync-price, which is the same operation behind the
// stricter gate.
export async function POST() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const result = await syncEthPriceDeduped();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (result.steps > 0) {
    await audit(guard.user, 'PRICE_SYNC', 'system', 'CryptoLoan.ethPrice', {
      newPrice: result.newPrice, steps: result.steps, trigger: 'user',
    });
  }

  return NextResponse.json({
    success: true, newPrice: result.newPrice, steps: result.steps, path: result.path,
    ...(result.message ? { message: result.message } : {}),
  });
}
