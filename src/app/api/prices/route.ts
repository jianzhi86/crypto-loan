import { NextResponse } from 'next/server';

const CG_URL =
  'https://api.coingecko.com/api/v3/simple/price' +
  '?ids=bitcoin,ethereum,solana,binancecoin,avalanche-2,chainlink,polkadot,cardano,ripple' +
  '&vs_currencies=myr,usd' +
  '&include_24hr_change=true';

// Cache the result for 15 seconds at the edge
export const revalidate = 15;

export async function GET() {
  try {
    const res = await fetch(CG_URL, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 15 },
    });

    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);

    const raw = await res.json();

    const prices = {
      bitcoin:     { myr: raw.bitcoin?.myr          ?? 0, usd: raw.bitcoin?.usd          ?? 0, change24h: raw.bitcoin?.usd_24h_change          ?? 0 },
      ethereum:    { myr: raw.ethereum?.myr         ?? 0, usd: raw.ethereum?.usd         ?? 0, change24h: raw.ethereum?.usd_24h_change         ?? 0 },
      solana:      { myr: raw.solana?.myr           ?? 0, usd: raw.solana?.usd           ?? 0, change24h: raw.solana?.usd_24h_change           ?? 0 },
      binancecoin: { myr: raw.binancecoin?.myr      ?? 0, usd: raw.binancecoin?.usd      ?? 0, change24h: raw.binancecoin?.usd_24h_change      ?? 0 },
      avax:        { myr: raw['avalanche-2']?.myr   ?? 0, usd: raw['avalanche-2']?.usd   ?? 0, change24h: raw['avalanche-2']?.usd_24h_change   ?? 0 },
      chainlink:   { myr: raw.chainlink?.myr        ?? 0, usd: raw.chainlink?.usd        ?? 0, change24h: raw.chainlink?.usd_24h_change        ?? 0 },
      polkadot:    { myr: raw.polkadot?.myr         ?? 0, usd: raw.polkadot?.usd         ?? 0, change24h: raw.polkadot?.usd_24h_change         ?? 0 },
      cardano:     { myr: raw.cardano?.myr          ?? 0, usd: raw.cardano?.usd          ?? 0, change24h: raw.cardano?.usd_24h_change          ?? 0 },
      ripple:      { myr: raw.ripple?.myr           ?? 0, usd: raw.ripple?.usd           ?? 0, change24h: raw.ripple?.usd_24h_change           ?? 0 },
    };

    return NextResponse.json({ ok: true, prices }, {
      headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=10' },
    });
  } catch (err) {
    console.error('[GET /api/prices]', err);
    return NextResponse.json({ ok: false, error: 'Failed to fetch prices' }, { status: 502 });
  }
}
