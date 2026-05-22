'use client';

import { ethers } from 'ethers';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { Skeleton, SkeletonCard } from '@/components/Skeleton';
import { useWallet } from '@/lib/WalletContext';
import { usePrices } from '@/hooks/usePrices';

function hColor(hf: number) { return !isFinite(hf) || hf >= 2 ? '#22c55e' : hf >= 1.5 ? '#eab308' : '#ef4444'; }
function hLabel(hf: number) { return !isFinite(hf) || hf >= 2 ? 'Safe'   : hf >= 1.5 ? 'Moderate' : 'At Risk'; }
function rm(n: number, d = 0) { return 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function short(addr: string)  { return addr.slice(0, 6) + '…' + addr.slice(-4); }

export default function PortfolioPage() {
  const wallet            = useWallet();
  const { prices }        = usePrices();
  const isLive = wallet.isConnected && wallet.isCorrectNetwork && wallet.isDeployed;

  const ethMYR = prices.ethereum.myr;
  const loan   = wallet.loanInfo;

  const colEth  = loan ? parseFloat(ethers.formatEther(loan.collateral)) : 0;
  const borMYR  = loan ? Number(loan.borrowed) / 1e6 : 0;
  const colMYR  = colEth * (isLive ? wallet.ethPriceMYR : ethMYR);
  const netMYR  = colMYR - borMYR;
  const hf      = loan?.healthFactor ?? Infinity;
  const hc      = hColor(hf);
  const ltvUsed = colMYR > 0 ? (borMYR / colMYR) * 100 : 0;
  const liqPrice = isLive ? (wallet.ethPriceMYR * (1 - 0.75 * 0.9)) : 0;

  // Not connected
  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#0D0F1A', color: '#F1F5F9' }}>
        <Navbar />
        <div className="max-w-7xl mx-auto px-6 py-24 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl mb-6"
            style={{ background: 'linear-gradient(135deg, #7C3AED22, #06B6D422)', border: '1px solid #7C3AED33' }}>
            🏦
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Your Portfolio</h1>
          <p className="text-sm mb-8 max-w-md" style={{ color: '#64748B' }}>
            Connect your MetaMask wallet to view your live positions, collateral, borrowed MYR, and health factor.
          </p>
          <button onClick={wallet.connect}
            className="px-6 py-3 rounded-xl text-white font-semibold"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}>
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0D0F1A', color: '#F1F5F9' }}>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-1">Portfolio</h1>
            <p className="text-sm font-mono" style={{ color: '#64748B' }}>{wallet.address}</p>
          </div>
          <button onClick={wallet.refresh}
            className="text-xs px-3 py-2 rounded-lg font-semibold"
            style={{ backgroundColor: '#131629', border: '1px solid #1E2035', color: '#94A3B8' }}>
            ↻ Refresh
          </button>
        </div>

        {/* Overview cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {isLive && wallet.isRefreshing ? (
            [0,1,2,3].map(i => <SkeletonCard key={i} />)
          ) : (
            [
              { label: 'ETH Collateral',   value: `${colEth.toFixed(4)} ETH`,  sub: rm(colMYR),     sc: '#22c55e' },
              { label: 'Borrowed MYR',     value: rm(borMYR, 2),               sub: `${ltvUsed.toFixed(1)}% LTV used`, sc: '#eab308' },
              { label: 'Net Position',     value: rm(netMYR),                  sub: 'Collateral − Debt', sc: '#06B6D4' },
              { label: 'Health Factor',    value: isFinite(hf) ? hf.toFixed(2) : '∞', sub: hLabel(hf), sc: hc },
            ].map(s => (
              <div key={s.label} className="p-4 rounded-xl" style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
                <p className="text-xs mb-1.5" style={{ color: '#64748B' }}>{s.label}</p>
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-xs mt-1" style={{ color: s.sc }}>{s.sub}</p>
              </div>
            ))
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Position detail */}
          <div className="lg:col-span-2 space-y-6">

            {/* Loan position */}
            <div className="rounded-2xl p-6" style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
              <h2 className="text-lg font-semibold text-white mb-5">Active Position</h2>

              {isLive && wallet.isRefreshing ? (
                <div className="space-y-3">
                  {[0,1,2].map(i => (
                    <div key={i} className="p-4 rounded-xl" style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
                      <div className="flex justify-between mb-3">
                        <Skeleton w="w-28" h="h-3" />
                        <Skeleton w="w-20" h="h-3" />
                      </div>
                      <Skeleton w="w-full" h="h-2" className="rounded-full" />
                    </div>
                  ))}
                </div>
              ) : colEth > 0 ? (
                <>
                  {/* Collateral bar */}
                  <div className="p-4 rounded-xl mb-4" style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
                    <div className="flex justify-between text-sm mb-3">
                      <span style={{ color: '#94A3B8' }}>Collateral (ETH)</span>
                      <span className="font-semibold text-white">{colEth.toFixed(4)} ETH</span>
                    </div>
                    <div className="flex justify-between text-xs mb-2" style={{ color: '#64748B' }}>
                      <span>Value: {rm(colMYR)}</span>
                      <span>ETH price: {rm(isLive ? wallet.ethPriceMYR : ethMYR)}</span>
                    </div>
                    <div className="h-2 rounded-full" style={{ backgroundColor: '#1E2035' }}>
                      <div className="h-full rounded-full" style={{ width: '100%', backgroundColor: '#627EEA' }} />
                    </div>
                  </div>

                  {/* Borrowed bar */}
                  <div className="p-4 rounded-xl mb-4" style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
                    <div className="flex justify-between text-sm mb-3">
                      <span style={{ color: '#94A3B8' }}>Borrowed (MYR)</span>
                      <span className="font-semibold text-white">{rm(borMYR, 2)}</span>
                    </div>
                    <div className="flex justify-between text-xs mb-2">
                      <span style={{ color: '#64748B' }}>Used: {ltvUsed.toFixed(1)}% LTV</span>
                      <span style={{ color: '#64748B' }}>Max LTV: 70%</span>
                    </div>
                    <div className="h-2 rounded-full" style={{ backgroundColor: '#1E2035' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min(ltvUsed / 70 * 100, 100)}%`,
                                 backgroundColor: ltvUsed > 60 ? '#ef4444' : ltvUsed > 40 ? '#eab308' : '#22c55e' }} />
                    </div>
                  </div>

                  {/* Health factor */}
                  <div className="p-4 rounded-xl" style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm" style={{ color: '#94A3B8' }}>Health Factor</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold" style={{ color: hc }}>
                          {isFinite(hf) ? hf.toFixed(2) : '∞'}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ backgroundColor: `${hc}1A`, color: hc }}>{hLabel(hf)}</span>
                      </div>
                    </div>
                    <div className="h-3 rounded-full" style={{ backgroundColor: '#1E2035' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min((isFinite(hf) ? hf : 3) / 3 * 100, 100)}%`, backgroundColor: hc }} />
                    </div>
                    <div className="flex justify-between mt-2 text-xs" style={{ color: '#475569' }}>
                      <span>Liquidation (1.0)</span>
                      <span>Safe (2.0+)</span>
                    </div>
                    {isLive && isFinite(hf) && (
                      <p className="text-xs mt-2" style={{ color: '#64748B' }}>
                        Liquidation price: ≈ {rm(liqPrice)} / ETH
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center py-10 text-center rounded-xl"
                  style={{ backgroundColor: '#0D0F1A', border: '1px dashed #1E2035' }}>
                  <p className="text-3xl mb-3">📭</p>
                  <p className="text-sm font-medium text-white mb-1">No open position</p>
                  <p className="text-xs mb-4" style={{ color: '#64748B' }}>Deposit ETH to start borrowing MYR</p>
                  <Link href="/"
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}>
                    Go to Dashboard
                  </Link>
                </div>
              )}
            </div>

            {/* Balances */}
            <div className="rounded-2xl p-6" style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
              <h2 className="text-lg font-semibold text-white mb-5">Wallet Balances</h2>
              <div className="space-y-3">
                {isLive && wallet.isRefreshing ? (
                  [0,1].map(i => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl"
                      style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full animate-pulse" style={{ backgroundColor: '#1E2035' }} />
                        <div><Skeleton w="w-12" h="h-3" className="mb-1.5" /><Skeleton w="w-20" h="h-3" /></div>
                      </div>
                      <div className="text-right"><Skeleton w="w-20" h="h-3" className="mb-1.5" /><Skeleton w="w-14" h="h-3" /></div>
                    </div>
                  ))
                ) : (
                  [
                    { icon: 'Ξ', color: '#627EEA', label: 'ETH', sub: 'Ethereum', value: `${wallet.ethBalance} ETH`, usd: rm(parseFloat(wallet.ethBalance) * (isLive ? wallet.ethPriceMYR : ethMYR)) },
                    { icon: '₿', color: '#22c55e', label: 'MYR', sub: 'Mock Ringgit', value: `RM ${wallet.myrBalance}`, usd: 'Borrowed token' },
                  ].map(b => (
                    <div key={b.label} className="flex items-center justify-between p-3 rounded-xl"
                      style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold"
                          style={{ backgroundColor: `${b.color}1A`, color: b.color }}>{b.icon}</div>
                        <div>
                          <p className="text-sm font-semibold text-white">{b.label}</p>
                          <p className="text-xs" style={{ color: '#64748B' }}>{b.sub}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-white">{b.value}</p>
                        <p className="text-xs" style={{ color: '#64748B' }}>{b.usd}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="space-y-6">

            {/* Quick actions */}
            <div className="rounded-2xl p-6" style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
              <h2 className="text-base font-semibold text-white mb-4">Quick Actions</h2>
              <div className="space-y-2">
                {[
                  { label: 'Deposit Collateral', sub: 'Add ETH to your position',  href: '/?tab=deposit', gradient: 'linear-gradient(135deg, #7C3AED, #5B21B6)' },
                  { label: 'Borrow MYR',         sub: 'Borrow against your ETH',   href: '/?tab=borrow',  gradient: 'linear-gradient(135deg, #7C3AED, #06B6D4)' },
                  { label: 'Repay Loan',         sub: 'Reduce your debt',           href: '/?tab=repay',   gradient: 'linear-gradient(135deg, #06B6D4, #0891B2)' },
                ].map(a => (
                  <Link key={a.label} href={a.href}
                    className="flex items-center justify-between p-3 rounded-xl text-white transition-opacity hover:opacity-90"
                    style={{ background: a.gradient }}>
                    <div>
                      <p className="text-sm font-semibold">{a.label}</p>
                      <p className="text-xs opacity-70">{a.sub}</p>
                    </div>
                    <span className="text-lg">→</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Connection info */}
            <div className="rounded-2xl p-6" style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
              <h2 className="text-base font-semibold text-white mb-4">Connection</h2>
              <div className="space-y-3 text-xs">
                {[
                  { label: 'Address',  value: short(wallet.address!) },
                  { label: 'Network',  value: isLive ? 'Hardhat Local' : 'Wrong network' },
                  { label: 'Chain ID', value: `${wallet.chainId ?? '—'}` },
                  { label: 'Status',   value: wallet.isDeployed ? 'Contracts deployed' : 'Not deployed' },
                ].map(r => (
                  <div key={r.label} className="flex justify-between">
                    <span style={{ color: '#64748B' }}>{r.label}</span>
                    <span className="text-white font-mono">{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
