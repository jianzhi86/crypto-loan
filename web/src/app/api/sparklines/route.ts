import { NextResponse } from 'next/server';

// coins/markets with sparkline=true returns 7 days of hourly prices in one
// request for all coins — the last 25 points are the trailing 24 hours. One
// upstream call instead of ten per-coin /market_chart calls keeps us far away
// from CoinGecko's free-tier rate limit.
const CG_URL =
  'https://api.coingecko.com/api/v3/coins/markets' +
  '?vs_currency=myr' +
  '&ids=bitcoin,ethereum,solana,binancecoin,avalanche-2,chainlink,polkadot,cardano,ripple,matic-network' +
  '&sparkline=true';

// Hourly data — refreshing faster than every 5 minutes buys nothing.
export const revalidate = 300;

// CoinGecko ids → the keys the frontend Prices map already uses.
const ID_TO_KEY: Record<string, string> = {
  'avalanche-2':   'avax',
  'matic-network': 'polygon',
};

export async function GET() {
  try {
    const res = await fetch(CG_URL, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);

    const raw = await res.json() as { id: string; sparkline_in_7d?: { price?: number[] } }[];

    const sparklines: Record<string, number[]> = {};
    for (const coin of raw) {
      const key = ID_TO_KEY[coin.id] ?? coin.id;
      const points = coin.sparkline_in_7d?.price ?? [];
      sparklines[key] = points.slice(-25);
    }

    return NextResponse.json({ ok: true, sparklines }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
    });
  } catch (err) {
    console.error('[GET /api/sparklines]', err);
    return NextResponse.json({ ok: false, error: 'Failed to fetch sparklines' }, { status: 502 });
  }
}
