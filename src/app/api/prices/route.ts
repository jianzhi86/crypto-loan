import { NextResponse } from 'next/server';

const CG_URL =
  'https://api.coingecko.com/api/v3/simple/price' +
  '?ids=bitcoin,ethereum,solana,binancecoin' +
  '&vs_currencies=myr,usd' +
  '&include_24hr_change=true';

// Cache the result for 60 seconds at the edge
export const revalidate = 60;

export async function GET() {
  try {
    const res = await fetch(CG_URL, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
    });

    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);

    const raw = await res.json();

    const prices = {
      bitcoin:     { myr: raw.bitcoin?.myr     ?? 0, usd: raw.bitcoin?.usd     ?? 0, change24h: raw.bitcoin?.usd_24h_change     ?? 0 },
      ethereum:    { myr: raw.ethereum?.myr    ?? 0, usd: raw.ethereum?.usd    ?? 0, change24h: raw.ethereum?.usd_24h_change    ?? 0 },
      solana:      { myr: raw.solana?.myr      ?? 0, usd: raw.solana?.usd      ?? 0, change24h: raw.solana?.usd_24h_change      ?? 0 },
      binancecoin: { myr: raw.binancecoin?.myr ?? 0, usd: raw.binancecoin?.usd ?? 0, change24h: raw.binancecoin?.usd_24h_change ?? 0 },
    };

    return NextResponse.json({ ok: true, prices }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('[GET /api/prices]', err);
    return NextResponse.json({ ok: false, error: 'Failed to fetch prices' }, { status: 502 });
  }
}
