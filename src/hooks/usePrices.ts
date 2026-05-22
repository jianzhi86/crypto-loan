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

const FALLBACK: Prices = {
  bitcoin:     { myr: 315000, usd: 67420, change24h:  2.4 },
  ethereum:    { myr: 18200,  usd: 3840,  change24h: -0.8 },
  solana:      { myr:   856,  usd:  182,  change24h:  5.2 },
  binancecoin: { myr:  2880,  usd:  612,  change24h:  1.1 },
};

export function usePrices() {
  const [prices, setPrices]           = useState<Prices>(FALLBACK);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch('/api/prices');
      if (!res.ok) throw new Error(`/api/prices ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error('upstream error');

      setPrices(data.prices);
      setError(false);
      setLastUpdated(new Date());
    } catch {
      setError(true);
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

export const SYMBOL_TO_ID: Record<string, keyof Prices> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  BNB: 'binancecoin',
};
