'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
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
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import { useWallet } from '@/lib/WalletContext';
import { usePrices, SYMBOL_TO_ID } from '@/hooks/usePrices';
import { useSparklines } from '@/hooks/useSparklines';
import { useProtocolStats } from '@/hooks/useProtocolStats';
import Sparkline from '@/components/Sparkline';
import { dynamicApr, supplyApr } from '@/lib/rates';
import AccountSetupBanner from '@/components/AccountSetupBanner';
import { AlertIcon, BankIcon, CartIcon, CashIcon, CheckIcon, ChipGlyph, ClockIcon, CoinIcon, IdCardIcon, LiveDot, LockIcon, SolanaIcon, WalletIcon } from '@/components/Icons';

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

// riskMul: borrow-rate multiplier relative to ETH (all assets move with the live ETH rate)
// supplyRatio: fraction of the borrow spread passed to lenders (higher for illiquid assets)
const ASSETS = [
  { symbol: 'BTC',  name: 'Bitcoin',   color: '#F7931A', maxLTV: 70, riskMul: 0.78, supplyRatio: 0.40, icon: '₿' },
  { symbol: 'ETH',  name: 'Ethereum',  color: '#627EEA', maxLTV: 70, riskMul: 1.00, supplyRatio: 0.38, icon: 'Ξ' },
  { symbol: 'SOL',  name: 'Solana',    color: '#9945FF', maxLTV: 65, riskMul: 0.96, supplyRatio: 0.49, icon: <SolanaIcon size={18} /> },
  { symbol: 'BNB',  name: 'BNB Chain', color: '#F3BA2F', maxLTV: 65, riskMul: 0.88, supplyRatio: 0.41, icon: 'B' },
  { symbol: 'XRP',  name: 'XRP',       color: '#00AAE4', maxLTV: 55, riskMul: 1.13, supplyRatio: 0.62, icon: 'X' },
  { symbol: 'AVAX', name: 'Avalanche', color: '#E84142', maxLTV: 60, riskMul: 1.16, supplyRatio: 0.57, icon: 'A' },
  { symbol: 'LINK', name: 'Chainlink', color: '#2A5ADA', maxLTV: 60, riskMul: 1.12, supplyRatio: 0.60, icon: 'L' },
  { symbol: 'DOT',  name: 'Polkadot',  color: '#E6007A', maxLTV: 55, riskMul: 1.27, supplyRatio: 0.63, icon: 'D' },
  { symbol: 'ADA',  name: 'Cardano',   color: '#0033AD', maxLTV: 50, riskMul: 1.30, supplyRatio: 0.65, icon: '₳' },
];

const LOAN_TERMS = [
  { days: 30,  months: 1,  label: '1 Month'  },
  { days: 90,  months: 3,  label: '3 Months' },
  { days: 180, months: 6,  label: '6 Months' },
  { days: 365, months: 12, label: '1 Year'   },
];

/// Interest steps once per calendar day on-chain (CryptoLoan.ACCRUAL_STEP),
/// so every accrual here is expressed in whole days over a 365-day year.
const DAY_MS = 86_400_000;
const MYR_TZ_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8 — see CryptoLoan.MYR_TZ_OFFSET
// Mirrors accruedInterest()'s calendar-day anchoring: interest is owed for
// the borrow date itself (Malaysia midnight boundaries — "today" means local
// time for an MYR product, not UTC), and each local calendar date crossed
// since then adds one more day's interest — not a rolling 24h window from
// the borrow timestamp. The borrow-date charge (+1 on top of the dates
// crossed) applies ONLY before this loan's first ever repay (firstAccrual) —
// see the matching guard in CryptoLoan.sol's _loanInterest(). A repay
// collects interest through its own date and resets the clock
// (lastRepayTime), so adding the day again would charge repeated same-day
// partial repayments a fresh phantom day of interest each.
const daysSince = (sinceMs: number, now: number, firstAccrual: boolean) => {
  if (sinceMs <= 0) return 0;
  const lastDay = Math.floor((sinceMs + MYR_TZ_OFFSET_MS) / DAY_MS);
  const curDay  = Math.floor((now + MYR_TZ_OFFSET_MS) / DAY_MS);
  // Clamped at 0: the contract can never accrue backwards, so neither may this
  // mirror. A position restored from cache renders before the first chain read
  // lands, and its clock can sit behind a loan's own timestamps — which showed
  // up as negative interest on the Repay tab.
  const diff    = Math.max(0, curDay - lastDay);
  return firstAccrual ? diff + 1 : diff;
};

/// Amount fields never mean a negative number: min=0 (via nonNegProps) stops
/// the stepper arrows at zero, and nonNeg() catches a typed or pasted minus.
/// (Number('-') is NaN, so a half-typed value passes through untouched.)
const nonNeg = (v: string) => (Number(v) < 0 ? '0' : v);
const nonNegProps = { min: 0 };

/// ETH the MAX buttons hold back for gas. A depositCollateral() costs about
/// 0.00008 ETH on this chain, so this covers roughly a hundred more actions —
/// enough that withdrawing or repaying afterwards is never blocked.
const GAS_RESERVE_ETH = 0.01;

/// Larger reserve for the contract owner's own wallet. The server keeper signs
/// setEthPrice, setKYC and withdrawProtocolFees with OWNER_PRIVATE_KEY, paying
/// gas out of this same account — so depositing it down to a normal user's
/// reserve quietly starves price syncs and KYC approvals within a couple of
/// hours. This is why the owner account "must leave at least 1 ETH".
const OWNER_GAS_RESERVE_ETH = 1;

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

/// Small ⓘ affordance with a plain-language tooltip — the standard way this
/// page explains a term (Health Factor, Due Date, Grace Period, APR…) without
/// crowding the layout with paragraphs.
function Hint({ text }: { text: string }) {
  return (
    <Tooltip title={text} arrow enterTouchDelay={0}
      slotProps={{ tooltip: { sx: { bgcolor: '#1A2547', border: `1px solid ${C.border}`, color: C.tp, fontSize: 11.5, lineHeight: 1.6, p: 1.25, maxWidth: 260 } } }}>
      <Box component="span" sx={{ display: 'inline-flex', verticalAlign: 'middle', ml: 0.5, cursor: 'help', color: C.ts, opacity: 0.7, '&:hover': { opacity: 1 } }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </Box>
    </Tooltip>
  );
}

/// The five explanations required across the UI — one source so the wording
/// can't drift between the dashboard, tooltips and dialogs.
const HINTS = {
  healthFactor: 'Measures your loan safety: (collateral value × 80%) ÷ total debt. Below 1.0 your collateral may be liquidated. It falls when ETH drops or interest grows.',
  dueDate:      'The date your loan term ends. Repay before this date to avoid overdue status.',
  gracePeriod:  'Extra repayment time (7 days) after your due date before liquidation becomes possible. Interest still accrues during it.',
  liquidation:  'Your collateral may be used to repay your debt if your loan becomes unsafe (health factor < 1.0) or stays unpaid past the due date + 7-day grace period.',
  apr:          'The yearly interest rate used to calculate borrowing costs. It is locked for each loan when you borrow — later market moves change new borrows only.',
};

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
function InfoBlock({ label, value, sub, color }: { label: React.ReactNode; value: string; sub?: string; color?: string }) {
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
  // Protocol-wide truth for the banner. Works with no wallet connected, which
  // useWallet() cannot — that gap is why the banner used to be invented.
  const { stats: pStats } = useProtocolStats();
  const pChain = pStats?.chain ?? null;
  const chainSubOffline = 'Local chain unreachable';
  // True when the connected wallet IS the account the server signs with. That
  // collision is the cause of "Nonce too low": the keeper advances the nonce
  // between MetaMask's own transactions, and it also drains this account's gas.
  const isOwnerWallet = !!wallet.address && !!pChain?.ownerAddress
    && wallet.address.toLowerCase() === pChain.ownerAddress.toLowerCase();
  const ethReserve = isOwnerWallet ? OWNER_GAS_RESERVE_ETH : GAS_RESERVE_ETH;

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
  // True once the user hand-edits the repay amount. A tranche selection then
  // stops overwriting the input (the ticks stay as "which borrows to settle"),
  // so selecting never locks the field.
  const [repayAmtEdited,   setRepayAmtEdited]    = useState(false);
  // True after "Pay This Month" — the amount follows the ticked plans' combined
  // installment, and settlement splits per plan (each pays its own share)
  // instead of the oldest-first default. Cleared by typing or any chip.
  const [repayBillMode,    setRepayBillMode]     = useState(false);
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
  // Client-side guardrail messages for the Borrow tab (over capacity, market
  // price drift) — surfaced before MetaMask is ever opened.
  const [borrowError,      setBorrowError]       = useState('');
  const [kycDialogOpen,    setKycDialogOpen]     = useState(false);
  const kycDialogShown = useRef(false);
  // Countdown to the next earn-APR refresh (WalletContext polls every 60 s).
  // Resets to 60 whenever borrowAprBps changes (= the poll fired).
  const [earnCountdown, setEarnCountdown] = useState(60);
  // Automatic price-sync keeper: whenever the on-chain price drifts from the
  // live market, re-sync it on a timer (at most once per cooldown window) so
  // the user never has to click the button themselves.
  const lastAutoSync = useRef(0);
  const syncingRef   = useRef(false);
  // True once a sync attempt comes back reporting the developer panel is
  // holding the on-chain price at a manual value. The drift between chain and
  // market is then deliberate — the keeper must stop trying to "heal" it and
  // the warning must stop reading like a fault.
  const [pricePinned, setPricePinned] = useState(false);

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

  // Earn-APR countdown: tick down every second, reset when the on-chain rate refreshes.
  useEffect(() => {
    const id = setInterval(() => setEarnCountdown(c => c <= 1 ? 60 : c - 1), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { setEarnCountdown(60); }, [wallet.borrowAprBps]);

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

  // THE invariant for this file: `baseAprPct` may only ever be *labelled*
  // ("base rate"). Every number a borrower is charged against — projections,
  // ledger accrual, payoff quotes — comes from `effAprPct`, which mirrors the
  // contract's currentAprBps() (base + utilization premium, clamped). Quoting
  // one while the contract charged the other is what left sen of principal
  // behind on a "full" repayment.
  const baseAprPct = wallet.borrowAprBps / 100;
  const effAprPct  = wallet.currentAprBps / 100;
  const utilPremiumPct = Math.max(0, effAprPct - baseAprPct);
  // Demo assets get the display-side formula so every APR moves with market
  // conditions instead of sitting frozen.
  const calcApr    = calcAsset.symbol === 'ETH'
    ? effAprPct
    : dynamicApr(effAprPct, calcAsset.riskMul, prices[SYMBOL_TO_ID[calcAsset.symbol]]?.change24h ?? 0);

  const calcInterest   = (borrowable * calcApr / 100) * (loanTermDays / 365);
  const calcMonthly    = (borrowable * calcApr / 100) / 12;
  const calcTotal      = borrowable + calcInterest;

  const colAmtNum       = parseFloat(collAmt || '0');
  const targetPrice     = assetPrice * holdMultiplier;
  const ethGain         = colAmtNum * assetPrice * (holdMultiplier - 1);
  const netAdvantage    = ethGain - calcInterest;
  const breakEvenPrice  = colAmtNum > 0 ? (collUSD + calcInterest) / colAmtNum : 0;
  const breakEvenChangePct = assetPrice > 0 ? ((breakEvenPrice - assetPrice) / assetPrice) * 100 : 0;

  const isLive = wallet.isConnected && wallet.isCorrectNetwork && wallet.isDeployed;

  /// The clock for anything measured against an on-chain timestamp (loan start,
  /// lastRepayTime, dueDate). Whichever of wall time and the chain's own clock
  /// is FURTHER along, because that is what the next block will carry: an idle
  /// Hardhat chain sits behind (its last block is old, but the next one mines at
  /// real time), while the dev panel's evm_increaseTime pushes it days ahead and
  /// the offset persists into every block after. Pinned to the refresh stamp so
  /// the figures step once per chain read rather than on every render.
  const chainNow = Math.max(wallet.lastRefreshAt || Date.now(), wallet.chainNowMs);

  // ── Per-loan ledger ───────────────────────────────────────────────────────
  // One entry per ON-CHAIN loan (wallet.loanInfo.loans — the contract's own
  // per-loan book), joined with the DB ledger row that recorded the borrow
  // (for its original principal, installment term and settle target). The
  // chain is authoritative for principal, locked APR, dates and status; the
  // DB adds bookkeeping the chain doesn't store. Interest is derived
  // client-side — principal × THIS loan's locked APR × elapsed days — so it
  // keeps growing across dialog close/reopen and page reloads. Elapsed is
  // measured up to wallet.lastRefreshAt (not the render instant), so the
  // figures step once per quote cycle, exactly when the countdown wraps.
  //
  // Installment fields (termMonths/monthsElapsed/remainingMonths/thisMonthDue):
  // Shopee-PayLater-style plan tracking. thisMonthDue is always CURRENT
  // remaining balance ÷ months left in the plan — so it recomputes smaller on
  // its own after any payment, and grows as billing cycles pass even with
  // zero payments, same as any straight-line installment plan would.
  type LoanStatusKey = 'active' | 'dueSoon' | 'grace' | 'overdue' | 'liquidatable';
  type LedgerRow = {
    /** On-chain loan index — the repay/settle key. */
    loanId: number;
    /** DB ledger row id, when one exists (settle target). */
    rowId: string | null;
    principalMYR: number;
    /** APR locked at borrow (bps) — THE rate this loan's interest runs on. */
    aprBps: number;
    baseAprBps: number;
    interest: number;
    label: string;
    startMs: number;
    dueMs: number;
    termDays: number;
    status: LoanStatusKey;
    termMonths: number; monthsElapsed: number; remainingMonths: number; thisMonthDue: number;
  };
  const GRACE_DAYS = 7;                 // mirrors CryptoLoan.GRACE_PERIOD
  const GRACE_MS   = GRACE_DAYS * DAY_MS;
  const STATUS_META: Record<LoanStatusKey, { label: string; color: string }> = {
    active:       { label: 'Active',          color: C.teal },
    dueSoon:      { label: 'Due Soon',        color: C.gold },
    grace:        { label: 'In Grace Period', color: C.gold },
    overdue:      { label: 'Overdue',         color: C.red  },
    liquidatable: { label: 'Liquidatable',    color: C.red  },
  };
  type DbBorrowRow = { id: string; loanId: number | null; principal: string; originalPrincipal: string; aprBps: number; baseAprBps: number; termMonths: number; borrowedAt: string; dueDate: string | null };
  const [borrowRows, setBorrowRows] = useState<DbBorrowRow[]>([]);
  // Selection is keyed by on-chain loanId (stringified — the tick state
  // predates the per-loan model and everything downstream reads strings).
  const [selectedBorrowIds, setSelectedBorrowIds] = useState<string[]>([]);
  const fetchBorrows = useCallback(async () => {
    if (!wallet.address) { setBorrowRows([]); return; }
    try {
      const r = await fetch(`/api/borrows?wallet=${wallet.address}`);
      const d = await r.json() as { borrows?: DbBorrowRow[] };
      if (Array.isArray(d.borrows)) setBorrowRows(d.borrows);
    } catch { /* keep the last known list */ }
  }, [wallet.address]);
  // True once the user has ticked/unticked a plan themselves — stops the
  // single-plan auto-tick from fighting a deliberate untick. Reset on tab open.
  const selTouchedRef = useRef(false);
  // Load on tab open; re-sync after every completed refresh (covers
  // post-borrow and post-repay, both of which trigger a refresh).
  useEffect(() => {
    if (activeTab !== 'repay') {
      setSelectedBorrowIds([]); setRepayAmtEdited(false); setRepayBillMode(false);
      selTouchedRef.current = false;
      return;
    }
    void fetchBorrows();
  }, [activeTab, fetchBorrows]);
  // The Step-1 top-up default tracks the live shortage; a manually typed
  // amount goes stale the moment the quote refreshes (interest grew), so
  // clear it each refresh cycle and let the recomputed default show through.
  useEffect(() => {
    if (activeTab === 'repay') setBuyAmt('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.lastRefreshAt]);
  useEffect(() => {
    if (activeTab !== 'repay' || wallet.isRefreshing) return;
    void fetchBorrows();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.isRefreshing]);
  // Loan gone (fully repaid) — clear the repay inputs.
  useEffect(() => {
    if (!isLive || !wallet.loanInfo) return;
    if (Number(wallet.loanInfo.borrowed) === 0 && (repayAmt || repayFull || repayBillMode || selectedBorrowIds.length > 0)) {
      setRepayAmt(''); setRepayFull(false); setSelectedBorrowIds([]); setRepayAmtEdited(false); setRepayBillMode(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.loanInfo, isLive]);

  const ledger = (() => {
    if (!isLive || !wallet.loanInfo) return null;
    const activeLoans = wallet.loanInfo.loans.filter(l => l.active);
    if (activeLoans.length === 0) return { rows: [] as LedgerRow[], totalInt: 0, totalPrincipal: 0 };
    const now = chainNow;
    const MONTH_MS = 30 * 86_400_000; // matches LOAN_TERMS' own 30-day "1 month"
    // "Months elapsed" advances two ways, whichever is FURTHER along: real
    // calendar time passing (30-day cycles since borrow — falling behind
    // makes the next bill bigger, same as any installment plan), OR having
    // already paid down that fraction of the ORIGINAL principal (paying an
    // installment early moves you to the next one immediately, rather than
    // still dividing by the full original term until 30 real days pass).
    const installment = (
      originalPrincipalMYR: number, principalMYR: number, interest: number, termMonths: number, borrowedAtMs: number,
    ) => {
      const monthsElapsedByTime = Math.max(0, Math.floor((now - borrowedAtMs) / MONTH_MS));
      // A real installment payment pays interest first, so the PRINCIPAL-only
      // reduction from paying exactly one installment's bill always lands a
      // bit short of a clean 1/termMonths share — that's not rounding noise,
      // it's the interest portion for that cycle. Tolerance sized to the
      // contract's own worst case (MAX_BASE_RATE_BPS = 15% APR ≈ 1.25%/month)
      // plus margin, so an on-time payment still advances the plan.
      const monthsElapsedByPay  = originalPrincipalMYR > 0
        ? Math.floor(((originalPrincipalMYR - principalMYR) / originalPrincipalMYR) * termMonths + 0.02)
        : 0;
      const monthsElapsed    = Math.min(termMonths - 1, Math.max(monthsElapsedByTime, monthsElapsedByPay));
      const remainingMonths  = Math.max(1, termMonths - monthsElapsed);
      return { termMonths, monthsElapsed, remainingMonths, thisMonthDue: (principalMYR + interest) / remainingMonths };
    };
    const hfNow = wallet.loanInfo.healthFactor;
    const dbByLoanId = new Map(borrowRows.filter(r => r.loanId != null).map(r => [r.loanId as number, r]));
    // Every ACTIVE on-chain loan gets a row — the chain is the list, the DB
    // row (if recorded) only adds its original principal and installment term.
    // Each loan accrues at ITS OWN locked APR since ITS OWN last repay: paying
    // plan A never advances or consumes plan B's interest clock.
    const rows: LedgerRow[] = activeLoans.map(l => {
      const db            = dbByLoanId.get(l.loanId) ?? null;
      const principalMYR  = Number(l.principal) / 1e6;
      const originalMYR   = db ? Number(db.originalPrincipal || db.principal) / 1e6 : principalMYR;
      const startMs       = Number(l.startTime) * 1000;
      const dueMs         = Number(l.dueDate) * 1000;
      const lastRepayMs   = Number(l.lastRepayTime) * 1000;
      const firstAccrual  = l.lastRepayTime === l.startTime;
      const days          = daysSince(Math.max(startMs, lastRepayMs), now, firstAccrual);
      const interest      = principalMYR * (l.aprBps / 10_000) * (days / 365);
      const status: LoanStatusKey =
        hfNow < 1                    ? 'liquidatable' :
        now > dueMs + GRACE_MS       ? 'overdue'      :
        now > dueMs                  ? 'grace'        :
        dueMs - now <= 7 * DAY_MS    ? 'dueSoon'      :
                                       'active';
      // Months are anchored to the loan's on-chain start; termMonths comes
      // from the DB plan when recorded, else derived from the on-chain term.
      const termMonths = db?.termMonths ?? Math.max(1, Math.round(l.termDays / 30));
      return {
        loanId: l.loanId,
        rowId: db?.id ?? null,
        principalMYR,
        aprBps: l.aprBps,
        // The split is on-chain state now (loan.baseBps); the DB copy survives
        // only as a fallback for loans made before the contract stored it.
        baseAprBps: l.baseBps > 0 ? l.baseBps : (db?.baseAprBps ?? 0),
        interest,
        label: new Date(startMs).toLocaleString('en-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        startMs, dueMs, termDays: l.termDays, status,
        ...installment(originalMYR, principalMYR, interest, termMonths, startMs),
      };
    });
    return {
      rows,
      totalInt: rows.reduce((s, r) => s + r.interest, 0),
      totalPrincipal: rows.reduce((s, r) => s + r.principalMYR, 0),
    };
  })();
  const ledgerInt     = ledger?.totalInt ?? 0;
  // On-chain accrued interest — the contract's own (block-stale) figure.
  const chainAccruedInt = wallet.loanInfo ? Number(wallet.loanInfo.accruedInterest) / 1e6 : 0;
  // On Hardhat, block.timestamp only advances when a TX mines a block, so
  // chainAccruedInt is frozen between transactions. ledgerInt runs on chainNow,
  // which keeps moving between blocks and still honours a dev-panel time jump.
  // Use ledgerInt for display; chainAccruedInt is kept for reference only.
  const liveChainInt = ledgerInt > 0 ? ledgerInt : chainAccruedInt;
  const selectedRows  = ledger ? ledger.rows.filter(r => selectedBorrowIds.includes(String(r.loanId))) : [];
  const allSelected   = !!ledger && ledger.rows.length > 0 && selectedRows.length === ledger.rows.length;
  // THE fix for "why does repaying plan 1 include the other plans' interest":
  // each loan on the contract now carries its own principal, locked APR and
  // interest clock, so settling a selection costs exactly the selected plans'
  // principal + THEIR OWN interest — the other plans are untouched, on-chain
  // and in this quote.
  const selectedTotal = selectedRows.reduce((s, r) => s + r.principalMYR + r.interest, 0);
  // This month's combined installment across the ticked plans only.
  const selectedBill  = selectedRows.reduce((s, r) => s + r.thisMonthDue, 0);
  // What the Repay panel is actually paying: FULL (or all-selected) settles
  // every plan. Bill mode follows the ticked plans' combined installment. A
  // partial tranche selection sums the chosen loans' own dues. Otherwise the
  // typed amount. The single place that decides "this payment is meant to
  // clear the selected plans" — the displayed amount, the repay plan and the
  // per-loan on-chain re-quote all read THIS.
  const isFullPayoffIntent = repayFull || (allSelected && !repayAmtEdited && !repayBillMode);
  const repayAmtEffective = selectedRows.length > 0 && !repayAmtEdited && !repayFull
    ? (repayBillMode ? selectedBill : selectedTotal).toFixed(2)
    : ledger && repayFull
      ? (ledger.totalPrincipal + ledger.totalInt).toFixed(2)
      : repayAmt;
  const toggleBorrow = (id: string) => {
    // Re-arm the auto-filled amount: ticking rows is a fresh choice, so the
    // input follows the selection again until the user types over it.
    selTouchedRef.current = true;
    setRepayFull(false); setRepayAmt(''); setRepayAmtEdited(false);
    setSelectedBorrowIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectAll = () => {
    selTouchedRef.current = true;
    setRepayFull(false); setRepayAmt(''); setRepayAmtEdited(false);
    setSelectedBorrowIds(allSelected || !ledger ? [] : ledger.rows.map(r => String(r.loanId)));
  };
  // Selection-first flow: with exactly one open plan there is nothing to
  // choose, so pre-tick it. Never fights the user — a manual untick
  // (selTouchedRef) stops the auto-tick until the tab is reopened.
  useEffect(() => {
    if (activeTab !== 'repay' || !ledger || selTouchedRef.current) return;
    if (ledger.rows.length === 1 && selectedBorrowIds.length === 0) {
      setSelectedBorrowIds([String(ledger.rows[0].loanId)]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, borrowRows, wallet.loanInfo]);
  // Build the per-loan payment plan wallet.repay() executes:
  //  * full      — clear every listed plan entirely; amounts are re-quoted
  //                per loan from the contract at confirm time (settleFull).
  //  * bill      — each ticked plan pays ITS OWN monthly installment; one
  //                plan's bill can never drain another plan's balance.
  //  * custom    — the typed amount, spread oldest-first across the ticked
  //                plans (each capped at its own total due).
  // Every item carries its loanId (the on-chain repay key) and rowId (the DB
  // settle target), so the amount charged and the ledger row it settles can
  // no longer disagree.
  const buildRepayPlan = (mode: 'full' | 'settleSelected' | 'bill' | 'custom', customAmt?: number) => {
    const base = mode === 'full' || selectedRows.length === 0 ? (ledger?.rows ?? []) : selectedRows;
    if (base.length === 0) return null;
    if (mode === 'bill') {
      return {
        items: base.map(r => ({ loanId: r.loanId, amount: r.thisMonthDue.toFixed(2), rowId: r.rowId ?? undefined })),
        settleFull: false,
      };
    }
    if (mode === 'custom') {
      let remaining = customAmt ?? 0;
      const items = [];
      for (const r of [...base].sort((a, b) => a.startMs - b.startMs)) {
        if (remaining <= 0) break;
        const due = r.principalMYR + r.interest;
        const amt = Math.min(remaining, due);
        remaining -= amt;
        if (amt > 0) items.push({ loanId: r.loanId, amount: amt.toFixed(2), rowId: r.rowId ?? undefined });
      }
      return items.length > 0 ? { items, settleFull: false } : null;
    }
    // full / settleSelected — every listed plan is cleared entirely.
    return {
      items: base.map(r => ({ loanId: r.loanId, amount: (r.principalMYR + r.interest).toFixed(2), rowId: r.rowId ?? undefined })),
      settleFull: true,
    };
  };

  const liveColMYR  = wallet.loanInfo?.collateralValueMYR ?? null;
  const liveBorMYR  = wallet.loanInfo ? Number(wallet.loanInfo.borrowed) / 1e6 : null;
  const liveHF      = wallet.loanInfo?.healthFactor ?? null;
  const ethPriceMYR = wallet.isConnected ? wallet.ethPriceMYR : prices.ethereum.myr;

  const mktEthPrice   = prices.ethereum.myr;
  const colEth        = wallet.loanInfo ? Number(ethers.formatEther(wallet.loanInfo.collateral)) : 0;
  const liveColMktMYR = isLive ? colEth * mktEthPrice : null;
  const totalDebtMYR    = liveBorMYR !== null ? liveBorMYR + chainAccruedInt : null;
  const mktHF         = (liveColMktMYR !== null && totalDebtMYR !== null && totalDebtMYR > 0)
    ? (liveColMktMYR * 0.8) / totalDebtMYR : null;

  const onChainPrice    = wallet.ethPriceMYR;
  const priceDiffPct    = onChainPrice > 0 ? Math.abs((mktEthPrice - onChainPrice) / onChainPrice) * 100 : 0;
  const hasPriceMismatch = isLive && priceDiffPct > 3;

  // Which valuation the solvency cards lead with. The contract's oracle price
  // is the ONLY one that can liquidate you, so when the two disagree it is the
  // headline and the market number becomes the reference caption — the previous
  // arrangement was inverted, and it told a wallet the contract had already
  // marked liquidatable that it was "Safe" at 67.58. In normal operation the
  // keeper holds the two within 3% and this picks the market price as before,
  // so nothing visibly changes until the gap is real (a stale oracle, or the
  // developer panel deliberately pinning the price to test liquidation).
  const useChainPrice = hasPriceMismatch;
  const colMYR    = useChainPrice ? liveColMYR : liveColMktMYR;
  const netPosMYR = colMYR !== null && totalDebtMYR !== null ? colMYR - totalDebtMYR : null;
  const shownHF   = useChainPrice ? liveHF : mktHF;
  const priceUsed = useChainPrice ? onChainPrice : mktEthPrice;

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
      const data = await res.json() as { error?: string; steps?: number; newPrice?: number; paused?: boolean };
      if (!res.ok) {
        setSyncError(data.error ?? 'Sync failed');
      } else {
        setPricePinned(!!data.paused);
        if (!data.paused) await wallet.refresh();
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
    // A pinned price is a drift somebody asked for — one attempt is what
    // discovers the hold, and after that re-trying every 5 minutes only burns
    // requests on a server-side no-op.
    if (!isLive || !hasPriceMismatch || pricePinned) return;
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
  }, [isLive, hasPriceMismatch, pricePinned]);

  // Hourly market-rate keeper. /api/sync-price already re-derives the on-chain
  // base borrow rate from ETH's 24h move after every convergence, but the
  // dashboard only called it when the *price* drifted >3% — in a calm market
  // the APR could sit frozen for days. Fire it on a 1-hour cadence too, gated
  // through localStorage so reloads and multiple tabs share one schedule.
  useEffect(() => {
    if (!isLive) return;
    const KEY = 'cryptolend:rate-sync-at';
    const attempt = () => {
      const last = Number(localStorage.getItem(KEY) || 0);
      if (Date.now() - last < 3600_000) return;
      // Only advance the timestamp on a CONFIRMED success. Stamping it before
      // the fetch resolves used to mean one failed attempt (CoinGecko rate
      // limit, a momentary RPC hiccup) silently blocked every retry for a
      // full hour — the next 5-minute check would see "synced within the
      // hour" and skip, even though nothing actually happened. Leaving it
      // untouched on failure lets the next 5-minute tick retry instead.
      // /api/sync-price dedupes concurrent calls server-side, so it's safe
      // even if a slow request overlaps the next scheduled attempt.
      fetch('/api/sync-price', { method: 'POST' })
        .then(async res => {
          if (res.ok) localStorage.setItem(KEY, String(Date.now()));
          const data = await res.json().catch(() => ({})) as { paused?: boolean };
          if (data.paused) setPricePinned(true);
          return walletRefreshRef.current();
        })
        .catch(() => {});
    };
    attempt();
    const id = setInterval(attempt, 5 * 60_000);
    return () => clearInterval(id);
  }, [isLive]);

  const borrowMYR    = parseFloat(borrowAmt || '0');
  const panelMonthly = (borrowMYR * effAprPct / 100) / 12;
  const panelInterest = (borrowMYR * effAprPct / 100) * (loanTermDays / 365);
  const panelTotal   = borrowMYR + panelInterest;
  const borrowAvail  = isLive && wallet.loanInfo ? Number(wallet.loanInfo.available) / 1e6 : 0;

  // Runs after the user confirms the borrow summary dialog. Kept at component
  // scope so both the dialog's Confirm button and the flow below share it.
  const executeBorrow = async () => {
    setBorrowConfirmOpen(false);
    const termMonths = LOAN_TERMS.find(t => t.days === loanTermDays)?.months ?? 1;
    const borrowed = await wallet.borrow(borrowAmt, { termMonths });
    if (!borrowed) return;
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
          {/* Every tile here is on-chain or ledger truth. When the node is
              unreachable they read "—" rather than a plausible-looking number:
              a stale figure a user might act on is worse than a visible gap. */}
          {[
            {
              label: 'Total Value Locked',
              value: pChain ? rm(pChain.totalCollateralETH * pChain.ethPriceMYR) : '—',
              sub: pChain ? `${pChain.totalCollateralETH.toFixed(3)} ETH locked · on-chain` : chainSubOffline,
              color: C.teal,
            },
            {
              label: 'Active Loans',
              value: pStats ? String(pStats.openBorrows) : '—',
              sub: pStats
                ? `${pStats.borrowers} wallet${pStats.borrowers === 1 ? '' : 's'} with debt`
                : chainSubOffline,
              color: C.blue,
            },
            {
              label: 'Total Borrowed',
              value: pChain ? rm(pChain.totalBorrowedMYR) : '—',
              sub: pChain
                ? `${(pChain.utilizationBps / 100).toFixed(1)}% of the ${rm(pChain.supplyCapMYR)} pool`
                : chainSubOffline,
              color: C.gold,
            },
            {
              label: 'ETH / MYR Price',
              value: loading ? '…' : `RM ${prices.ethereum.myr.toLocaleString()}`,
              // This tile is the live market feed. Name the contract's own
              // price alongside it whenever the two have parted company, so the
              // headline number can't be mistaken for the one the protocol
              // values collateral at.
              sub: `${prices.ethereum.change24h >= 0 ? '+' : ''}${prices.ethereum.change24h?.toFixed(2) ?? '0.00'}% 24h`
                + (hasPriceMismatch ? ` · contract ${rm(onChainPrice)}` : ''),
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
                  value={isLive && colMYR !== null ? rm(colMYR) : '—'}
                  sub={isLive
                    ? `${colEth.toFixed(4)} ETH · ${useChainPrice ? 'contract price' : 'live market'}`
                    : 'Connect your wallet'}
                  color={C.tp}
                />
                {isLive && liveColMktMYR !== null && hasPriceMismatch && (
                  <Typography variant="caption" sx={{ color: C.ts, display: 'block', mt: 1 }}>
                    At live market: {rm(liveColMktMYR)}
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
                  value={isLive && liveBorMYR !== null ? rm(liveBorMYR, 2) : '—'}
                  sub={isLive && wallet.loanInfo
                    ? `+ RM ${(Number(wallet.loanInfo.accruedInterest) / 1e6).toFixed(4)} interest · Wallet: ${wallet.myrBalance} MYR`
                    : isLive ? `Wallet: ${wallet.myrBalance} MYR` : 'Connect your wallet'}
                  color={C.tp}
                />
                {/* Nearest maturity across the active plans — the one date the
                    borrower must not miss. Colored by how urgent it is. */}
                {isLive && wallet.loanInfo && wallet.loanInfo.loans.some(l => l.active) && (() => {
                  const nowMs = chainNow;
                  const next  = wallet.loanInfo.loans.filter(l => l.active)
                    .reduce((a, l) => (Number(l.dueDate) < Number(a.dueDate) ? l : a));
                  const dueMs = Number(next.dueDate) * 1000;
                  const graceEndMs = dueMs + 7 * 86_400_000;
                  const daysLeft = Math.ceil((dueMs - nowMs) / 86_400_000);
                  const label = nowMs > graceEndMs
                    ? 'Overdue — repay immediately'
                    : nowMs > dueMs
                      ? `In grace period — ${Math.max(0, Math.ceil((graceEndMs - nowMs) / 86_400_000))}d left to repay`
                      : `Next due ${new Date(dueMs).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })} · ${daysLeft}d left`;
                  const color = nowMs > dueMs ? C.red : daysLeft <= 7 ? C.gold : C.ts;
                  return (
                    <Typography variant="caption" sx={{ color, display: 'block', mt: 1, fontWeight: 600 }}>
                      {label}
                      <Hint text={`${HINTS.dueDate} ${HINTS.gracePeriod}`} />
                    </Typography>
                  );
                })()}
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
                  value={isLive && netPosMYR !== null ? rm(netPosMYR) : '—'}
                  sub={isLive ? `${useChainPrice ? 'Contract' : 'Market'} collateral − Debt` : 'Connect your wallet'}
                  color={netPosMYR !== null && netPosMYR >= 0 ? C.teal : C.red}
                />
              </Paper>

              {/* Health Factor */}
              {(() => {
                // The 1.58 fallback exists only to keep hColor/fmtHF total; it is
                // never rendered. Showing an invented health factor — with the
                // amber "moderate risk" border that came with it — implied this
                // visitor had a position at risk when they have no position.
                const hf = isLive && shownHF !== null ? shownHF : isLive && liveHF !== null ? liveHF : 1.58;
                const hc = isLive ? hColor(hf) : C.ts;
                const hv = isLive ? fmtHF(hf) : '—';
                // Translate the ratio into something concrete: the ETH price
                // at which liquidation starts, and how far away that is. "How
                // far" is measured from the SAME price the card is valued at —
                // quoting a market-price drop next to a contract-price health
                // factor is what let a liquidatable position read as "−99%".
                const debtNow  = totalDebtMYR ?? 0;
                const liqPrice = isLive && debtNow > 0 && colEth > 0 ? debtNow / (0.8 * colEth) : null;
                const refPrice = priceUsed > 0 ? priceUsed : ethPriceMYR;
                const dropPct  = liqPrice !== null && refPrice > 0 ? (1 - liqPrice / refPrice) * 100 : null;
                const hl = !isLive ? 'Connect your wallet'
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
                    <InfoBlock label={<>Health Factor<Hint text={HINTS.healthFactor} /></>} value={hv} sub={hl} color={hc} />
                    {isLive && mktHF !== null && hasPriceMismatch && (
                      <Typography variant="caption" sx={{ color: C.ts, display: 'block', mt: 1 }}>
                        At live market: {fmtHF(mktHF)}
                      </Typography>
                    )}
                  </Paper>
                );
              })()}
            </>
          )}
        </Box>

        {/* ── Shared-account warning ────────────────────────────────────── */}
        {isOwnerWallet && (
          <Alert
            severity="warning"
            icon={<AlertIcon size={17} />}
            sx={{
              mb: 3, bgcolor: 'rgba(255,178,36,0.08)', color: C.gold,
              border: '1px solid rgba(255,178,36,0.25)',
              '& .MuiAlert-icon': { color: C.gold }, borderRadius: 2,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 700, color: C.gold }}>
              This wallet is the protocol owner — the server signs with it too
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,178,36,0.75)', display: 'block', mt: 0.5 }}>
              Price syncs, KYC approvals and fee withdrawals are signed server-side with this
              same account (Hardhat #0, <code>OWNER_PRIVATE_KEY</code>). Each one advances the
              nonce without MetaMask knowing, which is what causes
              <b style={{ color: C.gold }}> &quot;Nonce too low&quot;</b> on your next transaction, and
              it spends this account&apos;s ETH on gas. Switch MetaMask to a different Hardhat
              account (#1 or later) to use the app normally.
            </Typography>
          </Alert>
        )}

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
            action={pricePinned ? undefined : (
              <Button size="small" disabled={syncing}
                onClick={() => { void doPriceSync(); }}
                sx={{ color: C.teal, border: '1px solid rgba(43,217,162,0.3)', fontSize: 11, borderRadius: 2, whiteSpace: 'nowrap' }}>
                {syncing ? 'Syncing…' : '⟳ Sync Price'}
              </Button>
            )}
          >
            <Typography variant="body2" sx={{ fontWeight: 700, color: C.gold }}>
              {pricePinned ? 'On-chain price is pinned by the developer panel'
                : syncing ? 'Syncing on-chain price to live market…'
                : 'On-chain price differs from live market'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,178,36,0.7)', display: 'block', mt: 0.5 }}>
              Contract: <b style={{ color: C.gold }}>{rm(onChainPrice)}/ETH</b>
              {' · '}Live: <b style={{ color: C.gold }}>{rm(mktEthPrice)}/ETH</b>
              {' '}({priceDiffPct.toFixed(1)}% diff)
              {pricePinned
                ? ' — the cards above are valued at the contract price, the one that decides liquidation. Use the panel\'s “back to live price” to release the hold.'
                : syncing ? ' — updating automatically, this takes a few seconds' : ''}
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
                { step: '03', icon: <CashIcon size={20} />, title: 'Borrow MYR',          desc: 'Pick a 1–12 month term and receive Malaysian Ringgit instantly — up to 70% of your collateral value.' },
                { step: '04', icon: <CheckIcon size={20} />, title: 'Repay & Unlock',      desc: 'Repay before your due date (early is fine, no penalties) to unlock and withdraw your collateral.' },
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
                      {['Asset', '24h Chart', 'Price (MYR)', 'Max LTV', 'Borrow APR', 'Supply APR', 'Liquidity (on-chain)'].map(h => (
                        <TableCell key={h} sx={{ color: C.ts, bgcolor: 'transparent', fontSize: 11, fontWeight: 600, border: 'none', borderBottom: `1px solid ${C.border}`, pb: 1.5 }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ASSETS.map((a, i) => {
                      const p      = prices[SYMBOL_TO_ID[a.symbol]];
                      const change = p?.change24h ?? 0;
                      const sel    = calcAssetIdx === i;
                      const bApr   = a.symbol === 'ETH' ? effAprPct : dynamicApr(effAprPct, a.riskMul, change);
                      const sApr   = supplyApr(bApr, a.supplyRatio);
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
                              label={`${bApr.toFixed(2)}%`}
                              title="Variable rate — base rate plus a premium that moves with market conditions"
                              size="small"
                              sx={{ bgcolor: `${C.red}18`, color: C.red, border: `1px solid ${C.red}30`, fontSize: 11, fontWeight: 700, height: 22 }} />
                          </TableCell>
                          <TableCell sx={{ borderColor: i < ASSETS.length - 1 ? C.border : 'transparent', py: 1.5 }}>
                            <Chip label={`${sApr.toFixed(2)}% Earn`} size="small"
                              onClick={e => { e.stopPropagation(); switchTab('deposit'); }}
                              sx={{ bgcolor: `${C.teal}18`, color: C.teal, border: `1px solid ${C.teal}30`, fontSize: 11, fontWeight: 700, height: 22, cursor: 'pointer',
                                '&:hover': { bgcolor: `${C.teal}30` } }} />
                          </TableCell>
                          <TableCell sx={{ borderColor: i < ASSETS.length - 1 ? C.border : 'transparent', py: 1.5 }}>
                            {/* ETH is the only market deployed on this chain, so
                                it is the only row with a real liquidity figure.
                                The others held invented "RM 11.2B" strings. */}
                            <Typography variant="caption" sx={{ color: C.ts }}
                              title={a.symbol === 'ETH' ? 'Total ETH collateral held by the contract' : 'Not live — ETH is the only market deployed on this chain'}>
                              {a.symbol === 'ETH' && pChain
                                ? rm(pChain.totalCollateralETH * pChain.ethPriceMYR)
                                : '—'}
                            </Typography>
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
                  const bApr   = a.symbol === 'ETH' ? effAprPct : dynamicApr(effAprPct, a.riskMul, change);
                  const sApr   = supplyApr(bApr, a.supplyRatio);
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
                          { label: 'Max LTV',    value: `${a.maxLTV}%`,        vc: C.teal,  click: false },
                          { label: 'Borrow APR', value: `${bApr.toFixed(2)}%`, vc: C.red,   click: false },
                          { label: 'Supply APR', value: `${sApr.toFixed(2)}%`, vc: C.teal,  click: true  },
                        ].map(stat => (
                          <Box key={stat.label} onClick={stat.click ? () => switchTab('deposit') : undefined}
                            sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, cursor: stat.click ? 'pointer' : 'default' }}>
                            <Typography sx={{ fontSize: 9.5, fontWeight: 600, color: C.ts, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                              {stat.label}{stat.click ? ' ↗' : ''}
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
                <InputBase type="number" inputProps={nonNegProps} value={collAmt} onChange={e => setCollAmt(nonNeg(e.target.value))}
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
                const colEthPos    = parseFloat(ethers.formatEther(wallet.loanInfo!.collateral));
                const borMYRPos    = Number(wallet.loanInfo!.borrowed) / 1e6;
                const hfPos        = wallet.loanInfo!.healthFactor;
                const hfColor      = hfPos < 1.2 ? C.red : hfPos < 1.5 ? C.gold : C.teal;
                const hfLabel      = hfPos < 1.2 ? 'At Risk' : hfPos < 1.5 ? 'Moderate' : 'Healthy';
                const hfBarPct     = Math.min((isFinite(hfPos) ? hfPos : 3) / 3 * 100, 100);
                const earnedMYR    = wallet.pendingYieldMYR;
                const stripSupApr  = supplyApr(effAprPct, 0.38);
                // One loan → its own locked rate is THE rate and can be shown
                // plainly. Several loans → there is no single true rate, so
                // say how many plans there are and point at the per-plan list
                // instead of quoting the live rate none of them is charged.
                const stripPlans   = wallet.loanInfo!.loans.filter(l => l.active);
                const borrowedSub  = borMYRPos <= 0 ? 'No debt'
                  : stripPlans.length === 1 ? `${(stripPlans[0].aprBps / 100).toFixed(2)}% APR · locked at borrow`
                  : `${stripPlans.length} plans · each at its own locked APR`;
                return (
                  <Box sx={{ mb: 2, borderRadius: 2, overflow: 'hidden', border: `1px solid ${C.border}`, bgcolor: '#111B38' }}>
                    <Box sx={{ display: 'flex' }}>
                      {[
                        { label: 'Collateral', value: `${colEthPos.toFixed(3)} ETH`, color: C.tp,   sub: `≈ ${rm(colEthPos * wallet.ethPriceMYR)}` },
                        { label: 'Borrowed',   value: borMYRPos > 0 ? `RM ${borMYRPos.toFixed(2)}` : '—', color: borMYRPos > 0 ? C.gold : C.ts, sub: borrowedSub },
                        { label: 'Earning',    value: `RM ${earnedMYR.toFixed(4)}`, color: C.teal, sub: `${stripSupApr.toFixed(2)}% Supply APR` },
                        { label: 'Health',     value: borMYRPos > 0 ? fmtHF(hfPos) : '—', color: hfColor, sub: borMYRPos > 0 ? hfLabel : '—' },
                      ].map((item, i) => (
                        <Box key={item.label} sx={{
                          flex: 1, px: 1.5, py: 1.25,
                          borderRight: i < 3 ? `1px solid ${C.border}` : 'none',
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
                      <InputBase type="number" inputProps={nonNegProps} value={depositAmt} onChange={e => setDepositAmt(nonNeg(e.target.value))}
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
                          const val = Math.max(0, bal * pct / 100 - GAS_RESERVE_ETH);
                          return (
                            <Box key={pct} onClick={() => setDepositAmt(val.toFixed(4))}
                              sx={{ flex: 1, py: 0.6, textAlign: 'center', bgcolor: C.inner, borderRadius: 1.5,
                                cursor: 'pointer', border: `1px solid ${C.border}`,
                                '&:hover': { borderColor: C.teal, bgcolor: `${C.teal}08` } }}>
                              <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.ts }}>{pct}%</Typography>
                            </Box>
                          );
                        })}
                        <Box onClick={() => setDepositAmt(Math.max(0, parseFloat(wallet.ethBalance || '0') - ethReserve).toFixed(4))}
                          sx={{ flex: 1, py: 0.6, textAlign: 'center', bgcolor: `${C.teal}10`, borderRadius: 1.5,
                            cursor: 'pointer', border: `1px solid ${C.teal}30`,
                            '&:hover': { bgcolor: `${C.teal}18` } }}>
                          <Typography sx={{ fontSize: 11, fontWeight: 700, color: C.teal }}>MAX</Typography>
                        </Box>
                      </Box>
                    )}
                    {isOwnerWallet && (
                      <Typography sx={{ fontSize: 10.5, color: C.gold, mt: 0.75, display: 'block' }}>
                        MAX keeps {OWNER_GAS_RESERVE_ETH} ETH back — this account is the protocol owner and the
                        server pays for price syncs and KYC approvals out of it.
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

                  {/* Earn-rate estimate — read-only preview of what this deposit would
                      earn; live claim balance lives on the Portfolio page instead. */}
                  {(() => {
                    const ethSupplyApr = supplyApr(effAprPct, 0.38);
                    const depEth       = parseFloat(depositAmt || '0');
                    const price        = isLive ? wallet.ethPriceMYR : ethPriceMYR;
                    const hourlyEarn   = depEth > 0 ? depEth * price * (ethSupplyApr / 100) / 8760 : 0;
                    return (
                      <Box sx={{ p: 1.5, bgcolor: `${C.teal}07`, border: `1px solid ${C.teal}25`, borderRadius: 2, display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
                        </svg>
                        <Box sx={{ flex: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Typography sx={{ fontSize: 12, color: C.teal, fontWeight: 700, lineHeight: 1 }}>
                              Earn {ethSupplyApr.toFixed(2)}% Supply APR on deposited ETH
                            </Typography>
                            <LiveDot color={C.teal} />
                            <Typography sx={{ fontSize: 9, color: C.ts, letterSpacing: 0.3 }}>{earnCountdown}s</Typography>
                          </Box>
                          <Typography sx={{ fontSize: 11, color: C.ts, mt: 0.5, lineHeight: 1 }}>
                            Est. hourly earnings: <Box component="span" sx={{ color: C.teal, fontWeight: 600 }}>
                              RM {depEth > 0 ? hourlyEarn.toFixed(4) : (price * (ethSupplyApr / 100) / 8760).toFixed(6) + ' / ETH'}
                            </Box>
                          </Typography>
                          <Typography sx={{ fontSize: 10, color: C.ts, mt: 0.5, lineHeight: 1.4, opacity: 0.7 }}>
                            Rate = {baseAprPct.toFixed(2)}% base borrow APR × 38% — auto-updates with market
                          </Typography>
                          <Typography sx={{ fontSize: 10, color: C.ts, mt: 0.25, lineHeight: 1.4, opacity: 0.7 }}>
                            = {(ethSupplyApr / 8760).toFixed(6)}% APR / hr
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })()}

                  {/* Fee breakdown — gas only, no protocol fee on deposit */}
                  {(() => {
                    const depEth = parseFloat(depositAmt || '0');
                    const price  = isLive ? wallet.ethPriceMYR : ethPriceMYR;
                    // Measured on this chain: depositCollateral ≈ 82k gas at
                    // ~1 gwei. The old 0.010 placeholder overstated it ~120×.
                    const gasEth = 0.0001;
                    return depEth > 0 ? (
                      <Box sx={{ ...innerSx, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        <Typography variant="caption" sx={{ color: C.ts, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75, mb: 0.25 }}>
                          Transaction Fees
                        </Typography>
                        <Row label="Protocol deposit fee"  value="None (0%)" vc={C.teal} />
                        <Row label="Est. network gas"      value={`~${gasEth.toFixed(3)} ETH (≈ ${rm(gasEth * price)})`} />
                        <Box sx={{ pt: 0.75, borderTop: `1px solid ${C.border}` }}>
                          <Row label="Collateral credited" value={`${depEth.toFixed(4)} ETH — 100% of your deposit`} vc={C.teal} bold />
                        </Box>
                        <Typography variant="caption" sx={{ color: C.ts, fontSize: 10, lineHeight: 1.5 }}>
                          Gas is paid to the Ethereum network, not the protocol. Your wallet ETH balance will drop by the deposit amount + gas.
                        </Typography>
                      </Box>
                    ) : null;
                  })()}

                  <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
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
                      <InputBase type="number" inputProps={nonNegProps} value={withdrawAmt} onChange={e => setWithdrawAmt(nonNeg(e.target.value))}
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

                  {(() => {
                    const ethSupplyApr   = supplyApr(effAprPct, 0.38);
                    const hourlyNow      = colEth  * price * (ethSupplyApr / 100) / 8760;
                    const hourlyAfter    = colAfter * price * (ethSupplyApr / 100) / 8760;
                    const gasEth         = 0.010;
                    const receiveEth     = wAmt > 0 ? Math.max(0, wAmt - gasEth) : 0;
                    return (
                      <Box sx={{ ...innerSx, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Typography variant="caption" sx={{ color: C.tp, fontWeight: 700, mb: 0.5 }}>After Withdrawal</Typography>
                        <Row label="Current collateral"          value={`${colEth.toFixed(4)} ETH (${rm(colEth * price)})`} />
                        <Row label="Withdraw"                    value={`−${(wAmt || 0).toFixed(4)} ETH`} vc={C.gold} />
                        <Box sx={{ pt: 1, borderTop: `1px solid ${C.border}` }}>
                          <Row label="Remaining collateral"       value={`${colAfter.toFixed(4)} ETH`} bold />
                          <Row label="Value"                       value={rm(colAfter * price)} />
                        </Box>
                        {wAmt > 0 && (
                          <Box sx={{ pt: 1, borderTop: `1px solid ${C.border}` }}>
                            <Typography variant="caption" sx={{ color: C.ts, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75, display: 'block', mb: 0.75 }}>
                              Transaction Fees
                            </Typography>
                            <Row label="Protocol withdrawal fee"  value="None (0%)" vc={C.teal} />
                            <Row label="Est. network gas"          value={`~${gasEth.toFixed(3)} ETH (≈ ${rm(gasEth * price)})`} />
                            <Box sx={{ pt: 0.75, borderTop: `1px solid ${C.border}` }}>
                              <Row label="You receive (wallet)"    value={`≈ ${receiveEth.toFixed(4)} ETH`} vc={C.teal} bold />
                              <Row label=""                         value={`≈ ${rm(receiveEth * price)} after gas`} vc={C.ts} />
                              {colAfter <= 0 && wallet.pendingYieldMYR > 0.000001 && (
                                <Row label="+ Supply interest (auto-claimed)" value={`${rm(wallet.pendingYieldMYR, 4)}`} vc={C.teal} bold />
                              )}
                            </Box>
                          </Box>
                        )}
                        {borMYR > 0 && (
                          <Box sx={{ pt: 1, borderTop: `1px solid ${C.border}` }}>
                            <Row label="Outstanding debt"          value={rm(borMYR, 2)} vc={C.gold} />
                            <Row label="Min. collateral required"  value={`${minColEth.toFixed(4)} ETH`} />
                          </Box>
                        )}
                        <Box sx={{ pt: 1, borderTop: `1px solid ${C.border}` }}>
                          {/* Supply APR row with live indicator */}
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                              <Typography variant="caption" sx={{ color: C.ts }}>
                                Supply APR
                              </Typography>
                              <LiveDot color={C.teal} />
                              <Typography sx={{ fontSize: 9, color: C.ts, letterSpacing: 0.3 }}>{earnCountdown}s</Typography>
                            </Box>
                            <Typography variant="caption" sx={{ color: C.teal, fontWeight: 700 }}>
                              {ethSupplyApr.toFixed(2)}% · RM {hourlyNow.toFixed(4)} / hr
                            </Typography>
                          </Box>
                          {wAmt > 0 && colAfter > 0 && (
                            <Row label="After withdrawal" value={`RM ${hourlyAfter.toFixed(4)} / hr`} vc={hourlyAfter < hourlyNow ? C.gold : C.teal} />
                          )}
                          {wAmt > 0 && colAfter <= 0 && (
                            <Row label="After withdrawal" value="No longer earning" vc={C.red} />
                          )}
                        </Box>
                      </Box>
                    );
                  })()}

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
                          <InputBase type="number" inputProps={nonNegProps} value={borrowAmt}
                            onChange={e => { setBorrowAmt(nonNeg(e.target.value)); setBorrowError(''); }}
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

                      {/* Where the money lands. One destination — the loan is
                          disbursed as MYRC to the borrowing wallet, which is
                          the transfer the contract actually performs. */}
                      <Box>
                        <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 1, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75 }}>
                          Receive As
                        </Typography>
                        <Box sx={{ p: 1.75, borderRadius: 2, border: `1px solid ${C.teal}50`, bgcolor: `${C.teal}08`,
                                    display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{ display: 'flex', color: C.teal }}><CoinIcon size={18} /></Box>
                          <Box>
                            <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: C.teal }}>
                              MYR Token
                            </Typography>
                            <Typography sx={{ fontSize: 10, color: C.ts }}>
                              MYRC credited to {isLive ? `${wallet.address?.slice(0, 6)}…${wallet.address?.slice(-4)}` : 'your connected wallet'}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>

                      <Box sx={{ ...innerSx, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Row label="Principal"                               value={borrowMYR > 0 ? rm(borrowMYR, 2) : '—'} />
                        {/* Rate breakdown. The effective rate shown here is
                            LOCKED into this loan at borrow time — the contract
                            stamps currentAprBps() onto the loan and accrues at
                            that fixed rate for its whole term. */}
                        <Row label="Base Rate (p.a.)"                        value={`${baseAprPct.toFixed(2)}%`} />
                        <Row label="Utilisation Premium"
                          value={`+${utilPremiumPct.toFixed(2)}%`} />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="caption" sx={{ color: C.ts }}>
                            APR — locked for this loan<Hint text={HINTS.apr} />
                          </Typography>
                          <Typography variant="caption" sx={{ color: C.gold, fontWeight: 500 }}>{effAprPct.toFixed(2)}%</Typography>
                        </Box>
                        <Row label={`Interest (${loanTermDays}d · at ${effAprPct.toFixed(2)}% locked)`}  value={borrowMYR > 0 ? rm(panelInterest, 2) : '—'} vc={C.gold} />
                        <Row label="Monthly Payment (est.)"                 value={borrowMYR > 0 ? rm(panelMonthly, 2) : '—'} vc={C.blue} />
                        {/* The term is real on-chain state: the loan matures on
                            this date, gets 7 more grace days, then becomes
                            liquidatable if still unpaid. */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="caption" sx={{ color: C.ts }}>
                            Due date<Hint text={HINTS.dueDate} />
                          </Typography>
                          <Typography variant="caption" sx={{ color: C.tp, fontWeight: 500 }}>
                            {new Date(chainNow + loanTermDays * 86_400_000).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="caption" sx={{ color: C.ts }}>
                            Grace period<Hint text={HINTS.gracePeriod} />
                          </Typography>
                          <Typography variant="caption" sx={{ color: C.tp, fontWeight: 500 }}>7 days after due date</Typography>
                        </Box>
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

                      {borrowError && (
                        <Alert severity="warning" sx={{ bgcolor: `${C.gold}08`, color: C.gold, '& .MuiAlert-icon': { color: C.gold }, borderRadius: 2 }}>
                          {borrowError}
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
                          , and I understand my ETH collateral can be partially liquidated if my health factor
                          falls below 1.0 <b>or</b> if this loan is still unpaid 7 days after its due date.
                          <Hint text={HINTS.liquidation} />
                        </Typography>
                      </Box>

                      <Button fullWidth variant="contained"
                        disabled={!isLive || !borrowAmt || !agreedTerms || wallet.txStatus === 'pending' ||
                          (isLive && wallet.loanInfo != null && parseFloat(borrowAmt) > Number(wallet.loanInfo.available) / 1e6)}
                        sx={{ py: 1.75, fontSize: 14, borderRadius: 2.5, background: (isLive && !!borrowAmt && agreedTerms && wallet.txStatus !== 'pending') ? `linear-gradient(135deg, ${C.blue}, #4458E8)` : undefined }}
                        onClick={() => {
                          setBorrowError('');
                          const available = wallet.loanInfo ? Number(wallet.loanInfo.available) / 1e6 : 0;
                          if (parseFloat(borrowAmt) > available) {
                            setBorrowError(`Exceeds available capacity (RM ${available.toFixed(2)}). Deposit more collateral first.`);
                            return;
                          }
                          const mktAvail = Math.max(0, colEth * mktEthPrice * 0.7 - (wallet.loanInfo ? Number(wallet.loanInfo.borrowed) / 1e6 : 0));
                          if (hasPriceMismatch && parseFloat(borrowAmt) > mktAvail) {
                            setBorrowError(`Warning: At live market price, your safe limit is RM ${mktAvail.toFixed(2)}.`);
                            return;
                          }
                          // All checks passed — show the final confirmation summary.
                          setBorrowConfirmOpen(true);
                        }}>
                        {wallet.txStatus === 'pending' ? 'Waiting for confirmation…'
                          : isLive && !!borrowAmt && parseFloat(borrowAmt) > borrowAvail + 1e-9
                            ? `Exceeds available — max RM ${(Math.floor(borrowAvail * 100) / 100).toFixed(2)}`
                          : !agreedTerms && borrowAmt ? 'Accept the terms to continue'
                          : 'Borrow MYR'}
                      </Button>
                    </>
                  )}
                </Box>
              )}

              {/* REPAY — GrabPay-style: top up MYR wallet → repay */}
              {activeTab === 'repay' && (() => {
                const principal    = ledger ? ledger.totalPrincipal : 0;
                const myrBal       = parseFloat(wallet.myrBalance || '0');
                // Each plan accrues at ITS OWN locked APR now — the daily cost
                // is the sum of every active plan's own daily interest, and
                // there is no single "position rate" any more. currentAprBps
                // is only what a NEW borrow would be locked at today.
                const liveAprPct   = wallet.currentAprBps / 100;
                const perDay       = ledger ? ledger.rows.reduce((s, r) => s + r.principalMYR * (r.aprBps / 10_000) / 365, 0) : 0;
                const repayAmtNum  = parseFloat(repayAmtEffective || '0');
                // A payment spreads oldest-first across the ticked plans, and
                // within each plan interest is charged before principal — so
                // principal only starts shrinking once the payment clears the
                // OLDEST ticked plan's accrued interest.
                const oldestSelInt = selectedRows.length > 0
                  ? [...selectedRows].sort((a, b) => a.startMs - b.startMs)[0].interest
                  : 0;
                // Full settlement must be funded to the plans' real cost,
                // whatever the input shows; partial repays only need the typed
                // amount. selectedTotal is per-loan-exact, so this matches
                // what repayMany will actually pull.
                const fullNeed     = repayFull ? (principal + liveChainInt) : selectedTotal;
                const requiredBal  = (repayFull || (!repayAmtEdited && !repayBillMode && selectedRows.length > 0))
                  ? Math.max(repayAmtNum, fullNeed) : repayAmtNum;
                const shortage     = repayAmtNum > 0 ? Math.max(0, requiredBal - myrBal) : 0;
                const perMin       = perDay / 1440;
                // Buffer: 30 min of growth at the plans' rates (min RM 1), so the
                // suggested top-up survives signing time and the next few refreshes.
                const topUpAmt     = shortage > 0 ? Math.ceil((shortage + Math.max(perMin * 30, 1)) * 100) / 100 : 0;
                const hasDue       = principal > 0;
                const isPending    = wallet.txStatus === 'pending';
                const insuffBal    = shortage > 0;
                const canSubmit    = isLive && repayAmtNum > 0 && !isPending && !insuffBal && hasDue;
                const canAutoRepay = repayFull && shortage > 0 && isLive && !!wallet.loanInfo && hasDue && !isPending;
                const qc           = wallet.isRefreshing ? C.blue : quoteIn > 30 ? C.teal : quoteIn > 10 ? C.gold : C.red;

                const doAutoTopUp = async () => {
                  const bought = await wallet.buyMYR(topUpAmt.toFixed(2));
                  if (!bought) return;
                  const plan = buildRepayPlan('full');
                  if (plan) await walletRepayRef.current(plan.items, { settleFull: plan.settleFull });
                };

                return (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>

                  {/* ── Nothing to repay — say so instead of a blank panel ── */}
                  {isLive && !hasDue && (
                    <Box sx={{ p: 4, bgcolor: C.inner, border: `2px dashed ${C.border}`, borderRadius: 2.5, textAlign: 'center' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5, color: C.teal }}><CheckIcon size={26} /></Box>
                      <Typography variant="body2" sx={{ color: C.tp, fontWeight: 700, mb: 0.5 }}>
                        You have no borrows yet
                      </Typography>
                      <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 2.5, lineHeight: 1.7, maxWidth: 360, mx: 'auto' }}>
                        There&apos;s nothing to repay — your account has no active loans.
                        Borrow MYR against your deposited ETH and your plans will show up
                        here with their due dates and monthly bills.
                      </Typography>
                      <Button variant="contained" onClick={() => switchTab('borrow')}
                        sx={{ borderRadius: 2, fontSize: 13, px: 3, background: `linear-gradient(135deg, ${C.blue}, #4458E8)` }}>
                        Borrow MYR →
                      </Button>
                    </Box>
                  )}

                  {/* ── Loan rate card ── */}
                  {hasDue && (
                    <Box sx={{ p: 2, bgcolor: `${C.gold}08`, border: `1px solid ${C.gold}25`, borderRadius: 2.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.25 }}>
                        <Typography sx={{ fontSize: 11, color: C.gold, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Active Loan
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <LiveDot color={C.gold} />
                          <Chip label={`${liveAprPct.toFixed(2)}% APR on new borrows`} size="small"
                            sx={{ bgcolor: `${C.gold}18`, color: C.gold, border: `1px solid ${C.gold}45`, fontSize: 11, fontWeight: 700, height: 22 }} />
                        </Box>
                      </Box>
                      <Typography sx={{ fontSize: 10, color: C.ts, mt: -0.75, mb: 1, lineHeight: 1.4 }}>
                        Each plan below keeps the APR it was{' '}
                        <Box component="span" sx={{ color: C.gold, fontWeight: 600 }}>locked at when you borrowed</Box>{' '}
                        — for its whole life. The live rate here only prices your NEXT borrow.
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
                        {[
                          { label: 'Outstanding',   val: `RM ${principal.toFixed(2)}`,        color: C.tp   },
                          { label: 'Interest due',  val: `RM ${liveChainInt.toFixed(4)}`,   color: C.gold },
                          { label: 'Daily cost',    val: `RM ${perDay.toFixed(4)}`,          color: C.ts   },
                        ].map(s => (
                          <Box key={s.label}>
                            <Typography sx={{ fontSize: 9.5, color: C.ts, mb: 0.25, textTransform: 'uppercase', letterSpacing: 0.4 }}>{s.label}</Typography>
                            <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: s.color }}>{s.val}</Typography>
                          </Box>
                        ))}
                      </Box>
                      <Box sx={{ mt: 1.25, pt: 1, borderTop: `1px solid ${C.gold}20`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <LiveDot color={qc} />
                          <Typography sx={{ fontSize: 10.5, color: C.ts }}>
                            {wallet.isRefreshing ? 'Updating…' : `Quote refreshes in ${quoteIn}s`}
                          </Typography>
                        </Box>
                        <Typography sx={{ fontSize: 10.5, color: C.ts }}>+RM {perDay < 0.01 ? perDay.toFixed(4) : perDay.toFixed(3)}/day</Typography>
                      </Box>
                    </Box>
                  )}

                  {/* ── Step 1 — pick the plan(s). Everything below (bill, amount,
                      wallet, confirm) scopes to this selection, so a payment can
                      only ever touch the plans the user actually chose. ── */}
                  {isLive && ledger && ledger.rows.length > 0 && (
                    <Box sx={{ ...innerSx, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <Typography variant="caption" sx={{ color: C.ts, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75 }}>
                          Your Borrows ({ledger.rows.length}) — tick to choose
                        </Typography>
                        {ledger.rows.length > 1 && (
                          <Typography variant="caption" onClick={toggleSelectAll}
                            sx={{ color: C.teal, fontSize: 10, fontWeight: 700, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}>
                            {allSelected ? 'clear all' : 'select all'}
                          </Typography>
                        )}
                      </Box>
                      {ledger.rows.map(r => {
                        const key = String(r.loanId);
                        const sel = selectedBorrowIds.includes(key);
                        const st  = STATUS_META[r.status];
                        const nowMs    = chainNow;
                        const msLeft   = r.dueMs - nowMs;
                        const daysLeft = Math.ceil(msLeft / DAY_MS);
                        const graceLeft = Math.ceil((r.dueMs + GRACE_MS - nowMs) / DAY_MS);
                        const dueLabel  = new Date(r.dueMs).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
                        // The one line that answers "how long do I have?" for
                        // this plan, phrased for its stage of life.
                        const timeline =
                          r.status === 'liquidatable' ? 'collateral unsafe — repay or add collateral now' :
                          r.status === 'overdue'      ? `grace period ended — repay immediately` :
                          r.status === 'grace'        ? `grace period: ${Math.max(0, graceLeft)}d left to repay` :
                          `due ${dueLabel} · ${Math.max(0, daysLeft)}d left`;
                        return (
                          <Box key={key} onClick={() => toggleBorrow(key)}
                            sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1, borderRadius: 1.5, cursor: 'pointer',
                              border: `1px solid ${sel ? C.teal : C.border}`, bgcolor: sel ? `${C.teal}0C` : 'transparent',
                              '&:hover': { borderColor: C.teal } }}>
                            <Box sx={{ width: 16, height: 16, borderRadius: 0.75, flexShrink: 0,
                              border: `1.5px solid ${sel ? C.teal : C.ts}`, bgcolor: sel ? C.teal : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {sel && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#060D1F" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                            </Box>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                                <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: C.tp }}>
                                  RM {r.principalMYR.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  <Box component="span" sx={{ color: C.ts, fontWeight: 500 }}>
                                    {' · '}
                                    {r.baseAprBps > 0 && r.aprBps >= r.baseAprBps
                                      ? `${(r.baseAprBps / 100).toFixed(2)}% base + ${((r.aprBps - r.baseAprBps) / 100).toFixed(2)}% util = ${(r.aprBps / 100).toFixed(2)}% locked`
                                      : `${(r.aprBps / 100).toFixed(2)}% APR locked`}
                                  </Box>
                                </Typography>
                                <Chip label={st.label} size="small"
                                  sx={{ bgcolor: `${st.color}15`, color: st.color, border: `1px solid ${st.color}40`,
                                    fontSize: 9.5, fontWeight: 700, height: 18, '& .MuiChip-label': { px: 0.9 } }} />
                              </Box>
                              <Typography sx={{ fontSize: 10.5, color: C.ts }}>
                                Borrowed {r.label} · {r.termDays}-day term
                              </Typography>
                              <Typography sx={{ fontSize: 10.5, color: r.status === 'active' ? C.blue : st.color, mt: 0.25 }}>
                                {timeline}
                              </Typography>
                              {/* Past grace the protocol can recover this loan, and THAT
                                  charges latePenaltyBps on top (see recoverLoan()) — a
                                  self-repay never does. The admin page prices the
                                  recovery, this page prices the repay; without this
                                  line the two look like they disagree by 5%. */}
                              {r.status === 'overdue' && (
                                <Typography sx={{ fontSize: 10.5, color: st.color, mt: 0.25 }}>
                                  +RM {((r.principalMYR + r.interest) * wallet.latePenaltyBps / 10_000).toFixed(2)}{' '}
                                  late penalty ({(wallet.latePenaltyBps / 100).toFixed(0)}%) if the protocol
                                  recovers this loan — repaying yourself avoids it
                                </Typography>
                              )}
                              <Typography sx={{ fontSize: 10.5, color: C.blue, mt: 0.25 }}>
                                Month {Math.min(r.monthsElapsed + 1, r.termMonths)} of {r.termMonths} · RM {r.thisMonthDue.toFixed(2)} this month
                              </Typography>
                            </Box>
                            <Box sx={{ textAlign: 'right' }}>
                              <Typography sx={{ fontSize: 11, color: C.gold }}>+RM {r.interest < 0.01 ? r.interest.toFixed(4) : r.interest.toFixed(2)} int.</Typography>
                              <Typography sx={{ fontSize: 10.5, color: C.ts }}>RM {(r.principalMYR + Number(r.interest.toFixed(2))).toFixed(2)} to settle</Typography>
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  )}

                  {/* Nothing ticked yet — the repay panel waits for the choice. */}
                  {hasDue && selectedRows.length === 0 && (
                    <Box sx={{ p: 2.5, borderRadius: 2.5, border: `1px dashed ${C.border}`, textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 12.5, color: C.ts, lineHeight: 1.6 }}>
                        Pick a plan above to repay — tick one, several, or select all.
                        The bill and repay options follow your choice.
                      </Typography>
                    </Box>
                  )}

                  {/* ── This Month's Bill — Shopee-PayLater-style installment tracker,
                      scoped to the ticked plans. No term picker here: the term was
                      already chosen on the Borrow tab when each tranche was taken out.
                      Sums each selected row's own thisMonthDue (its current remaining
                      balance ÷ months left in ITS plan). Pay any amount, of any size —
                      the balance shrinks, and next time this renders (immediately,
                      since it's a live formula, not a cached quote) the bill is
                      recalculated from the new smaller balance over the same remaining
                      months, automatically smaller too. ── */}
                  {hasDue && selectedRows.length > 0 && (() => {
                    const billDue = selectedBill;
                    const isThisBill = repayBillMode && !repayFull;
                    // Single selection: name the plan directly ("Month 2 of 3"). Mixed
                    // terms across multiple plans have no one shared "month N of M" to
                    // show, so say how the payment is split instead.
                    const single = selectedRows.length === 1 ? selectedRows[0] : null;
                    const planLabel = single
                      ? `Month ${Math.min(single.monthsElapsed + 1, single.termMonths)} of ${single.termMonths}`
                      : `${selectedRows.length} plans selected — each pays its own installment`;
                    return (
                      <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: `${C.blue}0F`, border: `1px solid ${C.blue}35`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                        <Box>
                          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: C.tp }}>This Month&apos;s Bill</Typography>
                          <Typography sx={{ fontSize: 10.5, color: C.ts, mt: 0.25 }}>
                            {planLabel} · remaining balance ÷ months left · each plan at its own locked rate
                          </Typography>
                          <Typography sx={{ fontSize: 17, fontWeight: 800, color: C.blue, mt: 0.5 }}>RM {billDue.toFixed(2)}</Typography>
                        </Box>
                        <Button variant="contained" disableElevation disabled={isPending}
                          onClick={() => {
                            setRepayBillMode(true); setRepayAmt('');
                            setRepayAmtEdited(false); setRepayFull(false);
                          }}
                          sx={{ px: 2.25, py: 1, borderRadius: 2, fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap',
                            bgcolor: isThisBill ? `${C.blue}25` : C.blue, color: isThisBill ? C.blue : '#0B1226',
                            border: isThisBill ? `1px solid ${C.blue}60` : 'none',
                            '&:hover': { bgcolor: isThisBill ? `${C.blue}30` : '#4458E8' } }}>
                          {isThisBill ? '✓ Amount Set' : 'Pay This Month'}
                        </Button>
                      </Box>
                    );
                  })()}

                  {/* ── Repay amount — scoped to the ticked plans ── */}
                  {selectedRows.length > 0 && (
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="caption" sx={{ color: C.ts, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75 }}>
                        Repay Amount (MYR)
                      </Typography>
                      <Typography variant="caption" sx={{ color: C.ts, fontSize: 10 }}>
                        {allSelected ? 'covers all plans' : `covers ${selectedRows.length} of ${ledger?.rows.length ?? 0} plans`}
                      </Typography>
                    </Box>
                    <Box sx={{ ...innerSx, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Typography variant="body2" sx={{ color: C.teal, fontWeight: 800, fontSize: 17 }}>RM</Typography>
                      <InputBase type="number" inputProps={nonNegProps} value={repayAmtEffective}
                        onChange={e => {
                          // Typing takes over the amount but keeps the ticked
                          // borrows — they still mark which tranches this
                          // payment settles (if the amount covers them). A typed
                          // amount is no longer "the bill", so it distributes
                          // oldest-first across the ticked plans.
                          setRepayAmt(nonNeg(e.target.value)); setRepayAmtEdited(true); setRepayFull(false); setRepayBillMode(false);
                        }}
                        placeholder="0.00"
                        sx={{ flex: 1, color: C.tp, fontSize: 22, fontWeight: 600, '& input': { p: 0 } }} />
                    </Box>
                    {isLive && wallet.loanInfo && hasDue && (() => {
                      // FULL reads as active whenever the amount is the selection's
                      // full settle value — the default un-edited state.
                      const fullActive = repayFull || (!repayAmtEdited && !repayBillMode);
                      return (
                      <Box sx={{ display: 'flex', gap: 0.75, mt: 1 }}>
                        {[25, 50, 75].map(pct => (
                          <Box key={pct} onClick={() => { setRepayAmt((selectedTotal * pct / 100).toFixed(2)); setRepayAmtEdited(true); setRepayFull(false); setRepayBillMode(false); }}
                            sx={{ flex: 1, py: 0.6, textAlign: 'center', bgcolor: C.inner, borderRadius: 1.5,
                              cursor: 'pointer', border: `1px solid ${C.border}`,
                              '&:hover': { borderColor: C.teal, bgcolor: `${C.teal}08` } }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.ts }}>{pct}%</Typography>
                          </Box>
                        ))}
                        {/* Pressing FULL means "pay it all off", so it ticks every
                            plan rather than requiring the user to have ticked them
                            first. setRepayFull(allSelected) made this chip silently
                            do nothing whenever the selection was partial, which then
                            skipped the on-chain re-quote and stranded sen of principal. */}
                        <Box onClick={() => {
                          setRepayAmt(''); setRepayAmtEdited(false); setRepayBillMode(false);
                          setSelectedBorrowIds(ledger ? ledger.rows.map(r => String(r.loanId)) : []);
                          setRepayFull(true);
                        }}
                          sx={{ flex: 1, py: 0.6, textAlign: 'center', bgcolor: fullActive ? `${C.teal}25` : C.inner, borderRadius: 1.5,
                            cursor: 'pointer', border: `1px solid ${fullActive ? C.teal : C.border}`,
                            '&:hover': { borderColor: C.teal, bgcolor: `${C.teal}08` } }}>
                          <Typography sx={{ fontSize: 11, fontWeight: 700, color: fullActive ? C.teal : C.ts }}>FULL</Typography>
                        </Box>
                      </Box>
                      );
                    })()}
                  </Box>
                  )}

                  {/* Too-small-to-touch-principal warning — within each plan,
                      interest is always paid first, and a custom amount lands on
                      the oldest ticked plan first. A payment under that plan's
                      accrued interest is consumed entirely by interest and leaves
                      every principal unchanged. */}
                  {hasDue && !repayFull && repayAmtNum > 0 && repayAmtNum <= oldestSelInt && (
                    <Box sx={{ p: 1.5, bgcolor: `${C.red}0A`, border: `1px solid ${C.red}30`, borderRadius: 2, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <Typography sx={{ fontSize: 11, color: C.red, lineHeight: 1.5 }}>
                        This won&apos;t reduce your principal — RM {oldestSelInt.toFixed(2)} of interest has already
                        accrued on the oldest ticked plan, and interest is always paid first. Repay at least{' '}
                        <Box component="span" sx={{ fontWeight: 700 }}>RM {(oldestSelInt + 0.01).toFixed(2)}</Box>{' '}
                        to start paying down principal too.
                      </Typography>
                    </Box>
                  )}

                  {/* ── GrabPay-style MYR wallet → top up → repay ── */}
                  {selectedRows.length > 0 && (
                  <Box sx={{ borderRadius: 2.5, overflow: 'hidden', border: `1px solid ${insuffBal ? C.red + '40' : C.teal + '35'}` }}>

                    {/* Wallet balance header */}
                    <Box sx={{
                      p: 2.25,
                      background: insuffBal
                        ? `linear-gradient(135deg, rgba(229,72,77,0.12) 0%, rgba(229,72,77,0.05) 100%)`
                        : `linear-gradient(135deg, rgba(43,217,162,0.12) 0%, rgba(43,217,162,0.05) 100%)`,
                      display: 'flex', alignItems: 'center', gap: 2,
                    }}>
                      <Box sx={{
                        width: 46, height: 46, borderRadius: 2, flexShrink: 0,
                        bgcolor: insuffBal ? `${C.red}18` : `${C.teal}18`,
                        border: `1.5px solid ${insuffBal ? C.red + '35' : C.teal + '35'}`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Typography sx={{ fontSize: 9, fontWeight: 700, color: insuffBal ? C.red : C.teal, lineHeight: 1.1 }}>MYR</Typography>
                        <Typography sx={{ fontSize: 16, fontWeight: 800, color: insuffBal ? C.red : C.teal, lineHeight: 1 }}>RM</Typography>
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontSize: 10.5, color: C.ts, mb: 0.25 }}>MYR Wallet Balance</Typography>
                        <Typography sx={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, color: insuffBal ? C.red : C.teal }}>
                          RM {myrBal.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </Typography>
                      </Box>
                      {repayAmtNum > 0 && !insuffBal ? (
                        <Chip label="✓ Ready" size="small"
                          sx={{ bgcolor: `${C.teal}1A`, color: C.teal, border: `1px solid ${C.teal}45`, fontWeight: 700, fontSize: 11 }} />
                      ) : insuffBal ? (
                        <Chip label={`Short RM ${shortage.toFixed(2)}`} size="small"
                          sx={{ bgcolor: `${C.red}15`, color: C.red, border: `1px solid ${C.red}40`, fontWeight: 700, fontSize: 11 }} />
                      ) : null}
                    </Box>

                    {/* Step 1 — Top up (only when balance is insufficient) */}
                    {insuffBal && (
                      <Box sx={{ p: 2.25, bgcolor: `${C.red}06`, borderTop: `1px solid ${C.red}20` }}>
                        <Typography sx={{ fontSize: 12, color: C.tp, fontWeight: 700, mb: 0.5 }}>
                          Step 1 — Top Up MYR
                        </Typography>
                        <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 1.75, lineHeight: 1.65 }}>
                          You&apos;re <b style={{ color: C.red }}>RM {shortage.toFixed(2)}</b> short.
                          {' '}Buy MYR with your ETH — then repay below. The suggested amount adds
                          a <b style={{ color: C.tp }}>RM {(topUpAmt - shortage).toFixed(2)}</b> buffer
                          for interest that keeps accruing while you confirm, so you won&apos;t end up
                          a few sen short again.
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                          <Box sx={{ flex: 1, ...innerSx, display: 'flex', alignItems: 'center', gap: 1, py: '9px' }}>
                            <Typography sx={{ fontSize: 13, color: C.ts, fontWeight: 600, flexShrink: 0 }}>RM</Typography>
                            <InputBase
                              type="number"
                              inputProps={nonNegProps}
                              value={buyAmt !== '' ? buyAmt : topUpAmt.toFixed(2)}
                              onChange={e => setBuyAmt(nonNeg(e.target.value))}
                              sx={{ flex: 1, color: C.tp, fontSize: 14, fontWeight: 600, '& input': { p: 0 } }}
                            />
                          </Box>
                          <Button variant="contained" size="small" disabled={isPending}
                            onClick={() => wallet.buyMYR(buyAmt !== '' ? buyAmt : topUpAmt.toFixed(2)).then(ok => { if (ok) setBuyAmt(''); })}
                            sx={{ px: 2.5, py: 1.15, borderRadius: 2, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap',
                              background: `linear-gradient(135deg, ${C.blue}, #4458E8)` }}>
                            Buy MYR →
                          </Button>
                        </Box>
                        <Typography variant="caption" sx={{ color: C.ts }}>
                          ≈ {wallet.ethPriceMYR > 0
                            ? ((parseFloat(buyAmt !== '' ? buyAmt : topUpAmt.toFixed(2)) || topUpAmt) / wallet.ethPriceMYR).toFixed(5)
                            : '…'} ETH · RM {wallet.ethPriceMYR?.toLocaleString()}/ETH
                        </Typography>
                      </Box>
                    )}

                    {/* Step 2 — Repay confirm */}
                    <Box sx={{ p: 2.25, bgcolor: 'rgba(0,0,0,0.15)', borderTop: `1px solid rgba(255,255,255,0.06)` }}>
                      <Typography sx={{ fontSize: 12, color: C.tp, fontWeight: 700, mb: 1.25 }}>
                        {insuffBal ? 'Step 2 — Repay Loan' : 'Confirm Repayment'}
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1.5 }}>
                        {/* Scoped to the ticked plans — repaying them touches ONLY
                            their principal and THEIR OWN accrued interest. */}
                        <Row label={`Principal (${selectedRows.length} plan${selectedRows.length === 1 ? '' : 's'})`}
                          value={hasDue ? `RM ${selectedRows.reduce((s, r) => s + r.principalMYR, 0).toFixed(2)}` : '—'} />
                        <Row label="Their interest"
                          value={hasDue ? `RM ${selectedRows.reduce((s, r) => s + r.interest, 0).toFixed(4)}` : '—'} vc={C.gold} />
                        <Row label="You repay"   value={repayAmtNum > 0 ? `RM ${repayAmtNum.toFixed(2)}` : '—'} vc={C.teal} bold />
                        {repayAmtNum > 0 && hasDue && wallet.loanInfo && (() => {
                          const selInt = selectedRows.reduce((s, r) => s + r.interest, 0);
                          const principalPaid = Math.max(0, repayAmtNum - selInt);
                          const rem = Math.max(0, principal - principalPaid);
                          return repayFull || rem <= 0
                            ? <Row key="hf" label="After repay" value="∞ (fully paid — collateral stays deposited)" vc={C.teal} bold />
                            : <Row key="hf" label="New health factor" value={fmtHF((wallet.loanInfo.collateralValueMYR * 0.8) / rem)} vc={C.teal} />;
                        })()}
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5, mb: 1.5, flexWrap: 'wrap' }}>
                        {(canAutoRepay
                          ? [{ n: '①', lbl: 'Exchange ETH' }, { n: '②', lbl: 'Approve MYR' }, { n: '③', lbl: 'Repay Loan' }]
                          : [{ n: '①', lbl: 'Approve MYR'  }, { n: '②', lbl: 'Repay Loan'  }]
                        ).map((s, i, arr) => (
                          <Box key={s.n} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Box sx={{ px: 1.1, py: 0.4, bgcolor: `${C.teal}10`, border: `1px solid ${C.teal}30`, borderRadius: 1 }}>
                              <Typography sx={{ fontSize: 10.5, color: C.teal, fontWeight: 700 }}>{s.n} {s.lbl}</Typography>
                            </Box>
                            {i < arr.length - 1 && <Typography sx={{ color: C.ts, fontSize: 11 }}>→</Typography>}
                          </Box>
                        ))}
                      </Box>
                      <Button
                        fullWidth variant="contained"
                        disabled={canAutoRepay ? false : !canSubmit}
                        onClick={canAutoRepay ? doAutoTopUp : () => {
                          // Decide the payment plan from the panel state:
                          //  * FULL intent (chip, or all plans ticked untouched)
                          //    → clear every plan, per-loan re-quote on confirm.
                          //  * A typed amount that happens to cover the whole
                          //    selection (1-sen epsilon) is promoted to a full
                          //    settle of those plans — the re-quote path is what
                          //    stops a rounding difference stranding dust.
                          //  * Bill mode → each plan pays its own installment.
                          //  * Anything else → the typed amount, oldest-first
                          //    across the ticked plans.
                          const selDue = selectedTotal;
                          const coversSelection = selDue > 0 && repayAmtNum >= selDue - 0.01;
                          const plan = isFullPayoffIntent
                            ? buildRepayPlan('full')
                            : repayBillMode
                              ? buildRepayPlan('bill')
                              : (!repayAmtEdited || coversSelection)
                                ? buildRepayPlan('settleSelected')
                                : buildRepayPlan('custom', repayAmtNum);
                          if (!plan) return;
                          void wallet.repay(plan.items, { settleFull: plan.settleFull })
                            .then(() => { setRepayAmt(''); setRepayFull(false); setSelectedBorrowIds([]); });
                        }}
                        sx={{ py: 1.65, fontSize: 14, fontWeight: 700, borderRadius: 2.5,
                          background: (canSubmit || canAutoRepay) ? `linear-gradient(135deg, ${C.teal}, #0B8B5E)` : undefined }}>
                        {isPending
                          ? 'Waiting for confirmation…'
                          : canAutoRepay
                            ? `Top Up RM ${topUpAmt.toFixed(2)} + Repay`
                            : insuffBal
                              ? 'Insufficient MYR — Top Up First'
                              : repayFull
                                ? 'Repay Loan in Full'
                                : 'Repay Loan'}
                      </Button>
                    </Box>
                  </Box>
                  )}

                  {repayFull && (
                    <Box sx={{ p: 1.5, bgcolor: `${C.teal}08`, border: `1px solid ${C.teal}25`, borderRadius: 2 }}>
                      <Typography variant="caption" sx={{ color: C.teal, lineHeight: 1.6 }}>
                        Full payoff — the exact amount owed is re-quoted from the contract when you confirm,
                        so interest accrued while you sign is included. You are only ever charged the actual
                        debt, never more, and nothing is left behind.
                      </Typography>
                    </Box>
                  )}

                </Box>
                );
              })()}

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
                        <InputBase type="number" inputProps={nonNegProps} value={buyAmt} onChange={e => setBuyAmt(nonNeg(e.target.value))}
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
            <Row label="Receive as" value="MYR tokens to wallet" />
            <Row label="Interest rate" value={`${effAprPct.toFixed(2)}% APR · locked for this loan`} />
            <Row label={`Est. interest (${loanTermDays}d)`} value={rm(panelInterest, 2)} vc={C.gold} />
            <Row label="Loan term" value={`${loanTermDays} days`} />
            <Row label="Due date"
              value={new Date(chainNow + loanTermDays * 86_400_000).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })} />
            <Row label="Grace period" value="7 days after due date" />
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
              Your ETH stays locked as collateral until the loan is repaid. Part of it can be liquidated
              to cover the debt if your health factor drops below 1.0, or if the loan is still unpaid
              7 days after its due date. Repay before the due date to avoid overdue status.
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
