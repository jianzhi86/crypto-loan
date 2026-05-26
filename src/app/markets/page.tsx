'use client';

import { useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { Skeleton } from '@/components/Skeleton';
import { usePrices, SYMBOL_TO_ID } from '@/hooks/usePrices';

const MARKETS = [
  { symbol: 'BTC',  name: 'Bitcoin',   icon: '₿', color: '#F7931A', id: 'bitcoin',     supplyAPR: 2.1, borrowAPR: 5.2, maxLTV: 70, liqThresh: 80, liquidity: 'RM 11.2B', totalBorrowed: 'RM 7.8B',  util: 70 },
  { symbol: 'ETH',  name: 'Ethereum',  icon: 'Ξ', color: '#627EEA', id: 'ethereum',    supplyAPR: 1.8, borrowAPR: 4.8, maxLTV: 75, liqThresh: 85, liquidity: 'RM 8.5B',  totalBorrowed: 'RM 5.3B',  util: 62 },
  { symbol: 'SOL',  name: 'Solana',    icon: '◎', color: '#9945FF', id: 'solana',      supplyAPR: 3.2, borrowAPR: 6.5, maxLTV: 65, liqThresh: 75, liquidity: 'RM 1.9B',  totalBorrowed: 'RM 1.1B',  util: 58 },
  { symbol: 'BNB',  name: 'BNB Chain', icon: 'B', color: '#F3BA2F', id: 'binancecoin', supplyAPR: 2.4, borrowAPR: 5.8, maxLTV: 65, liqThresh: 75, liquidity: 'RM 3.1B',  totalBorrowed: 'RM 1.7B',  util: 55 },
  { symbol: 'XRP',  name: 'XRP',       icon: 'X', color: '#00AAE4', id: 'ripple',      supplyAPR: 4.8, borrowAPR: 7.8, maxLTV: 55, liqThresh: 65, liquidity: 'RM 720M',  totalBorrowed: 'RM 288M',  util: 40 },
  { symbol: 'AVAX', name: 'Avalanche', icon: 'A', color: '#E84142', id: 'avax',        supplyAPR: 4.1, borrowAPR: 7.2, maxLTV: 60, liqThresh: 70, liquidity: 'RM 840M',  totalBorrowed: 'RM 420M',  util: 50 },
  { symbol: 'LINK', name: 'Chainlink', icon: 'L', color: '#2A5ADA', id: 'chainlink',   supplyAPR: 4.5, borrowAPR: 7.5, maxLTV: 60, liqThresh: 70, liquidity: 'RM 520M',  totalBorrowed: 'RM 240M',  util: 46 },
  { symbol: 'DOT',  name: 'Polkadot',  icon: 'D', color: '#E6007A', id: 'polkadot',   supplyAPR: 5.0, borrowAPR: 8.0, maxLTV: 55, liqThresh: 65, liquidity: 'RM 310M',  totalBorrowed: 'RM 130M',  util: 42 },
  { symbol: 'ADA',  name: 'Cardano',   icon: '₳', color: '#0033AD', id: 'cardano',    supplyAPR: 5.5, borrowAPR: 8.5, maxLTV: 50, liqThresh: 60, liquidity: 'RM 280M',  totalBorrowed: 'RM 108M',  util: 38 },
  { symbol: 'MATIC', name: 'Polygon',  icon: 'M', color: '#8247E5', id: null,          supplyAPR: 5.2, borrowAPR: 8.5, maxLTV: 55, liqThresh: 65, liquidity: 'RM 445M',  totalBorrowed: 'RM 196M',  util: 44 },
];

const MATIC_PRICE = { myr: 4.34, usd: 0.92, change24h: 3.2 };

type FilterKey = 'all' | 'top-yield' | 'lowest-borrow';

export default function MarketsPage() {
  const { prices, loading, lastUpdated, flash } = usePrices();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch]  = useState('');

  const getPrice = (m: typeof MARKETS[0]) => {
    if (m.id && SYMBOL_TO_ID[m.symbol]) return prices[SYMBOL_TO_ID[m.symbol]];
    if (m.symbol === 'MATIC') return MATIC_PRICE;
    return { myr: 0, usd: 0, change24h: 0 };
  };

  let displayed = MARKETS.filter(m =>
    m.symbol.toLowerCase().includes(search.toLowerCase()) ||
    m.name.toLowerCase().includes(search.toLowerCase())
  );
  if (filter === 'top-yield')     displayed = [...displayed].sort((a, b) => b.supplyAPR - a.supplyAPR);
  if (filter === 'lowest-borrow') displayed = [...displayed].sort((a, b) => a.borrowAPR - b.borrowAPR);

  const totalTVL = 'RM 28.3B';
  const totalBor = 'RM 17.5B';

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0D0F1A', color: '#F1F5F9' }}>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Markets</h1>
            <p className="text-sm" style={{ color: '#64748B' }}>
              Borrow MYR against your crypto collateral · Prices in Malaysian Ringgit (RM)
            </p>
          </div>
          {loading ? (
            <Skeleton w="w-36" h="h-3" className="mt-2" />
          ) : lastUpdated && (
            <p className="text-xs mt-1" style={{ color: '#475569' }}>
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Market stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Value Locked', value: totalTVL, sub: 'Across all assets', c: '#22c55e' },
            { label: 'Total Borrowed',     value: totalBor, sub: '61.8% utilisation',  c: '#eab308' },
            { label: 'Avg Borrow APR',     value: '7.1%',   sub: 'Weighted average',   c: '#ef4444' },
            { label: 'Avg Supply APR',     value: '3.9%',   sub: 'Weighted average',   c: '#22c55e' },
          ].map(s => (
            <div key={s.label} className="p-4 rounded-xl" style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
              <p className="text-xs mb-1.5" style={{ color: '#64748B' }}>{s.label}</p>
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs mt-1" style={{ color: s.c }}>{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Filter + search */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex gap-2">
            {([['all', 'All Markets'], ['top-yield', 'Top Yield'], ['lowest-borrow', 'Lowest Borrow']] as [FilterKey, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  backgroundColor: filter === k ? '#7C3AED' : '#131629',
                  color: filter === k ? '#fff' : '#64748B',
                  border: `1px solid ${filter === k ? '#7C3AED' : '#1E2035'}`,
                }}>
                {l}
              </button>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search asset…"
            className="px-3 py-1.5 rounded-lg text-xs outline-none w-40"
            style={{ backgroundColor: '#131629', border: '1px solid #1E2035', color: '#F1F5F9' }} />
        </div>

        {/* Market table */}
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1E2035' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: '#131629', borderBottom: '1px solid #1E2035' }}>
                {['Asset', 'Price (MYR)', '24h', 'Max LTV', 'Liq. Threshold', 'Borrow APR', 'Supply APR', 'Utilisation', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-medium" style={{ color: '#64748B' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((m, i) => {
                const p     = getPrice(m);
                const odd   = i % 2 === 0;
                const priceKey = m.id ? (m.id as keyof typeof flash) : undefined;
                const flashDir = priceKey ? flash[priceKey] : undefined;
                return (
                  <tr key={m.symbol}
                    style={{ backgroundColor: odd ? '#0D0F1A' : '#0F111D', borderBottom: '1px solid #1E2035' }}>

                    {/* Asset */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                          style={{ backgroundColor: `${m.color}1A`, color: m.color }}>{m.icon}</div>
                        <div>
                          <p className="font-semibold text-white">{m.symbol}</p>
                          <p className="text-xs" style={{ color: '#64748B' }}>{m.name}</p>
                        </div>
                      </div>
                    </td>

                    {/* Price */}
                    <td className={`px-4 py-4 rounded ${flashDir ? `price-flash-${flashDir}` : ''}`}>
                      {loading && m.id ? (
                        <>
                          <Skeleton w="w-24" h="h-4" className="mb-1.5" />
                          <Skeleton w="w-16" h="h-3" />
                        </>
                      ) : (
                        <>
                          <p className="font-semibold text-white">
                            {`RM ${p.myr.toLocaleString('en-MY', { minimumFractionDigits: p.myr < 10 ? 2 : 0, maximumFractionDigits: p.myr < 10 ? 2 : 0 })}`}
                          </p>
                          <p className="text-xs" style={{ color: '#64748B' }}>
                            ${p.usd.toLocaleString('en-US', { minimumFractionDigits: p.usd < 10 ? 2 : 0, maximumFractionDigits: p.usd < 10 ? 2 : 0 })}
                          </p>
                        </>
                      )}
                    </td>

                    {/* 24h */}
                    <td className="px-4 py-4">
                      {loading && m.id ? (
                        <Skeleton w="w-14" h="h-5" className="rounded-full" />
                      ) : (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: p.change24h >= 0 ? '#22c55e20' : '#ef444420',
                            color: p.change24h >= 0 ? '#22c55e' : '#ef4444',
                          }}>
                          {p.change24h >= 0 ? '+' : ''}{p.change24h.toFixed(2)}%
                        </span>
                      )}
                    </td>

                    {/* Max LTV */}
                    <td className="px-4 py-4 font-semibold" style={{ color: '#06B6D4' }}>{m.maxLTV}%</td>

                    {/* Liq Threshold */}
                    <td className="px-4 py-4 text-xs" style={{ color: '#94A3B8' }}>{m.liqThresh}%</td>

                    {/* Borrow APR */}
                    <td className="px-4 py-4">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ backgroundColor: '#ef444420', color: '#ef4444' }}>{m.borrowAPR}%</span>
                    </td>

                    {/* Supply APR */}
                    <td className="px-4 py-4">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}>{m.supplyAPR}%</span>
                    </td>

                    {/* Utilisation */}
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: '#1E2035', minWidth: 48 }}>
                          <div className="h-full rounded-full"
                            style={{ width: `${m.util}%`, backgroundColor: m.util > 75 ? '#ef4444' : m.util > 50 ? '#eab308' : '#22c55e' }} />
                        </div>
                        <span className="text-xs" style={{ color: '#94A3B8' }}>{m.util}%</span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-4">
                      <Link href={`/?asset=${m.symbol}`}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white inline-block"
                        style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}>
                        Borrow
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Disclaimer */}
        <p className="text-xs mt-6 text-center" style={{ color: '#334155' }}>
          Prices sourced from CoinGecko API in real-time · APR rates and LTV limits are protocol parameters set by the smart contract owner · For testnet use only
        </p>
      </main>
    </div>
  );
}
