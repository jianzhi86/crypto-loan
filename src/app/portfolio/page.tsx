'use client';

import { ethers } from 'ethers';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { Skeleton, SkeletonCard } from '@/components/Skeleton';
import { useWallet } from '@/lib/WalletContext';
import { usePrices } from '@/hooks/usePrices';

const APR       = 4.8;
const ORIG_FEE  = 0.001;
const MAX_LTV   = 70;
const LIQ_THRES = 80;

function hColor(hf: number) { return !isFinite(hf) || hf >= 2 ? '#22c55e' : hf >= 1.5 ? '#eab308' : '#ef4444'; }
function hLabel(hf: number) { return !isFinite(hf) || hf >= 2 ? 'Safe' : hf >= 1.5 ? 'Moderate' : 'At Risk'; }
function rm(n: number, d = 0) { return 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function short(addr: string) { return addr.slice(0, 6) + '…' + addr.slice(-4); }
function pct(n: number, d = 1) { return n.toFixed(d) + '%'; }

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function formatDate(d: Date) {
  return d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PortfolioPage() {
  const wallet       = useWallet();
  const { prices }   = usePrices();
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

  // Liquidation price: HF = 1 → colEth * liqPrice * 0.75 = borMYR → liqPrice = borMYR / (colEth * 0.75)
  const liqPrice  = colEth > 0 && borMYR > 0 ? borMYR / (colEth * (LIQ_THRES / 100)) : 0;
  const priceDrop = isLive && wallet.ethPriceMYR > 0 && liqPrice > 0
    ? ((wallet.ethPriceMYR - liqPrice) / wallet.ethPriceMYR) * 100 : 0;

  // Loan timeline — persisted to localStorage per wallet
  const [borrowDate, setBorrowDate] = useState<Date | null>(null);
  const [loanTerm]  = useState(90); // default 90-day term in demo

  useEffect(() => {
    if (!wallet.address || borMYR === 0) { setBorrowDate(null); return; }
    const key = `borrowDate_${wallet.address.toLowerCase()}`;
    let stored = localStorage.getItem(key);
    if (!stored) {
      // Simulate a borrow date 15 days ago for demo
      const demo = new Date();
      demo.setDate(demo.getDate() - 15);
      stored = demo.toISOString();
      localStorage.setItem(key, stored);
    }
    setBorrowDate(new Date(stored));
  }, [wallet.address, borMYR]);

  const today       = new Date();
  const daysElapsed = borrowDate ? Math.max(0, Math.floor((today.getTime() - borrowDate.getTime()) / 86400000)) : 0;
  const daysLeft    = Math.max(0, loanTerm - daysElapsed);
  const maturityDate = borrowDate ? addDays(borrowDate, loanTerm) : null;
  const progressPct  = loanTerm > 0 ? Math.min((daysElapsed / loanTerm) * 100, 100) : 0;

  // Interest calculations
  const origFee       = borMYR * ORIG_FEE;
  const accruedInt    = borMYR * (APR / 100) * (daysElapsed / 365);
  const projTotalInt  = borMYR * (APR / 100) * (loanTerm / 365);
  const totalRepay    = borMYR + accruedInt;
  const fullRepay     = borMYR + projTotalInt;
  const dailyInt      = borMYR * (APR / 100) / 365;

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
        <div className="flex items-center justify-between mb-6">
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

        {/* Risk alert */}
        {isLive && isFinite(hf) && hf < 1.5 && borMYR > 0 && (
          <div className="mb-6 p-4 rounded-xl flex items-start gap-3"
            style={{ backgroundColor: '#ef444415', border: '1px solid #ef444440' }}>
            <span className="text-xl mt-0.5">⚠️</span>
            <div>
              <p className="text-sm font-semibold" style={{ color: '#ef4444' }}>
                {hf < 1.2 ? 'Critical: Liquidation Imminent' : 'Warning: Low Health Factor'}
              </p>
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>
                Your health factor is <strong style={{ color: '#ef4444' }}>{hf.toFixed(2)}</strong>.
                {hf < 1.2
                  ? ' Your position may be liquidated at any time. Repay debt or add collateral immediately.'
                  : ` Add more collateral or repay some debt to bring it above 2.0. Liquidation triggers at 1.0.`}
              </p>
              <div className="flex gap-3 mt-3">
                <Link href="/?tab=deposit"
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #7C3AED, #5B21B6)' }}>
                  Add Collateral
                </Link>
                <Link href="/?tab=repay"
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #ef4444, #b91c1c)' }}>
                  Repay Now
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Overview cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {isLive && wallet.isRefreshing ? (
            [0,1,2,3].map(i => <SkeletonCard key={i} />)
          ) : (
            [
              { label: 'ETH Collateral',  value: `${colEth.toFixed(4)} ETH`,                   sub: rm(colMYR),               sc: '#22c55e' },
              { label: 'Total Borrowed',  value: rm(borMYR, 2),                                 sub: `${pct(ltvUsed)} LTV used`, sc: '#eab308' },
              { label: 'Accrued Interest',value: borMYR > 0 ? rm(accruedInt, 2) : '—',         sub: `${APR}% APR · ${daysElapsed}d elapsed`, sc: '#F59E0B' },
              { label: 'Health Factor',   value: isFinite(hf) ? hf.toFixed(2) : '∞',           sub: hLabel(hf),               sc: hc },
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

          {/* Left / main */}
          <div className="lg:col-span-2 space-y-6">

            {/* Active Position */}
            <div className="rounded-2xl p-6" style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
              <h2 className="text-lg font-semibold text-white mb-5">Active Position</h2>

              {isLive && wallet.isRefreshing ? (
                <div className="space-y-3">
                  {[0,1,2].map(i => (
                    <div key={i} className="p-4 rounded-xl" style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
                      <div className="flex justify-between mb-3"><Skeleton w="w-28" h="h-3" /><Skeleton w="w-20" h="h-3" /></div>
                      <Skeleton w="w-full" h="h-2" className="rounded-full" />
                    </div>
                  ))}
                </div>
              ) : colEth > 0 ? (
                <div className="space-y-4">

                  {/* Collateral */}
                  <div className="p-4 rounded-xl" style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
                    <div className="flex justify-between text-sm mb-1">
                      <span style={{ color: '#94A3B8' }}>ETH Collateral</span>
                      <span className="font-semibold text-white">{colEth.toFixed(4)} ETH</span>
                    </div>
                    <div className="flex justify-between text-xs mb-3" style={{ color: '#64748B' }}>
                      <span>Value: {rm(colMYR)}</span>
                      <span>@ {rm(isLive ? wallet.ethPriceMYR : ethMYR)} / ETH</span>
                    </div>
                    <div className="h-2 rounded-full" style={{ backgroundColor: '#1E2035' }}>
                      <div className="h-full rounded-full" style={{ width: '100%', backgroundColor: '#627EEA' }} />
                    </div>
                  </div>

                  {/* LTV utilization */}
                  <div className="p-4 rounded-xl" style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
                    <div className="flex justify-between text-sm mb-1">
                      <span style={{ color: '#94A3B8' }}>Loan-to-Value</span>
                      <span className="font-semibold text-white">{pct(ltvUsed)} / {MAX_LTV}% max</span>
                    </div>
                    <div className="flex justify-between text-xs mb-3" style={{ color: '#64748B' }}>
                      <span>Borrowed: {rm(borMYR, 2)}</span>
                      <span>Available: {rm(Math.max(0, colMYR * MAX_LTV / 100 - borMYR), 2)}</span>
                    </div>
                    <div className="h-2 rounded-full" style={{ backgroundColor: '#1E2035' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(ltvUsed / MAX_LTV * 100, 100)}%`,
                          backgroundColor: ltvUsed > 60 ? '#ef4444' : ltvUsed > 40 ? '#eab308' : '#22c55e',
                        }} />
                    </div>
                    <div className="flex justify-between mt-1.5 text-xs" style={{ color: '#475569' }}>
                      <span>0%</span><span>Liquidation risk &gt; 60%</span><span>{MAX_LTV}%</span>
                    </div>
                  </div>

                  {/* Health factor */}
                  <div className="p-4 rounded-xl" style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm" style={{ color: '#94A3B8' }}>Health Factor</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold" style={{ color: hc }}>{isFinite(hf) ? hf.toFixed(2) : '∞'}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ backgroundColor: `${hc}1A`, color: hc }}>{hLabel(hf)}</span>
                      </div>
                    </div>
                    <div className="h-3 rounded-full mt-3" style={{ backgroundColor: '#1E2035' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${Math.min((isFinite(hf) ? hf : 3) / 3 * 100, 100)}%`, backgroundColor: hc }} />
                    </div>
                    <div className="flex justify-between mt-2 text-xs" style={{ color: '#475569' }}>
                      <span>Liquidation (1.0)</span><span>Moderate (1.5)</span><span>Safe (2.0+)</span>
                    </div>
                    {isLive && liqPrice > 0 && (
                      <div className="mt-3 pt-3 flex justify-between text-xs" style={{ borderTop: '1px solid #1E2035' }}>
                        <span style={{ color: '#64748B' }}>Liquidation price</span>
                        <span style={{ color: '#ef4444' }}>≈ {rm(liqPrice)} / ETH
                          {priceDrop > 0 && <span style={{ color: '#64748B' }}> ({priceDrop.toFixed(1)}% drop from now)</span>}
                        </span>
                      </div>
                    )}
                  </div>

                </div>
              ) : (
                <div className="flex flex-col items-center py-10 text-center rounded-xl"
                  style={{ backgroundColor: '#0D0F1A', border: '1px dashed #1E2035' }}>
                  <p className="text-3xl mb-3">📭</p>
                  <p className="text-sm font-medium text-white mb-1">No open position</p>
                  <p className="text-xs mb-4" style={{ color: '#64748B' }}>Deposit ETH collateral to start borrowing</p>
                  <Link href="/" className="px-4 py-2 rounded-lg text-xs font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}>
                    Go to Dashboard
                  </Link>
                </div>
              )}
            </div>

            {/* Loan timeline & interest */}
            {borMYR > 0 && (
              <div className="rounded-2xl p-6" style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
                <h2 className="text-lg font-semibold text-white mb-5">Loan Timeline &amp; Interest</h2>

                {/* Timeline bar */}
                {borrowDate && maturityDate && (
                  <div className="mb-6">
                    <div className="flex justify-between text-xs mb-2" style={{ color: '#64748B' }}>
                      <span>Start: {formatDate(borrowDate)}</span>
                      <span>Maturity: {formatDate(maturityDate)}</span>
                    </div>
                    <div className="h-3 rounded-full relative" style={{ backgroundColor: '#1E2035' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #7C3AED, #06B6D4)' }} />
                    </div>
                    <div className="flex justify-between mt-1.5 text-xs" style={{ color: '#64748B' }}>
                      <span>{daysElapsed} days elapsed</span>
                      <span>{daysLeft} days remaining</span>
                    </div>
                  </div>
                )}

                {/* Interest breakdown */}
                <div className="space-y-2">
                  {[
                    { label: 'Principal Borrowed',      value: rm(borMYR, 2),        sub: 'Original loan amount',         vc: '#F1F5F9' },
                    { label: 'Origination Fee (0.1%)',  value: rm(origFee, 2),        sub: 'Charged at disbursement',      vc: '#94A3B8' },
                    { label: 'Accrued Interest',        value: rm(accruedInt, 2),     sub: `${APR}% APR × ${daysElapsed} days / 365`,  vc: '#F59E0B' },
                    { label: 'Daily Interest Rate',     value: rm(dailyInt, 2) + '/day', sub: 'Accruing continuously',     vc: '#64748B' },
                    { label: 'Projected Total Interest',value: rm(projTotalInt, 2),   sub: `If held full ${loanTerm} days`, vc: '#94A3B8' },
                  ].map(r => (
                    <div key={r.label} className="flex items-center justify-between p-3 rounded-xl"
                      style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
                      <div>
                        <p className="text-xs font-medium text-white">{r.label}</p>
                        <p className="text-xs mt-0.5" style={{ color: '#475569' }}>{r.sub}</p>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: r.vc }}>{r.value}</span>
                    </div>
                  ))}

                  {/* Total to repay */}
                  <div className="p-3 rounded-xl mt-1"
                    style={{ background: 'linear-gradient(135deg, #7C3AED15, #06B6D415)', border: '1px solid #7C3AED40' }}>
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-semibold text-white">Repay Today</p>
                        <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>Principal + accrued interest</p>
                      </div>
                      <span className="text-xl font-bold" style={{ color: '#7C3AED' }}>{rm(totalRepay, 2)}</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl"
                    style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-white">Full-Term Repayment</p>
                        <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>If held to {loanTerm}-day maturity</p>
                      </div>
                      <span className="text-sm font-semibold" style={{ color: '#94A3B8' }}>{rm(fullRepay, 2)}</span>
                    </div>
                  </div>
                </div>

                <Link href="/?tab=repay"
                  className="mt-5 w-full flex items-center justify-center py-2.5 rounded-xl text-sm font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #06B6D4, #0891B2)' }}>
                  Repay Loan →
                </Link>
              </div>
            )}

            {/* Wallet balances */}
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
                    { icon: 'M',  color: '#22c55e', label: 'MYR', sub: 'Mock Ringgit', value: `RM ${wallet.myrBalance}`, usd: 'Borrowed token' },
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

            {/* Loan terms */}
            <div className="rounded-2xl p-6" style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
              <h2 className="text-base font-semibold text-white mb-4">Loan Terms</h2>
              <div className="space-y-2 text-xs">
                {[
                  { label: 'Annual Rate (APR)',     value: `${APR}%`,          vc: '#22c55e' },
                  { label: 'Max LTV',               value: `${MAX_LTV}%`,      vc: '#F1F5F9' },
                  { label: 'Liquidation Threshold', value: `${LIQ_THRES}% LTV`, vc: '#F1F5F9' },
                  { label: 'Origination Fee',       value: `${ORIG_FEE * 100}%`, vc: '#F1F5F9' },
                  { label: 'Collateral Asset',      value: 'ETH',              vc: '#627EEA' },
                  { label: 'Borrow Asset',          value: 'MYR (Mock)',       vc: '#22c55e' },
                  { label: 'Interest Type',         value: 'Variable APR',     vc: '#F59E0B' },
                  { label: 'Liquidation Penalty',   value: '10%',              vc: '#ef4444' },
                ].map(r => (
                  <div key={r.label} className="flex justify-between py-2" style={{ borderBottom: '1px solid #1E2035' }}>
                    <span style={{ color: '#64748B' }}>{r.label}</span>
                    <span className="font-semibold" style={{ color: r.vc }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick actions */}
            <div className="rounded-2xl p-6" style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
              <h2 className="text-base font-semibold text-white mb-4">Quick Actions</h2>
              <div className="space-y-2">
                {[
                  { label: 'Deposit Collateral', sub: 'Add ETH to position',    href: '/?tab=deposit', gradient: 'linear-gradient(135deg, #7C3AED, #5B21B6)' },
                  { label: 'Borrow MYR',         sub: 'Borrow against ETH',     href: '/?tab=borrow',  gradient: 'linear-gradient(135deg, #7C3AED, #06B6D4)' },
                  { label: 'Repay Loan',         sub: 'Reduce debt + interest', href: '/?tab=repay',   gradient: 'linear-gradient(135deg, #06B6D4, #0891B2)' },
                  { label: 'KYC Verification',   sub: 'Required to borrow',     href: '/kyc',          gradient: 'linear-gradient(135deg, #10B981, #059669)' },
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

            {/* Net position summary */}
            <div className="rounded-2xl p-6" style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
              <h2 className="text-base font-semibold text-white mb-4">Net Position</h2>
              <div className="space-y-2 text-xs">
                {[
                  { label: 'Collateral Value', value: rm(colMYR),    vc: '#22c55e' },
                  { label: 'Outstanding Debt', value: `− ${rm(borMYR, 2)}`, vc: '#ef4444' },
                  { label: 'Accrued Interest', value: `− ${rm(accruedInt, 2)}`, vc: '#F59E0B' },
                ].map(r => (
                  <div key={r.label} className="flex justify-between py-2" style={{ borderBottom: '1px solid #1E2035' }}>
                    <span style={{ color: '#64748B' }}>{r.label}</span>
                    <span className="font-semibold" style={{ color: r.vc }}>{r.value}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-2">
                  <span className="font-semibold text-white">Net Equity</span>
                  <span className="font-bold" style={{ color: netMYR >= 0 ? '#22c55e' : '#ef4444' }}>{rm(netMYR - accruedInt)}</span>
                </div>
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
                  { label: 'Contracts', value: wallet.isDeployed ? 'Deployed' : 'Not deployed' },
                  { label: 'KYC',      value: wallet.kycApproved ? 'Approved' : 'Pending' },
                ].map(r => (
                  <div key={r.label} className="flex justify-between">
                    <span style={{ color: '#64748B' }}>{r.label}</span>
                    <span className="font-mono" style={{
                      color: r.label === 'KYC' ? (wallet.kycApproved ? '#22c55e' : '#eab308')
                           : r.label === 'Network' ? (isLive ? '#22c55e' : '#ef4444')
                           : '#F1F5F9'
                    }}>{r.value}</span>
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
