'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ethers } from 'ethers';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Slider from '@mui/material/Slider';
import InputBase from '@mui/material/InputBase';
import Alert from '@mui/material/Alert';
import MuiSkeleton from '@mui/material/Skeleton';
import LinearProgress from '@mui/material/LinearProgress';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import { useWallet } from '@/lib/WalletContext';
import { usePrices, SYMBOL_TO_ID } from '@/hooks/usePrices';

// ── Color tokens ────────────────────────────────────────────────────────────
const C = {
  bg:     '#F4F6F8',   // cool paper
  card:   '#FFFFFF',   // white cards
  inner:  '#EEF1F5',   // inset panels
  border: '#E2E7EE',   // hairline
  teal:   '#0E9F6E',   // status: gain / safe / live
  gold:   '#C77700',   // status: caution / interest / moderate
  red:    '#E5484D',   // status: loss / risk / liquidation
  blue:   '#2A3FD6',   // brand: indigo
  tp:     '#10151C',   // ink
  ts:     '#5A6675',   // slate
};

const ASSETS = [
  { symbol: 'BTC',  name: 'Bitcoin',   color: '#F7931A', maxLTV: 70, borrowAPR: 5.2, supplyAPR: 2.1, liquidity: 'RM 11.2B', icon: '₿' },
  { symbol: 'ETH',  name: 'Ethereum',  color: '#627EEA', maxLTV: 70, borrowAPR: 4.8, supplyAPR: 1.8, liquidity: 'RM 8.5B',  icon: 'Ξ' },
  { symbol: 'SOL',  name: 'Solana',    color: '#9945FF', maxLTV: 65, borrowAPR: 6.5, supplyAPR: 3.2, liquidity: 'RM 1.9B',  icon: '◎' },
  { symbol: 'BNB',  name: 'BNB Chain', color: '#F3BA2F', maxLTV: 65, borrowAPR: 5.8, supplyAPR: 2.4, liquidity: 'RM 3.1B',  icon: 'B' },
  { symbol: 'XRP',  name: 'XRP',       color: '#00AAE4', maxLTV: 55, borrowAPR: 7.8, supplyAPR: 4.8, liquidity: 'RM 720M',  icon: 'X' },
  { symbol: 'AVAX', name: 'Avalanche', color: '#E84142', maxLTV: 60, borrowAPR: 7.2, supplyAPR: 4.1, liquidity: 'RM 840M',  icon: 'A' },
  { symbol: 'LINK', name: 'Chainlink', color: '#2A5ADA', maxLTV: 60, borrowAPR: 7.5, supplyAPR: 4.5, liquidity: 'RM 520M',  icon: 'L' },
  { symbol: 'DOT',  name: 'Polkadot',  color: '#E6007A', maxLTV: 55, borrowAPR: 8.0, supplyAPR: 5.0, liquidity: 'RM 310M',  icon: 'D' },
  { symbol: 'ADA',  name: 'Cardano',   color: '#0033AD', maxLTV: 50, borrowAPR: 8.5, supplyAPR: 5.5, liquidity: 'RM 280M',  icon: '₳' },
];

const LOAN_TERMS = [
  { days: 30,  label: '1 Month'  },
  { days: 90,  label: '3 Months' },
  { days: 180, label: '6 Months' },
  { days: 365, label: '1 Year'   },
];

const DEMO_LOANS = [
  { id: '1', collateral: 'BTC', colAmt: 0.5, colVal: 157500, borrowed: 98000, hf: 1.82, apr: 5.2, days: 142 },
  { id: '2', collateral: 'ETH', colAmt: 4.2, colVal: 76440,  borrowed: 42000, hf: 1.34, apr: 4.8, days: 67  },
];

function hColor(hf: number) {
  return !isFinite(hf) || hf >= 2 ? C.teal : hf >= 1.5 ? C.gold : C.red;
}
function hLabel(hf: number) {
  return !isFinite(hf) || hf >= 2 ? 'Safe' : hf >= 1.5 ? 'Moderate' : 'At Risk';
}
function rm(n: number, dec = 0) {
  return 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function Row({ label, value, vc, bold }: { label: string; value: string; vc?: string; bold?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography variant="caption" sx={{ color: C.ts }}>{label}</Typography>
      <Typography variant="caption" sx={{ color: vc ?? C.tp, fontWeight: bold ? 700 : 500 }}>{value}</Typography>
    </Box>
  );
}

function StatCardSkeleton() {
  return (
    <Paper sx={{ p: 3, bgcolor: C.card, border: `1px solid ${C.border}`, borderRadius: 3 }}>
      <MuiSkeleton width={80}  height={12} sx={{ mb: 1.5 }} />
      <MuiSkeleton width={130} height={32} sx={{ mb: 0.75 }} />
      <MuiSkeleton width={100} height={12} />
    </Paper>
  );
}

// Shared style objects
const cardSx = { p: 3, bgcolor: C.card, border: `1px solid ${C.border}`, borderRadius: 3 };
const innerSx = { p: 2, bgcolor: C.inner, border: `1px solid ${C.border}`, borderRadius: 2 };

// KYC gate shown in place of the Deposit / Borrow / Repay forms until verified.
function KycRequiredCard({ onStart, action, kycStatus }: { onStart: () => void; action: string; kycStatus: 'none' | 'pending' | 'approved' }) {
  if (kycStatus === 'pending') {
    return (
      <Box sx={{ p: 3, bgcolor: 'rgba(42,63,214,0.06)', border: `1px solid rgba(42,63,214,0.25)`, borderRadius: 2.5, textAlign: 'center' }}>
        <Box sx={{
          width: 48, height: 48, borderRadius: '50%', bgcolor: 'rgba(42,63,214,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, mx: 'auto', mb: 1.5,
        }}>⏳</Box>
        <Typography variant="body2" sx={{ color: C.tp, fontWeight: 700, mb: 0.75 }}>KYC Under Review</Typography>
        <Chip label="● Pending Review" size="small"
          sx={{ bgcolor: 'rgba(42,63,214,0.1)', color: C.blue, border: '1px solid rgba(42,63,214,0.25)', fontWeight: 600, mb: 1.5, fontSize: 11 }} />
        <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 2, lineHeight: 1.6 }}>
          Your identity verification is being reviewed by our compliance team. You will be able to {action} once your KYC is approved (1–3 business days).
        </Typography>
        <Button variant="outlined" onClick={onStart}
          sx={{ borderColor: C.blue, color: C.blue, fontSize: 12, '&:hover': { bgcolor: 'rgba(42,63,214,0.06)' } }}>
          View KYC Status →
        </Button>
      </Box>
    );
  }
  return (
    <Box sx={{ p: 3, bgcolor: `${C.gold}08`, border: `1px solid ${C.gold}30`, borderRadius: 2.5, textAlign: 'center' }}>
      <Box sx={{
        width: 48, height: 48, borderRadius: '50%', bgcolor: `${C.gold}15`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, mx: 'auto', mb: 1.5,
      }}>🪪</Box>
      <Typography variant="body2" sx={{ color: C.tp, fontWeight: 700, mb: 0.75 }}>KYC Verification Required</Typography>
      <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 2, lineHeight: 1.6 }}>
        Complete identity verification before {action}, as required by Malaysian regulations (BNM AML/CFT).
      </Typography>
      <Button variant="contained" onClick={onStart}
        sx={{ background: `linear-gradient(135deg, ${C.gold} 0%, #FF8C00 100%)`, boxShadow: `0 4px 14px ${C.gold}40` }}>
        Complete KYC →
      </Button>
    </Box>
  );
}

// Reusable small label+value block
function InfoBlock({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 0.5, fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Typography variant="h5" sx={{ color: color ?? C.tp, fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
      {sub && <Typography variant="caption" sx={{ color: C.ts, mt: 0.5, display: 'block' }}>{sub}</Typography>}
    </Box>
  );
}

export default function Dashboard() {
  const wallet  = useWallet();
  const router  = useRouter();
  const { prices, loading, flash } = usePrices();

  const [calcAssetIdx, setCalcAssetIdx] = useState(1);
  const [collAmt,          setCollAmt]          = useState('1');
  const [ltv,              setLtv]              = useState(50);
  const [activeTab,        setActiveTab]         = useState<'deposit' | 'withdraw' | 'borrow' | 'repay' | 'buy'>('deposit');

  // Read URL params client-side only (avoids SSR/client hydration mismatch)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'withdraw' || tab === 'borrow' || tab === 'repay' || tab === 'buy') setActiveTab(tab);
    const asset = params.get('asset')?.toUpperCase();
    if (asset) {
      const idx = ASSETS.findIndex(a => a.symbol === asset);
      if (idx >= 0) setCalcAssetIdx(idx);
    }
  }, []);
  const [depositAmt,       setDepositAmt]        = useState('');
  const [withdrawAmt,      setWithdrawAmt]       = useState('');
  const [borrowAmt,        setBorrowAmt]         = useState('');
  const [repayAmt,         setRepayAmt]          = useState('');
  const [buyAmt,           setBuyAmt]            = useState('');
  const [loanTermDays,     setLoanTermDays]      = useState(90);
  const [holdMultiplier,   setHoldMultiplier]    = useState(1.5);
  const [syncError,        setSyncError]         = useState('');
  const [syncing,          setSyncing]           = useState(false);
  const [deliveryMethod,   setDeliveryMethod]    = useState<'token' | 'bank'>('token');
  const [transferResult,   setTransferResult]    = useState<{ refNo: string; bankName: string; last4: string } | null>(null);
  const [transferError,    setTransferError]     = useState('');
  const [kycDialogOpen,    setKycDialogOpen]     = useState(false);
  const kycDialogShown = useRef(false);

  // Show KYC dialog once per session when wallet connects and deposit tab is active.
  // Wait for BOTH loanInfo (chain read done) AND kycDbChecked (DB check done) before
  // deciding — prevents a false-positive when chain read finishes first and kycApproved
  // is temporarily false while the DB check is still in flight.
  useEffect(() => {
    if (
      wallet.isConnected &&
      wallet.loanInfo !== null &&
      wallet.kycDbChecked &&
      !wallet.kycApproved &&
      activeTab === 'deposit' &&
      !kycDialogShown.current
    ) {
      kycDialogShown.current = true;
      setKycDialogOpen(true);
    }
  }, [wallet.isConnected, wallet.loanInfo, wallet.kycDbChecked, wallet.kycApproved, activeTab]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const calcAsset  = ASSETS[calcAssetIdx];
  const livePrice  = prices[SYMBOL_TO_ID[calcAsset.symbol]]?.myr ?? 0;
  const assetPrice = loading ? 0 : livePrice;
  const collUSD    = parseFloat(collAmt || '0') * assetPrice;
  const borrowable = collUSD * (ltv / 100);
  const ltvPct     = ltv / calcAsset.maxLTV;
  const calcHF     = ltv > 0 ? calcAsset.maxLTV / ltv : Infinity;

  const calcInterest   = (borrowable * calcAsset.borrowAPR / 100) * (loanTermDays / 365);
  const calcMonthly    = (borrowable * calcAsset.borrowAPR / 100) / 12;
  const calcTotal      = borrowable + calcInterest;
  const originationFee = borrowable * 0.001;

  const colAmtNum       = parseFloat(collAmt || '0');
  const targetPrice     = assetPrice * holdMultiplier;
  const ethGain         = colAmtNum * assetPrice * (holdMultiplier - 1);
  const netAdvantage    = ethGain - calcInterest;
  const breakEvenPrice  = colAmtNum > 0 ? (collUSD + calcInterest) / colAmtNum : 0;
  const breakEvenDropPct = assetPrice > 0 ? ((assetPrice - breakEvenPrice) / assetPrice) * 100 : 0;

  const isLive = wallet.isConnected && wallet.isCorrectNetwork && wallet.isDeployed;

  const liveColMYR  = wallet.loanInfo?.collateralValueMYR ?? null;
  const liveBorMYR  = wallet.loanInfo ? Number(wallet.loanInfo.borrowed) / 1e6 : null;
  const liveHF      = wallet.loanInfo?.healthFactor ?? null;
  const ethPriceMYR = wallet.isConnected ? wallet.ethPriceMYR : prices.ethereum.myr;

  const mktEthPrice   = prices.ethereum.myr;
  const colEth        = wallet.loanInfo ? Number(ethers.formatEther(wallet.loanInfo.collateral)) : 0;
  const liveColMktMYR = isLive ? colEth * mktEthPrice : null;
  const mktNetPos     = liveColMktMYR !== null && liveBorMYR !== null ? liveColMktMYR - liveBorMYR : null;
  const mktHF         = (liveColMktMYR !== null && liveBorMYR !== null && liveBorMYR > 0)
    ? (liveColMktMYR * 0.8) / liveBorMYR : null;

  const onChainPrice    = wallet.ethPriceMYR;
  const priceDiffPct    = onChainPrice > 0 ? Math.abs((mktEthPrice - onChainPrice) / onChainPrice) * 100 : 0;
  const hasPriceMismatch = isLive && priceDiffPct > 3;

  const borrowMYR    = parseFloat(borrowAmt || '0');
  const panelMonthly = (borrowMYR * 4.8 / 100) / 12;
  const panelInterest = (borrowMYR * 4.8 / 100) * (loanTermDays / 365);
  const panelTotal   = borrowMYR + panelInterest + (borrowMYR * 0.001);

  const ltvColor = ltvPct > 0.85 ? C.red : ltvPct > 0.6 ? C.gold : C.teal;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: C.bg }}>
      <Box component="main" sx={{ maxWidth: 1320, mx: 'auto', px: { xs: 2, sm: 3 }, py: 4 }}>

        {/* ── Page Header ───────────────────────────────────────────────── */}
        <Box sx={{ mb: 4, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h4" sx={{ color: C.tp, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.1, mb: 0.5 }}>
              Dashboard
            </Typography>
            <Typography variant="body2" sx={{ color: C.ts }}>
              {isLive
                ? `Connected · ${wallet.address?.slice(0, 6)}…${wallet.address?.slice(-4)} · Chain 31337`
                : 'Connect MetaMask to access live lending'}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {isLive && (
              <Chip label="● Live" size="small"
                sx={{ bgcolor: `${C.teal}15`, color: C.teal, border: `1px solid ${C.teal}40`, fontWeight: 700, fontSize: 11 }} />
            )}
            {!wallet.isConnected && (
              <Button variant="contained" size="small" onClick={wallet.connect}
                sx={{ fontSize: 12, borderRadius: 2, px: 2 }}>
                Connect Wallet
              </Button>
            )}
            {wallet.isConnected && wallet.kycApproved && (
              <Chip label="✓ KYC Verified" size="small"
                sx={{ bgcolor: `${C.teal}12`, color: C.teal, border: `1px solid ${C.teal}30`, fontWeight: 600, fontSize: 11 }} />
            )}
          </Box>
        </Box>

        {/* ── Protocol Stats Banner ─────────────────────────────────────── */}
        <Paper sx={{
          p: { xs: 2.5, sm: 3.5 }, mb: 4,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' },
          gap: { xs: 2, sm: 4 },
          background: 'linear-gradient(135deg, #FFFFFF 0%, #F5F7FB 100%)',
          border: '1px solid rgba(42,63,214,0.18)',
          borderRadius: 3,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Subtle decorative glow */}
          <Box sx={{
            position: 'absolute', top: -60, right: -60,
            width: 200, height: 200, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(42,63,214,0.1) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          {[
            { label: 'Total Value Locked', value: 'RM 892M',   sub: '+3.2% this week',        color: C.teal },
            { label: 'Active Loans',       value: '2,847',     sub: 'Across all assets',       color: C.blue },
            { label: 'Total Borrowed',     value: 'RM 534M',   sub: '59.9% utilisation',       color: C.gold },
            {
              label: 'ETH / MYR Price',
              value: loading ? '…' : `RM ${prices.ethereum.myr.toLocaleString()}`,
              sub: `${prices.ethereum.change24h >= 0 ? '+' : ''}${prices.ethereum.change24h?.toFixed(2) ?? '0.00'}% 24h`,
              color: (prices.ethereum.change24h ?? 0) >= 0 ? C.teal : C.red,
            },
          ].map(s => (
            <InfoBlock key={s.label} label={s.label} value={s.value} sub={s.sub} color={s.color} />
          ))}
        </Paper>

        {/* ── User Stats ────────────────────────────────────────────────── */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
          {isLive && wallet.isRefreshing ? (
            [0,1,2,3].map(i => <StatCardSkeleton key={i} />)
          ) : (
            <>
              {/* Collateral */}
              <Paper sx={{
                p: 3, bgcolor: C.card, borderRadius: 3,
                border: '1px solid rgba(14,159,110,0.3)',
                position: 'relative', overflow: 'hidden',
              }}>
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #0E9F6E, transparent)' }} />
                <InfoBlock
                  label="My Collateral"
                  value={isLive && liveColMktMYR !== null ? rm(liveColMktMYR) : 'RM 233,838'}
                  sub={isLive ? `${colEth.toFixed(4)} ETH · live market` : 'Demo data'}
                  color={C.tp}
                />
                {isLive && liveColMYR !== null && hasPriceMismatch && (
                  <Typography variant="caption" sx={{ color: C.ts, display: 'block', mt: 1 }}>
                    Contract: {rm(liveColMYR)}
                  </Typography>
                )}
              </Paper>

              {/* Debt */}
              <Paper sx={{
                p: 3, bgcolor: C.card, borderRadius: 3,
                border: '1px solid rgba(199,119,0,0.2)',
                position: 'relative', overflow: 'hidden',
              }}>
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #C77700, transparent)' }} />
                <InfoBlock
                  label="Outstanding Debt"
                  value={isLive && liveBorMYR !== null ? rm(liveBorMYR, 2) : 'RM 129,000'}
                  sub={isLive && wallet.loanInfo
                    ? `+ RM ${(Number(wallet.loanInfo.accruedInterest) / 1e6).toFixed(4)} interest · ${wallet.myrBalance} MYR`
                    : isLive ? `${wallet.myrBalance} MYR balance` : '55.2% utilisation'}
                  color={C.tp}
                />
                {isLive && !wallet.myrTokenAdded && (
                  <Button
                    size="small"
                    onClick={() => wallet.addTokenToWallet()}
                    sx={{
                      mt: 1.5, px: 1.25, py: 0.25, minWidth: 0,
                      fontSize: 11, fontWeight: 600,
                      color: C.gold,
                      bgcolor: 'rgba(199,119,0,0.1)',
                      border: '1px solid rgba(199,119,0,0.25)',
                      borderRadius: 2,
                      '&:hover': { bgcolor: 'rgba(199,119,0,0.18)' },
                    }}
                    title="Import the MYR token into MetaMask so the balance shows in your wallet"
                  >
                    + Add MYR to MetaMask
                  </Button>
                )}
                {isLive && wallet.myrTokenAdded && (
                  <Typography variant="caption" sx={{ mt: 1.5, display: 'block', color: C.ts, fontWeight: 600 }}>
                    ✓ MYR token in wallet
                  </Typography>
                )}
              </Paper>

              {/* Net Position */}
              <Paper sx={{
                p: 3, bgcolor: C.card, borderRadius: 3,
                border: `1px solid ${C.border}`,
                position: 'relative', overflow: 'hidden',
              }}>
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #2A3FD6, transparent)' }} />
                <InfoBlock
                  label="Net Position"
                  value={isLive && mktNetPos !== null ? rm(mktNetPos) : 'RM 104,838'}
                  sub={isLive ? 'Market collateral − Debt' : 'Demo data'}
                  color={mktNetPos !== null && mktNetPos >= 0 ? C.teal : C.red}
                />
              </Paper>

              {/* Health Factor */}
              {(() => {
                const hf = isLive && mktHF !== null ? mktHF : isLive && liveHF !== null ? liveHF : 1.58;
                const hc = isLive ? hColor(hf) : C.gold;
                const hv = isFinite(hf) ? hf.toFixed(2) : '∞';
                const hl = isLive ? hLabel(hf) : 'Moderate risk';
                return (
                  <Paper sx={{
                    p: 3, bgcolor: C.card, borderRadius: 3,
                    border: `1px solid ${hc}33`,
                    position: 'relative', overflow: 'hidden',
                  }}>
                    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${hc}, transparent)` }} />
                    <InfoBlock label="Health Factor" value={hv} sub={hl} color={hc} />
                    {isLive && liveHF !== null && hasPriceMismatch && (
                      <Typography variant="caption" sx={{ color: C.ts, display: 'block', mt: 1 }}>
                        Contract HF: {isFinite(liveHF) ? liveHF.toFixed(2) : '∞'}
                      </Typography>
                    )}
                  </Paper>
                );
              })()}
            </>
          )}
        </Box>

        {/* ── Price Mismatch Warning ────────────────────────────────────── */}
        {hasPriceMismatch && (
          <Alert
            severity="warning"
            icon={<Typography sx={{ fontSize: 16 }}>⚠️</Typography>}
            sx={{
              mb: 3, bgcolor: 'rgba(199,119,0,0.08)', color: C.gold,
              border: '1px solid rgba(199,119,0,0.25)',
              '& .MuiAlert-icon': { color: C.gold }, borderRadius: 2,
            }}
            action={
              <Button size="small" disabled={syncing}
                onClick={async () => {
                  setSyncError('');
                  setSyncing(true);
                  try {
                    const res  = await fetch('/api/admin/sync-price', { method: 'POST' });
                    const data = await res.json() as { error?: string; steps?: number; newPrice?: number };
                    if (!res.ok) {
                      setSyncError(data.error ?? 'Sync failed');
                    } else {
                      await wallet.refresh();
                    }
                  } catch {
                    setSyncError('Network error — is the dev server running?');
                  } finally {
                    setSyncing(false);
                  }
                }}
                sx={{ color: C.teal, border: '1px solid rgba(14,159,110,0.3)', fontSize: 11, borderRadius: 2, whiteSpace: 'nowrap' }}>
                {syncing ? 'Syncing…' : '⟳ Sync Price'}
              </Button>
            }
          >
            <Typography variant="body2" sx={{ fontWeight: 700, color: C.gold }}>On-chain price differs from live market</Typography>
            <Typography variant="caption" sx={{ color: 'rgba(199,119,0,0.7)', display: 'block', mt: 0.5 }}>
              Contract: <b style={{ color: C.gold }}>{rm(onChainPrice)}/ETH</b>
              {' · '}Live: <b style={{ color: C.gold }}>{rm(mktEthPrice)}/ETH</b>
              {' '}({priceDiffPct.toFixed(1)}% diff)
            </Typography>
            {syncError && (
              <Typography variant="caption" sx={{ color: C.red, display: 'block', mt: 0.75, fontWeight: 600 }}>
                ✗ {syncError}
              </Typography>
            )}
          </Alert>
        )}

        {/* ── How It Works (when not connected) ────────────────────────── */}
        {!wallet.isConnected && (
          <Paper sx={{ ...cardSx, mb: 4 }}>
            <Typography variant="h6" sx={{ color: C.tp, fontWeight: 700, mb: 3 }}>
              How{' '}
              <Box component="span" className="gradient-text">CryptoLend</Box>
              {' '}Works
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' }, gap: 2 }}>
              {[
                { step: '01', icon: '🪪', title: 'Complete KYC',       desc: 'Verify your identity as required by Malaysian financial regulations (BNM).' },
                { step: '02', icon: '🔒', title: 'Deposit Collateral',  desc: 'Lock your crypto (ETH, BTC, SOL) as collateral to secure your credit line.' },
                { step: '03', icon: '💸', title: 'Borrow MYR',          desc: 'Receive Malaysian Ringgit instantly — up to 70% of your collateral value.' },
                { step: '04', icon: '✅', title: 'Repay & Unlock',      desc: 'Repay anytime to unlock and withdraw your collateral with no penalties.' },
              ].map(s => (
                <Box key={s.step} sx={{
                  p: 2.5, bgcolor: C.inner, border: `1px solid ${C.border}`, borderRadius: 2.5,
                  position: 'relative', overflow: 'hidden',
                }}>
                  <Box sx={{
                    position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                    background: `linear-gradient(90deg, ${C.teal}80, transparent)`,
                  }} />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                    <Box sx={{ px: 1.25, py: 0.375, borderRadius: 999, bgcolor: `${C.teal}18`, border: `1px solid ${C.teal}33` }}>
                      <Typography variant="caption" sx={{ color: C.teal, fontWeight: 700 }}>{s.step}</Typography>
                    </Box>
                    <Typography sx={{ fontSize: 22 }}>{s.icon}</Typography>
                  </Box>
                  <Typography variant="body2" sx={{ color: C.tp, fontWeight: 700, mb: 0.75 }}>{s.title}</Typography>
                  <Typography variant="caption" sx={{ color: C.ts, lineHeight: 1.7 }}>{s.desc}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        )}

        {/* ── Main 3:2 grid ────────────────────────────────────────────── */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, gap: 3 }}>

          {/* ── LEFT column ── */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* Markets & Calculator — combined */}
            <Paper sx={cardSx}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h6" sx={{ color: C.tp, fontWeight: 700 }}>Markets & Calculator</Typography>
                <Chip
                  label={loading ? 'Loading prices…' : '● Live MYR'}
                  size="small"
                  sx={{
                    bgcolor: loading ? 'rgba(16,21,28,0.04)' : `${C.teal}15`,
                    color: loading ? C.ts : C.teal,
                    border: `1px solid ${loading ? C.border : C.teal + '40'}`,
                    fontSize: 11, fontWeight: 600,
                  }}
                />
              </Box>

              {/* ── Assets table (clicking a row selects it for the calculator) ── */}
              <TableContainer sx={{ overflowX: 'auto', mb: 3 }}>
                <Table size="small" sx={{ minWidth: 480 }}>
                  <TableHead>
                    <TableRow>
                      {['Asset', 'Price (MYR)', 'Max LTV', 'Borrow APR', 'Supply APR', 'Liquidity'].map(h => (
                        <TableCell key={h} sx={{ color: C.ts, bgcolor: 'transparent', fontSize: 11, fontWeight: 600, border: 'none', borderBottom: `1px solid ${C.border}`, pb: 1.5 }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ASSETS.map((a, i) => {
                      const p      = prices[SYMBOL_TO_ID[a.symbol]];
                      const change = p?.change24h ?? 0;
                      const sel    = calcAssetIdx === i;
                      return (
                        <TableRow key={a.symbol}
                          onClick={() => { setCalcAssetIdx(i); setLtv(Math.min(ltv, a.maxLTV)); }}
                          sx={{
                            cursor: 'pointer', transition: 'background 0.15s',
                            bgcolor: sel ? `${a.color}08` : 'transparent',
                            '&:hover': { bgcolor: sel ? `${a.color}12` : 'rgba(14,159,110,0.06)' },
                          }}>
                          <TableCell sx={{ borderColor: i < ASSETS.length - 1 ? C.border : 'transparent', py: 1.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Box sx={{
                                width: 34, height: 34, borderRadius: '50%',
                                bgcolor: sel ? `${a.color}20` : `${a.color}15`,
                                color: a.color,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0,
                                border: `1px solid ${sel ? a.color + '50' : a.color + '25'}`,
                              }}>
                                {a.icon}
                              </Box>
                              <Box>
                                <Typography variant="body2" sx={{ color: C.tp, fontWeight: sel ? 700 : 600 }}>{a.symbol}</Typography>
                                <Typography variant="caption" sx={{ color: C.ts }}>{a.name}</Typography>
                              </Box>
                              {sel && (
                                <Chip label="Selected" size="small"
                                  sx={{ bgcolor: `${a.color}15`, color: a.color, border: `1px solid ${a.color}30`, fontSize: 10, fontWeight: 700, height: 18, ml: 0.5 }} />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell className={flash[SYMBOL_TO_ID[a.symbol]] ? `price-flash-${flash[SYMBOL_TO_ID[a.symbol]]}` : ''}
                            sx={{ borderColor: i < ASSETS.length - 1 ? C.border : 'transparent', py: 1.5 }}>
                            <Typography variant="body2" sx={{ color: C.tp, fontWeight: 600 }}>
                              {loading ? '…' : `RM ${(p?.myr ?? 0).toLocaleString()}`}
                            </Typography>
                            <Typography variant="caption" sx={{ color: change >= 0 ? C.teal : C.red }}>
                              {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ borderColor: i < ASSETS.length - 1 ? C.border : 'transparent', py: 1.5 }}>
                            <Typography variant="body2" sx={{ color: C.teal, fontWeight: 700 }}>{a.maxLTV}%</Typography>
                          </TableCell>
                          <TableCell sx={{ borderColor: i < ASSETS.length - 1 ? C.border : 'transparent', py: 1.5 }}>
                            <Chip label={`${a.borrowAPR}%`} size="small"
                              sx={{ bgcolor: `${C.red}18`, color: C.red, border: `1px solid ${C.red}30`, fontSize: 11, fontWeight: 700, height: 22 }} />
                          </TableCell>
                          <TableCell sx={{ borderColor: i < ASSETS.length - 1 ? C.border : 'transparent', py: 1.5 }}>
                            <Chip label={`${a.supplyAPR}%`} size="small"
                              sx={{ bgcolor: `${C.teal}18`, color: C.teal, border: `1px solid ${C.teal}30`, fontSize: 11, fontWeight: 700, height: 22 }} />
                          </TableCell>
                          <TableCell sx={{ borderColor: i < ASSETS.length - 1 ? C.border : 'transparent', py: 1.5 }}>
                            <Typography variant="caption" sx={{ color: C.ts }}>{a.liquidity}</Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* ── Calculator for selected asset ── */}
              <Box sx={{ pt: 3, borderTop: `1px solid ${C.border}` }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                  <Box sx={{
                    width: 32, height: 32, borderRadius: '50%', bgcolor: `${calcAsset.color}18`, color: calcAsset.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800,
                    border: `1px solid ${calcAsset.color}30`, flexShrink: 0,
                  }}>{calcAsset.icon}</Box>
                  <Box>
                    <Typography variant="body2" sx={{ color: C.tp, fontWeight: 700 }}>
                      {calcAsset.name} Calculator
                    </Typography>
                    <Typography variant="caption" sx={{ color: C.ts }}>
                      {calcAsset.maxLTV}% Max LTV · {calcAsset.borrowAPR}% APR
                    </Typography>
                  </Box>
                </Box>

              {/* Collateral Amount */}
              <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 1, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75 }}>
                Collateral Amount
              </Typography>
              <Box sx={{ ...innerSx, display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.75 }}>
                <Typography sx={{ fontSize: 22, fontWeight: 700, color: calcAsset.color, lineHeight: 1 }}>{calcAsset.icon}</Typography>
                <InputBase type="number" value={collAmt} onChange={e => setCollAmt(e.target.value)}
                  placeholder="0.00"
                  sx={{ flex: 1, color: C.tp, fontSize: 20, fontWeight: 600, '& input': { p: 0 } }} />
                <Typography variant="caption" sx={{ color: C.ts, fontWeight: 700, pr: 0.5 }}>{calcAsset.symbol}</Typography>
              </Box>
              <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 3 }}>
                ≈ {rm(collUSD, 2)} MYR
              </Typography>

              {/* LTV Slider */}
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="caption" sx={{ color: C.ts, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75 }}>Loan-to-Value (LTV)</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" sx={{ color: ltvColor, fontWeight: 700, fontSize: 14 }}>{ltv}%</Typography>
                    <Typography variant="caption" sx={{ color: C.ts }}>/ {calcAsset.maxLTV}% max</Typography>
                  </Box>
                </Box>
                <Slider min={0} max={calcAsset.maxLTV} value={ltv}
                  onChange={(_, val) => setLtv(val as number)}
                  sx={{
                    color: ltvColor,
                    '& .MuiSlider-thumb': { width: 18, height: 18, boxShadow: `0 0 0 6px ${ltvColor}22` },
                    '& .MuiSlider-rail': { opacity: 0.3 },
                  }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: -0.5 }}>
                  <Typography variant="caption" sx={{ color: C.ts, fontSize: 10 }}>0%</Typography>
                  <Typography variant="caption" sx={{ color: C.teal, fontSize: 10 }}>Safe ≤50%</Typography>
                  <Typography variant="caption" sx={{ color: C.red,  fontSize: 10 }}>Max {calcAsset.maxLTV}%</Typography>
                </Box>
              </Box>

              {/* Loan Term */}
              <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 1, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75 }}>
                Loan Term
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1, mb: 3 }}>
                {LOAN_TERMS.map(t => {
                  const sel = loanTermDays === t.days;
                  return (
                    <Box key={t.days} onClick={() => setLoanTermDays(t.days)}
                      sx={{
                        py: 1, textAlign: 'center', borderRadius: 2, cursor: 'pointer', transition: 'all 0.15s',
                        bgcolor: sel ? C.teal : C.inner,
                        border: `1px solid ${sel ? C.teal : C.border}`,
                        '&:hover': { borderColor: C.teal },
                      }}>
                      <Typography variant="caption" sx={{ color: sel ? '#060D1F' : C.ts, fontWeight: 700 }}>
                        {t.label}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>

              {/* ── Hold vs Sell ── */}
              <Box sx={{ mb: 3 }}>
                {/* Header */}
                <Box sx={{
                  p: 2, mb: 2, borderRadius: 2.5,
                  background: 'linear-gradient(135deg, rgba(14,159,110,0.08) 0%, rgba(42,63,214,0.08) 100%)',
                  border: `1px solid ${C.teal}25`,
                }}>
                  <Typography variant="body2" sx={{ color: C.teal, fontWeight: 700, mb: 0.5 }}>
                    Why Hold Instead of Selling?
                  </Typography>
                  <Typography variant="caption" sx={{ color: C.ts, lineHeight: 1.6 }}>
                    Keep your {calcAsset.symbol} upside while accessing MYR liquidity now.
                    Choose a target price scenario to see the advantage.
                  </Typography>
                </Box>

                {/* Scenario picker */}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, mb: 2 }}>
                  {[
                    { label: 'Flat', mult: 1.0, color: C.ts  },
                    { label: '+50%', mult: 1.5, color: C.gold },
                    { label: '2×',   mult: 2.0, color: C.teal },
                    { label: '3×',   mult: 3.0, color: C.blue },
                  ].map(opt => {
                    const sel = holdMultiplier === opt.mult;
                    return (
                      <Box key={opt.mult} onClick={() => setHoldMultiplier(opt.mult)}
                        sx={{
                          py: 1, textAlign: 'center', borderRadius: 2, cursor: 'pointer', transition: 'all 0.15s',
                          bgcolor: sel ? `${opt.color}18` : C.inner,
                          border: `1px solid ${sel ? opt.color + '60' : C.border}`,
                          '&:hover': { borderColor: opt.color + '40' },
                        }}>
                        <Typography variant="caption" sx={{ color: sel ? opt.color : C.ts, fontWeight: 700 }}>
                          {opt.label}
                        </Typography>
                        {sel && (
                          <Typography sx={{ fontSize: 9, color: opt.color, display: 'block', mt: 0.25 }}>
                            {rm(targetPrice)}
                          </Typography>
                        )}
                      </Box>
                    );
                  })}
                </Box>

                {/* Sell vs Hold comparison */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                  <Box sx={{ p: 2, bgcolor: C.inner, border: `1px solid ${C.red}33`, borderRadius: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: C.red }} />
                      <Typography variant="caption" sx={{ color: C.red, fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                        Sell Today
                      </Typography>
                    </Box>
                    <Typography variant="h6" sx={{ color: C.tp, fontWeight: 700, mb: 0.5 }}>{rm(collUSD)}</Typography>
                    <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 1.5 }}>One-time cash out</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Row label={`${calcAsset.symbol} position`} value="Forfeited" vc={C.red} />
                      {holdMultiplier > 1 && <Row label={`Upside if ${calcAsset.symbol} hits ${holdMultiplier}×`} value={`Miss ${rm(ethGain)}`} vc={C.red} />}
                    </Box>
                  </Box>

                  <Box sx={{ p: 2, bgcolor: C.inner, border: `1px solid ${C.teal}33`, borderRadius: 2.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: C.teal }} />
                      <Typography variant="caption" sx={{ color: C.teal, fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                        Borrow + Hold
                      </Typography>
                    </Box>
                    <Typography variant="h6" sx={{ color: C.tp, fontWeight: 700, mb: 0.5 }}>
                      {rm(borrowable)}{' '}
                      <Box component="span" sx={{ fontSize: 12, color: C.ts, fontWeight: 400 }}>MYR</Box>
                    </Typography>
                    <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 1.5 }}>Cash + {calcAsset.symbol} upside</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Row label={`${calcAsset.symbol} position`}   value="Retained" vc={C.teal} />
                      <Row label={`Gain at ${holdMultiplier}×`}     value={ethGain > 0 ? `+${rm(ethGain)}` : '—'} vc={C.teal} />
                      <Row label={`Interest (${loanTermDays}d)`}    value={`−${rm(calcInterest, 2)}`} vc={C.gold} />
                    </Box>
                  </Box>
                </Box>

                {/* Net advantage banner */}
                <Box sx={{
                  mt: 1.5, p: 2, borderRadius: 2.5,
                  background: netAdvantage >= 0
                    ? 'linear-gradient(135deg, rgba(14,159,110,0.08), rgba(14,159,110,0.06))'
                    : 'linear-gradient(135deg, rgba(229,72,77,0.08), rgba(229,72,77,0.04))',
                  border: `1px solid ${netAdvantage >= 0 ? C.teal + '30' : C.red + '30'}`,
                }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="caption" sx={{
                        color: netAdvantage >= 0 ? C.teal : C.red,
                        fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5,
                      }}>
                        {netAdvantage >= 0 ? '↑ Borrowing wins by' : '↓ Selling was better by'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: C.ts, display: 'block', mt: 0.25 }}>
                        vs selling at today&apos;s price ({rm(assetPrice)})
                      </Typography>
                    </Box>
                    <Typography variant="h5" sx={{ color: netAdvantage >= 0 ? C.teal : C.red, fontWeight: 800 }}>
                      {rm(Math.abs(netAdvantage))}
                    </Typography>
                  </Box>
                  {assetPrice > 0 && (
                    <Typography variant="caption" sx={{
                      display: 'block', mt: 1.5, pt: 1.5,
                      borderTop: `1px solid ${netAdvantage >= 0 ? C.teal + '20' : C.red + '20'}`,
                      color: C.ts, lineHeight: 1.6,
                    }}>
                      Break-even: {calcAsset.symbol} needs to drop below{' '}
                      <Box component="span" sx={{ color: C.gold }}>{rm(breakEvenPrice)}</Box>
                      {' '}(−{breakEvenDropPct.toFixed(1)}%) for selling to have been the smarter move.
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Calculator result */}
              <Box sx={{
                p: 3, borderRadius: 2.5,
                background: 'linear-gradient(135deg, #FFFFFF 0%, #F5F7FB 100%)',
                border: `1px solid ${C.teal}25`,
              }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2.5 }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: C.ts, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75, display: 'block', mb: 0.75 }}>
                      You Can Borrow
                    </Typography>
                    <Typography variant="h3" sx={{ color: C.teal, fontWeight: 800, lineHeight: 1 }}>{rm(borrowable)}</Typography>
                    <Typography variant="caption" sx={{ color: C.ts }}>Malaysian Ringgit</Typography>
                  </Box>
                  <Chip
                    label={`HF ${isFinite(calcHF) ? calcHF.toFixed(2) : '∞'}`}
                    size="small"
                    sx={{ bgcolor: `${hColor(calcHF)}18`, color: hColor(calcHF), border: `1px solid ${hColor(calcHF)}40`, fontWeight: 700 }}
                  />
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 2, borderTop: `1px solid ${C.teal}15`, mb: 2.5 }}>
                  <Row label="Interest Rate"                        value={`${calcAsset.borrowAPR}% APR`} />
                  <Row label={`Interest (${loanTermDays}d)`}        value={rm(calcInterest, 2)} vc={C.gold} />
                  <Row label="Origination Fee (0.1%)"               value={rm(originationFee, 2)} />
                  <Row label="Monthly Payment"                      value={rm(calcMonthly, 2)} vc={C.blue} />
                  <Box sx={{ pt: 1, borderTop: `1px solid ${C.teal}15` }}>
                    <Row label="Total Repayment"                    value={rm(calcTotal, 2)} vc={C.teal} bold />
                  </Box>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, pt: 2, borderTop: `1px solid ${C.teal}15` }}>
                  {[
                    { label: 'Liq. Price',      value: rm(assetPrice * (1 - calcAsset.maxLTV / 100 * 0.9)) },
                    { label: 'Min. Collateral', value: (borrowable / (assetPrice || 1) / (calcAsset.maxLTV / 100)).toFixed(4) + ' ' + calcAsset.symbol },
                  ].map(({ label, value }) => (
                    <Box key={label}>
                      <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 0.5 }}>{label}</Typography>
                      <Typography variant="body2" sx={{ color: C.tp, fontWeight: 700 }}>{value}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
              </Box>{/* end calculator wrapper */}
            </Paper>
          </Box>

          {/* ── RIGHT column ── */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* (My Credit Line card removed — position shown in top stats cards) */}
            {false && <Paper sx={cardSx}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h6" sx={{ color: C.tp, fontWeight: 700 }}>My Credit Line</Typography>
                <Chip
                  label={isLive ? '● Live' : 'Demo'}
                  size="small"
                  sx={{
                    bgcolor: isLive ? `${C.teal}15` : 'rgba(16,21,28,0.04)',
                    color: isLive ? C.teal : C.ts,
                    border: `1px solid ${isLive ? C.teal + '40' : C.border}`,
                    fontSize: 11, fontWeight: 700,
                  }}
                />
              </Box>

              {isLive && wallet.loanInfo && (() => {
                const { collateral, borrowed, healthFactor: hf, available } = wallet.loanInfo;
                const hc       = hColor(hf);
                const colEthFmt = parseFloat(ethers.formatEther(collateral)).toFixed(4);
                const borMYR   = (Number(borrowed) / 1e6).toFixed(2);
                const avMYR    = (Number(available) / 1e6).toFixed(2);
                const ltvNow   = wallet.loanInfo.collateralValueMYR > 0
                  ? ((Number(borrowed) / 1e6) / wallet.loanInfo.collateralValueMYR * 100).toFixed(1)
                  : '0.0';
                const hasLoan  = collateral > BigInt(0);
                return hasLoan ? (
                  <Box sx={{ ...innerSx }}>
                    {/* Loan header */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                        <Box sx={{
                          width: 32, height: 32, borderRadius: '50%', bgcolor: '#627EEA18', color: '#627EEA',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800,
                          border: '1px solid rgba(98,126,234,0.3)',
                        }}>Ξ</Box>
                        <Box>
                          <Typography variant="body2" sx={{ color: C.tp, fontWeight: 700 }}>ETH → MYR Loan</Typography>
                          <Typography variant="caption" sx={{ color: C.ts }}>4.80% APR · {ltvNow}% LTV</Typography>
                        </Box>
                      </Box>
                      <Chip label={hLabel(hf)} size="small"
                        sx={{ bgcolor: `${hc}18`, color: hc, border: `1px solid ${hc}40`, fontWeight: 700, fontSize: 11 }} />
                    </Box>

                    {/* Stats row */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2.5 }}>
                      <Box>
                        <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 0.5, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Collateral Locked</Typography>
                        <Typography variant="body1" sx={{ color: C.tp, fontWeight: 700 }}>{colEthFmt} ETH</Typography>
                        <Typography variant="caption" sx={{ color: C.ts }}>{rm(wallet.loanInfo.collateralValueMYR)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 0.5, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Outstanding Debt</Typography>
                        <Typography variant="body1" sx={{ color: C.tp, fontWeight: 700 }}>RM {borMYR}</Typography>
                        <Typography variant="caption" sx={{ color: C.gold }}>
                          + RM {(Number(wallet.loanInfo.accruedInterest) / 1e6).toFixed(4)} interest
                        </Typography>
                      </Box>
                    </Box>

                    {/* Health Factor bar */}
                    {Number(borrowed) > 0 && (
                      <Box sx={{ mb: 2.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="caption" sx={{ color: C.ts }}>Health Factor</Typography>
                          <Typography variant="caption" sx={{ color: hc, fontWeight: 700 }}>{isFinite(hf) ? hf.toFixed(2) : '∞'}</Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min((isFinite(hf) ? hf : 3) / 3 * 100, 100)}
                          sx={{
                            height: 8, borderRadius: 999,
                            bgcolor: '#E7EBF1',
                            '& .MuiLinearProgress-bar': { bgcolor: hc, borderRadius: 999, boxShadow: `0 0 8px ${hc}60` },
                          }}
                        />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75 }}>
                          <Typography variant="caption" sx={{ color: C.ts, fontSize: 10 }}>Liquidation (1.0)</Typography>
                          <Typography variant="caption" sx={{ color: C.ts, fontSize: 10 }}>Safe (2.0+)</Typography>
                        </Box>
                        {hf < 1.5 && isFinite(hf) && (
                          <Box sx={{ mt: 1.5, p: 1.5, bgcolor: `${C.red}10`, border: `1px solid ${C.red}30`, borderRadius: 2 }}>
                            <Typography variant="caption" sx={{ color: C.red }}>
                              ⚠ Risk Alert: Health factor below 1.5. Consider repaying or adding collateral.
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    )}

                    {/* Available credit */}
                    <Box sx={{ pt: 2, borderTop: `1px solid ${C.border}` }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                        <Typography variant="caption" sx={{ color: C.ts }}>Available credit</Typography>
                        <Typography variant="caption" sx={{ color: C.teal, fontWeight: 700 }}>RM {avMYR}</Typography>
                      </Box>
                      {Number(borrowed) > 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                          <Typography variant="caption" sx={{ color: C.ts }}>Total due now</Typography>
                          <Typography variant="caption" sx={{ color: C.gold, fontWeight: 700 }}>
                            RM {((Number(borrowed) + Number(wallet.loanInfo.accruedInterest)) / 1e6).toFixed(2)}
                          </Typography>
                        </Box>
                      )}
                      {Number(borrowed) === 0 && <Box sx={{ mb: 2 }} />}
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button fullWidth size="small" onClick={() => setActiveTab('deposit')}
                          sx={{ bgcolor: `rgba(16,21,28,0.04)`, color: C.tp, border: `1px solid ${C.border}`, fontSize: 12, borderRadius: 2,
                                '&:hover': { bgcolor: 'rgba(16,21,28,0.07)' } }}>
                          + Collateral
                        </Button>
                        <Button fullWidth size="small" variant="contained" onClick={() => setActiveTab('repay')}
                          sx={{ fontSize: 12, borderRadius: 2 }}>
                          Repay Loan
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4, textAlign: 'center',
                    bgcolor: `${C.teal}05`, border: `2px dashed ${C.teal}25`, borderRadius: 2.5,
                  }}>
                    <Box sx={{
                      width: 56, height: 56, borderRadius: '50%', bgcolor: `${C.teal}12`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, mb: 2,
                      border: `1px solid ${C.teal}25`,
                    }}>💳</Box>
                    <Typography variant="body2" sx={{ color: C.tp, fontWeight: 700, mb: 0.5 }}>No Active Credit Line</Typography>
                    <Typography variant="caption" sx={{ color: C.ts, mb: 0.5, lineHeight: 1.6, display: 'block' }}>
                      Deposit ETH to open your crypto credit line
                    </Typography>
                    <Typography variant="caption" sx={{ color: C.ts, mb: 2.5, lineHeight: 1.6, display: 'block' }}>
                      Up to <Box component="span" sx={{ color: C.teal, fontWeight: 700 }}>70% LTV</Box> · 4.80% APR
                    </Typography>
                    <Button size="small" variant="contained" onClick={() => setActiveTab('deposit')}
                      sx={{ borderRadius: 2, px: 2.5 }}>
                      Deposit Collateral
                    </Button>
                  </Box>
                );
              })()}

              {!isLive && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {DEMO_LOANS.map(loan => {
                    const meta = ASSETS.find(a => a.symbol === loan.collateral)!;
                    const hc   = hColor(loan.hf);
                    return (
                      <Box key={loan.id} sx={{ ...innerSx }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                            <Box sx={{
                              width: 32, height: 32, borderRadius: '50%', bgcolor: `${meta.color}18`, color: meta.color,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800,
                              border: `1px solid ${meta.color}30`,
                            }}>
                              {meta.icon}
                            </Box>
                            <Typography variant="body2" sx={{ color: C.tp, fontWeight: 700 }}>{loan.collateral} → MYR</Typography>
                          </Box>
                          <Chip label={hLabel(loan.hf)} size="small"
                            sx={{ bgcolor: `${hc}18`, color: hc, border: `1px solid ${hc}40`, fontWeight: 700, fontSize: 11 }} />
                        </Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 1.5 }}>
                          <Box>
                            <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 0.5 }}>Collateral</Typography>
                            <Typography variant="body2" sx={{ color: C.tp, fontWeight: 700 }}>{loan.colAmt} {loan.collateral}</Typography>
                            <Typography variant="caption" sx={{ color: C.ts }}>{rm(loan.colVal)}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 0.5 }}>Outstanding</Typography>
                            <Typography variant="body2" sx={{ color: C.tp, fontWeight: 700 }}>{rm(loan.borrowed)}</Typography>
                            <Typography variant="caption" sx={{ color: C.ts }}>{loan.apr}% APR · {loan.days}d</Typography>
                          </Box>
                        </Box>
                        <Box sx={{ pt: 1.5, borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="caption" sx={{ color: C.ts }}>Accrued interest</Typography>
                          <Typography variant="caption" sx={{ color: C.gold, fontWeight: 600 }}>
                            RM {((loan.borrowed * loan.apr / 100) * (loan.days / 365)).toFixed(2)}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                  <Typography variant="caption" sx={{ color: C.ts, textAlign: 'center' }}>
                    Connect MetaMask to interact with real contracts
                  </Typography>
                </Box>
              )}
            </Paper>}

            {/* Actions */}
            <Paper sx={cardSx}>
              {/* Tab switcher */}
              <Box sx={{ display: 'flex', bgcolor: C.inner, borderRadius: 2, p: 0.5, mb: 3, gap: 0.5 }}>
                {(['deposit', 'withdraw', 'borrow', 'repay', 'buy'] as const).map(tab => (
                  <Box key={tab} onClick={() => setActiveTab(tab)}
                    sx={{
                      flex: 1, py: 1, textAlign: 'center', borderRadius: 1.5, cursor: 'pointer',
                      transition: 'all 0.18s',
                      bgcolor: activeTab === tab ? C.card : 'transparent',
                      boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.09)' : 'none',
                      border: `1px solid ${activeTab === tab ? C.border : 'transparent'}`,
                    }}>
                    <Typography variant="caption" sx={{
                      color: activeTab === tab ? C.tp : C.ts,
                      fontWeight: activeTab === tab ? 700 : 500,
                      fontSize: 11,
                    }}>
                      {tab === 'buy' ? 'Buy MYR' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {!wallet.isConnected && (
                <Box sx={{ mb: 2.5, p: 3, bgcolor: `${C.blue}06`, border: `2px dashed rgba(42,63,214,0.2)`, borderRadius: 2.5, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: 28, mb: 1.5 }}>🦊</Typography>
                  <Typography variant="body2" sx={{ color: C.tp, fontWeight: 700, mb: 0.5 }}>MetaMask Required</Typography>
                  <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 2, lineHeight: 1.6 }}>
                    Connect your wallet to deposit collateral, borrow MYR, and manage your loans.
                  </Typography>
                  <Button variant="contained" onClick={wallet.connect}
                    sx={{ borderRadius: 2, px: 3, background: `linear-gradient(135deg, ${C.blue}, #4458E8)`, boxShadow: `0 4px 14px ${C.blue}30` }}>
                    Connect MetaMask
                  </Button>
                </Box>
              )}

              {/* DEPOSIT */}
              {activeTab === 'deposit' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {isLive && !wallet.kycApproved && (
                    <KycRequiredCard onStart={() => router.push('/kyc')} action="depositing collateral" kycStatus={wallet.kycStatus} />
                  )}
                  {(!isLive || wallet.kycApproved) && (
                  <>
                  <Box>
                    <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 1, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75 }}>
                      ETH Amount to Deposit
                    </Typography>
                    <Box sx={{ ...innerSx, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#627EEA', lineHeight: 1 }}>Ξ</Typography>
                      <InputBase type="number" value={depositAmt} onChange={e => setDepositAmt(e.target.value)}
                        placeholder="0.00"
                        sx={{ flex: 1, color: C.tp, fontSize: 20, fontWeight: 600, '& input': { p: 0 } }} />
                      <Button size="small" onClick={() => setDepositAmt(Math.max(0, parseFloat(wallet.ethBalance || '0') - 0.01).toFixed(4))}
                        sx={{ bgcolor: `${C.teal}15`, color: C.teal, fontSize: 11, minWidth: 'auto', py: 0.25, px: 1.25, borderRadius: 1.5 }}>
                        MAX
                      </Button>
                    </Box>
                    {wallet.isConnected && (
                      <Typography variant="caption" sx={{ color: C.ts, mt: 0.75, display: 'block' }}>
                        Wallet balance: {wallet.ethBalance} ETH
                      </Typography>
                    )}
                  </Box>

                  {(() => {
                    const depEth          = parseFloat(depositAmt || '0');
                    const price           = isLive ? wallet.ethPriceMYR : ethPriceMYR;
                    const colValue        = depEth * price;
                    const maxBorrow       = colValue * 0.70;
                    const alreadyBorrowed = isLive && wallet.loanInfo ? Number(wallet.loanInfo.borrowed) / 1e6 : 0;
                    const totalColAfter   = (isLive && wallet.loanInfo ? parseFloat(ethers.formatEther(wallet.loanInfo.collateral)) : 0) + depEth;
                    const totalColMYR     = totalColAfter * price;
                    const newMaxBorrow    = totalColMYR * 0.70;
                    const newAvailable    = Math.max(0, newMaxBorrow - alreadyBorrowed);
                    return (
                      <Box sx={{ ...innerSx, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Typography variant="caption" sx={{ color: C.tp, fontWeight: 700, mb: 0.5 }}>Borrowing Power</Typography>
                        <Row label="ETH Price (on-chain)"                                      value={rm(price)} />
                        <Row label={`${depEth.toFixed(4)} ETH × ${rm(price)}`}                value={rm(colValue)} />
                        <Row label="× Max LTV (70%)"                                           value={`= ${rm(maxBorrow)}`} vc={C.teal} />
                        {isLive && alreadyBorrowed > 0 && (
                          <Box sx={{ pt: 1, borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Row label="Total collateral after"  value={`${totalColAfter.toFixed(4)} ETH`} />
                            <Row label="New max borrowable"       value={rm(newMaxBorrow)} />
                            <Row label="Already borrowed"         value={`−${rm(alreadyBorrowed, 2)}`} vc={C.gold} />
                          </Box>
                        )}
                        <Box sx={{ pt: 1, borderTop: `1px solid ${C.border}` }}>
                          <Row
                            label={isLive && alreadyBorrowed > 0 ? 'Available after deposit' : 'Max you can borrow'}
                            value={rm(isLive && alreadyBorrowed > 0 ? newAvailable : maxBorrow, 2) + ' MYR'}
                            vc={C.teal} bold
                          />
                        </Box>
                      </Box>
                    );
                  })()}

                  <Box sx={{ p: 1.75, bgcolor: `${C.teal}08`, border: `1px solid ${C.teal}20`, borderRadius: 2, display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                    <Typography sx={{ fontSize: 14, flexShrink: 0 }}>🔒</Typography>
                    <Typography variant="caption" sx={{ color: C.teal, lineHeight: 1.6 }}>
                      Collateral is locked in a non-custodial smart contract. Only you can withdraw it after repaying your loan.
                    </Typography>
                  </Box>

                  {(() => {
                    const amt        = parseFloat(depositAmt || '0');
                    const overBal    = wallet.isConnected && amt > parseFloat(wallet.ethBalance || '0');
                    const pending    = wallet.txStatus === 'pending';
                    // Resolve the single blocking reason so the button is always
                    // either actionable or clearly explains why it isn't.
                    const action =
                      !wallet.isConnected       ? { label: 'Connect Wallet',        onClick: wallet.connect,         disabled: false } :
                      !wallet.isCorrectNetwork  ? { label: 'Switch to Hardhat',      onClick: wallet.switchToHardhat, disabled: false } :
                      !wallet.isDeployed        ? { label: 'Contracts not deployed', onClick: undefined,              disabled: true  } :
                      pending                   ? { label: 'Waiting for confirmation…', onClick: undefined,           disabled: true  } :
                      !depositAmt || amt <= 0   ? { label: 'Enter an ETH amount',    onClick: undefined,              disabled: true  } :
                      overBal                   ? { label: 'Insufficient ETH balance',onClick: undefined,              disabled: true  } :
                                                  { label: 'Deposit Collateral',     onClick: () => wallet.depositCollateral(depositAmt).then(() => setDepositAmt('')), disabled: false };
                    return (
                      <Button fullWidth variant="contained"
                        disabled={action.disabled}
                        onClick={action.onClick}
                        sx={{ py: 1.75, fontSize: 14, borderRadius: 2.5 }}>
                        {action.label}
                      </Button>
                    );
                  })()}
                  </>
                  )}
                </Box>
              )}

              {/* WITHDRAW */}
              {activeTab === 'withdraw' && (() => {
                const price       = isLive ? wallet.ethPriceMYR : ethPriceMYR;
                const colEth      = isLive && wallet.loanInfo ? parseFloat(ethers.formatEther(wallet.loanInfo.collateral)) : 0;
                const borMYR      = isLive && wallet.loanInfo ? Number(wallet.loanInfo.borrowed) / 1e6 : 0;
                // Must keep enough collateral that the loan stays within 70% LTV.
                const minColEth   = borMYR > 0 ? (borMYR / 0.70) / price : 0;
                const maxWithdraw = Math.max(0, colEth - minColEth);
                const wAmt        = parseFloat(withdrawAmt || '0');
                const colAfter    = Math.max(0, colEth - wAmt);
                const pending     = wallet.txStatus === 'pending';
                const overMax     = wAmt > maxWithdraw + 1e-9;
                const action =
                  !wallet.isConnected      ? { label: 'Connect Wallet',          onClick: wallet.connect,         disabled: false } :
                  !wallet.isCorrectNetwork ? { label: 'Switch to Hardhat',        onClick: wallet.switchToHardhat, disabled: false } :
                  !wallet.isDeployed       ? { label: 'Contracts not deployed',   onClick: undefined,              disabled: true  } :
                  colEth <= 0              ? { label: 'No collateral to withdraw',onClick: undefined,              disabled: true  } :
                  pending                  ? { label: 'Waiting for confirmation…',onClick: undefined,              disabled: true  } :
                  !withdrawAmt || wAmt <= 0? { label: 'Enter an ETH amount',      onClick: undefined,              disabled: true  } :
                  overMax                  ? { label: 'Exceeds withdrawable (LTV)',onClick: undefined,             disabled: true  } :
                                             { label: 'Withdraw Collateral',      onClick: () => wallet.withdrawCollateral(withdrawAmt).then(() => setWithdrawAmt('')), disabled: false };
                return (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {isLive && colEth <= 0 && (
                    <Box sx={{ p: 3, bgcolor: C.inner, border: `2px dashed ${C.border}`, borderRadius: 2.5, textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 24, mb: 1 }}>🏦</Typography>
                      <Typography variant="body2" sx={{ color: C.tp, fontWeight: 700, mb: 0.5 }}>No Collateral Deposited</Typography>
                      <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 2, lineHeight: 1.6 }}>
                        Deposit ETH first to have something to withdraw.
                      </Typography>
                      <Button size="small" variant="outlined" onClick={() => setActiveTab('deposit')}
                        sx={{ borderRadius: 2, fontSize: 12 }}>
                        Go to Deposit →
                      </Button>
                    </Box>
                  )}
                  {(!isLive || colEth > 0) && (
                  <>
                  <Box>
                    <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 1, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75 }}>
                      ETH Amount to Withdraw
                    </Typography>
                    <Box sx={{ ...innerSx, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#627EEA', lineHeight: 1 }}>Ξ</Typography>
                      <InputBase type="number" value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)}
                        placeholder="0.00"
                        sx={{ flex: 1, color: C.tp, fontSize: 20, fontWeight: 600, '& input': { p: 0 } }} />
                      <Button size="small" onClick={() => setWithdrawAmt((Math.floor(maxWithdraw * 10000) / 10000).toFixed(4))}
                        sx={{ bgcolor: `${C.teal}15`, color: C.teal, fontSize: 11, minWidth: 'auto', py: 0.25, px: 1.25, borderRadius: 1.5 }}>
                        MAX
                      </Button>
                    </Box>
                    {isLive && (
                      <Typography variant="caption" sx={{ color: C.ts, mt: 0.75, display: 'block' }}>
                        Deposited: {colEth.toFixed(4)} ETH · Withdrawable now: {maxWithdraw.toFixed(4)} ETH
                      </Typography>
                    )}
                  </Box>

                  <Box sx={{ ...innerSx, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Typography variant="caption" sx={{ color: C.tp, fontWeight: 700, mb: 0.5 }}>After Withdrawal</Typography>
                    <Row label="Current collateral"          value={`${colEth.toFixed(4)} ETH (${rm(colEth * price)})`} />
                    <Row label="Withdraw"                    value={`−${(wAmt || 0).toFixed(4)} ETH`} vc={C.gold} />
                    <Box sx={{ pt: 1, borderTop: `1px solid ${C.border}` }}>
                      <Row label="Remaining collateral"       value={`${colAfter.toFixed(4)} ETH`} bold />
                      <Row label="Value"                       value={rm(colAfter * price)} />
                    </Box>
                    {borMYR > 0 && (
                      <Box sx={{ pt: 1, borderTop: `1px solid ${C.border}` }}>
                        <Row label="Outstanding debt"          value={rm(borMYR, 2)} vc={C.gold} />
                        <Row label="Min. collateral required"  value={`${minColEth.toFixed(4)} ETH`} />
                      </Box>
                    )}
                  </Box>

                  {borMYR > 0 && (
                    <Box sx={{ p: 1.75, bgcolor: `${C.gold}08`, border: `1px solid ${C.gold}20`, borderRadius: 2, display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                      <Typography sx={{ fontSize: 14, flexShrink: 0 }}>⚠</Typography>
                      <Typography variant="caption" sx={{ color: C.gold, lineHeight: 1.6 }}>
                        Open loan: you can only withdraw above the 70% LTV minimum. Repay debt to unlock more collateral.
                      </Typography>
                    </Box>
                  )}

                  <Button fullWidth variant="contained"
                    disabled={action.disabled}
                    onClick={action.onClick}
                    sx={{ py: 1.75, fontSize: 14, borderRadius: 2.5 }}>
                    {action.label}
                  </Button>
                  </>
                  )}
                </Box>
                );
              })()}

              {/* BORROW */}
              {activeTab === 'borrow' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {isLive && !wallet.kycApproved && (
                    <KycRequiredCard onStart={() => router.push('/kyc')} action="borrowing" kycStatus={wallet.kycStatus} />
                  )}

                  {(!isLive || wallet.kycApproved) && (
                    <>
                      <Box>
                        <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 1, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75 }}>
                          Loan Term
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
                          {LOAN_TERMS.map(t => {
                            const sel = loanTermDays === t.days;
                            return (
                              <Box key={t.days} onClick={() => setLoanTermDays(t.days)}
                                sx={{
                                  py: 1, textAlign: 'center', borderRadius: 2, cursor: 'pointer', transition: 'all 0.15s',
                                  bgcolor: sel ? C.teal : C.inner,
                                  border: `1px solid ${sel ? C.teal : C.border}`,
                                  '&:hover': { borderColor: C.teal },
                                }}>
                                <Typography variant="caption" sx={{ color: sel ? '#060D1F' : C.ts, fontWeight: 700, fontSize: 11 }}>
                                  {t.label}
                                </Typography>
                              </Box>
                            );
                          })}
                        </Box>
                      </Box>

                      <Box>
                        <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 1, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75 }}>
                          Borrow Amount (MYR)
                        </Typography>
                        <Box sx={{ ...innerSx, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Typography variant="body2" sx={{ color: C.teal, fontWeight: 800, fontSize: 15 }}>RM</Typography>
                          <InputBase type="number" value={borrowAmt}
                            onChange={e => { setBorrowAmt(e.target.value); setTransferResult(null); setTransferError(''); }}
                            placeholder="0.00"
                            sx={{ flex: 1, color: C.tp, fontSize: 20, fontWeight: 600, '& input': { p: 0 } }} />
                          <Button size="small"
                            onClick={() => isLive && wallet.loanInfo
                              ? setBorrowAmt((Number(wallet.loanInfo.available) / 1e6).toFixed(2)) : undefined}
                            sx={{ bgcolor: `${C.teal}15`, color: C.teal, fontSize: 11, minWidth: 'auto', py: 0.25, px: 1.25, borderRadius: 1.5 }}>
                            MAX
                          </Button>
                        </Box>
                        {isLive && wallet.loanInfo && (() => {
                          const contractAvail = Number(wallet.loanInfo!.available) / 1e6;
                          const mktAvail      = Math.max(0, colEth * mktEthPrice * 0.7 - (Number(wallet.loanInfo!.borrowed) / 1e6));
                          return (
                            <Box sx={{ mt: 0.75 }}>
                              <Typography variant="caption" sx={{ color: C.ts, display: 'block' }}>
                                Available (contract): RM {contractAvail.toFixed(2)}
                              </Typography>
                              {hasPriceMismatch && (
                                <Typography variant="caption" sx={{ display: 'block', color: mktAvail < contractAvail ? C.gold : C.ts }}>
                                  Available (market): RM {mktAvail.toFixed(2)}
                                </Typography>
                              )}
                            </Box>
                          );
                        })()}
                      </Box>

                      {/* Delivery method */}
                      <Box>
                        <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 1, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75 }}>
                          Receive As
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                          {([
                            { key: 'token', icon: '🪙', title: 'MYR Token',    sub: 'MockMYR to wallet' },
                            { key: 'bank',  icon: '🏦', title: 'Bank Transfer', sub: 'DuitNow transfer' },
                          ] as const).map(opt => (
                            <Box key={opt.key}
                              onClick={() => { setDeliveryMethod(opt.key); setTransferResult(null); setTransferError(''); }}
                              sx={{
                                p: 1.75, borderRadius: 2, cursor: 'pointer', transition: 'all 0.15s',
                                border: `1px solid ${deliveryMethod === opt.key ? C.teal + '50' : C.border}`,
                                bgcolor: deliveryMethod === opt.key ? `${C.teal}08` : C.inner,
                                '&:hover': { borderColor: C.teal + '40' },
                              }}>
                              <Typography sx={{ fontSize: 18, mb: 0.5 }}>{opt.icon}</Typography>
                              <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: deliveryMethod === opt.key ? C.teal : C.tp }}>
                                {opt.title}
                              </Typography>
                              <Typography sx={{ fontSize: 10, color: C.ts }}>{opt.sub}</Typography>
                            </Box>
                          ))}
                        </Box>
                        {deliveryMethod === 'bank' && (
                          <Box sx={{ mt: 1, p: 1.5, bgcolor: `${C.teal}06`, border: `1px solid ${C.teal}20`, borderRadius: 2 }}>
                            <Typography variant="caption" sx={{ color: C.ts }}>
                              ℹ MYR will be transferred via DuitNow.{' '}
                              <Box component="span" onClick={() => router.push('/settings')}
                                sx={{ color: C.teal, cursor: 'pointer', textDecoration: 'underline' }}>
                                Add bank account in Settings →
                              </Box>
                            </Typography>
                          </Box>
                        )}
                      </Box>

                      <Box sx={{ ...innerSx, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Row label="Principal"                               value={borrowMYR > 0 ? rm(borrowMYR, 2) : '—'} />
                        <Row label={`Interest (${loanTermDays}d · 4.80%)`}  value={borrowMYR > 0 ? rm(panelInterest, 2) : '—'} vc={C.gold} />
                        <Row label="Origination Fee (0.10%)"                value={borrowMYR > 0 ? rm(borrowMYR * 0.001, 2) : '—'} />
                        <Row label="Monthly Payment (est.)"                 value={borrowMYR > 0 ? rm(panelMonthly, 2) : '—'} vc={C.blue} />
                        <Box sx={{ pt: 1, borderTop: `1px solid ${C.border}` }}>
                          <Row label="Total to Repay"                       value={borrowMYR > 0 ? rm(panelTotal, 2) : '—'} vc={C.teal} bold />
                        </Box>
                        {(() => {
                          if (!isLive || !wallet.loanInfo || !borrowAmt) {
                            return <Row label="Health Factor After" value="—" vc={C.teal} />;
                          }
                          const newBor     = Number(wallet.loanInfo.borrowed) / 1e6 + parseFloat(borrowAmt);
                          if (newBor <= 0) return <Row label="Health Factor After" value="∞" vc={C.teal} />;
                          const contractHF = (wallet.loanInfo.collateralValueMYR * 0.8) / newBor;
                          const mktHFAfter = (colEth * mktEthPrice * 0.8) / newBor;
                          return (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <Typography variant="caption" sx={{ color: C.ts }}>Health Factor After</Typography>
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="caption" sx={{ color: hColor(contractHF), fontWeight: 700, display: 'block' }}>
                                  {contractHF.toFixed(2)} (contract)
                                </Typography>
                                {hasPriceMismatch && (
                                  <Typography variant="caption" sx={{ color: hColor(mktHFAfter), fontWeight: 700, display: 'block' }}>
                                    {mktHFAfter.toFixed(2)} (market) {mktHFAfter < 1.5 ? '⚠️' : ''}
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                          );
                        })()}
                      </Box>

                      {transferError && (
                        <Alert severity="warning" sx={{ bgcolor: `${C.gold}08`, color: C.gold, '& .MuiAlert-icon': { color: C.gold }, borderRadius: 2 }}>
                          {transferError}
                        </Alert>
                      )}

                      {transferResult && (
                        <Alert severity="success" sx={{ bgcolor: `${C.teal}08`, color: C.teal, '& .MuiAlert-icon': { color: C.teal }, borderRadius: 2 }}>
                          <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: C.teal }}>
                            {transferResult.refNo === 'ON-CHAIN' ? '✓ On-chain transfer confirmed' : '✓ DuitNow transfer initiated'}
                          </Typography>
                          <Typography variant="caption" sx={{ color: C.ts }}>
                            {transferResult.bankName} ****{transferResult.last4}
                            {transferResult.refNo !== 'ON-CHAIN' && ` · Ref: ${transferResult.refNo}`}
                          </Typography>
                        </Alert>
                      )}

                      <Button fullWidth variant="contained"
                        disabled={!isLive || !borrowAmt || wallet.txStatus === 'pending' ||
                          (isLive && wallet.loanInfo != null && parseFloat(borrowAmt) > Number(wallet.loanInfo.available) / 1e6)}
                        onClick={async () => {
                          setTransferResult(null); setTransferError('');
                          const available = wallet.loanInfo ? Number(wallet.loanInfo.available) / 1e6 : 0;
                          if (parseFloat(borrowAmt) > available) {
                            setTransferError(`Exceeds available capacity (RM ${available.toFixed(2)}). Deposit more collateral first.`);
                            return;
                          }
                          const mktAvail = Math.max(0, colEth * mktEthPrice * 0.7 - (wallet.loanInfo ? Number(wallet.loanInfo.borrowed) / 1e6 : 0));
                          if (hasPriceMismatch && parseFloat(borrowAmt) > mktAvail) {
                            setTransferError(`Warning: At live market price, your safe limit is RM ${mktAvail.toFixed(2)}.`);
                            return;
                          }
                          const borrowed = await wallet.borrow(borrowAmt);
                          if (!borrowed) return;
                          if (deliveryMethod === 'bank') {
                            try {
                              const bankRes     = await fetch('/api/profile/bank-account');
                              const bankData    = await bankRes.json() as { account?: { recipientAddress?: string; bankName?: string; accountNumber?: string } };
                              const recipientAddr = bankData.account?.recipientAddress ?? '';
                              if (recipientAddr && /^0x[0-9a-fA-F]{40}$/.test(recipientAddr)) {
                                const sent = await wallet.transferMYR(borrowAmt, recipientAddr);
                                if (sent) {
                                  const last4 = bankData.account?.accountNumber?.slice(-4) ?? '????';
                                  setTransferResult({ refNo: 'ON-CHAIN', bankName: bankData.account?.bankName ?? 'Bank', last4 });
                                } else {
                                  setTransferError('On-chain transfer failed. MYR tokens remain in your wallet.');
                                }
                              } else {
                                const res  = await fetch('/api/transfers', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ amountMYR: parseFloat(borrowAmt) }),
                                });
                                const data = await res.json() as { transfer?: { referenceNo: string; bankName: string; accountLast4: string }; error?: string };
                                if (res.ok && data.transfer) {
                                  setTransferResult({ refNo: data.transfer.referenceNo, bankName: data.transfer.bankName, last4: data.transfer.accountLast4 });
                                } else {
                                  setTransferError(data.error ?? 'No recipient wallet set. Go to Settings first.');
                                }
                              }
                            } catch {
                              setTransferError('Network error initiating transfer.');
                            }
                          }
                          setBorrowAmt('');
                        }}
                        sx={{ py: 1.75, fontSize: 14, borderRadius: 2.5 }}>
                        {wallet.txStatus === 'pending' ? 'Waiting for confirmation…'
                          : deliveryMethod === 'bank' ? 'Borrow + Transfer to Bank' : 'Borrow MYR'}
                      </Button>
                    </>
                  )}
                </Box>
              )}

              {/* REPAY — no KYC gate; repay() on-chain has no onlyKYC modifier */}
              {activeTab === 'repay' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 1, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75 }}>
                      Repay Amount (MYR)
                    </Typography>
                    <Box sx={{ ...innerSx, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Typography variant="body2" sx={{ color: C.teal, fontWeight: 800, fontSize: 15 }}>RM</Typography>
                      <InputBase type="number" value={repayAmt} onChange={e => setRepayAmt(e.target.value)}
                        placeholder="0.00"
                        sx={{ flex: 1, color: C.tp, fontSize: 20, fontWeight: 600, '& input': { p: 0 } }} />
                      <Button size="small"
                        onClick={() => {
                          if (!isLive || !wallet.loanInfo) return;
                          const due = (Number(wallet.loanInfo.borrowed) + Number(wallet.loanInfo.accruedInterest)) / 1e6;
                          setRepayAmt(due.toFixed(2));
                        }}
                        sx={{ bgcolor: `${C.teal}15`, color: C.teal, fontSize: 11, minWidth: 'auto', py: 0.25, px: 1.25, borderRadius: 1.5 }}>
                        FULL
                      </Button>
                    </Box>
                    {isLive && (
                      <Typography variant="caption" sx={{ color: C.ts, mt: 0.75, display: 'block' }}>
                        MYR balance: {wallet.myrBalance}
                      </Typography>
                    )}
                  </Box>

                  <Box sx={{ ...innerSx, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Row label="Outstanding Principal"
                      value={isLive && wallet.loanInfo ? `RM ${(Number(wallet.loanInfo.borrowed)/1e6).toFixed(2)}` : '—'} />
                    <Row label="Accrued Interest"
                      value={isLive && wallet.loanInfo ? `RM ${(Number(wallet.loanInfo.accruedInterest)/1e6).toFixed(4)}` : '—'} vc={C.gold} />
                    <Row label="Total Due"
                      value={isLive && wallet.loanInfo
                        ? `RM ${((Number(wallet.loanInfo.borrowed)+Number(wallet.loanInfo.accruedInterest))/1e6).toFixed(2)}`
                        : '—'} vc={C.teal} />
                    <Row label="Repaying" value={repayAmt ? `RM ${parseFloat(repayAmt).toFixed(2)}` : '—'} vc={C.teal} />
                    <Box sx={{ pt: 1, borderTop: `1px solid ${C.border}` }}>
                      <Row label="New Health Factor"
                        value={(() => {
                          if (!isLive || !wallet.loanInfo || !repayAmt) return '—';
                          const interest     = Number(wallet.loanInfo.accruedInterest) / 1e6;
                          const principal    = Number(wallet.loanInfo.borrowed) / 1e6;
                          const paying       = parseFloat(repayAmt);
                          const principalPaid = Math.max(0, paying - interest);
                          const rem          = Math.max(0, principal - principalPaid);
                          if (rem <= 0) return '∞';
                          return ((wallet.loanInfo.collateralValueMYR * 0.8) / rem).toFixed(2);
                        })()} vc={C.teal} bold />
                    </Box>
                  </Box>

                  {/* Low MYR balance warning */}
                  {isLive && wallet.loanInfo && (() => {
                    const due = (Number(wallet.loanInfo.borrowed) + Number(wallet.loanInfo.accruedInterest)) / 1e6;
                    const bal = parseFloat(wallet.myrBalance || '0');
                    const shortage = due - bal;
                    if (shortage <= 0) return null;
                    return (
                      <Box sx={{ p: 2, bgcolor: `${C.red}08`, border: `1px solid ${C.red}30`, borderRadius: 2 }}>
                        <Typography variant="caption" sx={{ color: C.red, fontWeight: 700, display: 'block', mb: 0.75 }}>
                          Insufficient MYR balance
                        </Typography>
                        <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 1.25, lineHeight: 1.6 }}>
                          You need <b style={{ color: C.tp }}>RM {due.toFixed(2)}</b> to repay in full but only have{' '}
                          <b style={{ color: C.tp }}>RM {bal.toFixed(2)}</b>.{' '}
                          You&apos;re short by <b style={{ color: C.red }}>RM {shortage.toFixed(2)}</b>.
                        </Typography>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => { setBuyAmt(shortage.toFixed(2)); setActiveTab('buy'); }}
                          sx={{ fontSize: 12, borderRadius: 2, bgcolor: C.teal, '&:hover': { bgcolor: '#0b8a5e' } }}
                        >
                          Buy RM {shortage.toFixed(2)} MYR →
                        </Button>
                      </Box>
                    );
                  })()}

                  <Box sx={{ p: 1.75, bgcolor: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: 2, display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                    <Typography sx={{ fontSize: 14, flexShrink: 0 }}>ℹ</Typography>
                    <Box>
                      <Typography variant="caption" sx={{ color: C.ts, display: 'block', lineHeight: 1.6 }}>
                        Two MetaMask confirmations: <b style={{ color: C.tp }}>① Approve MYR spend</b>, then <b style={{ color: C.tp }}>② Repay loan</b>.
                      </Typography>
                      <Typography variant="caption" sx={{ color: C.ts, display: 'block', mt: 0.5, lineHeight: 1.6 }}>
                        Full repayment unlocks your ETH collateral immediately.
                      </Typography>
                    </Box>
                  </Box>

                  <Button fullWidth variant="contained"
                    disabled={!isLive || !repayAmt || wallet.txStatus === 'pending'}
                    onClick={() => wallet.repay(repayAmt).then(() => setRepayAmt(''))}
                    sx={{ py: 1.75, fontSize: 14, borderRadius: 2.5 }}>
                    {wallet.txStatus === 'pending' ? 'Waiting for confirmation…' : 'Repay Loan'}
                  </Button>
                </Box>
              )}

              {/* BUY MYR */}
              {activeTab === 'buy' && (() => {
                const buyMyrNum    = parseFloat(buyAmt || '0');
                const ethCost      = isLive && wallet.ethPriceMYR > 0 ? buyMyrNum / wallet.ethPriceMYR : 0;
                const overBalance  = wallet.isConnected && ethCost > parseFloat(wallet.ethBalance || '0');
                const pending      = wallet.txStatus === 'pending';
                const action =
                  !wallet.isConnected      ? { label: 'Connect Wallet',         onClick: wallet.connect,          disabled: false } :
                  !wallet.isCorrectNetwork ? { label: 'Switch to Hardhat',       onClick: wallet.switchToHardhat,  disabled: false } :
                  !wallet.isDeployed       ? { label: 'Contracts not deployed',  onClick: undefined,               disabled: true  } :
                  pending                  ? { label: 'Waiting for confirmation…',onClick: undefined,              disabled: true  } :
                  !buyAmt || buyMyrNum <= 0? { label: 'Enter MYR amount',        onClick: undefined,               disabled: true  } :
                  overBalance              ? { label: 'Insufficient ETH balance', onClick: undefined,              disabled: true  } :
                                             { label: 'Buy MYR →',              onClick: () => wallet.buyMYR(buyAmt).then(() => setBuyAmt('')), disabled: false };
                return (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box sx={{ p: 2, bgcolor: `${C.teal}08`, border: `1px solid ${C.teal}25`, borderRadius: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                        <Typography sx={{ fontSize: 16 }}>🛒</Typography>
                        <Typography variant="caption" sx={{ color: C.teal, fontWeight: 700 }}>Buy MYR with ETH</Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: C.ts, lineHeight: 1.6, display: 'block' }}>
                        Swap ETH → MYR tokens at the on-chain oracle price. MYR is minted directly to your wallet, ready to repay your loan.
                      </Typography>
                      {isLive && wallet.loanInfo && Number(wallet.loanInfo.borrowed) > 0 && (
                        <Box sx={{ mt: 1.25, pt: 1.25, borderTop: `1px solid ${C.teal}20`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="caption" sx={{ color: C.ts }}>Your loan balance</Typography>
                          <Typography variant="caption" sx={{ color: C.tp, fontWeight: 700 }}>
                            RM {((Number(wallet.loanInfo.borrowed) + Number(wallet.loanInfo.accruedInterest)) / 1e6).toFixed(2)}
                          </Typography>
                        </Box>
                      )}
                    </Box>

                    <Box>
                      <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 1, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75 }}>
                        MYR Amount to Buy
                      </Typography>
                      <Box sx={{ ...innerSx, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography sx={{ fontSize: 16, fontWeight: 700, color: C.teal, lineHeight: 1 }}>RM</Typography>
                        <InputBase type="number" value={buyAmt} onChange={e => setBuyAmt(e.target.value)}
                          placeholder="0.00"
                          sx={{ flex: 1, color: C.tp, fontSize: 20, fontWeight: 600, '& input': { p: 0 } }} />
                        <Typography variant="caption" sx={{ color: C.ts, fontWeight: 700, pr: 0.5 }}>MYR</Typography>
                      </Box>
                      {wallet.isConnected && (
                        <Typography variant="caption" sx={{ color: C.ts, mt: 0.75, display: 'block' }}>
                          Wallet balance: {wallet.ethBalance} ETH · MYR balance: {wallet.myrBalance}
                        </Typography>
                      )}
                    </Box>

                    <Box sx={{ ...innerSx, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography variant="caption" sx={{ color: C.tp, fontWeight: 700, mb: 0.5 }}>You Will Pay</Typography>
                      <Row label="ETH/MYR Rate (on-chain)"   value={isLive ? `RM ${wallet.ethPriceMYR.toLocaleString()}` : '—'} />
                      <Row label={`${buyMyrNum.toFixed(2)} MYR ÷ rate`} value={ethCost > 0 ? `${ethCost.toFixed(6)} ETH` : '—'} />
                      <Box sx={{ pt: 1, borderTop: `1px solid ${C.border}` }}>
                        <Row label="ETH Cost"  value={ethCost > 0 ? `${ethCost.toFixed(6)} ETH` : '—'} vc={C.teal} bold />
                      </Box>
                    </Box>

                    <Box sx={{ p: 1.75, bgcolor: `${C.gold}08`, border: `1px solid ${C.gold}25`, borderRadius: 2 }}>
                      <Typography variant="caption" sx={{ color: C.gold }}>
                        ⚠ This mints new MYR at the contract&apos;s on-chain price. Use it to top up your balance before repaying a loan.
                      </Typography>
                    </Box>

                    <Button fullWidth variant="contained"
                      disabled={action.disabled}
                      onClick={action.onClick}
                      sx={{ py: 1.75, fontSize: 14, borderRadius: 2.5, background: !action.disabled ? `linear-gradient(135deg, ${C.teal}, #0B8B5E)` : undefined }}>
                      {action.label}
                    </Button>
                  </Box>
                );
              })()}
            </Paper>
          </Box>
        </Box>
      </Box>

      {/* KYC Dialog — shown once per session when deposit tab is active and KYC not done */}
      <Dialog open={kycDialogOpen} onClose={() => setKycDialogOpen(false)} maxWidth="xs" fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3, p: 0.5 } } }}>
        <DialogContent sx={{ p: 3.5, textAlign: 'center' }}>
          {wallet.kycStatus === 'pending' ? (
            <>
              <Box sx={{
                width: 64, height: 64, borderRadius: '50%', bgcolor: 'rgba(42,63,214,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, mx: 'auto', mb: 2,
              }}>⏳</Box>
              <Typography variant="h6" sx={{ color: C.tp, fontWeight: 700, mb: 1 }}>KYC Under Review</Typography>
              <Chip label="● Pending Review" size="small"
                sx={{ bgcolor: 'rgba(42,63,214,0.1)', color: C.blue, border: '1px solid rgba(42,63,214,0.25)', fontWeight: 600, mb: 2 }} />
              <Typography variant="body2" sx={{ color: C.ts, lineHeight: 1.7, mb: 3 }}>
                Your identity verification is being reviewed by our compliance team. Depositing collateral will be unlocked once your KYC is approved.
              </Typography>
              <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 3,
                p: 1.5, bgcolor: C.inner, border: `1px solid ${C.border}`, borderRadius: 2, textAlign: 'left' }}>
                <Box component="span" sx={{ fontWeight: 700, color: C.tp, display: 'block', mb: 0.5 }}>Why KYC?</Box>
                Malaysian regulations (BNM AML/CFT) require all crypto-backed lending platforms to verify user identities to prevent money laundering and fraud.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Button fullWidth variant="outlined" onClick={() => setKycDialogOpen(false)}
                  sx={{ borderColor: C.border, color: C.ts, borderRadius: 2 }}>
                  Continue Browsing
                </Button>
                <Button fullWidth variant="contained" onClick={() => { setKycDialogOpen(false); router.push('/kyc'); }}
                  sx={{ borderRadius: 2, bgcolor: C.blue }}>
                  View KYC Status
                </Button>
              </Box>
            </>
          ) : (
            <>
              <Box sx={{
                width: 64, height: 64, borderRadius: '50%', bgcolor: `${C.gold}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, mx: 'auto', mb: 2,
              }}>🪪</Box>
              <Typography variant="h6" sx={{ color: C.tp, fontWeight: 700, mb: 1 }}>Verify Your Identity First</Typography>
              <Typography variant="body2" sx={{ color: C.ts, lineHeight: 1.7, mb: 2 }}>
                Before depositing collateral, you need to complete KYC (Know Your Customer) verification.
              </Typography>
              <Box sx={{ p: 2, mb: 3, bgcolor: C.inner, border: `1px solid ${C.border}`, borderRadius: 2, textAlign: 'left' }}>
                <Typography variant="caption" sx={{ color: C.tp, fontWeight: 700, display: 'block', mb: 1 }}>Why is KYC required?</Typography>
                <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  {[
                    'Mandated by BNM (Bank Negara Malaysia) AML/CFT guidelines',
                    'Protects against money laundering and financial fraud',
                    'Enables legally compliant crypto-backed lending in Malaysia',
                  ].map(t => (
                    <Box component="li" key={t}>
                      <Typography variant="caption" sx={{ color: C.ts, lineHeight: 1.6 }}>{t}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 3 }}>
                Verification takes 1–3 business days. Only basic identity documents are required.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Button fullWidth variant="outlined" onClick={() => setKycDialogOpen(false)}
                  sx={{ borderColor: C.border, color: C.ts, borderRadius: 2 }}>
                  Not Now
                </Button>
                <Button fullWidth variant="contained" onClick={() => { setKycDialogOpen(false); router.push('/kyc'); }}
                  sx={{ borderRadius: 2, background: `linear-gradient(135deg, ${C.gold}, #FF8C00)`, boxShadow: `0 4px 14px ${C.gold}40` }}>
                  Start KYC →
                </Button>
              </Box>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <Box component="footer" sx={{ mt: 10, py: 5, borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 2,
        }}>
          <Box sx={{
            width: 28, height: 28, borderRadius: 1.5,
            background: '#2A3FD6',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Typography sx={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>C</Typography>
          </Box>
          <Typography variant="body2" sx={{ color: C.ts, fontWeight: 600 }}>
            Crypto<Box component="span" sx={{ color: C.teal }}>Lend</Box>
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(16,21,28,0.25)' }}>·</Typography>
          <Typography variant="caption" sx={{ color: C.ts }}>© 2026</Typography>
        </Box>
        <Typography variant="caption" sx={{ color: '#8B96A5', maxWidth: 520, mx: 'auto', display: 'block', lineHeight: 1.8 }}>
          Decentralised Crypto-Backed Lending · Hardhat Testnet (Chain ID 31337)
          <br />
          Demonstration app for educational purposes. Not financial advice. Crypto lending carries liquidation risk.
        </Typography>
      </Box>
    </Box>
  );
}
