import { NextResponse } from 'next/server';
import { requireAdmin, audit } from '@/lib/authz';
import { syncEthPriceDeduped } from '@/lib/price-sync';

// POST /api/admin/sync-price — the admin panel's manual sync button.
// Same keeper operation as /api/sync-price (shared lib); kept as a separate
// admin-gated route so the admin surface stays fully admin-only and the audit
// trail distinguishes a deliberate admin action from a user/auto trigger.
export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const result = await syncEthPriceDeduped();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (result.steps > 0) {
    await audit(guard.user, 'PRICE_SYNC', 'system', 'CryptoLoan.ethPrice', {
      newPrice: result.newPrice, steps: result.steps, trigger: 'admin',
    });
  }

  return NextResponse.json({
    success: true, newPrice: result.newPrice, steps: result.steps, path: result.path,
    ...(result.message ? { message: result.message } : {}),
  });
}
