'use client';

import { useState, useEffect, useCallback } from 'react';

export interface CoinPrice {
  myr: number;
  usd: number;
  change24h: number;
}

export interface Prices {
  bitcoin:     CoinPrice;
  ethereum:    CoinPrice;
  solana:      CoinPrice;
  binancecoin: CoinPrice;
}

// Fallback prices (used when API is unreachable)
const FALLBACK: Prices = {
  bitcoin:     { myr: 315000, usd: 67420, change24h:  2.4  },
  ethereum:    { myr: 18200,  usd: 3840,  change24h: -0.8  },
  solana:      { myr:   856,  usd:  182,  change24h:  5.2  },
  binancecoin: { myr:  2880,  usd:  612,  change24h:  1.1  },
};

const API_URL =
  'https://api.coingecko.com/api/v3/simple/price' +
  '?ids=bitcoin,ethereum,solana,binancecoin' +
  '&vs_currencies=myr,usd' +
  '&include_24hr_change=true';

export function usePrices() {
  const [prices, setPrices]           = useState<Prices>(FALLBACK);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchPrices = useCallback(async () => {
    try {
      const res  = await fetch(API_URL, { next: { revalidate: 60 } });
      if (!res.ok) throw new Error('non-200');
      const data = await res.json();

      const parse = (id: string): CoinPrice => ({
        myr:      data[id]?.myr       ?? FALLBACK[id as keyof Prices].myr,
        usd:      data[id]?.usd       ?? FALLBACK[id as keyof Prices].usd,
        change24h: data[id]?.usd_24h_change ?? FALLBACK[id as keyof Prices].change24h,
      });

      setPrices({
        bitcoin:     parse('bitcoin'),
        ethereum:    parse('ethereum'),
        solana:      parse('solana'),
        binancecoin: parse('binancecoin'),
      });
      setError(false);
      setLastUpdated(new Date());
    } catch {
      setError(true);
      // keep existing/fallback prices
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    const id = setInterval(fetchPrices, 60_000);
    return () => clearInterval(id);
  }, [fetchPrices]);

  return { prices, loading, error, lastUpdated, refetch: fetchPrices };
}

// Keyed by asset symbol → CoinGecko id
export const SYMBOL_TO_ID: Record<string, keyof Prices> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
};
