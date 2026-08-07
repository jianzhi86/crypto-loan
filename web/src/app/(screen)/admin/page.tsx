import Link from 'next/link';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';

import { prisma } from '@/lib/db/prisma';
import { getFlags } from '@/lib/features-server';
import { FLAGS, ON } from '@/lib/features';
import { readChainStats, readChainActivity, readContractBirthMs } from '@/lib/contract-read';
import { supplyApr } from '@/lib/rates';
import { AdminAutoSync } from '@/components/AdminAutoSync';
import { AdminAutoRefresh } from '@/components/AdminAutoRefresh';
import { AdminWithdrawFees } from '@/components/admin/AdminWithdrawFees';
import { ShieldIcon, BoltIcon, PulseIcon, BankIcon } from '@/components/Icons';
import { Badge, C, type Tone } from '@/components/admin/ui';
import { Sparkline, ProtocolAreaChart, ActivityDonut } from '@/components/admin/AdminCharts';

/* ─── Types ───────────────────────────────────────────────────────────────── */
type TxRow = { type: string; amount: string; wallet: string; createdAt: Date };

/**
 * Rows that are extra LEGS of another row's transaction, not transactions of
 * their own. One recovery emits its debt figure, the collateral it took and
 * the penalty it charged — three rows sharing one transaction hash, because
 * each is in different units and feeds a different series. Counting them as
 * three transactions would treble the activity numbers.
 */
const DERIVED_TYPES = new Set(['CollateralSeized', 'LatePenalty']);
const isDerived = (type: string) => DERIVED_TYPES.has(type);

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function rm(n: number) {
  return n >= 1_000_000 ? `RM ${(n / 1_000_000).toFixed(2)}M`
       : n >= 1_000     ? `RM ${(n / 1_000).toFixed(2)}K`
       : `RM ${n.toFixed(2)}`;
}

function pct(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}

/* Sum / count one event type over the deployment's real rows. */
function sumOf(rows: TxRow[], type: string) {
  let s = 0;
  for (const r of rows) if (r.type === type) s += Number(r.amount);
  return s;
}
function countOf(rows: TxRow[], type: string) {
  let c = 0;
  for (const r of rows) if (r.type === type) c++;
  return c;
}

/**
 * REAL monthly series from the deployment's transactions — one point per
 * calendar month from the first recorded transaction to now, cumulative.
 * Nothing is synthesized: a protocol born this month gets a one-month chart,
 * not a fabricated January-to-December curve. Also derives the KPI sparklines
 * from the same cumulative series, so every line on the page traces actual
 * history.
 */
function buildMonthlySeries(rows: TxRow[]) {
  const chart: { month: string; borrowed: number; repaid: number; recovered: number; outstanding: number }[] = [];
  const sparks = { borrowed: [] as number[], txs: [] as number[], wallets: [] as number[], eth: [] as number[] };
  if (rows.length === 0) return { chart, sparks };

  const first = rows[0].createdAt;
  // The last month to draw is whichever is later: real "now", or the newest
  // activity on the chain. On a time-travelled dev chain block timestamps run
  // ahead of the wall clock, and ending at wall time silently dropped every
  // event past it — a recovery executed "in November" simply never appeared,
  // which is why Repaid/Recovered sat at RM 0 after the action succeeded.
  const lastActivity = rows.reduce((m, r) => (r.createdAt > m ? r.createdAt : m), rows[0].createdAt);
  const now  = new Date();
  const end  = lastActivity > now ? lastActivity : now;
  const months: Date[] = [];
  // Start one month BEFORE the first activity: a zero-point baseline, so the
  // chart visibly begins settled at RM 0 instead of a floating single dot.
  // Honest by construction — the protocol genuinely had nothing then.
  const cursor = new Date(first.getFullYear(), first.getMonth() - 1, 1);
  while (cursor <= end) { months.push(new Date(cursor)); cursor.setMonth(cursor.getMonth() + 1); }
  const spansYears = months[0].getFullYear() !== end.getFullYear();

  // cumF ("forced") is debt cleared without the borrower choosing to clear it —
  // a protocol recovery or a liquidator's payout. It settles debt exactly as a
  // repayment does, so it must come off Outstanding, but it is kept as its own
  // series: folding it into Repaid would flatter the repayment rate with debt
  // that was collected by seizing someone's collateral.
  let cumB = 0, cumR = 0, cumF = 0, cumTx = 0, cumEth = 0;
  const wallets = new Set<string>();
  let i = 0;
  for (const m of months) {
    const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    while (i < rows.length && rows[i].createdAt < next) {
      const r = rows[i++];
      if (!isDerived(r.type)) cumTx++;
      wallets.add(r.wallet);
      if (r.type === 'Borrowed')            cumB   += Number(r.amount) / 1e6;
      else if (r.type === 'Repaid')         cumR   += Number(r.amount) / 1e6;
      else if (r.type === 'LoanRecovered' || r.type === 'Liquidated') cumF += Number(r.amount) / 1e6;
      else if (r.type === 'CollateralDeposited') cumEth += Number(r.amount) / 1e18;
      else if (r.type === 'CollateralWithdrawn' || r.type === 'CollateralSeized') cumEth -= Number(r.amount) / 1e18;
    }
    chart.push({
      month: m.toLocaleDateString('en-MY', spansYears ? { month: 'short', year: '2-digit' } : { month: 'short' }),
      borrowed:    Math.round(cumB),
      repaid:      Math.round(cumR),
      recovered:   Math.round(cumF),
      outstanding: Math.round(Math.max(0, cumB - cumR - cumF)),
    });
    sparks.borrowed.push(cumB);
    sparks.txs.push(cumTx);
    sparks.wallets.push(wallets.size);
    sparks.eth.push(cumEth);
  }
  return { chart, sparks };
}

/* Sparkline points from a real cumulative series (a lone month gets a flat
   two-point line rather than an invented trend). */
function sparkFrom(values: number[]) {
  const v = values.length === 0 ? [0, 0] : values.length === 1 ? [values[0], values[0]] : values;
  return v.map(x => ({ v: Math.round(x * 100) / 100 }));
}

/* ─── Route config ────────────────────────────────────────────────────────── */
export const dynamic = 'force-dynamic';

/* ─── Audit tone map ──────────────────────────────────────────────────────── */
const ACTION_TONE: Record<string, Tone> = {
  USER_SUSPEND: 'red',    KYC_DELETE: 'red',   KYC_REJECT: 'red',
  USER_RESTRICT: 'amber', USER_RESET_PASSWORD: 'amber', USER_RESET_KYC: 'amber',
  USER_UNLINK_WALLET: 'amber',
  USER_UNSUSPEND: 'green', USER_UNRESTRICT: 'green', KYC_APPROVE: 'green',
  FLAG_UPDATE: 'blue', USER_SET_ADMIN: 'blue',
  PRICE_SYNC: 'neutral', PROTOCOL_FEES_WITHDRAWN: 'amber',
  LOAN_RECOVERED: 'red', LATE_PENALTY_UPDATED: 'amber',
};

/* ─── Page ────────────────────────────────────────────────────────────────── */
export default async function AdminOverviewPage() {
  // Every transaction figure below comes from the CONNECTED CHAIN'S OWN EVENT
  // LOG (readChainActivity), never from the LoanTransaction mirror. The
  // Supabase DB is shared across every developer's machine while each machine
  // runs its own local chain — the mirror therefore holds other chains'
  // transactions, frequently under the SAME Hardhat default wallets, and no
  // time- or wallet-based filter can separate them. Summing the mirror is
  // what used to show hundreds of millions "borrowed" (and phantom
  // outstanding debt) on a protocol whose chain says zero. The DB is used
  // only as a rough fallback when the node is unreachable, scoped to the
  // current contract's deployment moment.
  const [chainActivity, chainBirthMs] = await Promise.all([
    readChainActivity(),
    readContractBirthMs(),
  ]);

  const [
    users,
    kycPending, kycApproved, kycRejected,
    flags,
    recent, dbTxRows, chain,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.kycSubmission.count({ where: { status: 'pending' } }),
    prisma.kycSubmission.count({ where: { status: 'approved' } }),
    prisma.kycSubmission.count({ where: { status: 'rejected' } }),
    getFlags(),
    prisma.adminAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
    chainActivity
      ? Promise.resolve([])
      : prisma.loanTransaction.findMany({
          where:   { createdAt: { gte: new Date(chainBirthMs ?? 0) } },
          select:  { type: true, amount: true, wallet: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
    readChainStats(),
  ]);

  const txRows: TxRow[] = chainActivity
    ? chainActivity.map(t => ({ type: t.type, amount: t.amount.toString(), wallet: t.wallet.toLowerCase(), createdAt: new Date(t.timestampMs) }))
    : dbTxRows;

  // Latest 7 logical transactions for the "Recent Transactions" card —
  // straight off the chain's event log, newest first. The id carries the TYPE
  // as well as the hash because one transaction legitimately produces several
  // rows: a recovery moves both MYR and ETH, and a full withdrawal emits its
  // supply-interest claim alongside the withdrawal. Keying on the hash alone
  // gave React duplicate keys and let it drop rows.
  const recentTxs = (chainActivity ?? []).slice(-7).reverse()
    .map(t => ({ id: `${t.txHash}:${t.type}`, wallet: t.wallet, type: t.type as string, amount: t.amount.toString() }));

  const stat = {
    total_borrowed:       sumOf(txRows, 'Borrowed'),
    borrow_count:         countOf(txRows, 'Borrowed'),
    total_repaid:         sumOf(txRows, 'Repaid'),
    repay_count:          countOf(txRows, 'Repaid'),
    total_deposited:      sumOf(txRows, 'CollateralDeposited'),
    deposit_count:        countOf(txRows, 'CollateralDeposited'),
    total_withdrawn:      sumOf(txRows, 'CollateralWithdrawn'),
    total_purchased:      sumOf(txRows, 'MYRPurchased'),
    purchase_count:       countOf(txRows, 'MYRPurchased'),
    total_supply_claimed: sumOf(txRows, 'SupplyInterestClaimed'),
    claim_count:          countOf(txRows, 'SupplyInterestClaimed'),
    total_recovered:      sumOf(txRows, 'LoanRecovered') + sumOf(txRows, 'Liquidated'),
    recovery_count:       countOf(txRows, 'LoanRecovered') + countOf(txRows, 'Liquidated'),
    total_seized:         sumOf(txRows, 'CollateralSeized'),
    total_penalty:        sumOf(txRows, 'LatePenalty'),
    unique_wallets:       new Set(txRows.map(r => r.wallet)).size,
  };

  const totalBorrowedMYR     = stat.total_borrowed  / 1e6;
  const totalRepaidMYR       = stat.total_repaid    / 1e6;
  // Debt collected by seizing collateral rather than by the borrower paying.
  const totalRecoveredMYR    = stat.total_recovered / 1e6;
  const totalSeizedEth       = stat.total_seized    / 1e18;
  // Late-penalty revenue. This is NOT part of protocolFees: a recovery settles
  // in ETH, and protocolFees is an MYR balance the contract must actually hold
  // to pay out, so crediting it there would leave withdrawProtocolFees()
  // promising MYR that was never received. The value arrives as ETH in the
  // owner's wallet instead — surfaced here so it stops looking like zero.
  const totalPenaltyMYR      = stat.total_penalty   / 1e6;
  // Outstanding debt is the CONTRACT's live figure, not DB arithmetic — the
  // chain is what actually says whether anything is still owed.
  const netOutstandingMYR    = chain ? chain.totalBorrowedMYR
    : Math.max(0, totalBorrowedMYR - totalRepaidMYR - totalRecoveredMYR);
  const totalDepositedEth    = stat.total_deposited / 1e18;
  const totalWithdrawnEth    = stat.total_withdrawn / 1e18;
  const netLockedEth         = chain ? chain.totalCollateralETH
    : totalDepositedEth - totalWithdrawnEth - totalSeizedEth;
  const totalTxs             = txRows.filter(r => !isDerived(r.type)).length;
  const totalSupplyClaimedMYR = stat.total_supply_claimed / 1e6;

  const repaymentRate  = pct(totalRepaidMYR, totalBorrowedMYR);
  const lockRate       = pct(netLockedEth, totalDepositedEth);
  const kycApproveRate = pct(kycApproved, kycApproved + kycRejected);
  const kycRate        = pct(kycApproved, users);

  // On-chain live rates (null when node is unreachable)
  const liveAprPct   = chain ? chain.aprBps / 100 : null;
  const baseAprPct   = chain ? chain.baseRateBps / 100 : null;
  const ethSupplyApr = liveAprPct ? supplyApr(liveAprPct, 0.38) : null;

  // Supply interest projections from on-chain state
  const supplyRatePct       = chain ? chain.supplyRateBps / 100 : null;
  const collatValueMYR      = chain ? chain.totalCollateralETH * chain.ethPriceMYR : 0;
  const dailySupplyPayout   = supplyRatePct != null ? collatValueMYR * (supplyRatePct / 100) / 365 : null;
  const monthlySupplyPayout = dailySupplyPayout != null ? dailySupplyPayout * 30 : null;
  const yearlySupplyPayout  = dailySupplyPayout != null ? dailySupplyPayout * 365 : null;
  const earnRatioPct        = liveAprPct && ethSupplyApr ? Math.round((ethSupplyApr / liveAprPct) * 100) : 38;

  const paused = FLAGS.filter(f => (flags[f.key]?.state ?? ON) !== ON);

  const ETH_COLOR = '#627EEA';

  const donutData = [
    { name: 'Borrows',     value: stat.borrow_count,   color: C.green   },
    { name: 'Repays',      value: stat.repay_count,     color: ETH_COLOR },
    { name: 'Deposits',    value: stat.deposit_count,   color: C.amber   },
    { name: 'Earn Claims', value: stat.claim_count,     color: '#2BD9A2' },
    { name: 'Purchases',   value: stat.purchase_count,  color: '#9B7DFF' },
    { name: 'Recoveries',  value: stat.recovery_count,  color: C.red     },
  ].filter(d => d.value > 0);

  /* ── Real cumulative series for the chart + KPI sparklines ─ */
  const { chart: chartData, sparks } = buildMonthlySeries(txRows);

  /* ── KPI tiles — every figure from this deployment's real rows or the live
        contract; every sparkline traces the same real cumulative history ─ */
  const kpiCards = [
    {
      label:   'Total MYR Borrowed',
      value:   rm(totalBorrowedMYR),
      sub:     `Outstanding now (on-chain): ${rm(netOutstandingMYR)}`,
      color:   C.green,
      spark:   sparkFrom(sparks.borrowed),
      icon:    '₱',
      href:    '/explorer',
    },
    {
      label:   'Unique Wallets',
      value:   String(stat.unique_wallets),
      sub:     `${users} registered users`,
      color:   ETH_COLOR,
      spark:   sparkFrom(sparks.wallets),
      icon:    '◎',
      href:    '/admin/users',
    },
    {
      label:   'Total Transactions',
      value:   String(totalTxs),
      sub:     `${stat.borrow_count} borrows · ${stat.repay_count} repays`,
      color:   '#9B7DFF',
      spark:   sparkFrom(sparks.txs),
      icon:    '⇄',
      href:    '/explorer',
    },
    {
      label:   'ETH Locked',
      value:   netLockedEth >= 1000 ? `${(netLockedEth / 1000).toFixed(2)}K` : netLockedEth.toFixed(2),
      sub:     chain ? 'on-chain collateral, live' : `${lockRate}% of deposited ETH`,
      color:   C.amber,
      spark:   sparkFrom(sparks.eth),
      icon:    'Ξ',
      href:    '/explorer',
    },
  ];

  /* ── Protocol health goals ─ */
  const goals = [
    // Repayment rate stays voluntary-only on purpose: debt collected by seizing
    // collateral is a recovery, not a borrower repaying, and rolling it in here
    // would make a protocol that keeps liquidating people look healthy.
    { label: 'Repayment Rate',   value: repaymentRate,  color: C.green,
      hint: totalRecoveredMYR > 0
        ? `${rm(totalRepaidMYR)} of ${rm(totalBorrowedMYR)} · ${rm(totalRecoveredMYR)} recovered`
        : `${rm(totalRepaidMYR)} of ${rm(totalBorrowedMYR)}` },
    { label: 'Collateral Lock',  value: lockRate,        color: ETH_COLOR, hint: `${netLockedEth.toFixed(2)} ETH net locked` },
    { label: 'KYC Approval',     value: kycApproveRate,  color: C.amber,   hint: `${kycApproved} approved of ${kycApproved + kycRejected}` },
    { label: 'User KYC Rate',    value: kycRate,         color: '#9B7DFF', hint: `${kycApproved} of ${users} users` },
  ];

  /* ── Tx type display ─ */
  const TX_META: Record<string, { label: string; color: string }> = {
    Borrowed:               { label: 'Borrow',     color: C.green   },
    Repaid:                 { label: 'Repay',       color: ETH_COLOR },
    CollateralDeposited:    { label: 'Deposit',     color: C.amber   },
    CollateralWithdrawn:    { label: 'Withdraw',    color: C.red     },
    MYRPurchased:           { label: 'MYR Buy',     color: '#9B7DFF' },
    SupplyInterestClaimed:  { label: 'Earn Claim',  color: '#2BD9A2' },
    LoanRecovered:          { label: 'Recovery',    color: C.red     },
    Liquidated:             { label: 'Liquidation', color: C.red     },
    CollateralSeized:       { label: 'Seized',      color: C.red     },
    LatePenalty:            { label: 'Late Fee',    color: C.amber   },
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: '#080E1F', minHeight: '100vh' }}>
      {/* Without this the whole page — chart included — was frozen at whatever
          the server rendered when you first navigated here, so a repay or a
          seizure never showed up until a manual reload. 30s rather than the
          KYC page's 10s: every pass re-reads the chain's full event log. */}
      <AdminAutoRefresh intervalMs={30000} />
      <Box sx={{ maxWidth: 1440, mx: 'auto' }}>

        {/* ── Page header ──────────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 3 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: C.ink, fontSize: 22 }}>
              Protocol Dashboard
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: C.muted, mt: 0.4 }}>
              {new Date().toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              {' · '}transactions from this chain&apos;s event log · identity from Supabase
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            {kycPending > 0 && (
              <Link href="/admin/kyc" style={{ textDecoration: 'none' }}>
                <Box sx={{
                  px: 1.5, py: 0.6, borderRadius: 2, cursor: 'pointer',
                  bgcolor: '#0B3D91', border: '1px solid #0B3D91',
                  boxShadow: '0 0 12px rgba(11,61,145,0.5)',
                  display: 'flex', alignItems: 'center', gap: 0.75,
                  animation: 'kycPendingGlow 2s ease-in-out infinite',
                  '@keyframes kycPendingGlow': {
                    '0%, 100%': { boxShadow: '0 0 6px rgba(11,61,145,0.35)' },
                    '50%':      { boxShadow: '0 0 16px rgba(11,61,145,0.8)' },
                  },
                  '&:hover': { bgcolor: '#0E4CB5' },
                }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#fff', boxShadow: '0 0 6px #fff' }} />
                  <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>
                    {kycPending} KYC pending
                  </Typography>
                </Box>
              </Link>
            )}
            <AdminAutoSync />
          </Box>
        </Box>

        {/* ── Company Treasury — actual on-chain holdings, not bookkeeping counters.
            contractEthBalanceETH reads provider.getBalance() directly, and
            myrTotalSupplyMYR reads myr.totalSupply() — both live queries, so
            this reflects a deposit/borrow/repay the instant it confirms, no
            separate "add to balance" step. The reconciliation line below is a
            trust check: totalCollateralETH (the contract's internal counter)
            should always equal the wallet's real ETH balance. ── */}
        <Card sx={{
          mb: 3, borderRadius: 3, boxShadow: 'none', overflow: 'hidden',
          border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.blue}`,
          background: 'linear-gradient(135deg, rgba(110,139,255,0.06) 0%, #0D1628 55%)',
        }}>
          <Box sx={{ px: 2.5, pt: 2, pb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ color: C.blue }}><BankIcon size={16} /></Box>
              <Typography sx={{ fontWeight: 700, fontSize: 15, color: C.ink }}>Company Treasury</Typography>
              <Typography sx={{ fontSize: 11, color: C.muted }}>— what the protocol actually holds right now</Typography>
            </Box>
            {chain && (() => {
              // buyMYR() sells MYR for ETH that stays at the contract without
              // touching totalCollateral, so a SURPLUS over the collateral
              // counter is normal revenue, not a discrepancy. The only alarming
              // state is a deficit: less ETH held than depositors are owed.
              const surplus = chain.contractEthBalanceETH - chain.totalCollateralETH;
              const deficit = surplus < -0.0001;
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: deficit ? C.red : C.green }} />
                  <Typography sx={{ fontSize: 10, color: deficit ? C.red : C.muted }}>
                    {deficit
                      ? `Holds ${Math.abs(surplus).toFixed(4)} ETH LESS than depositors are owed — investigate`
                      : surplus > 0.0001
                        ? `Balance covers all collateral (+${surplus.toFixed(4)} ETH revenue from MYR sales)`
                        : 'Balance reconciles with contract state'}
                  </Typography>
                </Box>
              );
            })()}
          </Box>

          <Divider sx={{ borderColor: C.border }} />

          {chain ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', md: 'repeat(4,1fr)' } }}>
              <Box sx={{ px: 2.5, py: 2 }}>
                <Typography sx={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.5 }}>
                  ETH Balance
                </Typography>
                <Typography sx={{ fontSize: 24, fontWeight: 800, color: '#627EEA', lineHeight: 1.1, letterSpacing: -0.4 }}>
                  {chain.contractEthBalanceETH.toFixed(4)} <Typography component="span" sx={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>ETH</Typography>
                </Typography>
                <Typography sx={{ fontSize: 11, color: C.muted, mt: 0.4 }}>
                  ≈ {rm(chain.contractEthBalanceETH * chain.ethPriceMYR)} · live wallet balance
                </Typography>
              </Box>
              <Box sx={{ px: 2.5, py: 2, borderLeft: { sm: `1px solid ${C.border}` }, borderTop: { xs: `1px solid ${C.border}`, sm: 'none' } }}>
                <Typography sx={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.5 }}>
                  MYR in Circulation
                </Typography>
                <Typography sx={{ fontSize: 24, fontWeight: 800, color: C.ink, lineHeight: 1.1, letterSpacing: -0.4 }}>
                  {rm(chain.myrTotalSupplyMYR)}
                </Typography>
                <Typography sx={{ fontSize: 11, color: C.muted, mt: 0.4 }}>
                  Total ever minted · borrows + purchases + earn claims
                </Typography>
              </Box>
              <Box sx={{ px: 2.5, py: 2, borderLeft: { md: `1px solid ${C.border}` }, borderTop: { xs: `1px solid ${C.border}`, md: 'none' } }}>
                <Typography sx={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.5 }}>
                  Today&apos;s Borrow APR
                </Typography>
                <Typography sx={{ fontSize: 24, fontWeight: 800, color: C.green, lineHeight: 1.1, letterSpacing: -0.4 }}>
                  {liveAprPct!.toFixed(2)}%
                </Typography>
                <Typography sx={{ fontSize: 11, color: C.muted, mt: 0.4 }}>
                  {rm(chain.totalBorrowedMYR)} currently borrowed
                </Typography>
              </Box>
              <Box sx={{
                px: 2.5, py: 2, borderLeft: { sm: `1px solid ${C.border}` }, borderTop: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5,
                gridColumn: { xs: '1', sm: '2', md: '4' },
              }}>
                <Box>
                  <Typography sx={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.5 }}>
                    Protocol Fees (withdrawable)
                  </Typography>
                  <Typography sx={{ fontSize: 24, fontWeight: 800, color: C.amber, lineHeight: 1.1, letterSpacing: -0.4 }}>
                    {rm(chain.protocolFeesMYR)}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: C.muted, mt: 0.4 }}>
                    All interest + late penalties earned, not yet swept
                  </Typography>
                  {/* The ETH leg is a separate ledger from the MYR fee balance,
                      so say where it went rather than letting the two blur. */}
                  {totalSeizedEth > 0 && (
                    <Typography sx={{ fontSize: 10.5, color: C.slate, mt: 0.9, lineHeight: 1.55 }}>
                      Includes{' '}
                      <b style={{ color: C.amber }}>{rm(totalPenaltyMYR)}</b> of late-penalty revenue
                      {totalPenaltyMYR === 0 && ' (no overdue recovery yet — the health-factor path charges none)'}.
                      Recoveries also returned{' '}
                      <b style={{ color: C.ink }}>{totalSeizedEth.toFixed(4)} ETH</b> of seized
                      collateral to the owner wallet as recovered capital.
                    </Typography>
                  )}
                </Box>
                <AdminWithdrawFees feesMYR={chain.protocolFeesMYR} ownerAddress={chain.ownerAddress} />
              </Box>
            </Box>
          ) : (
            <Box sx={{ px: 2.5, py: 2 }}>
              <Typography sx={{ fontSize: 13, color: C.muted }}>
                Treasury data unavailable — the local Hardhat node is not reachable. Start it with <code>npm run chain</code>.
              </Typography>
            </Box>
          )}
        </Card>

        {/* ── KPI cards row ─────────────────────────────────────────────── */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', lg: 'repeat(4,1fr)' }, gap: 2, mb: 3 }}>
          {kpiCards.map(k => (
            <Link key={k.label} href={k.href} style={{ textDecoration: 'none' }}>
              <Card sx={{
                p: 0, border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none',
                bgcolor: '#0D1628', overflow: 'hidden',
                transition: 'border-color .15s, transform .15s',
                '&:hover': { borderColor: k.color, transform: 'translateY(-2px)' },
              }}>
                <Box sx={{ px: 2.5, pt: 2.5, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.7, mb: 0.75 }}>
                      {k.label}
                    </Typography>
                    <Typography sx={{ fontSize: 26, fontWeight: 800, color: C.ink, lineHeight: 1.1, letterSpacing: -0.5 }}>
                      {k.value}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: C.muted, mt: 0.4 }}>{k.sub}</Typography>
                  </Box>
                  <Box sx={{
                    width: 40, height: 40, borderRadius: 2, flexShrink: 0,
                    bgcolor: `${k.color}18`, border: `1px solid ${k.color}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Typography sx={{ fontSize: 18, color: k.color, lineHeight: 1 }}>{k.icon}</Typography>
                  </Box>
                </Box>
                <Sparkline data={k.spark} color={k.color} />
              </Card>
            </Link>
          ))}
        </Box>

        {/* ── Live on-chain rates ───────────────────────────────────────── */}
        <Card sx={{ mb: 3, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.green}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#0D1628', overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, pt: 2, pb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ color: chain?.paused ? C.amber : C.green }}><PulseIcon size={15} /></Box>
              <Typography sx={{ fontWeight: 700, fontSize: 14, color: C.ink }}>Live On-Chain Rates</Typography>
              {chain ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: 1, bgcolor: chain.paused ? `${C.amber}15` : `${C.green}12`, border: `1px solid ${chain.paused ? C.amber : C.green}30` }}>
                  <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: chain.paused ? C.amber : C.green }} />
                  <Typography sx={{ fontSize: 10, fontWeight: 700, color: chain.paused ? C.amber : C.green }}>
                    {chain.paused ? 'PAUSED' : 'LIVE'}
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: `${C.red}15`, border: `1px solid ${C.red}30` }}>
                  <Typography sx={{ fontSize: 10, fontWeight: 700, color: C.red }}>NODE OFFLINE</Typography>
                </Box>
              )}
            </Box>
            <Typography sx={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>
              {chain ? `ETH: RM ${chain.ethPriceMYR.toLocaleString('en-MY')} · from contract` : 'Cannot reach local node'}
            </Typography>
          </Box>

          <Divider sx={{ borderColor: C.border }} />

          {chain ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(3,1fr)', md: 'repeat(6,1fr)' } }}>
              {[
                { label: 'Borrow APR (ETH)',  value: `${liveAprPct!.toFixed(2)}%`,   color: C.green,  sub: `base ${baseAprPct!.toFixed(2)}%`    },
                { label: 'Supply APR (ETH)',  value: `${ethSupplyApr!.toFixed(2)}%`,  color: '#2BD9A2', sub: '38% of borrow'                     },
                { label: 'ETH Price',         value: `RM ${chain.ethPriceMYR.toLocaleString('en-MY')}`, color: '#627EEA', sub: 'on-chain'        },
                { label: 'On-chain Borrowed', value: rm(chain.totalBorrowedMYR),      color: C.ink,    sub: 'contract state'                     },
                { label: 'Collateral',        value: `${chain.totalCollateralETH.toFixed(2)} ETH`, color: C.ink, sub: 'contract state'           },
                { label: 'Protocol Fees',     value: rm(chain.protocolFeesMYR),       color: C.amber,  sub: 'unclaimed'                          },
              ].map((s, i) => (
                <Box key={s.label} sx={{
                  px: 2.5, py: 1.75,
                  borderLeft: i > 0 ? `1px solid ${C.border}` : 'none',
                  borderTop: { xs: i > 1 ? `1px solid ${C.border}` : 'none', sm: i > 3 ? `1px solid ${C.border}` : 'none', md: 'none' },
                }}>
                  <Typography sx={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.5 }}>{s.label}</Typography>
                  <Typography sx={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1.1, letterSpacing: -0.3 }}>{s.value}</Typography>
                  <Typography sx={{ fontSize: 10.5, color: C.muted, mt: 0.25 }}>{s.sub}</Typography>
                </Box>
              ))}
            </Box>
          ) : (
            <Box sx={{ px: 2.5, py: 2 }}>
              <Typography sx={{ fontSize: 13, color: C.muted }}>
                APR data unavailable — the local Hardhat node is not reachable at <code>{process.env.NEXT_PUBLIC_RPC_URL ?? 'http://127.0.0.1:8545'}</code>.
                Start the node with <code>npm run node</code> to see live rates.
              </Typography>
            </Box>
          )}
        </Card>

        {/* ── Lending Pool (cap / remaining / utilisation) ──────────────── */}
        <Card sx={{ mb: 3, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.blue}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#0D1628', overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, pt: 2, pb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ color: C.blue }}><BankIcon size={15} /></Box>
              <Typography sx={{ fontWeight: 700, fontSize: 14, color: C.ink }}>Lending Pool</Typography>
              <Box sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: `${C.blue}15`, border: `1px solid ${C.blue}30` }}>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: C.blue }}>ON-CHAIN CAP</Typography>
              </Box>
            </Box>
            <Typography sx={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>
              {chain ? 'borrow() refuses past the cap · utilisation prices the premium' : 'Cannot reach local node'}
            </Typography>
          </Box>

          <Divider sx={{ borderColor: C.border }} />

          {chain ? (() => {
            const utilPct    = chain.utilizationBps / 100;
            const premiumPct = chain.utilPremiumBps / 100;
            // Amber past half the pool, red once it is nearly exhausted — the
            // point at which "how much is left" stops being a curiosity.
            const headroomColor = utilPct >= 90 ? C.red : utilPct >= 75 ? C.amber : C.green;
            return (
              <>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(3,1fr)', md: 'repeat(5,1fr)' } }}>
                  {[
                    { label: 'Pool Cap',            value: rm(chain.supplyCapMYR),     color: C.ink,        sub: 'owner-settable ceiling' },
                    { label: 'Borrowed',            value: rm(chain.totalBorrowedMYR), color: C.ink,        sub: `${utilPct.toFixed(2)}% of cap` },
                    { label: 'Remaining to Lend',   value: rm(chain.poolAvailableMYR), color: headroomColor, sub: 'available before the cap' },
                    { label: 'Utilisation',         value: `${utilPct.toFixed(2)}%`,   color: headroomColor, sub: 'drives the borrow premium' },
                    { label: 'Utilisation Premium', value: `+${premiumPct.toFixed(2)}%`, color: C.amber,    sub: `base ${baseAprPct!.toFixed(2)}% → ${liveAprPct!.toFixed(2)}% effective` },
                  ].map((s, i) => (
                    <Box key={s.label} sx={{
                      px: 2.5, py: 1.75,
                      borderLeft: i > 0 ? `1px solid ${C.border}` : 'none',
                      borderTop: { xs: i > 1 ? `1px solid ${C.border}` : 'none', sm: i > 2 ? `1px solid ${C.border}` : 'none', md: 'none' },
                    }}>
                      <Typography sx={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.5 }}>{s.label}</Typography>
                      <Typography sx={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1.1, letterSpacing: -0.3 }}>{s.value}</Typography>
                      <Typography sx={{ fontSize: 10.5, color: C.muted, mt: 0.25 }}>{s.sub}</Typography>
                    </Box>
                  ))}
                </Box>
                <Box sx={{ px: 2.5, py: 1.75, borderTop: `1px solid ${C.border}` }}>
                  <LinearProgress
                    variant="determinate" value={Math.min(100, utilPct)}
                    sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.07)',
                          '& .MuiLinearProgress-bar': { borderRadius: 3, bgcolor: headroomColor } }} />
                  <Typography sx={{ fontSize: 11, color: C.muted, mt: 0.75 }}>
                    {rm(chain.poolAvailableMYR)} of {rm(chain.supplyCapMYR)} still lendable.
                    Every 25% of the pool consumed adds roughly +1.00% to the borrow APR, capped at 15%.
                  </Typography>
                </Box>
              </>
            );
          })() : (
            <Box sx={{ px: 2.5, py: 2 }}>
              <Typography sx={{ fontSize: 13, color: C.muted }}>
                Pool data unavailable — the local Hardhat node is not reachable.
              </Typography>
            </Box>
          )}
        </Card>

        {/* ── Supply Interest (Earn APR) section ───────────────────────── */}
        <Card sx={{ mb: 3, border: `1px solid ${C.border}`, borderLeft: `3px solid #2BD9A2`, borderRadius: 3, boxShadow: 'none', bgcolor: '#0D1628', overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, pt: 2, pb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ color: '#2BD9A2' }}><BoltIcon size={15} /></Box>
              <Typography sx={{ fontWeight: 700, fontSize: 14, color: C.ink }}>Supply Interest (Earn APR)</Typography>
              <Box sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: 'rgba(43,217,162,0.12)', border: '1px solid rgba(43,217,162,0.3)' }}>
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#2BD9A2' }}>
                  {supplyRatePct != null ? `${supplyRatePct.toFixed(2)}% APR` : '—'} · paid to depositors
                </Typography>
              </Box>
            </Box>
            <Typography sx={{ fontSize: 11, color: C.muted }}>
              Rate = {baseAprPct != null ? `${baseAprPct.toFixed(2)}%` : '—'} borrow APR × 38% · auto-follows market hourly
            </Typography>
          </Box>

          <Divider sx={{ borderColor: C.border }} />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(3,1fr)', md: 'repeat(6,1fr)' } }}>
            {[
              {
                label: 'Current Earn APR',
                value: supplyRatePct != null ? `${supplyRatePct.toFixed(2)}%` : '—',
                sub:   liveAprPct != null ? `${earnRatioPct}% of ${liveAprPct.toFixed(2)}% borrow` : 'node offline',
                color: '#2BD9A2',
              },
              {
                label: 'Daily Payout (proj.)',
                value: dailySupplyPayout != null ? rm(dailySupplyPayout) : '—',
                sub:   collatValueMYR > 0 ? `on ${rm(collatValueMYR)} collateral` : 'no collateral',
                color: C.ink,
              },
              {
                label: 'Monthly Payout (proj.)',
                value: monthlySupplyPayout != null ? rm(monthlySupplyPayout) : '—',
                sub:   'estimated 30-day cost',
                color: C.ink,
              },
              {
                label: 'Yearly Payout (proj.)',
                value: yearlySupplyPayout != null ? rm(yearlySupplyPayout) : '—',
                sub:   'estimated annual cost',
                color: C.amber,
              },
              {
                label: 'Total Paid Out',
                value: rm(totalSupplyClaimedMYR),
                sub:   `${stat.claim_count} claim${stat.claim_count === 1 ? '' : 's'}`,
                color: '#2BD9A2',
              },
              {
                label: 'Protocol Fees (pool)',
                value: chain ? rm(chain.protocolFeesMYR) : '—',
                sub:   'borrow interest collected',
                color: C.amber,
              },
            ].map((s, i) => (
              <Box key={s.label} sx={{
                px: 2.5, py: 1.75,
                borderLeft: i > 0 ? `1px solid ${C.border}` : 'none',
                borderTop: { xs: i > 1 ? `1px solid ${C.border}` : 'none', sm: i > 2 ? `1px solid ${C.border}` : 'none', md: 'none' },
              }}>
                <Typography sx={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.5 }}>{s.label}</Typography>
                <Typography sx={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1.1, letterSpacing: -0.3 }}>{s.value}</Typography>
                <Typography sx={{ fontSize: 10.5, color: C.muted, mt: 0.25 }}>{s.sub}</Typography>
              </Box>
            ))}
          </Box>

          {/* Earn / borrow ratio bar */}
          <Box sx={{ px: 2.5, py: 1.75, borderTop: `1px solid ${C.border}` }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
              <Typography sx={{ fontSize: 11, color: C.muted }}>
                Earn / Borrow spread — {earnRatioPct}% of borrow revenue allocated to supply rewards
              </Typography>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#2BD9A2' }}>
                {supplyRatePct != null ? `${supplyRatePct.toFixed(2)}%` : '—'} earn  ·  {liveAprPct != null ? `${(liveAprPct - (supplyRatePct ?? 0)).toFixed(2)}%` : '—'} protocol margin
              </Typography>
            </Box>
            <Box sx={{ height: 8, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.06)', overflow: 'hidden', display: 'flex' }}>
              <Box sx={{ width: `${earnRatioPct}%`, bgcolor: '#2BD9A2', borderRadius: '999px 0 0 999px', transition: 'width .4s' }} />
              <Box sx={{ flex: 1, bgcolor: C.amber, borderRadius: '0 999px 999px 0' }} />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
              <Typography sx={{ fontSize: 10, color: '#2BD9A2' }}>Supply reward ({earnRatioPct}%)</Typography>
              <Typography sx={{ fontSize: 10, color: C.amber }}>Protocol margin ({100 - earnRatioPct}%)</Typography>
            </Box>
          </Box>
        </Card>

        {/* ── Middle row: area chart + sidebar ─────────────────────────── */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 340px' }, gap: 2, mb: 3 }}>

          {/* Overview area chart */}
          <Card sx={{ p: 2.5, border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#0D1628' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2.5, flexWrap: 'wrap', gap: 1 }}>
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: 15, color: C.ink }}>Protocol Overview</Typography>
                <Typography sx={{ fontSize: 11.5, color: C.muted, mt: 0.25 }}>
                  Monthly MYR volume · cumulative · real activity since this chain deployment
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 2.5 }}>
                {[
                  { label: 'Borrowed',    color: C.green   },
                  { label: 'Repaid',      color: ETH_COLOR },
                  { label: 'Recovered',   color: C.red     },
                  { label: 'Outstanding', color: C.amber   },
                ].map(l => (
                  <Box key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 24, height: 3, borderRadius: 2, bgcolor: l.color }} />
                    <Typography sx={{ fontSize: 11, color: C.muted }}>{l.label}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
            {chartData.length > 0 ? (
              <ProtocolAreaChart data={chartData} />
            ) : (
              <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography sx={{ fontSize: 13, color: C.muted }}>
                  No transactions on this deployment yet — the chart fills in as real activity happens.
                </Typography>
              </Box>
            )}
          </Card>

          {/* Sidebar: donut + goals */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

            {/* Activity donut */}
            <Card sx={{ p: 2.5, border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#0D1628', flex: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 14, color: C.ink, mb: 0.25 }}>Activity Breakdown</Typography>
              <Typography sx={{ fontSize: 11, color: C.muted, mb: 1.5 }}>Transaction type distribution</Typography>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                {donutData.length > 0
                  ? <ActivityDonut data={donutData} center={String(totalTxs)} />
                  : <Typography sx={{ color: C.muted, py: 3, fontSize: 13 }}>No transactions yet</Typography>
                }
              </Box>
            </Card>

            {/* Protocol health goals */}
            <Card sx={{ p: 2.5, border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#0D1628', flex: 1 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 14, color: C.ink, mb: 0.25 }}>Protocol Health</Typography>
              <Typography sx={{ fontSize: 11, color: C.muted, mb: 2 }}>Key performance metrics</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {goals.map(g => (
                  <Box key={g.label}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.6 }}>
                      <Typography sx={{ fontSize: 12, color: C.slate }}>{g.label}</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: g.color }}>{g.value}%</Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate" value={g.value}
                      sx={{
                        height: 6, borderRadius: 3,
                        bgcolor: 'rgba(255,255,255,0.07)',
                        '& .MuiLinearProgress-bar': { bgcolor: g.color, borderRadius: 3 },
                      }}
                    />
                    <Typography sx={{ fontSize: 10, color: C.muted, mt: 0.4 }}>{g.hint}</Typography>
                  </Box>
                ))}
              </Box>
            </Card>

          </Box>
        </Box>

        {/* ── Bottom row: recent txs + activity feed ───────────────────── */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2.5 }}>

          {/* Recent transactions table */}
          <Card sx={{ border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#0D1628', overflow: 'hidden' }}>
            <Box sx={{ px: 2.5, pt: 2.25, pb: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: 14, color: C.ink }}>Recent Transactions</Typography>
                <Typography sx={{ fontSize: 11, color: C.muted }}>Latest on-chain activity</Typography>
              </Box>
              <Link href="/explorer" style={{ color: C.blue, fontSize: 12, textDecoration: 'none' }}>
                View all in Explorer →
              </Link>
            </Box>
            <Divider sx={{ borderColor: C.border }} />

            {/* Table header */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px', px: 2.5, py: 1 }}>
              {['Wallet', 'Type', 'Amount'].map(h => (
                <Typography key={h} sx={{ fontSize: 10.5, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {h}
                </Typography>
              ))}
            </Box>
            <Divider sx={{ borderColor: C.border }} />

            {recentTxs.length === 0 ? (
              <Typography sx={{ color: C.muted, p: 2.5, fontSize: 13 }}>No transactions yet.</Typography>
            ) : (
              recentTxs.map((tx, i) => {
                const meta = TX_META[tx.type] ?? { label: tx.type, color: C.muted };
                const amountMYR  = tx.type === 'Borrowed' || tx.type === 'Repaid' || tx.type === 'MYRPurchased'
                  ? `RM ${(Number(tx.amount) / 1e6).toFixed(2)}`
                  : `${(Number(tx.amount) / 1e18).toFixed(4)} ETH`;
                return (
                  <Box key={tx.id}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px', px: 2.5, py: 1.25, alignItems: 'center', '&:hover': { bgcolor: 'rgba(255,255,255,0.025)' } }}>
                      <Typography sx={{ fontSize: 12, color: C.slate, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', pr: 1 }}>
                        {tx.wallet?.slice(0, 6)}…{tx.wallet?.slice(-4)}
                      </Typography>
                      <Box sx={{ display: 'inline-flex' }}>
                        <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: `${meta.color}18`, border: `1px solid ${meta.color}30` }}>
                          <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: meta.color, whiteSpace: 'nowrap' }}>
                            {meta.label}
                          </Typography>
                        </Box>
                      </Box>
                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.ink, fontFamily: 'monospace', textAlign: 'right' }}>
                        {amountMYR}
                      </Typography>
                    </Box>
                    {i < recentTxs.length - 1 && <Divider sx={{ borderColor: C.border }} />}
                  </Box>
                );
              })
            )}
          </Card>

          {/* Admin activity feed */}
          <Card sx={{ border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#0D1628', overflow: 'hidden' }}>
            <Box sx={{ px: 2.5, pt: 2.25, pb: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: 14, color: C.ink }}>Recent Activity</Typography>
                <Typography sx={{ fontSize: 11, color: C.muted }}>Latest admin actions from your team</Typography>
              </Box>
              <Link href="/admin/audit" style={{ color: C.blue, fontSize: 12, textDecoration: 'none' }}>
                View all →
              </Link>
            </Box>
            <Divider sx={{ borderColor: C.border }} />

            {recent.length === 0 ? (
              <Typography sx={{ color: C.muted, p: 2.5, fontSize: 13 }}>No admin actions recorded yet.</Typography>
            ) : (
              recent.map((e, i) => {
                const tone = ACTION_TONE[e.action] ?? 'neutral';
                const dotColors: Record<string, string> = { red: C.red, amber: C.amber, green: C.green, blue: C.blue, neutral: C.muted };
                return (
                  <Box key={e.id}>
                    <Box sx={{ px: 2.5, py: 1.5, display: 'flex', gap: 1.5, alignItems: 'flex-start', '&:hover': { bgcolor: 'rgba(255,255,255,0.025)' } }}>
                      {/* Dot avatar */}
                      <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: `${dotColors[tone] ?? C.muted}18`, border: `1px solid ${dotColors[tone] ?? C.muted}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.25 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dotColors[tone] ?? C.muted }} />
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 0.3 }}>
                          <Badge label={e.action.replace(/_/g, ' ').toLowerCase()} tone={tone} />
                          <Typography sx={{ fontSize: 10.5, color: C.muted, whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                            {new Date(e.createdAt).toLocaleString('en-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        </Box>
                        <Typography sx={{ fontSize: 11, color: C.muted, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.actorEmail ?? e.actorId.slice(0, 28) + '…'}
                        </Typography>
                      </Box>
                    </Box>
                    {i < recent.length - 1 && <Divider sx={{ borderColor: C.border }} />}
                  </Box>
                );
              })
            )}
          </Card>
        </Box>

        {/* ── Feature status + permissions notice ───────────────────────── */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>

          <Card sx={{ p: 2.5, border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#0D1628' }}>
            <Typography sx={{ fontWeight: 700, fontSize: 13, color: C.ink, mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Feature Status
            </Typography>
            {paused.length === 0 ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: C.green, boxShadow: `0 0 0 3px ${C.green}30` }} />
                <Typography sx={{ fontSize: 13, color: C.slate }}>
                  All features active.{' '}
                  <Link href="/admin/features" style={{ color: C.blue }}>Manage →</Link>
                </Typography>
              </Box>
            ) : (
              <>
                {paused.map(f => (
                  <Box key={f.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.6 }}>
                    <Badge label={flags[f.key]?.state === 'HIDDEN' ? 'hidden' : 'maintenance'} tone={flags[f.key]?.state === 'HIDDEN' ? 'neutral' : 'amber'} />
                    <Typography sx={{ fontSize: 13, color: C.ink }}>{f.label}</Typography>
                  </Box>
                ))}
                <Link href="/admin/features" style={{ color: C.blue, fontSize: 13 }}>Manage features →</Link>
              </>
            )}
          </Card>

          <Card sx={{ p: 2.5, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.blue}`, borderRadius: 3, boxShadow: 'none', bgcolor: 'rgba(110,139,255,0.04)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
              <ShieldIcon size={14} />
              <Typography sx={{ fontWeight: 700, fontSize: 13, color: C.ink }}>Scope of control</Typography>
            </Box>
            <Typography sx={{ color: C.slate, fontSize: 12, lineHeight: 1.8 }}>
              Admin edits are limited to off-chain Supabase data: accounts, KYC, bank details, feature flags.
              On-chain data (collateral, debt, interest) is read-only here. The one chain action is KYC approval (<code>setKYC</code>), which is logged on every use.
            </Typography>
          </Card>
        </Box>

      </Box>
    </Box>
  );
}
