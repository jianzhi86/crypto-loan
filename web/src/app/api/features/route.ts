import { NextResponse } from 'next/server';
import { getFlags } from '@/lib/features-server';

/**
 * GET /api/features — current flag states, for the client-side provider.
 *
 * Public and unauthenticated by design: the signed-out marketing pages and the
 * login screen need to know whether sign-ups are closed. Flag states are not
 * secrets — they describe what the UI already visibly does.
 */
export async function GET() {
  const flags = await getFlags();
  return NextResponse.json(
    { flags },
    // Never let a CDN or the browser pin a stale flag map; toggling a feature
    // off has to reach clients on their next poll, not after a cache expiry.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
