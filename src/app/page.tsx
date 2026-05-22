'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ethers } from 'ethers';
import { SkeletonCard } from '@/components/Skeleton';
import Navbar from '@/components/Navbar';
import { useWallet } from '@/lib/WalletContext';
import { usePrices, SYMBOL_TO_ID } from '@/hooks/usePrices';

// ── Static asset config (APR / LTV — protocol params, not price-dependent) ──

const ASSETS = [
  { symbol: 'BTC', name: 'Bitcoin',   color: '#F7931A', maxLTV: 70, borrowAPR: 5.2, supplyAPR: 2.1, liquidity: 'RM 11.2B', icon: '₿' },
  { symbol: 'ETH', name: 'Ethereum',  color: '#627EEA', maxLTV: 75, borrowAPR: 4.8, supplyAPR: 1.8, liquidity: 'RM 8.5B',  icon: 'Ξ' },
  { symbol: 'SOL', name: 'Solana',    color: '#9945FF', maxLTV: 65, borrowAPR: 6.5, supplyAPR: 3.2, liquidity: 'RM 1.9B',  icon: '◎' },
  { symbol: 'BNB', name: 'BNB Chain', color: '#F3BA2F', maxLTV: 65, borrowAPR: 5.8, supplyAPR: 2.4, liquidity: 'RM 3.1B',  icon: 'B' },
];

const DEMO_LOANS = [
  { id: '1', collateral: 'BTC', colAmt: 0.5, colVal: 157500, borrowed: 98000, hf: 1.82, apr: 5.2, days: 142 },
  { id: '2', collateral: 'ETH', colAmt: 4.2, colVal: 76440,  borrowed: 42000, hf: 1.34, apr: 4.8, days: 67  },
];

// ── Helpers ───────────────────────────────────────────────────────────────

function hColor(hf: number) { return !isFinite(hf) || hf >= 2 ? '#22c55e' : hf >= 1.5 ? '#eab308' : '#ef4444'; }
function hLabel(hf: number) { return !isFinite(hf) || hf >= 2 ? 'Safe'   : hf >= 1.5 ? 'Moderate' : 'At Risk'; }
function rm(n: number, dec = 0) { return 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }

// ── Shared UI ─────────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-6 ${className}`} style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
      {children}
    </div>
  );
}
function Lbl({ children }: { children: React.ReactNode }) {
  return <p className="text-xs mb-2" style={{ color: '#94A3B8' }}>{children}</p>;
}
function InputBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
      {children}
    </div>
  );
}
function Row({ label, value, vc }: { label: string; value: string; vc?: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span style={{ color: '#94A3B8' }}>{label}</span>
      <span style={{ color: vc ?? '#F1F5F9' }}>{value}</span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const wallet              = useWallet();
  const router              = useRouter();
  const { prices, loading } = usePrices();

  const [calcAssetIdx, setCalcAssetIdx] = useState(1); // ETH default
  const [collAmt, setCollAmt]           = useState('1');
  const [ltv, setLtv]                   = useState(50);
  const [activeTab, setActiveTab]       = useState<'deposit' | 'borrow' | 'repay'>('deposit');
  const [depositAmt, setDepositAmt]     = useState('');
  const [borrowAmt, setBorrowAmt]       = useState('');
  const [repayAmt, setRepayAmt]         = useState('');

  const calcAsset   = ASSETS[calcAssetIdx];
  const livePrice   = prices[SYMBOL_TO_ID[calcAsset.symbol]]?.myr ?? 0;
  const assetPrice  = loading ? 0 : livePrice;
  const collUSD     = parseFloat(collAmt || '0') * assetPrice;
  const borrowable  = collUSD * (ltv / 100);
  const ltvPct      = ltv / calcAsset.maxLTV;
  const calcHF      = ltv > 0 ? calcAsset.maxLTV / ltv : Infinity;

  const isLive = wallet.isConnected && wallet.isCorrectNetwork && wallet.isDeployed;

  const liveColMYR  = wallet.loanInfo?.collateralValueMYR ?? null;
  const liveBorMYR  = wallet.loanInfo ? Number(wallet.loanInfo.borrowed) / 1e6 : null;
  const liveHF      = wallet.loanInfo?.healthFactor ?? null;
  const ethPriceMYR = wallet.isConnected ? wallet.ethPriceMYR : prices.ethereum.myr;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0D0F1A', color: '#F1F5F9' }}>
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Stats bar ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {isLive && wallet.isRefreshing ? (
            [0,1,2,3].map(i => <SkeletonCard key={i} />)
          ) : (
            [
              {
                label: 'Total Collateral',
                value: isLive && liveColMYR !== null ? rm(liveColMYR) : 'RM 233,838',
                sub:   isLive
                  ? `${parseFloat(ethers.formatEther(wallet.loanInfo?.collateral ?? BigInt(0))).toFixed(4)} ETH`
                  : '+2.4% this week',
                sc: '#22c55e',
              },
              {
                label: 'Total Borrowed',
                value: isLive && liveBorMYR !== null ? rm(liveBorMYR, 2) : 'RM 129,000',
                sub:   isLive ? `${wallet.myrBalance} MYR` : '55.2% utilisation',
                sc: '#eab308',
              },
              {
                label: 'Net Position',
                value: isLive && liveColMYR !== null && liveBorMYR !== null
                  ? rm(liveColMYR - liveBorMYR)
                  : 'RM 104,838',
                sub: isLive ? 'ETH collateral − MYR debt' : '+5.1% this week',
                sc: '#22c55e',
              },
              {
                label: 'Health Factor',
                value: isLive && liveHF !== null ? (isFinite(liveHF) ? liveHF.toFixed(2) : '∞') : '1.58',
                sub:   isLive && liveHF !== null ? hLabel(liveHF) : 'Moderate risk',
                sc: isLive && liveHF !== null ? hColor(liveHF) : '#eab308',
              },
            ].map(s => (
              <div key={s.label} className="p-4 rounded-xl" style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
                <p className="text-xs mb-1.5" style={{ color: '#64748B' }}>{s.label}</p>
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-xs mt-1" style={{ color: s.sc }}>{s.sub}</p>
              </div>
            ))
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ── Left (3/5) ── */}
          <div className="lg:col-span-3 flex flex-col gap-6">

            {/* Loan Calculator */}
            <Card>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-white">Loan Calculator</h2>
                {loading ? (
                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: '#1E2035', color: '#64748B' }}>
                    Loading prices…
                  </span>
                ) : (
                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: '#06B6D422', color: '#06B6D4' }}>
                    Live MYR prices
                  </span>
                )}
              </div>

              <Lbl>Collateral Asset</Lbl>
              <div className="grid grid-cols-4 gap-2 mb-5">
                {ASSETS.map((asset, i) => {
                  const p = prices[SYMBOL_TO_ID[asset.symbol]];
                  return (
                    <button key={asset.symbol}
                      onClick={() => { setCalcAssetIdx(i); setLtv(Math.min(ltv, asset.maxLTV)); }}
                      className="flex flex-col items-center gap-1 p-3 rounded-xl transition-all"
                      style={{
                        backgroundColor: calcAssetIdx === i ? '#1E1B3A' : '#0D0F1A',
                        border: `1px solid ${calcAssetIdx === i ? '#7C3AED' : '#1E2035'}`,
                      }}>
                      <span className="text-xl font-bold leading-none" style={{ color: asset.color }}>{asset.icon}</span>
                      <span className="text-xs font-semibold text-white">{asset.symbol}</span>
                      <span className="text-xs" style={{ color: '#64748B' }}>
                        {loading ? '…' : `RM ${(p?.myr ?? 0).toLocaleString()}`}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mb-5">
                <Lbl>Collateral Amount</Lbl>
                <InputBox>
                  <span className="text-xl font-bold" style={{ color: calcAsset.color }}>{calcAsset.icon}</span>
                  <input type="number" min={0} value={collAmt}
                    onChange={e => setCollAmt(e.target.value)}
                    className="flex-1 bg-transparent outline-none text-white text-lg font-medium"
                    placeholder="0.00" />
                  <span className="text-sm font-semibold" style={{ color: '#64748B' }}>{calcAsset.symbol}</span>
                </InputBox>
                <p className="text-xs mt-1.5" style={{ color: '#64748B' }}>
                  ≈ {rm(collUSD, 2)}
                </p>
              </div>

              <div className="mb-5">
                <div className="flex justify-between mb-2">
                  <Lbl>Loan-to-Value (LTV)</Lbl>
                  <span className="text-xs font-semibold"
                    style={{ color: ltvPct > 0.85 ? '#ef4444' : ltvPct > 0.6 ? '#eab308' : '#06B6D4' }}>
                    {ltv}% / {calcAsset.maxLTV}% max
                  </span>
                </div>
                <input type="range" min={0} max={calcAsset.maxLTV} value={ltv}
                  onChange={e => setLtv(Number(e.target.value))}
                  className="w-full cursor-pointer" />
                <div className="flex justify-between mt-1.5 text-xs" style={{ color: '#64748B' }}>
                  <span>0%</span><span style={{ color: '#22c55e' }}>Safe ≤50%</span>
                  <span style={{ color: '#ef4444' }}>Max {calcAsset.maxLTV}%</span>
                </div>
              </div>

              <div className="p-4 rounded-xl"
                style={{ background: 'linear-gradient(135deg, #1A1535 0%, #0D1520 100%)', border: '1px solid #7C3AED33' }}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-xs mb-1" style={{ color: '#94A3B8' }}>You Can Borrow</p>
                    <p className="text-3xl font-bold" style={{ color: '#06B6D4' }}>
                      {rm(borrowable)}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>MYR</p>
                  </div>
                  <div className="px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={{ backgroundColor: `${hColor(calcHF)}22`, color: hColor(calcHF) }}>
                    HF {isFinite(calcHF) ? calcHF.toFixed(2) : '∞'}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-3" style={{ borderTop: '1px solid #7C3AED22' }}>
                  {[
                    { label: 'Interest Rate',     value: `${calcAsset.borrowAPR}% APR` },
                    { label: 'Liq. Price',        value: rm(assetPrice * (1 - calcAsset.maxLTV / 100 * 0.9)) },
                    { label: 'Monthly Cost',      value: rm((borrowable * calcAsset.borrowAPR) / 100 / 12) },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs mb-0.5" style={{ color: '#64748B' }}>{label}</p>
                      <p className="text-sm font-semibold text-white">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Supported Assets Table */}
            <Card>
              <h2 className="text-lg font-semibold text-white mb-5">Supported Assets</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid #1E2035' }}>
                    {['Asset', 'Price (MYR)', 'Max LTV', 'Borrow APR', 'Supply APR', 'Liquidity'].map(h => (
                      <th key={h} className="text-left pb-3 text-xs font-medium" style={{ color: '#64748B' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ASSETS.map((a, i) => {
                    const p = prices[SYMBOL_TO_ID[a.symbol]];
                    const change = p?.change24h ?? 0;
                    return (
                      <tr key={a.symbol} className="cursor-pointer"
                        onClick={() => setCalcAssetIdx(i)}
                        style={{ borderBottom: i < ASSETS.length - 1 ? '1px solid #1E2035' : 'none' }}>
                        <td className="py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                              style={{ backgroundColor: `${a.color}1A`, color: a.color }}>{a.icon}</div>
                            <div>
                              <p className="font-semibold text-white">{a.symbol}</p>
                              <p className="text-xs" style={{ color: '#64748B' }}>{a.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4">
                          <p className="font-medium text-white">{loading ? '…' : `RM ${(p?.myr ?? 0).toLocaleString()}`}</p>
                          <p className="text-xs" style={{ color: change >= 0 ? '#22c55e' : '#ef4444' }}>
                            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                          </p>
                        </td>
                        <td className="py-4"><span className="font-semibold" style={{ color: '#06B6D4' }}>{a.maxLTV}%</span></td>
                        <td className="py-4">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{ backgroundColor: '#ef444420', color: '#ef4444' }}>{a.borrowAPR}%</span>
                        </td>
                        <td className="py-4">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}>{a.supplyAPR}%</span>
                        </td>
                        <td className="py-4 text-xs" style={{ color: '#94A3B8' }}>{a.liquidity}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </div>

          {/* ── Right (2/5) ── */}
          <div className="lg:col-span-2 flex flex-col gap-6">

            {/* Active Loans */}
            <Card>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold text-white">My Active Loans</h2>
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                  style={{ backgroundColor: isLive ? '#22c55e22' : '#7C3AED22', color: isLive ? '#22c55e' : '#A78BFA' }}>
                  {isLive ? 'Live' : 'Demo'}
                </span>
              </div>

              {/* Live loan */}
              {isLive && wallet.loanInfo && (() => {
                const { collateral, borrowed, healthFactor: hf, available } = wallet.loanInfo;
                const hc = hColor(hf);
                const colEth = parseFloat(ethers.formatEther(collateral)).toFixed(4);
                const borMYR = (Number(borrowed) / 1e6).toFixed(2);
                const avMYR  = (Number(available) / 1e6).toFixed(2);
                const hasLoan = collateral > BigInt(0);
                return hasLoan ? (
                  <div className="p-4 rounded-xl" style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ backgroundColor: '#627EEA1A', color: '#627EEA' }}>Ξ</div>
                        <span className="text-sm font-semibold text-white">ETH → MYR</span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ backgroundColor: `${hc}1A`, color: hc }}>{hLabel(hf)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                      <div>
                        <p style={{ color: '#64748B' }}>Collateral</p>
                        <p className="font-semibold text-white mt-0.5">{colEth} ETH</p>
                        <p style={{ color: '#64748B' }}>{rm(wallet.loanInfo.collateralValueMYR)}</p>
                      </div>
                      <div>
                        <p style={{ color: '#64748B' }}>Borrowed</p>
                        <p className="font-semibold text-white mt-0.5">RM {borMYR}</p>
                        <p style={{ color: '#64748B' }}>MYR · 4.8% APR</p>
                      </div>
                    </div>
                    {Number(borrowed) > 0 && (
                      <div className="mb-3">
                        <div className="flex justify-between text-xs mb-1">
                          <span style={{ color: '#64748B' }}>Health Factor</span>
                          <span style={{ color: hc }} className="font-semibold">{isFinite(hf) ? hf.toFixed(2) : '∞'}</span>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ backgroundColor: '#1E2035' }}>
                          <div className="h-full rounded-full"
                            style={{ width: `${Math.min((isFinite(hf) ? hf : 3) / 3 * 100, 100)}%`, backgroundColor: hc }} />
                        </div>
                      </div>
                    )}
                    <div className="text-xs pt-3" style={{ borderTop: '1px solid #1E2035' }}>
                      <div className="flex justify-between mb-2">
                        <span style={{ color: '#64748B' }}>Still available to borrow</span>
                        <span style={{ color: '#06B6D4' }} className="font-semibold">RM {avMYR}</span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setActiveTab('deposit')}
                          className="flex-1 py-1.5 rounded-md font-semibold text-center"
                          style={{ backgroundColor: '#7C3AED22', color: '#A78BFA' }}>Add Collateral</button>
                        <button onClick={() => setActiveTab('repay')}
                          className="flex-1 py-1.5 rounded-md font-semibold text-center"
                          style={{ backgroundColor: '#06B6D422', color: '#06B6D4' }}>Repay</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 rounded-xl text-center"
                    style={{ backgroundColor: '#0D0F1A', border: '1px dashed #1E2035' }}>
                    <p className="text-3xl mb-2">🏦</p>
                    <p className="text-sm font-medium text-white mb-1">No Active Loan</p>
                    <p className="text-xs mb-3" style={{ color: '#64748B' }}>Deposit ETH collateral to borrow MYR</p>
                    <button onClick={() => setActiveTab('deposit')}
                      className="px-4 py-2 rounded-lg text-xs font-semibold text-white"
                      style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}>
                      Deposit Collateral
                    </button>
                  </div>
                );
              })()}

              {/* Demo loans */}
              {!isLive && (
                <div className="space-y-4">
                  {DEMO_LOANS.map(loan => {
                    const meta = ASSETS.find(a => a.symbol === loan.collateral)!;
                    const hc   = hColor(loan.hf);
                    return (
                      <div key={loan.id} className="p-4 rounded-xl"
                        style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                              style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}>{meta.icon}</div>
                            <span className="text-sm font-semibold text-white">{loan.collateral} → MYR</span>
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                            style={{ backgroundColor: `${hc}1A`, color: hc }}>{hLabel(loan.hf)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <p style={{ color: '#64748B' }}>Collateral</p>
                            <p className="font-semibold text-white mt-0.5">{loan.colAmt} {loan.collateral}</p>
                            <p style={{ color: '#64748B' }}>{rm(loan.colVal)}</p>
                          </div>
                          <div>
                            <p style={{ color: '#64748B' }}>Borrowed</p>
                            <p className="font-semibold text-white mt-0.5">{rm(loan.borrowed)}</p>
                            <p style={{ color: '#64748B' }}>MYR · {loan.apr}% APR</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-center pt-1" style={{ color: '#475569' }}>
                    Connect MetaMask to interact with real contracts
                  </p>
                </div>
              )}
            </Card>

            {/* Deposit / Borrow / Repay */}
            <Card>
              <div className="flex rounded-lg p-1 mb-5" style={{ backgroundColor: '#0D0F1A' }}>
                {(['deposit', 'borrow', 'repay'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className="flex-1 py-2 rounded-md text-xs font-semibold capitalize transition-all"
                    style={{ backgroundColor: activeTab === tab ? '#7C3AED' : 'transparent',
                             color: activeTab === tab ? '#fff' : '#64748B' }}>
                    {tab}
                  </button>
                ))}
              </div>

              {!wallet.isConnected && (
                <div className="mb-4 p-3 rounded-xl text-center"
                  style={{ backgroundColor: '#0D0F1A', border: '1px dashed #1E2035' }}>
                  <p className="text-xs mb-2" style={{ color: '#64748B' }}>Connect MetaMask to use live transactions</p>
                  <button onClick={wallet.connect}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-white"
                    style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}>Connect Wallet</button>
                </div>
              )}

              {/* DEPOSIT */}
              {activeTab === 'deposit' && (
                <div className="space-y-4">
                  <div>
                    <Lbl>ETH Amount to Deposit</Lbl>
                    <InputBox>
                      <span className="text-lg font-bold" style={{ color: '#627EEA' }}>Ξ</span>
                      <input type="number" min={0} step="0.01" value={depositAmt}
                        onChange={e => setDepositAmt(e.target.value)}
                        className="flex-1 bg-transparent outline-none text-white text-lg font-medium"
                        placeholder="0.00" />
                      <button onClick={() => setDepositAmt(Math.max(0, parseFloat(wallet.ethBalance || '0') - 0.01).toFixed(4))}
                        className="text-xs px-2 py-1 rounded font-semibold"
                        style={{ backgroundColor: '#7C3AED22', color: '#A78BFA' }}>MAX</button>
                    </InputBox>
                    {wallet.isConnected && <p className="text-xs mt-1" style={{ color: '#64748B' }}>Wallet: {wallet.ethBalance} ETH</p>}
                  </div>
                  <div className="p-3 rounded-xl space-y-2.5" style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
                    <Row label="ETH Price (on-chain)" value={rm(isLive ? wallet.ethPriceMYR : ethPriceMYR)} />
                    <Row label="Collateral Value"
                      value={rm((parseFloat(depositAmt || '0')) * (isLive ? wallet.ethPriceMYR : ethPriceMYR))} />
                    <Row label="Max Borrowable (70%)"
                      value={rm((parseFloat(depositAmt || '0')) * (isLive ? wallet.ethPriceMYR : ethPriceMYR) * 0.70) + ' MYR'}
                      vc="#06B6D4" />
                  </div>
                  <button disabled={!isLive || !depositAmt || wallet.txStatus === 'pending'}
                    onClick={() => wallet.depositCollateral(depositAmt).then(() => setDepositAmt(''))}
                    className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}>
                    {wallet.txStatus === 'pending' ? 'Waiting for MetaMask…' : 'Deposit Collateral'}
                  </button>
                </div>
              )}

              {/* BORROW */}
              {activeTab === 'borrow' && (
                <div className="space-y-4">
                  {/* KYC gate */}
                  {isLive && !wallet.kycApproved && (
                    <div className="p-4 rounded-xl text-center"
                      style={{ backgroundColor: '#1a0f2e', border: '1px solid #7C3AED55' }}>
                      <div className="text-3xl mb-2">🪪</div>
                      <p className="text-sm font-semibold text-white mb-1">KYC Verification Required</p>
                      <p className="text-xs mb-4" style={{ color: '#94A3B8' }}>
                        You must complete identity verification before borrowing, as required by Malaysian financial regulations.
                      </p>
                      <button onClick={() => router.push('/kyc')}
                        className="px-5 py-2 rounded-lg text-sm font-bold text-white"
                        style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}>
                        Complete KYC →
                      </button>
                    </div>
                  )}

                  {/* Borrow form — only when KYC passed (or not yet connected) */}
                  {(!isLive || wallet.kycApproved) && (
                    <>
                      <div>
                        <Lbl>Borrow Amount (MYR)</Lbl>
                        <InputBox>
                          <span className="text-sm font-bold" style={{ color: '#06B6D4' }}>RM</span>
                          <input type="number" min={0} value={borrowAmt}
                            onChange={e => setBorrowAmt(e.target.value)}
                            className="flex-1 bg-transparent outline-none text-white text-lg font-medium"
                            placeholder="0.00" />
                          <button onClick={() => isLive && wallet.loanInfo
                            ? setBorrowAmt((Number(wallet.loanInfo.available) / 1e6).toFixed(2)) : undefined}
                            className="text-xs px-2 py-1 rounded font-semibold"
                            style={{ backgroundColor: '#7C3AED22', color: '#A78BFA' }}>MAX</button>
                        </InputBox>
                        {isLive && wallet.loanInfo && (
                          <p className="text-xs mt-1" style={{ color: '#64748B' }}>
                            Available: RM {(Number(wallet.loanInfo.available) / 1e6).toFixed(2)}
                          </p>
                        )}
                      </div>
                      <div className="p-3 rounded-xl space-y-2.5" style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
                        <Row label="Borrow APR" value="4.80%" vc="#ef4444" />
                        <Row label="Origination Fee" value="0.10%" />
                        <Row label="Health Factor After"
                          value={(() => {
                            if (!isLive || !wallet.loanInfo || !borrowAmt) return '—';
                            const colMYR  = wallet.loanInfo.collateralValueMYR;
                            const newBor  = Number(wallet.loanInfo.borrowed) / 1e6 + parseFloat(borrowAmt);
                            if (newBor <= 0) return '∞';
                            return ((colMYR * 0.8) / newBor).toFixed(2);
                          })()} vc="#22c55e" />
                      </div>
                      <button disabled={!isLive || !borrowAmt || wallet.txStatus === 'pending'}
                        onClick={() => wallet.borrow(borrowAmt).then(() => setBorrowAmt(''))}
                        className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-40"
                        style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}>
                        {wallet.txStatus === 'pending' ? 'Waiting for MetaMask…' : 'Borrow MYR'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* REPAY */}
              {activeTab === 'repay' && (
                <div className="space-y-4">
                  <div>
                    <Lbl>Repay Amount (MYR)</Lbl>
                    <InputBox>
                      <span className="text-sm font-bold" style={{ color: '#06B6D4' }}>RM</span>
                      <input type="number" min={0} value={repayAmt}
                        onChange={e => setRepayAmt(e.target.value)}
                        className="flex-1 bg-transparent outline-none text-white text-lg font-medium"
                        placeholder="0.00" />
                      <button onClick={() => isLive && wallet.loanInfo
                        ? setRepayAmt((Number(wallet.loanInfo.borrowed) / 1e6).toFixed(2)) : undefined}
                        className="text-xs px-2 py-1 rounded font-semibold"
                        style={{ backgroundColor: '#06B6D422', color: '#06B6D4' }}>FULL</button>
                    </InputBox>
                    {isLive && <p className="text-xs mt-1" style={{ color: '#64748B' }}>MYR balance: {wallet.myrBalance}</p>}
                  </div>
                  <div className="p-3 rounded-xl space-y-2.5" style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
                    <Row label="Outstanding Debt"
                      value={isLive && wallet.loanInfo ? `RM ${(Number(wallet.loanInfo.borrowed)/1e6).toFixed(2)}` : '—'} />
                    <Row label="Remaining After"
                      value={isLive && wallet.loanInfo && repayAmt
                        ? `RM ${Math.max(0, Number(wallet.loanInfo.borrowed)/1e6 - parseFloat(repayAmt)).toFixed(2)}` : '—'} />
                    <Row label="New Health Factor"
                      value={(() => {
                        if (!isLive || !wallet.loanInfo || !repayAmt) return '—';
                        const rem = Math.max(0, Number(wallet.loanInfo.borrowed)/1e6 - parseFloat(repayAmt));
                        if (rem <= 0) return '∞';
                        return ((wallet.loanInfo.collateralValueMYR * 0.8) / rem).toFixed(2);
                      })()} vc="#22c55e" />
                  </div>
                  <p className="text-xs" style={{ color: '#64748B' }}>
                    ℹ Two MetaMask confirmations: MYR approval + repay.
                  </p>
                  <button disabled={!isLive || !repayAmt || wallet.txStatus === 'pending'}
                    onClick={() => wallet.repay(repayAmt).then(() => setRepayAmt(''))}
                    className="w-full py-3 rounded-xl text-white font-bold text-sm disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #06B6D4, #7C3AED)' }}>
                    {wallet.txStatus === 'pending' ? 'Waiting for MetaMask…' : 'Repay Loan'}
                  </button>
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>

      <footer className="mt-16 py-6 text-center text-xs" style={{ color: '#475569', borderTop: '1px solid #1E2035' }}>
        CryptoLend © 2025 — Borrow MYR against crypto · Hardhat Testnet · Chain ID 31337
      </footer>
    </div>
  );
}
