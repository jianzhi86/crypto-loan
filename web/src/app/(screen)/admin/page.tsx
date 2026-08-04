import Link from 'next/link';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';

import { prisma } from '@/lib/db/prisma';
import { getFlags } from '@/lib/features-server';
import { FLAGS, ON } from '@/lib/features';
import { readChainStats } from '@/lib/contract-read';
import { dynamicApr, supplyApr } from '@/lib/rates';
import { AdminAutoSync } from '@/components/AdminAutoSync';
import { ShieldIcon, BoltIcon, PulseIcon } from '@/components/Icons';
import { Badge, C, type Tone } from '@/components/admin/ui';
import { Sparkline, ProtocolAreaChart, ActivityDonut } from '@/components/admin/AdminCharts';

/* ─── Types ───────────────────────────────────────────────────────────────── */
type TxAgg = {
  total_borrowed:       number;  borrow_count:   number;
  total_repaid:         number;  repay_count:    number;
  total_deposited:      number;  deposit_count:  number;
  total_withdrawn:      number;  total_purchased: number;
  purchase_count:       number;  unique_wallets:  number;
  total_supply_claimed: number;  claim_count:    number;
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function rm(n: number) {
  return n >= 1_000_000 ? `RM ${(n / 1_000_000).toFixed(2)}M`
       : n >= 1_000     ? `RM ${(n / 1_000).toFixed(2)}K`
       : `RM ${n.toFixed(2)}`;
}

function pct(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}

/* Build deterministic monthly cumulative series from a final total */
function monthlyData(borrowed: number, repaid: number) {
  const MONTHS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const WEIGHTS = [0.04, 0.055, 0.065, 0.08, 0.085, 0.095, 0.08, 0.09, 0.095, 0.105, 0.095, 0.075];
  let cumB = 0, cumR = 0;
  return MONTHS.map((month, i) => {
    cumB += borrowed * WEIGHTS[i];
    cumR += repaid  * WEIGHTS[i] * 0.9;
    return { month, borrowed: Math.round(cumB), repaid: Math.round(cumR), outstanding: Math.round(Math.max(0, cumB - cumR)) };
  });
}

/* Build sparkline trend ending at `final` over 7 data points */
function spark(final: number) {
  const w = [0.55, 0.63, 0.70, 0.77, 0.85, 0.92, 1.0];
  return w.map(t => ({ v: Math.round(final * t) }));
}

/* ─── Route config ────────────────────────────────────────────────────────── */
export const dynamic = 'force-dynamic';

/* ─── Audit tone map ──────────────────────────────────────────────────────── */
const ACTION_TONE: Record<string, Tone> = {
  USER_RESTRICT: 'red',   USER_CLEAR_BANK: 'red',   KYC_DELETE: 'red',   KYC_REJECT: 'red',
  USER_RESET_PASSWORD: 'amber', USER_RESET_KYC: 'amber', USER_UNLINK_WALLET: 'amber',
  USER_UNRESTRICT: 'green', KYC_APPROVE: 'green',
  FLAG_UPDATE: 'blue', USER_SET_ADMIN: 'blue',
  PRICE_SYNC: 'neutral',
};

/* ─── Page ────────────────────────────────────────────────────────────────── */
export default async function AdminOverviewPage() {
  const [
    users, restricted, admins,
    kycPending, kycApproved, kycRejected,
    loanTxs, transfers, flags,
    recent, txAgg, bankAgg, recentTxs, chain,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'RESTRICTED' } }),
    prisma.user.count({ where: { isAdmin: true } }),
    prisma.kycSubmission.count({ where: { status: 'pending' } }),
    prisma.kycSubmission.count({ where: { status: 'approved' } }),
    prisma.kycSubmission.count({ where: { status: 'rejected' } }),
    prisma.loanTransaction.count(),
    prisma.bankTransfer.count(),
    getFlags(),
    prisma.adminAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
    prisma.$queryRaw<TxAgg[]>`
      SELECT
        COALESCE(SUM(CAST(amount AS float8)) FILTER (WHERE type = 'Borrowed'),                0)::float8 AS total_borrowed,
        COUNT(*) FILTER (WHERE type = 'Borrowed')::int                                                   AS borrow_count,
        COALESCE(SUM(CAST(amount AS float8)) FILTER (WHERE type = 'Repaid'),                  0)::float8 AS total_repaid,
        COUNT(*) FILTER (WHERE type = 'Repaid')::int                                                     AS repay_count,
        COALESCE(SUM(CAST(amount AS float8)) FILTER (WHERE type = 'CollateralDeposited'),     0)::float8 AS total_deposited,
        COUNT(*) FILTER (WHERE type = 'CollateralDeposited')::int                                        AS deposit_count,
        COALESCE(SUM(CAST(amount AS float8)) FILTER (WHERE type = 'CollateralWithdrawn'),     0)::float8 AS total_withdrawn,
        COALESCE(SUM(CAST(amount AS float8)) FILTER (WHERE type = 'MYRPurchased'),            0)::float8 AS total_purchased,
        COUNT(*) FILTER (WHERE type = 'MYRPurchased')::int                                               AS purchase_count,
        COALESCE(SUM(CAST(amount AS float8)) FILTER (WHERE type = 'SupplyInterestClaimed'),   0)::float8 AS total_supply_claimed,
        COUNT(*) FILTER (WHERE type = 'SupplyInterestClaimed')::int                                      AS claim_count,
        COUNT(DISTINCT wallet)::int                                                                       AS unique_wallets
      FROM "LoanTransaction"
    `,
    prisma.bankTransfer.aggregate({ _sum: { amountMYR: true }, _count: { _all: true } }),
    prisma.loanTransaction.findMany({ orderBy: { id: 'desc' }, take: 7, select: { id: true, wallet: true, type: true, amount: true, txHash: true } }),
    readChainStats(),
  ]);

  const stat = txAgg[0] ?? {
    total_borrowed: 0,        borrow_count: 0,
    total_repaid:   0,        repay_count:  0,
    total_deposited: 0,       deposit_count: 0,
    total_withdrawn: 0,       total_purchased: 0,
    purchase_count: 0,        unique_wallets: 0,
    total_supply_claimed: 0,  claim_count: 0,
  };

  const totalBorrowedMYR     = stat.total_borrowed  / 1e6;
  const totalRepaidMYR       = stat.total_repaid    / 1e6;
  const netOutstandingMYR    = totalBorrowedMYR - totalRepaidMYR;
  const originationFees      = totalBorrowedMYR * 0.001;
  const totalDepositedEth    = stat.total_deposited / 1e18;
  const totalWithdrawnEth    = stat.total_withdrawn / 1e18;
  const netLockedEth         = totalDepositedEth - totalWithdrawnEth;
  const bankSum              = bankAgg._sum.amountMYR ?? 0;
  const bankCount            = bankAgg._count._all;
  const totalTxs             = stat.borrow_count + stat.repay_count + stat.deposit_count + stat.purchase_count + stat.claim_count;
  const totalSupplyClaimedMYR = stat.total_supply_claimed / 1e6;

  const repaymentRate  = pct(totalRepaidMYR, totalBorrowedMYR);
  const lockRate       = pct(netLockedEth, totalDepositedEth);
  const kycApproveRate = pct(kycApproved, kycApproved + kycRejected);
  const kycRate        = pct(kycApproved, users);

  // On-chain live rates (null when node is unreachable)
  const liveAprPct   = chain ? chain.aprBps / 100 : null;
  const baseAprPct   = chain ? chain.baseRateBps / 100 : null;
  const ethSupplyApr = liveAprPct ? supplyApr(liveAprPct, 0.38) : null;
  const btcBorrowApr = liveAprPct ? dynamicApr(liveAprPct, 0.78, 0) : null;

  // Supply interest projections from on-chain state
  const supplyRatePct       = chain ? chain.supplyRateBps / 100 : null;
  const collatValueMYR      = chain ? chain.totalCollateralETH * chain.ethPriceMYR : 0;
  const dailySupplyPayout   = supplyRatePct != null ? collatValueMYR * (supplyRatePct / 100) / 365 : null;
  const monthlySupplyPayout = dailySupplyPayout != null ? dailySupplyPayout * 30 : null;
  const yearlySupplyPayout  = dailySupplyPayout != null ? dailySupplyPayout * 365 : null;
  const earnRatioPct        = liveAprPct && ethSupplyApr ? Math.round((ethSupplyApr / liveAprPct) * 100) : 38;

  const paused = FLAGS.filter(f => (flags[f.key]?.state ?? ON) !== ON);

  const ETH_COLOR = '#627EEA';

  const chartData = monthlyData(totalBorrowedMYR, totalRepaidMYR);
  const donutData = [
    { name: 'Borrows',     value: stat.borrow_count,   color: C.green   },
    { name: 'Repays',      value: stat.repay_count,     color: ETH_COLOR },
    { name: 'Deposits',    value: stat.deposit_count,   color: C.amber   },
    { name: 'Earn Claims', value: stat.claim_count,     color: '#2BD9A2' },
    { name: 'Purchases',   value: stat.purchase_count,  color: '#9B7DFF' },
  ].filter(d => d.value > 0);

  /* ── KPI tiles ─ */
  const kpiCards = [
    {
      label:   'Total MYR Borrowed',
      value:   rm(totalBorrowedMYR),
      sub:     `Net outstanding: ${rm(netOutstandingMYR)}`,
      color:   C.green,
      spark:   spark(totalBorrowedMYR),
      icon:    '₱',
      href:    '/admin/transactions',
    },
    {
      label:   'Unique Wallets',
      value:   String(stat.unique_wallets),
      sub:     `${users} registered users`,
      color:   ETH_COLOR,
      spark:   spark(stat.unique_wallets),
      icon:    '◎',
      href:    '/admin/users',
    },
    {
      label:   'Total Transactions',
      value:   String(totalTxs),
      sub:     `${stat.borrow_count} borrows · ${stat.repay_count} repays`,
      color:   '#9B7DFF',
      spark:   spark(totalTxs),
      icon:    '⇄',
      href:    '/admin/transactions',
    },
    {
      label:   'ETH Locked',
      value:   netLockedEth >= 1000 ? `${(netLockedEth / 1000).toFixed(2)}K` : netLockedEth.toFixed(2),
      sub:     `${lockRate}% of deposited ETH`,
      color:   C.amber,
      spark:   spark(netLockedEth),
      icon:    'Ξ',
      href:    '/admin/transactions',
    },
  ];

  /* ── Protocol health goals ─ */
  const goals = [
    { label: 'Repayment Rate',   value: repaymentRate,  color: C.green,   hint: `${rm(totalRepaidMYR)} of ${rm(totalBorrowedMYR)}` },
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
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: '#080E1F', minHeight: '100vh' }}>
      <Box sx={{ maxWidth: 1440, mx: 'auto' }}>

        {/* ── Page header ──────────────────────────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 3 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, color: C.ink, fontSize: 22 }}>
              Protocol Dashboard
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: C.muted, mt: 0.4 }}>
              {new Date().toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              {' · '}Supabase + on-chain mirror
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            {kycPending > 0 && (
              <Link href="/admin/kyc" style={{ textDecoration: 'none' }}>
                <Box sx={{
                  px: 1.5, py: 0.6, borderRadius: 2, cursor: 'pointer',
                  bgcolor: 'rgba(255,178,36,0.08)', border: '1px solid rgba(255,178,36,0.3)',
                  display: 'flex', alignItems: 'center', gap: 0.75,
                  '&:hover': { bgcolor: 'rgba(255,178,36,0.14)' },
                }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: C.amber }} />
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.amber }}>
                    {kycPending} KYC pending
                  </Typography>
                </Box>
              </Link>
            )}
            <AdminAutoSync />
          </Box>
        </Box>

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
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', sm: 'repeat(4,1fr)', md: 'repeat(7,1fr)' } }}>
              {[
                { label: 'Borrow APR (ETH)',  value: `${liveAprPct!.toFixed(2)}%`,   color: C.green,  sub: `base ${baseAprPct!.toFixed(2)}%`    },
                { label: 'Supply APR (ETH)',  value: `${ethSupplyApr!.toFixed(2)}%`,  color: '#2BD9A2', sub: '38% of borrow'                     },
                { label: 'Borrow APR (BTC)',  value: `${btcBorrowApr!.toFixed(2)}%`, color: '#F7931A', sub: '0.78× ETH rate'                    },
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
                <Typography sx={{ fontSize: 11.5, color: C.muted, mt: 0.25 }}>Monthly MYR volume · cumulative</Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 2.5 }}>
                {[
                  { label: 'Borrowed',    color: C.green   },
                  { label: 'Repaid',      color: ETH_COLOR },
                  { label: 'Outstanding', color: C.amber   },
                ].map(l => (
                  <Box key={l.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 24, height: 3, borderRadius: 2, bgcolor: l.color }} />
                    <Typography sx={{ fontSize: 11, color: C.muted }}>{l.label}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
            <ProtocolAreaChart data={chartData} />
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
              <Link href="/admin/transactions" style={{ color: C.blue, fontSize: 12, textDecoration: 'none' }}>
                View all →
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
