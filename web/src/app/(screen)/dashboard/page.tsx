'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import { useWallet, type LoanInfo } from '@/lib/WalletContext';
import { usePrices, SYMBOL_TO_ID } from '@/hooks/usePrices';
import { useSparklines } from '@/hooks/useSparklines';
import Sparkline from '@/components/Sparkline';
import { dynamicApr } from '@/lib/rates';
import AccountSetupBanner from '@/components/AccountSetupBanner';
import { AlertIcon, BankIcon, CardIcon, CartIcon, CashIcon, CheckIcon, ChipGlyph, ClockIcon, CoinIcon, IdCardIcon, LiveDot, LockIcon, SolanaIcon, WalletIcon } from '@/components/Icons';

// ── Color tokens ────────────────────────────────────────────────────────────
const C = {
  bg:     '#0B1226',   // cool paper
  card:   '#111B38',   // raised navy cards
  inner:  '#0F1730',   // inset panels
  border: 'rgba(255,255,255,0.12)',   // hairline
  teal:   '#2BD9A2',   // status: gain / safe / live
  gold:   '#FFB224',   // status: caution / interest / moderate
  red:    '#E5484D',   // status: loss / risk / liquidation
  blue:   '#6E8BFF',   // brand: indigo
  tp:     '#F2F5FF',   // ink
  ts:     'rgba(255,255,255,0.65)',   // slate
};

const ASSETS = [
  { symbol: 'BTC',  name: 'Bitcoin',   color: '#F7931A', maxLTV: 70, borrowAPR: 5.2, supplyAPR: 2.1, liquidity: 'RM 11.2B', icon: '₿' },
  { symbol: 'ETH',  name: 'Ethereum',  color: '#627EEA', maxLTV: 70, borrowAPR: 4.8, supplyAPR: 1.8, liquidity: 'RM 8.5B',  icon: 'Ξ' },
  { symbol: 'SOL',  name: 'Solana',    color: '#9945FF', maxLTV: 65, borrowAPR: 6.5, supplyAPR: 3.2, liquidity: 'RM 1.9B',  icon: <SolanaIcon size={18} /> },
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
// Health factor for humans. With a near-zero debt the raw ratio explodes into
// the millions (collateral ÷ tiny debt), which reads like a bug — anything
// above 99 carries no more information than "extremely safe", so cap it there.
function fmtHF(hf: number) {
  if (!isFinite(hf)) return '∞';
  if (hf > 99) return '99+';
  return hf.toFixed(2);
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
      <Box sx={{ p: 3, bgcolor: 'rgba(110,139,255,0.06)', border: `1px solid rgba(110,139,255,0.25)`, borderRadius: 2.5, textAlign: 'center' }}>
        <Box sx={{
          width: 48, height: 48, borderRadius: '50%', bgcolor: 'rgba(110,139,255,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.blue, mx: 'auto', mb: 1.5,
        }}><ClockIcon size={22} /></Box>
        <Typography variant="body2" sx={{ color: C.tp, fontWeight: 700, mb: 0.75 }}>KYC Under Review</Typography>
        <Chip icon={<ChipGlyph><ClockIcon size={13} /></ChipGlyph>} label="Pending Review" size="small"
          sx={{ bgcolor: 'rgba(110,139,255,0.1)', color: C.blue, border: '1px solid rgba(110,139,255,0.25)', fontWeight: 600, mb: 1.5, fontSize: 11 }} />
        <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 2, lineHeight: 1.6 }}>
          Your identity verification is being reviewed by our compliance team. You will be able to {action} once your KYC is approved (1–3 business days).
        </Typography>
        <Button variant="outlined" onClick={onStart}
          sx={{ borderColor: C.blue, color: C.blue, fontSize: 12, '&:hover': { bgcolor: 'rgba(110,139,255,0.06)' } }}>
          View KYC Status →
        </Button>
      </Box>
    );
  }
  return (
    <Box sx={{ p: 3, bgcolor: `${C.gold}08`, border: `1px solid ${C.gold}30`, borderRadius: 2.5, textAlign: 'center' }}>
      <Box sx={{
        width: 48, height: 48, borderRadius: '50%', bgcolor: `${C.gold}15`, color: C.gold,
        display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 1.5,
      }}><IdCardIcon size={22} /></Box>
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

function Dashboard() {
  const wallet  = useWallet();
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const { prices, loading, flash } = usePrices();
  const sparklines = useSparklines();

  const [calcAssetIdx, setCalcAssetIdx] = useState(1);
  const [collAmt,          setCollAmt]          = useState('1');
  const [ltv,              setLtv]              = useState(50);
  const [activeTab,        setActiveTab]         = useState<'deposit' | 'withdraw' | 'borrow' | 'repay' | 'buy' | null>(null);

  const switchTab = (tab: 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'buy') => {
    setActiveTab(tab);
    router.replace(`/dashboard?tab=${tab}`, { scroll: false });
  };

  // Sync activeTab with URL ?tab= param (runs on mount + every sidebar nav)
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'deposit' || tab === 'withdraw' || tab === 'borrow' || tab === 'repay' || tab === 'buy') {
      setActiveTab(tab);
    } else {
      setActiveTab(null);
    }
    const asset = searchParams.get('asset')?.toUpperCase();
    if (asset) {
      const idx = ASSETS.findIndex(a => a.symbol === asset);
      if (idx >= 0) setCalcAssetIdx(idx);
    }
  }, [searchParams]);
  const [depositAmt,       setDepositAmt]        = useState('');
  const [withdrawAmt,      setWithdrawAmt]       = useState('');
  const [borrowAmt,        setBorrowAmt]         = useState('');
  const [repayAmt,         setRepayAmt]          = useState('');
  // True when the user chose FULL payoff — repay() then fetches a fresh
  // on-chain quote so per-second interest can't leave dust debt behind.
  const [repayFull,        setRepayFull]         = useState(false);
  // Seconds until the payoff quote auto-refreshes from the chain. Interest
  // accrues continuously, so the position is re-read once a minute (driven by
  // WalletContext's keep-fresh poll; this value counts down to its next fire)
  // and the countdown is shown so the number on screen is never silently stale.
  const [quoteIn,          setQuoteIn]           = useState(60);
  // Borrow guardrails: T&C consent + a final confirmation step.
  const [agreedTerms,      setAgreedTerms]       = useState(false);
  const [borrowConfirmOpen, setBorrowConfirmOpen] = useState(false);
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
  // Automatic price-sync keeper: whenever the on-chain price drifts from the
  // live market, re-sync it on a timer (at most once per cooldown window) so
  // the user never has to click the button themselves.
  const lastAutoSync = useRef(0);
  const syncingRef   = useRef(false);

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

  // Auto-dismiss success banner after 3 seconds
  useEffect(() => {
    if (wallet.txStatus !== 'success') return;
    const t = setTimeout(wallet.clearTx, 3000);
    return () => clearTimeout(t);
  }, [wallet.txStatus, wallet.clearTx]);

  // Live payoff quote for the Repay tab. The countdown is DERIVED from
  // wallet.lastRefreshAt — the timestamp every refresh source stamps — rather
  // than counted locally. WalletContext schedules its keep-fresh poll 60 s
  // after that same timestamp, so the countdown, the chain read, and the
  // interest bump below can never drift apart (a locally counted cycle used
  // to sit out of phase with the context's own 60 s poll, which refreshed the
  // quote mid-countdown). Refs because `refresh`'s identity changes every
  // render and the 1 s ticker must read the latest timestamp without remounting.
  const walletRefreshRef = useRef(wallet.refresh);
  const walletRepayRef   = useRef(wallet.repay);
  const lastRefreshAtRef = useRef(wallet.lastRefreshAt);
  useEffect(() => { walletRefreshRef.current = wallet.refresh; });
  useEffect(() => { walletRepayRef.current   = wallet.repay; });
  useEffect(() => { lastRefreshAtRef.current = wallet.lastRefreshAt; });
  useEffect(() => {
    if (activeTab !== 'repay') return;
    // Refresh immediately on tab open — stamps lastRefreshAt, so the countdown
    // and the next auto-refresh both restart from this same instant.
    void walletRefreshRef.current();
    const tick = () => {
      const at = lastRefreshAtRef.current;
      setQuoteIn(at > 0 ? Math.max(0, 60 - Math.floor((Date.now() - at) / 1000)) : 60);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeTab]);

  // Stop Lenis smooth scroll while the dialog is open so it doesn't intercept
  // wheel events and cause the page to scroll behind the dialog.
  useEffect(() => {
    if (activeTab !== null) {
      window.dispatchEvent(new Event('lenis:stop'));
    } else {
      window.dispatchEvent(new Event('lenis:start'));
    }
    return () => { window.dispatchEvent(new Event('lenis:start')); };
  }, [activeTab]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const calcAsset  = ASSETS[calcAssetIdx];
  const livePrice  = prices[SYMBOL_TO_ID[calcAsset.symbol]]?.myr ?? 0;
  const assetPrice = loading ? 0 : livePrice;
  const collUSD    = parseFloat(collAmt || '0') * assetPrice;
  const borrowable = collUSD * (ltv / 100);
  const ltvPct     = ltv / calcAsset.maxLTV;
  const calcHF     = ltv > 0 ? calcAsset.maxLTV / ltv : Infinity;

  // Live variable rate from the contract (falls back to 4.8% pre-redeploy);
  // demo assets get the display-side formula so every APR moves with market
  // conditions instead of sitting frozen.
  const liveAprPct = wallet.borrowAprBps / 100;
  const calcApr    = calcAsset.symbol === 'ETH' && wallet.isConnected && wallet.isDeployed
    ? liveAprPct
    : dynamicApr(calcAsset.borrowAPR, prices[SYMBOL_TO_ID[calcAsset.symbol]]?.change24h ?? 0);

  const calcInterest   = (borrowable * calcApr / 100) * (loanTermDays / 365);
  const calcMonthly    = (borrowable * calcApr / 100) / 12;
  const calcTotal      = borrowable + calcInterest;
  const originationFee = borrowable * 0.001;

  const colAmtNum       = parseFloat(collAmt || '0');
  const targetPrice     = assetPrice * holdMultiplier;
  const ethGain         = colAmtNum * assetPrice * (holdMultiplier - 1);
  const netAdvantage    = ethGain - calcInterest;
  const breakEvenPrice  = colAmtNum > 0 ? (collUSD + calcInterest) / colAmtNum : 0;
  const breakEvenChangePct = assetPrice > 0 ? ((breakEvenPrice - assetPrice) / assetPrice) * 100 : 0;

  const isLive = wallet.isConnected && wallet.isCorrectNetwork && wallet.isDeployed;

  // Displayed accrued interest for the Repay panel — updates once per minute.
  // Many contracts store an interest *checkpoint* that only changes when a
  // transaction is mined (common on local test chains where no new blocks
  // advance between reads). To avoid the number freezing, we add one perMin
  // estimate each cycle when the chain returns the same value as before.
  // If the chain returns a genuinely higher value (new transaction / real network)
  // that wins and the estimate resets.
  const [repayDisplayInt,  setRepayDisplayInt]  = useState(0);
  const repayDisplayIntRef = useRef<number | null>(null);
  const liveAprPctRef      = useRef(liveAprPct);
  useEffect(() => { liveAprPctRef.current = liveAprPct; });
  useEffect(() => {
    if (activeTab !== 'repay') { repayDisplayIntRef.current = null; setRepayDisplayInt(0); }
  }, [activeTab]);
  useEffect(() => {
    if (!isLive || !wallet.loanInfo || wallet.isRefreshing) return;
    const chainInt  = Number(wallet.loanInfo.accruedInterest) / 1e6;
    const principal = Number(wallet.loanInfo.borrowed) / 1e6;
    // Loan fully repaid — wipe the estimate and clear the input.
    if (principal === 0) {
      repayDisplayIntRef.current = 0;
      setRepayDisplayInt(0);
      setRepayAmt('');
      setRepayFull(false);
      return;
    }
    const perMin = principal * (liveAprPctRef.current / 100) / 525_600;
    const next = repayDisplayIntRef.current === null
      ? chainInt
      : Math.max(chainInt, repayDisplayIntRef.current + perMin);
    repayDisplayIntRef.current = next;
    setRepayDisplayInt(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.isRefreshing, isLive]);

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

  // Keeper call: nudges the on-chain price to the live market price. The
  // server fetches the target itself, so this is safe for any signed-in user —
  // it used to hit the admin-only route, which greeted normal users with
  // "Forbidden" on a warning they never asked to see.
  const doPriceSync = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncError('');
    setSyncing(true);
    try {
      const res  = await fetch('/api/sync-price', { method: 'POST' });
      const data = await res.json() as { error?: string; steps?: number; newPrice?: number };
      if (!res.ok) {
        setSyncError(data.error ?? 'Sync failed');
      } else {
        await wallet.refresh();
      }
    } catch {
      setSyncError('Network error — is the dev server running?');
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  };

  // Self-heal the price drift automatically, and keep healing it: an attempt
  // fires as soon as a mismatch is noticed, then re-checks every minute with a
  // 5-minute cooldown between actual syncs — so a long-open dashboard stays in
  // sync without anyone clicking the button. The manual button remains as an
  // instant-retry path.
  useEffect(() => {
    if (!isLive || !hasPriceMismatch) return;
    const attempt = () => {
      if (syncingRef.current) return;
      if (Date.now() - lastAutoSync.current < 5 * 60_000) return;
      lastAutoSync.current = Date.now();
      void doPriceSync();
    };
    const first = setTimeout(attempt, 0);
    const id = setInterval(attempt, 60_000);
    return () => { clearTimeout(first); clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, hasPriceMismatch]);

  const borrowMYR    = parseFloat(borrowAmt || '0');
  const panelMonthly = (borrowMYR * liveAprPct / 100) / 12;
  const panelInterest = (borrowMYR * liveAprPct / 100) * (loanTermDays / 365);
  const panelTotal   = borrowMYR + panelInterest + (borrowMYR * 0.001);
  const borrowAvail  = isLive && wallet.loanInfo ? Number(wallet.loanInfo.available) / 1e6 : 0;

  // Runs after the user confirms the borrow summary dialog. Kept at component
  // scope so both the dialog's Confirm button and the flow below share it.
  const executeBorrow = async () => {
    setBorrowConfirmOpen(false);
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
  };

  const ltvColor = ltvPct > 0.85 ? C.red : ltvPct > 0.6 ? C.gold : C.teal;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: C.bg }}>
      <Box component="main" sx={{ maxWidth: 1320, mx: 'auto', px: { xs: 2, sm: 3 }, py: 4 }}>

        {/* Nexo-style onboarding rail — THE first thing on the page, above
            everything else, so a new user knows their next step before they
            read anything. Renders nothing once the account is verified. */}
        <AccountSetupBanner />

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
              <Chip icon={<ChipGlyph><LiveDot color={C.teal} /></ChipGlyph>} label="Live" size="small"
                sx={{ bgcolor: `${C.teal}15`, color: C.teal, border: `1px solid ${C.teal}40`, fontWeight: 700, fontSize: 11 }} />
            )}
            {!wallet.isConnected && (
              <Button variant="contained" size="small" onClick={wallet.connect}
                sx={{ fontSize: 12, borderRadius: 2, px: 2 }}>
                Connect Wallet
              </Button>
            )}
            {wallet.isConnected && wallet.kycApproved && (
              // Admins bypass KYC — don't claim a verification that never
              // happened; say what's actually true.
              <Chip label={wallet.kycStatus === 'approved' ? '✓ KYC Verified' : 'Admin · full access'} size="small"
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
          background: 'linear-gradient(135deg, #131F44 0%, #0F1A3D 100%)',
          border: '1px solid rgba(110,139,255,0.18)',
          borderRadius: 3,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Subtle decorative glow */}
          <Box sx={{
            position: 'absolute', top: -60, right: -60,
            width: 200, height: 200, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(110,139,255,0.1) 0%, transparent 70%)',
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
                border: '1px solid rgba(43,217,162,0.3)',
                position: 'relative', overflow: 'hidden',
              }}>
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #2BD9A2, transparent)' }} />
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
                border: '1px solid rgba(255,178,36,0.2)',
                position: 'relative', overflow: 'hidden',
              }}>
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #FFB224, transparent)' }} />
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
                      bgcolor: 'rgba(255,178,36,0.1)',
                      border: '1px solid rgba(255,178,36,0.25)',
                      borderRadius: 2,
                      '&:hover': { bgcolor: 'rgba(255,178,36,0.18)' },
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
                <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #6E8BFF, transparent)' }} />
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
                const hv = isLive ? fmtHF(hf) : hf.toFixed(2);
                // Translate the ratio into something concrete: the ETH price
                // at which liquidation starts, and how far away that is.
                const debtNow  = liveBorMYR ?? 0;
                const liqPrice = isLive && debtNow > 0 && colEth > 0 ? debtNow / (0.8 * colEth) : null;
                const refPrice = mktEthPrice > 0 ? mktEthPrice : ethPriceMYR;
                const dropPct  = liqPrice !== null && refPrice > 0 ? (1 - liqPrice / refPrice) * 100 : null;
                const hl = !isLive ? 'Moderate risk'
                  : debtNow <= 0 ? 'No debt — nothing to liquidate'
                  : liqPrice !== null && dropPct !== null
                    ? `${hLabel(hf)} — liquidates if ETH ≤ ${rm(liqPrice)} (${dropPct >= 0 ? `−${dropPct.toFixed(0)}%` : 'now'})`
                    : hLabel(hf);
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
                        Contract HF: {fmtHF(liveHF)}
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
            icon={<AlertIcon size={17} />}
            sx={{
              mb: 3, bgcolor: 'rgba(255,178,36,0.08)', color: C.gold,
              border: '1px solid rgba(255,178,36,0.25)',
              '& .MuiAlert-icon': { color: C.gold }, borderRadius: 2,
            }}
            action={
              <Button size="small" disabled={syncing}
                onClick={() => { void doPriceSync(); }}
                sx={{ color: C.teal, border: '1px solid rgba(43,217,162,0.3)', fontSize: 11, borderRadius: 2, whiteSpace: 'nowrap' }}>
                {syncing ? 'Syncing…' : '⟳ Sync Price'}
              </Button>
            }
          >
            <Typography variant="body2" sx={{ fontWeight: 700, color: C.gold }}>
              {syncing ? 'Syncing on-chain price to live market…' : 'On-chain price differs from live market'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,178,36,0.7)', display: 'block', mt: 0.5 }}>
              Contract: <b style={{ color: C.gold }}>{rm(onChainPrice)}/ETH</b>
              {' · '}Live: <b style={{ color: C.gold }}>{rm(mktEthPrice)}/ETH</b>
              {' '}({priceDiffPct.toFixed(1)}% diff)
              {syncing ? ' — updating automatically, this takes a few seconds' : ''}
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
                { step: '01', icon: <IdCardIcon size={20} />, title: 'Complete KYC',       desc: 'Verify your identity as required by Malaysian financial regulations (BNM).' },
                { step: '02', icon: <LockIcon size={20} />, title: 'Deposit Collateral',  desc: 'Lock your crypto (ETH, BTC, SOL) as collateral to secure your credit line.' },
                { step: '03', icon: <CashIcon size={20} />, title: 'Borrow MYR',          desc: 'Receive Malaysian Ringgit instantly — up to 70% of your collateral value.' },
                { step: '04', icon: <CheckIcon size={20} />, title: 'Repay & Unlock',      desc: 'Repay anytime to unlock and withdraw your collateral with no penalties.' },
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
                    <Box sx={{ display: 'flex', color: C.teal }}>{s.icon}</Box>
                  </Box>
                  <Typography variant="body2" sx={{ color: C.tp, fontWeight: 700, mb: 0.75 }}>{s.title}</Typography>
                  <Typography variant="caption" sx={{ color: C.ts, lineHeight: 1.7 }}>{s.desc}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        )}

        {/* ── Main content ──────────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* Markets & Calculator — combined */}
            <Paper sx={cardSx}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h6" sx={{ color: C.tp, fontWeight: 700 }}>Markets & Calculator</Typography>
                <Chip
                  icon={loading ? undefined : <ChipGlyph><LiveDot color={C.teal} /></ChipGlyph>}
                  label={loading ? 'Loading prices…' : 'Live MYR'}
                  size="small"
                  sx={{
                    bgcolor: loading ? 'rgba(0,0,0,0.04)' : `${C.teal}15`,
                    color: loading ? C.ts : C.teal,
                    border: `1px solid ${loading ? C.border : C.teal + '40'}`,
                    fontSize: 11, fontWeight: 600,
                  }}
                />
              </Box>

              {/* ── Assets table — wide screens ── */}
              <TableContainer sx={{ overflowX: 'auto', mb: 3, display: { xs: 'none', md: 'block' } }}>
                <Table size="small" sx={{ minWidth: 640 }}>
                  <TableHead>
                    <TableRow>
                      {['Asset', '24h Chart', 'Price (MYR)', 'Max LTV', 'Borrow APR', 'Supply APR', 'Liquidity'].map(h => (
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
                            '&:hover': { bgcolor: sel ? `${a.color}12` : 'rgba(43,217,162,0.06)' },
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
                          <TableCell sx={{ borderColor: i < ASSETS.length - 1 ? C.border : 'transparent', py: 1.5 }}>
                            <Sparkline points={sparklines[SYMBOL_TO_ID[a.symbol]] ?? []} up={change >= 0} />
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
                            <Chip
                              label={`${(a.symbol === 'ETH' && isLive ? liveAprPct : dynamicApr(a.borrowAPR, change)).toFixed(2)}%`}
                              title="Variable rate — base rate plus a premium that moves with market conditions"
                              size="small"
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

              {/* ── Assets cards — narrow screens (Nexo-style) ── */}
              <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 0, mb: 3, border: `1px solid ${C.border}`, borderRadius: 2, overflow: 'hidden' }}>
                {ASSETS.map((a, i) => {
                  const p      = prices[SYMBOL_TO_ID[a.symbol]];
                  const change = p?.change24h ?? 0;
                  const sel    = calcAssetIdx === i;
                  return (
                    <Box key={a.symbol}
                      onClick={() => { setCalcAssetIdx(i); setLtv(Math.min(ltv, a.maxLTV)); }}
                      sx={{
                        cursor: 'pointer', transition: 'background 0.15s',
                        bgcolor: sel ? `${a.color}0D` : 'transparent',
                        borderBottom: i < ASSETS.length - 1 ? `1px solid ${C.border}` : 'none',
                        borderLeft: sel ? `3px solid ${a.color}` : '3px solid transparent',
                        '&:hover': { bgcolor: sel ? `${a.color}15` : 'rgba(255,255,255,0.03)' },
                      }}>

                      {/* Row 1 — icon + name + price */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.75, pt: 1.5, pb: 1 }}>
                        <Box sx={{
                          width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                          bgcolor: `${a.color}18`, color: a.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 16, fontWeight: 800,
                          border: `1.5px solid ${sel ? a.color + '60' : a.color + '28'}`,
                          boxShadow: sel ? `0 0 10px ${a.color}28` : 'none',
                        }}>
                          {a.icon}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Typography sx={{ fontWeight: 700, fontSize: 14, color: C.tp }}>{a.symbol}</Typography>
                            {sel && <Chip label="Selected" size="small"
                              sx={{ bgcolor: `${a.color}18`, color: a.color, border: `1px solid ${a.color}35`, fontSize: 9.5, fontWeight: 700, height: 17 }} />}
                          </Box>
                          <Typography variant="caption" sx={{ color: C.ts }}>{a.name}</Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography
                            className={flash[SYMBOL_TO_ID[a.symbol]] ? `price-flash-${flash[SYMBOL_TO_ID[a.symbol]]}` : ''}
                            sx={{ fontWeight: 700, fontSize: 14, color: C.tp }}>
                            {loading ? '…' : `RM ${(p?.myr ?? 0).toLocaleString()}`}
                          </Typography>
                          <Typography variant="caption" sx={{ color: change >= 0 ? C.teal : C.red, fontWeight: 600 }}>
                            {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
                          </Typography>
                        </Box>
                      </Box>

                      {/* Row 2 — stats grid */}
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, px: 1.75, pb: 1.5, pt: 0.5 }}>
                        {[
                          { label: 'Max LTV',    value: `${a.maxLTV}%`,       vc: C.teal },
                          { label: 'Borrow APR', value: `${(a.symbol === 'ETH' && isLive ? liveAprPct : dynamicApr(a.borrowAPR, change)).toFixed(2)}%`, vc: C.red },
                          { label: 'Supply APR', value: `${a.supplyAPR}%`,    vc: C.teal },
                        ].map(stat => (
                          <Box key={stat.label} sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                            <Typography sx={{ fontSize: 9.5, fontWeight: 600, color: C.ts, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                              {stat.label}
                            </Typography>
                            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: stat.vc }}>
                              {stat.value}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  );
                })}
              </Box>

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
                      {calcAsset.maxLTV}% Max LTV · {calcApr.toFixed(2)}% APR (variable)
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
                  background: 'linear-gradient(135deg, rgba(43,217,162,0.08) 0%, rgba(110,139,255,0.08) 100%)',
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
                    ? 'linear-gradient(135deg, rgba(43,217,162,0.08), rgba(43,217,162,0.06))'
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
                      Break-even:{' '}
                      <Box component="span" sx={{ color: C.gold }}>{rm(breakEvenPrice)}</Box>
                      {' '}({breakEvenChangePct >= 0 ? '+' : ''}{breakEvenChangePct.toFixed(1)}% from today) — borrowing wins above this price at maturity; selling wins below it.
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Calculator result */}
              <Box sx={{
                p: 3, borderRadius: 2.5,
                background: 'linear-gradient(135deg, #131F44 0%, #0F1A3D 100%)',
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
                  <Row label="Interest Rate"                        value={`${calcApr.toFixed(2)}% APR · variable`} />
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

          {/* (right column removed — actions accessible via sidebar Actions menu) */}
          {false && <Paper sx={cardSx}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h6" sx={{ color: C.tp, fontWeight: 700 }}>My Credit Line</Typography>
                <Chip
                  icon={isLive ? <ChipGlyph><LiveDot color={C.teal} /></ChipGlyph> : undefined}
                  label={isLive ? 'Live' : 'Demo'}
                  size="small"
                  sx={{
                    bgcolor: isLive ? `${C.teal}15` : 'rgba(0,0,0,0.04)',
                    color: isLive ? C.teal : C.ts,
                    border: `1px solid ${isLive ? C.teal + '40' : C.border}`,
                    fontSize: 11, fontWeight: 700,
                  }}
                />
              </Box>

              {isLive && wallet.loanInfo && (() => {
                // Annotated rather than inferred: this component is large
                // enough that TypeScript abandons control-flow analysis inside
                // it, so neither the `wallet.loanInfo &&` guard above nor a
                // local null check narrows the type here. The branch only
                // renders when loanInfo is non-null, so the annotation holds.
                const li: LoanInfo = wallet.loanInfo!;
                const { collateral, borrowed, healthFactor: hf, available } = li;
                const hc       = hColor(hf);
                const colEthFmt = parseFloat(ethers.formatEther(collateral)).toFixed(4);
                const borMYR   = (Number(borrowed) / 1e6).toFixed(2);
                const avMYR    = (Number(available) / 1e6).toFixed(2);
                const ltvNow   = li.collateralValueMYR > 0
                  ? ((Number(borrowed) / 1e6) / li.collateralValueMYR * 100).toFixed(1)
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
                        <Typography variant="caption" sx={{ color: C.ts }}>{rm(li.collateralValueMYR)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 0.5, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Outstanding Debt</Typography>
                        <Typography variant="body1" sx={{ color: C.tp, fontWeight: 700 }}>RM {borMYR}</Typography>
                        <Typography variant="caption" sx={{ color: C.gold }}>
                          + RM {(Number(li.accruedInterest) / 1e6).toFixed(4)} interest
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
                            bgcolor: 'rgba(255,255,255,0.12)',
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
                              Risk alert — health factor below 1.5. Consider repaying or adding collateral.
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
                            RM {((Number(borrowed) + Number(li.accruedInterest)) / 1e6).toFixed(2)}
                          </Typography>
                        </Box>
                      )}
                      {Number(borrowed) === 0 && <Box sx={{ mb: 2 }} />}
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button fullWidth size="small" onClick={() => setActiveTab('deposit')}
                          sx={{ bgcolor: `rgba(0,0,0,0.04)`, color: C.tp, border: `1px solid ${C.border}`, fontSize: 12, borderRadius: 2,
                                '&:hover': { bgcolor: 'rgba(0,0,0,0.07)' } }}>
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
                      width: 56, height: 56, borderRadius: '50%', bgcolor: `${C.teal}12`, color: C.teal,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2,
                      border: `1px solid ${C.teal}25`,
                    }}><CardIcon size={25} /></Box>
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

        </Box>
      </Box>


      {/* Action Dialog — opened via sidebar Actions links (?tab=…) */}
      <Dialog
        open={activeTab !== null}
        onClose={() => { setActiveTab(null); router.replace('/dashboard'); }}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' } } }}
      >
        {/* Dialog header: title + close */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, pt: 2.5, pb: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 16, color: C.tp }}>Manage Position</Typography>
          <IconButton size="small" onClick={() => { setActiveTab(null); router.replace('/dashboard'); }} sx={{ color: C.ts, mr: -0.5 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </IconButton>
        </Box>

        {/* KYC pending banner — shown inside dialog when review is in progress */}
        {wallet.kycStatus === 'pending' && (
          <Box sx={{
            mx: 2.5, mt: 1.5,
            display: 'flex', alignItems: 'center', gap: 1.25,
            bgcolor: 'rgba(110,139,255,0.08)', border: '1px solid rgba(110,139,255,0.28)',
            borderRadius: 2, px: 1.75, py: 1,
          }}>
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: C.blue, flexShrink: 0,
              '@keyframes kycPulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } },
              animation: 'kycPulse 2s ease-in-out infinite' }} />
            <Typography sx={{ fontSize: 12, color: C.blue, fontWeight: 600, flex: 1 }}>
              KYC under review — Deposit, Borrow and Buy MYR are unlocked once approved (1–3 business days).
            </Typography>
          </Box>
        )}

        {/* Inline tab strip */}
        <Box sx={{ px: 2.5, pt: 1.5, pb: 0 }}>
          <Box sx={{ display: 'flex', bgcolor: C.inner, borderRadius: 2, p: 0.5, gap: 0.5 }}>
            {([
              { key: 'deposit',  label: 'Deposit',  gated: true  },
              { key: 'withdraw', label: 'Withdraw', gated: false },
              { key: 'borrow',   label: 'Borrow',   gated: true  },
              { key: 'repay',    label: 'Repay',    gated: false },
              { key: 'buy',      label: 'Buy MYR',  gated: true  },
            ] as const).map(t => {
              const active  = activeTab === t.key;
              const locked  = t.gated && !wallet.kycApproved;
              const pending = locked && wallet.kycStatus === 'pending';
              return (
                <Box key={t.key} onClick={() => switchTab(t.key)}
                  sx={{
                    flex: 1, py: 0.75, textAlign: 'center', borderRadius: 1.5, cursor: 'pointer',
                    transition: 'all 0.15s',
                    bgcolor: active ? '#3D5BF5' : 'transparent',
                    boxShadow: active ? '0 2px 8px rgba(61,91,245,0.4)' : 'none',
                    position: 'relative',
                  }}>
                  <Typography variant="caption" sx={{
                    fontSize: 11.5, fontWeight: active ? 700 : 500,
                    color: active ? C.tp : locked ? 'rgba(255,255,255,0.35)' : C.ts,
                    lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.4,
                  }}>
                    {t.label}
                    {pending && !active && (
                      <Box component="span" sx={{ display: 'inline-flex', color: C.blue, lineHeight: 1 }}><ClockIcon size={9} /></Box>
                    )}
                    {locked && !pending && !active && (
                      <Box component="span" sx={{ display: 'inline-flex', color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}><LockIcon size={9} /></Box>
                    )}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Box>

        <DialogContent data-lenis-prevent sx={{ px: 3, pb: 3, pt: 2, overflowY: 'auto', flex: 1, overscrollBehavior: 'contain' }}>

              {/* Transaction status banner */}
              {wallet.txStatus !== 'idle' && (
                <Box sx={{
                  mb: 2.5, borderRadius: 2, overflow: 'hidden',
                  border: `1px solid ${
                    wallet.txStatus === 'success' ? C.teal + '50'
                    : wallet.txStatus === 'error' ? C.red + '40'
                    : C.border
                  }`,
                  bgcolor: wallet.txStatus === 'success' ? `${C.teal}08`
                    : wallet.txStatus === 'error' ? `${C.red}06`
                    : `${C.blue}08`,
                }}>
                  {/* Multi-step progress bar for repay (2 steps) */}
                  {wallet.txStatus === 'pending' && wallet.txTotalSteps > 1 && (
                    <LinearProgress
                      variant="determinate"
                      value={((wallet.txStep - 1) / wallet.txTotalSteps) * 100}
                      sx={{
                        height: 3, borderRadius: 0,
                        bgcolor: C.border,
                        '& .MuiLinearProgress-bar': { bgcolor: C.blue, transition: 'transform 0.6s ease' },
                      }}
                    />
                  )}
                  {wallet.txStatus === 'pending' && wallet.txTotalSteps === 1 && (
                    <LinearProgress
                      sx={{
                        height: 3, borderRadius: 0,
                        bgcolor: C.border,
                        '& .MuiLinearProgress-bar': { bgcolor: C.blue },
                      }}
                    />
                  )}
                  <Box sx={{ px: 2.5, py: 2, display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                    {/* Spinner / icon */}
                    <Box sx={{ flexShrink: 0, mt: 0.25 }}>
                      {wallet.txStatus === 'pending' && (
                        <CircularProgress size={20} thickness={3.5} sx={{ color: C.blue }} />
                      )}
                      {wallet.txStatus === 'success' && (
                        <Box sx={{
                          width: 22, height: 22, borderRadius: '50%', bgcolor: C.teal,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </Box>
                      )}
                      {wallet.txStatus === 'error' && (
                        <Box sx={{
                          width: 22, height: 22, borderRadius: '50%', bgcolor: C.red,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </Box>
                      )}
                    </Box>

                    {/* Message area */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {wallet.txStatus === 'pending' && (
                        <>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.tp }}>
                              {wallet.txMessage}
                            </Typography>
                            {wallet.txTotalSteps > 1 && (
                              <Box sx={{
                                px: 1, py: 0.2, borderRadius: 1,
                                bgcolor: `${C.blue}15`, border: `1px solid ${C.blue}25`,
                              }}>
                                <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: C.blue, lineHeight: 1 }}>
                                  Step {wallet.txStep} of {wallet.txTotalSteps}
                                </Typography>
                              </Box>
                            )}
                          </Box>
                          <Typography sx={{ fontSize: 11.5, color: C.ts, lineHeight: 1.6 }}>
                            {wallet.txTotalSteps > 1 && wallet.txStep === 1
                              ? 'Approve this request in MetaMask — your MYR spend limit.'
                              : 'Confirm the transaction in MetaMask and wait for the block to be mined.'}
                          </Typography>
                          <Typography sx={{ fontSize: 11, color: C.ts, mt: 0.5, opacity: 0.75 }}>
                            Blockchain transactions typically take 15–30 seconds.
                          </Typography>
                        </>
                      )}
                      {wallet.txStatus === 'success' && (
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.teal }}>
                          {wallet.txMessage}
                        </Typography>
                      )}
                      {wallet.txStatus === 'error' && (
                        <>
                          <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.red, mb: 0.25 }}>
                            Transaction Failed
                          </Typography>
                          <Typography sx={{ fontSize: 12, color: C.ts, lineHeight: 1.5 }}>
                            {wallet.txMessage}
                          </Typography>
                        </>
                      )}
                    </Box>

                    {/* Dismiss for success / error */}
                    {(wallet.txStatus === 'success' || wallet.txStatus === 'error') && (
                      <IconButton size="small" onClick={wallet.clearTx}
                        sx={{ color: C.ts, mt: -0.25, mr: -0.5, '&:hover': { color: C.tp } }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </IconButton>
                    )}
                  </Box>
                </Box>
              )}

              {/* Position summary strip — only when wallet connected and has a position */}
              {isLive && wallet.isConnected && wallet.loanInfo && (Number(wallet.loanInfo.collateral) > 0 || Number(wallet.loanInfo.borrowed) > 0) && (() => {
                const colEthPos  = parseFloat(ethers.formatEther(wallet.loanInfo!.collateral));
                const borMYRPos  = Number(wallet.loanInfo!.borrowed) / 1e6;
                const hfPos      = wallet.loanInfo!.healthFactor;
                const hfColor    = hfPos < 1.2 ? C.red : hfPos < 1.5 ? C.gold : C.teal;
                const hfLabel    = hfPos < 1.2 ? 'At Risk' : hfPos < 1.5 ? 'Moderate' : 'Healthy';
                const hfBarPct   = Math.min((isFinite(hfPos) ? hfPos : 3) / 3 * 100, 100);
                return (
                  <Box sx={{ mb: 2, borderRadius: 2, overflow: 'hidden', border: `1px solid ${C.border}`, bgcolor: '#111B38' }}>
                    <Box sx={{ display: 'flex' }}>
                      {[
                        { label: 'Collateral', value: `${colEthPos.toFixed(3)} ETH`, color: C.tp, sub: `≈ ${rm(colEthPos * wallet.ethPriceMYR)}` },
                        { label: 'Borrowed',   value: borMYRPos > 0 ? `RM ${borMYRPos.toFixed(2)}` : '—', color: borMYRPos > 0 ? C.gold : C.ts, sub: borMYRPos > 0 ? `${liveAprPct.toFixed(2)}% APR (var.)` : 'No debt' },
                        { label: 'Health',     value: borMYRPos > 0 ? fmtHF(hfPos) : '—', color: hfColor, sub: borMYRPos > 0 ? hfLabel : '—' },
                      ].map((item, i) => (
                        <Box key={item.label} sx={{
                          flex: 1, px: 1.5, py: 1.25,
                          borderRight: i < 2 ? `1px solid ${C.border}` : 'none',
                          textAlign: 'center',
                        }}>
                          <Typography sx={{ fontSize: 10, color: C.ts, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 0.25 }}>
                            {item.label}
                          </Typography>
                          <Typography sx={{ fontSize: 14, fontWeight: 700, color: item.color, lineHeight: 1.2 }}>
                            {item.value}
                          </Typography>
                          <Typography sx={{ fontSize: 10, color: C.ts, mt: 0.25 }}>{item.sub}</Typography>
                        </Box>
                      ))}
                    </Box>
                    {borMYRPos > 0 && (() => {
                      const liqPriceStrip = colEthPos > 0 ? borMYRPos / (0.8 * colEthPos) : 0;
                      return (
                        <Box sx={{ px: 1.5, pb: 1.25 }}>
                          <LinearProgress variant="determinate" value={hfBarPct}
                            sx={{ height: 4, borderRadius: 999, bgcolor: `${hfColor}20`,
                              '& .MuiLinearProgress-bar': { bgcolor: hfColor, borderRadius: 999 } }} />
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                            <Typography sx={{ fontSize: 9.5, color: C.ts }}>
                              Liquidation if ETH ≤ {rm(liqPriceStrip)} (HF &lt;1.0)
                            </Typography>
                            <Typography sx={{ fontSize: 9.5, color: C.ts }}>Safe 3.0+</Typography>
                          </Box>
                        </Box>
                      );
                    })()}
                  </Box>
                );
              })()}

              {!wallet.isConnected && (
                <Box sx={{ mb: 2.5, p: 3, bgcolor: `${C.blue}06`, border: `2px dashed rgba(110,139,255,0.2)`, borderRadius: 2.5, textAlign: 'center' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5, color: C.blue }}><WalletIcon size={26} /></Box>
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
                  {!wallet.kycApproved && (wallet.kycStatus === 'pending' || isLive) && (
                    <KycRequiredCard onStart={() => router.push('/kyc')} action="depositing collateral" kycStatus={wallet.kycStatus} />
                  )}
                  {(wallet.kycApproved || (!isLive && wallet.kycStatus !== 'pending')) && (
                  <>
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="caption" sx={{ color: C.ts, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75 }}>
                        ETH Amount
                      </Typography>
                      {wallet.isConnected && (
                        <Typography variant="caption" sx={{ color: C.ts }}>
                          Balance: <Box component="span" sx={{ color: C.tp, fontWeight: 600 }}>{wallet.ethBalance} ETH</Box>
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ ...innerSx, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Typography sx={{ fontSize: 22, fontWeight: 700, color: '#627EEA', lineHeight: 1 }}>Ξ</Typography>
                      <InputBase type="number" value={depositAmt} onChange={e => setDepositAmt(e.target.value)}
                        placeholder="0.00"
                        sx={{ flex: 1, color: C.tp, fontSize: 22, fontWeight: 600, '& input': { p: 0 } }} />
                      {depositAmt && (
                        <Typography sx={{ fontSize: 12, color: C.ts, fontWeight: 500 }}>
                          ≈ {rm(parseFloat(depositAmt || '0') * (isLive ? wallet.ethPriceMYR : ethPriceMYR))}
                        </Typography>
                      )}
                    </Box>
                    {wallet.isConnected && (
                      <Box sx={{ display: 'flex', gap: 0.75, mt: 1 }}>
                        {[25, 50, 75].map(pct => {
                          const bal = parseFloat(wallet.ethBalance || '0');
                          const val = Math.max(0, bal * pct / 100 - 0.001);
                          return (
                            <Box key={pct} onClick={() => setDepositAmt(val.toFixed(4))}
                              sx={{ flex: 1, py: 0.6, textAlign: 'center', bgcolor: C.inner, borderRadius: 1.5,
                                cursor: 'pointer', border: `1px solid ${C.border}`,
                                '&:hover': { borderColor: C.teal, bgcolor: `${C.teal}08` } }}>
                              <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.ts }}>{pct}%</Typography>
                            </Box>
                          );
                        })}
                        <Box onClick={() => setDepositAmt(Math.max(0, parseFloat(wallet.ethBalance || '0') - 0.01).toFixed(4))}
                          sx={{ flex: 1, py: 0.6, textAlign: 'center', bgcolor: `${C.teal}10`, borderRadius: 1.5,
                            cursor: 'pointer', border: `1px solid ${C.teal}30`,
                            '&:hover': { bgcolor: `${C.teal}18` } }}>
                          <Typography sx={{ fontSize: 11, fontWeight: 700, color: C.teal }}>MAX</Typography>
                        </Box>
                      </Box>
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
                    const headline        = isLive && alreadyBorrowed > 0 ? newAvailable : maxBorrow;
                    return (
                      <Box sx={{ borderRadius: 2, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                        <Box sx={{ px: 2, py: 1.5, bgcolor: `${C.teal}06` }}>
                          <Typography sx={{ fontSize: 10, color: C.ts, textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.5 }}>
                            {isLive && alreadyBorrowed > 0 ? 'Available to Borrow After' : 'Max You Can Borrow'}
                          </Typography>
                          <Typography sx={{ fontSize: 26, fontWeight: 700, color: headline > 0 ? C.teal : C.ts, lineHeight: 1.1 }}>
                            {rm(headline, 0)} <Box component="span" sx={{ fontSize: 14, fontWeight: 500, color: C.ts }}>MYR</Box>
                          </Typography>
                        </Box>
                        <Box sx={{ px: 2, py: 1.25, display: 'flex', flexDirection: 'column', gap: 0.75, borderTop: `1px solid ${C.border}`, bgcolor: '#111B38' }}>
                          <Row label="ETH Price (on-chain)"  value={rm(price)} />
                          <Row label={`${depEth > 0 ? depEth.toFixed(4) : '0'} ETH value`} value={depEth > 0 ? rm(colValue) : '—'} />
                          <Row label="Max LTV"               value="70%" />
                          {isLive && alreadyBorrowed > 0 && <>
                            <Row label="Already borrowed"    value={`−${rm(alreadyBorrowed, 2)}`} vc={C.gold} />
                          </>}
                        </Box>
                      </Box>
                    );
                  })()}

                  <Box sx={{ p: 1.5, bgcolor: `${C.teal}07`, border: `1px solid ${C.teal}20`, borderRadius: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>
                    </svg>
                    <Typography sx={{ fontSize: 11.5, color: C.teal, lineHeight: 1.5 }}>
                      Non-custodial — only you can withdraw after repaying.
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
                        sx={{ py: 1.75, fontSize: 14, borderRadius: 2.5, background: !action.disabled ? `linear-gradient(135deg, ${C.teal}, #0B8B5E)` : undefined }}>
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
                      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1, color: C.teal }}><BankIcon size={22} /></Box>
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
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="caption" sx={{ color: C.ts, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75 }}>
                        ETH Amount
                      </Typography>
                      {isLive && (
                        <Typography variant="caption" sx={{ color: C.ts }}>
                          Available: <Box component="span" sx={{ color: C.tp, fontWeight: 600 }}>{maxWithdraw.toFixed(4)} ETH</Box>
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ ...innerSx, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Typography sx={{ fontSize: 22, fontWeight: 700, color: '#627EEA', lineHeight: 1 }}>Ξ</Typography>
                      <InputBase type="number" value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)}
                        placeholder="0.00"
                        sx={{ flex: 1, color: C.tp, fontSize: 22, fontWeight: 600, '& input': { p: 0 } }} />
                      {withdrawAmt && (
                        <Typography sx={{ fontSize: 12, color: C.ts }}>≈ {rm(parseFloat(withdrawAmt || '0') * price)}</Typography>
                      )}
                    </Box>
                    {isLive && maxWithdraw > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.75, mt: 1 }}>
                        {[25, 50, 75].map(pct => (
                          <Box key={pct} onClick={() => setWithdrawAmt((maxWithdraw * pct / 100).toFixed(4))}
                            sx={{ flex: 1, py: 0.6, textAlign: 'center', bgcolor: C.inner, borderRadius: 1.5,
                              cursor: 'pointer', border: `1px solid ${C.border}`,
                              '&:hover': { borderColor: C.gold, bgcolor: `${C.gold}08` } }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.ts }}>{pct}%</Typography>
                          </Box>
                        ))}
                        <Box onClick={() => setWithdrawAmt((Math.floor(maxWithdraw * 10000) / 10000).toFixed(4))}
                          sx={{ flex: 1, py: 0.6, textAlign: 'center', bgcolor: `${C.gold}10`, borderRadius: 1.5,
                            cursor: 'pointer', border: `1px solid ${C.gold}30`,
                            '&:hover': { bgcolor: `${C.gold}18` } }}>
                          <Typography sx={{ fontSize: 11, fontWeight: 700, color: C.gold }}>MAX</Typography>
                        </Box>
                      </Box>
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
                      <Box sx={{ flexShrink: 0, color: C.gold, mt: '1px' }}><AlertIcon size={14} /></Box>
                      <Typography variant="caption" sx={{ color: C.gold, lineHeight: 1.6 }}>
                        Open loan: you can only withdraw above the 70% LTV minimum. Repay debt to unlock more collateral.
                      </Typography>
                    </Box>
                  )}

                  <Button fullWidth variant="contained"
                    disabled={action.disabled}
                    onClick={action.onClick}
                    sx={{ py: 1.75, fontSize: 14, borderRadius: 2.5, background: !action.disabled ? `linear-gradient(135deg, ${C.gold}, #B85C00)` : undefined }}>
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
                  {!wallet.kycApproved && (wallet.kycStatus === 'pending' || isLive) && (
                    <KycRequiredCard onStart={() => router.push('/kyc')} action="borrowing" kycStatus={wallet.kycStatus} />
                  )}

                  {(wallet.kycApproved || (!isLive && wallet.kycStatus !== 'pending')) && (
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
                            // Floor, never round: .toFixed(2) rounds UP past the
                            // real limit by a fraction of a cent, which made MAX
                            // produce an amount the contract rejects.
                            onClick={() => isLive && wallet.loanInfo
                              ? setBorrowAmt((Math.floor(Number(wallet.loanInfo.available) / 1e4) / 100).toFixed(2)) : undefined}
                            sx={{ bgcolor: `${C.teal}15`, color: C.teal, fontSize: 11, minWidth: 'auto', py: 0.25, px: 1.25, borderRadius: 1.5 }}>
                            MAX
                          </Button>
                        </Box>
                        {isLive && wallet.loanInfo && (() => {
                          // Floor to 2dp — same as the MAX button — so the displayed
                          // limit matches what can actually be submitted.
                          const contractAvail = Math.floor(Number(wallet.loanInfo!.available) / 1e4) / 100;
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
                            { key: 'token', icon: <CoinIcon size={18} />, title: 'MYR Token',    sub: 'MockMYR to wallet' },
                            { key: 'bank',  icon: <BankIcon size={18} />, title: 'Bank Transfer', sub: 'DuitNow transfer' },
                          ] as const).map(opt => (
                            <Box key={opt.key}
                              onClick={() => { setDeliveryMethod(opt.key); setTransferResult(null); setTransferError(''); }}
                              sx={{
                                p: 1.75, borderRadius: 2, cursor: 'pointer', transition: 'all 0.15s',
                                border: `1px solid ${deliveryMethod === opt.key ? C.teal + '50' : C.border}`,
                                bgcolor: deliveryMethod === opt.key ? `${C.teal}08` : C.inner,
                                '&:hover': { borderColor: C.teal + '40' },
                              }}>
                              <Box sx={{ display: 'flex', mb: 0.5, color: deliveryMethod === opt.key ? C.teal : C.ts }}>{opt.icon}</Box>
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
                        <Row label={`Interest (${loanTermDays}d · ${liveAprPct.toFixed(2)}% var.)`}  value={borrowMYR > 0 ? rm(panelInterest, 2) : '—'} vc={C.gold} />
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
                                  {fmtHF(contractHF)} (contract)
                                </Typography>
                                {hasPriceMismatch && (
                                  <Typography variant="caption" sx={{ color: hColor(mktHFAfter), fontWeight: 700, display: 'block' }}>
                                    {fmtHF(mktHFAfter)} (market)
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

                      {/* Terms & Conditions consent — required before borrowing */}
                      <Box onClick={() => setAgreedTerms(v => !v)}
                        sx={{
                          display: 'flex', alignItems: 'flex-start', gap: 1.25, p: 1.5,
                          bgcolor: agreedTerms ? `${C.teal}06` : C.inner,
                          border: `1px solid ${agreedTerms ? C.teal + '40' : C.border}`,
                          borderRadius: 2, cursor: 'pointer', transition: 'all 0.15s',
                          '&:hover': { borderColor: C.teal + '50' },
                        }}>
                        <Box sx={{
                          width: 18, height: 18, borderRadius: 1, flexShrink: 0, mt: '1px',
                          border: `1.5px solid ${agreedTerms ? C.teal : C.ts}`,
                          bgcolor: agreedTerms ? C.teal : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {agreedTerms && (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#060D1F" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </Box>
                        <Typography variant="caption" sx={{ color: C.ts, lineHeight: 1.6 }}>
                          I have read and agree to the{' '}
                          <Box component="span" onClick={e => { e.stopPropagation(); router.push('/docs'); }}
                            sx={{ color: C.teal, textDecoration: 'underline', cursor: 'pointer' }}>
                            Terms &amp; Conditions
                          </Box>
                          , and I understand my ETH collateral can be partially liquidated if my health factor falls below 1.0.
                        </Typography>
                      </Box>

                      <Button fullWidth variant="contained"
                        disabled={!isLive || !borrowAmt || !agreedTerms || wallet.txStatus === 'pending' ||
                          (isLive && wallet.loanInfo != null && parseFloat(borrowAmt) > Number(wallet.loanInfo.available) / 1e6)}
                        sx={{ py: 1.75, fontSize: 14, borderRadius: 2.5, background: (isLive && !!borrowAmt && agreedTerms && wallet.txStatus !== 'pending') ? `linear-gradient(135deg, ${C.blue}, #4458E8)` : undefined }}
                        onClick={() => {
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
                          // All checks passed — show the final confirmation summary.
                          setBorrowConfirmOpen(true);
                        }}>
                        {wallet.txStatus === 'pending' ? 'Waiting for confirmation…'
                          : isLive && !!borrowAmt && parseFloat(borrowAmt) > borrowAvail + 1e-9
                            ? `Exceeds available — max RM ${(Math.floor(borrowAvail * 100) / 100).toFixed(2)}`
                          : !agreedTerms && borrowAmt ? 'Accept the terms to continue'
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
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="caption" sx={{ color: C.ts, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75 }}>
                        Repay Amount (MYR)
                      </Typography>
                      {isLive && (
                        <Typography variant="caption" sx={{ color: C.ts }}>
                          Balance: <Box component="span" sx={{ color: C.tp, fontWeight: 600 }}>RM {wallet.myrBalance}</Box>
                        </Typography>
                      )}
                    </Box>
                    <Box sx={{ ...innerSx, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Typography variant="body2" sx={{ color: C.teal, fontWeight: 800, fontSize: 17 }}>RM</Typography>
                      <InputBase type="number" value={repayAmt}
                        onChange={e => { setRepayAmt(e.target.value); setRepayFull(false); }}
                        placeholder="0.00"
                        sx={{ flex: 1, color: C.tp, fontSize: 22, fontWeight: 600, '& input': { p: 0 } }} />
                    </Box>
                    {isLive && wallet.loanInfo && (() => {
                      const principal = Number(wallet.loanInfo!.borrowed) / 1e6;
                      const due       = principal + repayDisplayInt;
                      return (
                        <Box sx={{ display: 'flex', gap: 0.75, mt: 1 }}>
                          {[25, 50, 75].map(pct => (
                            <Box key={pct} onClick={() => { setRepayAmt((due * pct / 100).toFixed(2)); setRepayFull(false); }}
                              sx={{ flex: 1, py: 0.6, textAlign: 'center', bgcolor: C.inner, borderRadius: 1.5,
                                cursor: 'pointer', border: `1px solid ${C.border}`,
                                '&:hover': { borderColor: C.teal, bgcolor: `${C.teal}08` } }}>
                              <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.ts }}>{pct}%</Typography>
                            </Box>
                          ))}
                          <Box onClick={() => { setRepayAmt(due.toFixed(2)); setRepayFull(true); }}
                            sx={{ flex: 1, py: 0.6, textAlign: 'center', bgcolor: repayFull ? `${C.teal}25` : `${C.teal}10`, borderRadius: 1.5,
                              cursor: 'pointer', border: `1px solid ${repayFull ? C.teal : C.teal + '30'}`,
                              '&:hover': { bgcolor: `${C.teal}18` } }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 700, color: C.teal }}>FULL</Typography>
                          </Box>
                        </Box>
                      );
                    })()}
                  </Box>

                  {/* Live quote indicator — the payoff figure ages by the second,
                      so show exactly how fresh it is and when it renews. */}
                  {isLive && wallet.loanInfo && Number(wallet.loanInfo.borrowed) > 0 && (() => {
                    const qc = wallet.isRefreshing ? C.blue : quoteIn > 30 ? C.teal : quoteIn > 10 ? C.gold : C.red;
                    const principalMYR = Number(wallet.loanInfo!.borrowed) / 1e6;
                    const perMin = principalMYR * (liveAprPct / 100) / 525_600; // APR spread over the year's minutes
                    return (
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <LiveDot color={qc} />
                          <Typography variant="caption" sx={{ color: qc, fontWeight: 600 }}>
                            {wallet.isRefreshing ? 'Updating quote…' : `Live quote — refreshes in ${quoteIn}s`}
                          </Typography>
                        </Box>
                        <Typography variant="caption" sx={{ color: C.ts }}>
                          Interest grows ≈ RM {perMin < 0.01 ? perMin.toFixed(4) : perMin.toFixed(2)}/min
                        </Typography>
                      </Box>
                    );
                  })()}

                  <Box sx={{ ...innerSx, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {(() => {
                      const principal = isLive && wallet.loanInfo ? Number(wallet.loanInfo.borrowed) / 1e6 : 0;
                      const liveInt   = repayDisplayInt;
                      return (
                        <>
                          <Row label="Outstanding Principal"
                            value={isLive && wallet.loanInfo ? `RM ${principal.toFixed(2)}` : '—'} />
                          <Row label="Accrued Interest"
                            value={isLive && wallet.loanInfo ? `RM ${liveInt.toFixed(4)}` : '—'} vc={C.gold} />
                          <Row label="Total Due"
                            value={isLive && wallet.loanInfo ? `RM ${(principal + liveInt).toFixed(2)}` : '—'} vc={C.teal} />
                        </>
                      );
                    })()}
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
                          if (repayFull || rem <= 0) return '∞ (no debt)';
                          return fmtHF((wallet.loanInfo.collateralValueMYR * 0.8) / rem);
                        })()} vc={C.teal} bold />
                    </Box>
                    <Typography variant="caption" sx={{ color: C.ts, lineHeight: 1.5, fontSize: 10.5 }}>
                      Health factor = (collateral value × 80%) ÷ debt. Below 1.0, a liquidator can repay part
                      of your debt and take the matching ETH plus a 5% bonus — only enough to cover what they
                      repaid, not all of your collateral. Higher is safer; above 99 we just show “99+”.
                    </Typography>
                  </Box>

                  {repayFull && (
                    <Box sx={{ p: 1.5, bgcolor: `${C.teal}08`, border: `1px solid ${C.teal}25`, borderRadius: 2 }}>
                      <Typography variant="caption" sx={{ color: C.teal, lineHeight: 1.6 }}>
                        Full payoff — the exact amount owed is re-quoted from the contract when you confirm,
                        so interest accrued while you sign is included. You are only ever charged the actual
                        debt, never more, and nothing is left behind.
                      </Typography>
                    </Box>
                  )}

                  {/* Balance check, 3-step flow hint, info box and main button all share one IIFE */}
                  {(() => {
                    const myrBal      = parseFloat(wallet.myrBalance || '0');
                    const principal   = isLive && wallet.loanInfo ? Number(wallet.loanInfo.borrowed) / 1e6 : 0;
                    const chainInt    = isLive && wallet.loanInfo ? Number(wallet.loanInfo.accruedInterest) / 1e6 : 0;
                    const chainDue    = principal + chainInt;

                    const repayAmtNum   = parseFloat(repayAmt || '0');
                    // For full repay: use the max of the live-animated repayAmt and chainDue.
                    // chainDue can be stale (interest = 0 right after a fresh borrow) while
                    // the repayAmt already includes the animated estimate — the max catches
                    // the case where interest accrued between the last refresh and now.
                    const needed        = repayFull ? Math.max(repayAmtNum, chainDue) : repayAmtNum;
                    // 5-min APR buffer covers interest accrued across 3 MetaMask pops.
                    const perMin      = principal * (liveAprPct / 100) / 525_600;
                    const shortage    = Math.max(0, needed - myrBal);
                    const topUp       = shortage > 0 ? Math.ceil((shortage + Math.max(perMin * 5, 1)) * 100) / 100 : 0;

                    const insufficientBal = isLive && !!wallet.loanInfo && needed > 0 && needed > myrBal;
                    const isPending       = wallet.txStatus === 'pending';
                    const canSubmit       = isLive && !!repayAmt && !isPending && !insufficientBal && principal > 0;
                    // Full-repay with shortage → main button becomes "Auto top-up + Repay"
                    const canAutoRepay    = repayFull && shortage > 0 && isLive && !!wallet.loanInfo && principal > 0 && !isPending;

                    const doAutoTopUp = async () => {
                      const repayTotal = (principal + repayDisplayInt).toFixed(2);
                      const bought = await wallet.buyMYR(topUp.toFixed(2));
                      if (!bought) return;
                      // walletRepayRef always points to the latest wallet.repay closure
                      await walletRepayRef.current(repayTotal, { full: true });
                    };

                    return (
                      <>
                        {/* 3-step insufficient-balance card */}
                        {shortage > 0 && (
                          <Box sx={{ p: 2, bgcolor: `${C.red}08`, border: `1px solid ${C.red}30`, borderRadius: 2 }}>
                            <Typography variant="caption" sx={{ color: C.red, fontWeight: 700, display: 'block', mb: 0.5 }}>
                              Insufficient MYR balance
                            </Typography>
                            <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 1.5, lineHeight: 1.6 }}>
                              You&apos;re short by <b style={{ color: C.red }}>RM {shortage.toFixed(2)}</b>.
                              {' '}Your ETH will be exchanged for <b style={{ color: C.tp }}>RM {topUp.toFixed(2)}</b> MYR, then the loan repays automatically.
                            </Typography>
                            {/* 3-step flow chips */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5, flexWrap: 'wrap' }}>
                              {([
                                { label: '① Exchange ETH', sub: `→ RM ${topUp.toFixed(2)} MYR` },
                                { label: '② Approve MYR',  sub: 'MetaMask confirm'              },
                                { label: '③ Repay Loan',   sub: 'Collateral unlocked'           },
                              ] as { label: string; sub: string }[]).map((step, i) => (
                                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                  <Box sx={{ bgcolor: `${C.teal}15`, border: `1px solid ${C.teal}35`, borderRadius: 1.5, px: 1.25, py: 0.6, textAlign: 'center', minWidth: 88 }}>
                                    <Typography sx={{ color: C.teal, fontWeight: 700, fontSize: 11, lineHeight: 1.4 }}>
                                      {step.label}
                                    </Typography>
                                    <Typography sx={{ color: C.ts, fontSize: 10, lineHeight: 1.3 }}>
                                      {step.sub}
                                    </Typography>
                                  </Box>
                                  {i < 2 && <Typography sx={{ color: C.ts, fontSize: 13, lineHeight: 1 }}>→</Typography>}
                                </Box>
                              ))}
                            </Box>
                            <Button
                              size="small" variant="text"
                              onClick={() => { setBuyAmt(topUp.toFixed(2)); setActiveTab('buy'); }}
                              sx={{ fontSize: 12, borderRadius: 2, color: C.ts, p: 0, minWidth: 0 }}
                            >
                              Or buy manually in Buy MYR tab →
                            </Button>
                          </Box>
                        )}

                        {/* Confirmation count hint — updates for 2-step vs 3-step flow */}
                        <Box sx={{ p: 1.75, bgcolor: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: 2, display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                          <Typography sx={{ fontSize: 14, flexShrink: 0 }}>ℹ</Typography>
                          <Box>
                            <Typography variant="caption" sx={{ color: C.ts, display: 'block', lineHeight: 1.6 }}>
                              {shortage > 0
                                ? <><b style={{ color: C.tp }}>3 MetaMask confirmations</b>: ① Exchange ETH → MYR, ② Approve MYR spend, ③ Repay loan.</>
                                : <>Two MetaMask confirmations: <b style={{ color: C.tp }}>① Approve MYR spend</b>, then <b style={{ color: C.tp }}>② Repay loan</b>.</>
                              }
                            </Typography>
                            <Typography variant="caption" sx={{ color: C.ts, display: 'block', mt: 0.5, lineHeight: 1.6 }}>
                              Full repayment unlocks your ETH collateral immediately.
                            </Typography>
                          </Box>
                        </Box>

                        {/* Main action button — transforms when auto top-up is needed */}
                        <Button
                          fullWidth variant="contained"
                          disabled={canAutoRepay ? false : !canSubmit}
                          onClick={canAutoRepay ? doAutoTopUp : () => {
                            const rawDue = wallet.loanInfo
                              ? (Number(wallet.loanInfo.borrowed) + Number(wallet.loanInfo.accruedInterest)) / 1e6 : 0;
                            const full = repayFull || (rawDue > 0 && repayAmtNum >= rawDue - 0.005);
                            void wallet.repay(repayAmt, { full }).then(() => { setRepayAmt(''); setRepayFull(false); });
                          }}
                          sx={{ py: 1.75, fontSize: 14, borderRadius: 2.5, background: (canSubmit || canAutoRepay) ? `linear-gradient(135deg, ${C.teal}, #0B8B5E)` : undefined }}
                        >
                          {isPending
                            ? 'Waiting for confirmation…'
                            : canAutoRepay
                              ? `Auto top-up RM ${topUp.toFixed(2)} + Repay`
                              : insufficientBal
                                ? 'Insufficient MYR Balance'
                                : repayFull
                                  ? 'Repay Loan in Full'
                                  : 'Repay Loan'}
                        </Button>
                      </>
                    );
                  })()}
                </Box>
              )}

              {/* BUY MYR */}
              {activeTab === 'buy' && (() => {
                // Buying MYR is a funding action, gated on account verification
                // like deposit and borrow (withdraw/repay stay open so users
                // can always exit).
                if (!wallet.kycApproved && (wallet.kycStatus === 'pending' || isLive)) {
                  return <KycRequiredCard onStart={() => router.push('/kyc')} action="buying MYR" kycStatus={wallet.kycStatus} />;
                }
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
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, color: C.teal }}>
                        <CartIcon size={16} />
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
                        Note: this mints new MYR at the contract&apos;s on-chain price. Use it to top up your balance before repaying a loan.
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
        </DialogContent>
      </Dialog>

      {/* KYC Dialog — shown once per session when deposit tab is active and KYC not done */}
      <Dialog open={kycDialogOpen} onClose={() => setKycDialogOpen(false)} maxWidth="xs" fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3, p: 0.5 } } }}>
        <DialogContent sx={{ p: 3.5, textAlign: 'center' }}>
          {wallet.kycStatus === 'pending' ? (
            <>
              <Box sx={{
                width: 64, height: 64, borderRadius: '50%', bgcolor: 'rgba(110,139,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.blue, mx: 'auto', mb: 2,
              }}><ClockIcon size={28} /></Box>
              <Typography variant="h6" sx={{ color: C.tp, fontWeight: 700, mb: 1 }}>KYC Under Review</Typography>
              <Chip icon={<ChipGlyph><ClockIcon size={13} /></ChipGlyph>} label="Pending Review" size="small"
                sx={{ bgcolor: 'rgba(110,139,255,0.1)', color: C.blue, border: '1px solid rgba(110,139,255,0.25)', fontWeight: 600, mb: 2 }} />
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
                width: 64, height: 64, borderRadius: '50%', bgcolor: `${C.gold}15`, color: C.gold,
                display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2,
              }}><IdCardIcon size={28} /></Box>
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

      {/* Borrow confirmation — the double-check before money moves */}
      <Dialog open={borrowConfirmOpen} onClose={() => setBorrowConfirmOpen(false)} maxWidth="xs" fullWidth
        slotProps={{ paper: { sx: { borderRadius: 3, bgcolor: C.card, border: `1px solid ${C.border}`, backgroundImage: 'none' } } }}>
        <DialogContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ color: C.tp, fontWeight: 800, mb: 0.5 }}>Confirm Your Loan</Typography>
          <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 2.5 }}>
            Please review the details — MetaMask will ask you to sign after you confirm.
          </Typography>

          <Box sx={{ p: 2, mb: 2, bgcolor: C.inner, border: `1px solid ${C.border}`, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Row label="Borrow amount" value={rm(borrowMYR, 2)} bold />
            <Row label="Receive as" value={deliveryMethod === 'bank' ? 'Bank transfer (DuitNow)' : 'MYR tokens to wallet'} />
            <Row label="Interest rate" value={`${liveAprPct.toFixed(2)}% APR · variable`} />
            <Row label={`Est. interest (${loanTermDays}d)`} value={rm(panelInterest, 2)} vc={C.gold} />
            <Row label="Origination fee (0.10%)" value={rm(borrowMYR * 0.001, 2)} />
            <Box sx={{ pt: 1, borderTop: `1px solid ${C.border}` }}>
              <Row label="Total to repay (est.)" value={rm(panelTotal, 2)} vc={C.teal} bold />
            </Box>
            {isLive && wallet.loanInfo && borrowMYR > 0 && (() => {
              const newBor = Number(wallet.loanInfo.borrowed) / 1e6 + borrowMYR;
              const hfAfter = newBor > 0 ? (wallet.loanInfo.collateralValueMYR * 0.8) / newBor : Infinity;
              return <Row label="Health factor after" value={fmtHF(hfAfter)} vc={hColor(hfAfter)} bold />;
            })()}
          </Box>

          <Box sx={{ p: 1.5, mb: 2.5, bgcolor: `${C.gold}08`, border: `1px solid ${C.gold}25`, borderRadius: 2 }}>
            <Typography variant="caption" sx={{ color: C.gold, lineHeight: 1.6 }}>
              Your ETH stays locked as collateral until the loan is repaid. If your health factor drops
              below 1.0, part of it can be liquidated to cover the debt.
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Button fullWidth variant="outlined" onClick={() => setBorrowConfirmOpen(false)}
              sx={{ borderColor: C.border, color: C.ts, borderRadius: 2 }}>
              Cancel
            </Button>
            <Button fullWidth variant="contained" onClick={() => { void executeBorrow(); }}
              sx={{ borderRadius: 2, background: `linear-gradient(135deg, ${C.blue}, #4458E8)` }}>
              Confirm Borrow
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <Box component="footer" sx={{ mt: 10, py: 5, borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 2,
        }}>
          <Box sx={{
            width: 28, height: 28, borderRadius: 1.5,
            background: '#6E8BFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Typography sx={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>C</Typography>
          </Box>
          <Typography variant="body2" sx={{ color: C.ts, fontWeight: 600 }}>
            Crypto<Box component="span" sx={{ color: C.teal }}>Lend</Box>
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(0,0,0,0.25)' }}>·</Typography>
          <Typography variant="caption" sx={{ color: C.ts }}>© 2026</Typography>
        </Box>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', maxWidth: 520, mx: 'auto', display: 'block', lineHeight: 1.8 }}>
          Decentralised Crypto-Backed Lending · Hardhat Testnet (Chain ID 31337)
          <br />
          Demonstration app for educational purposes. Not financial advice. Crypto lending carries liquidation risk.
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * `useSearchParams` (used for the ?tab= action selector) opts the tree out of
 * static prerendering unless it sits under a Suspense boundary. A route segment
 * `export const dynamic` cannot do this job here, because segment config is
 * ignored in a 'use client' file.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}
