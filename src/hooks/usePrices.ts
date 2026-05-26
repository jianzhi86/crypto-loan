'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

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
  avax:        CoinPrice;
  chainlink:   CoinPrice;
  polkadot:    CoinPrice;
  cardano:     CoinPrice;
  ripple:      CoinPrice;
}

export type FlashDir = 'up' | 'down';
export type PriceFlash = Partial<Record<keyof Prices, FlashDir>>;

const FALLBACK: Prices = {
  bitcoin:     { myr: 315000, usd: 67420, change24h:  2.4 },
  ethereum:    { myr: 18200,  usd:  3840, change24h: -0.8 },
  solana:      { myr:   856,  usd:   182, change24h:  5.2 },
  binancecoin: { myr:  2880,  usd:   612, change24h:  1.1 },
  avax:        { myr:   179,  usd:    38, change24h: -1.5 },
  chainlink:   { myr:    71,  usd:    15, change24h:  2.1 },
  polkadot:    { myr:    38,  usd:     8, change24h: -0.4 },
  cardano:     { myr:  2.13,  usd:  0.45, change24h:  1.8 },
  ripple:      { myr:  2.46,  usd:  0.52, change24h:  3.5 },
};

export function usePrices() {
  const [prices, setPrices]           = useState<Prices>(FALLBACK);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [flash, setFlash]             = useState<PriceFlash>({});
  const prevPrices                    = useRef<Prices | null>(null);

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch('/api/prices');
      if (!res.ok) throw new Error(`/api/prices ${res.status}`);
      const data = await res.json();
      if (!data.ok) throw new Error('upstream error');

      const next: Prices = data.prices;

      if (prevPrices.current) {
        const newFlash: PriceFlash = {};
        (Object.keys(next) as (keyof Prices)[]).forEach(coin => {
          const prev = prevPrices.current![coin].usd;
          const curr = next[coin].usd;
          if (curr > prev) newFlash[coin] = 'up';
          else if (curr < prev) newFlash[coin] = 'down';
        });
        if (Object.keys(newFlash).length > 0) {
          setFlash(newFlash);
          setTimeout(() => setFlash({}), 1500);
        }
      }

      prevPrices.current = next;
      setPrices(next);
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
    const id = setInterval(fetchPrices, 15_000);
    return () => clearInterval(id);
  }, [fetchPrices]);

  return { prices, loading, error, lastUpdated, flash, refetch: fetchPrices };
}

export const SYMBOL_TO_ID: Record<string, keyof Prices> = {
  BTC:  'bitcoin',
  ETH:  'ethereum',
  SOL:  'solana',
  BNB:  'binancecoin',
  AVAX: 'avax',
  LINK: 'chainlink',
  DOT:  'polkadot',
  ADA:  'cardano',
  XRP:  'ripple',
};
