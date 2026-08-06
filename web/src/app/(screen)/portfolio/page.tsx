'use client';

import { ethers } from 'ethers';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import MuiSkeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import { useWallet } from '@/lib/WalletContext';
import { usePrices } from '@/hooks/usePrices';
import { useTransactionHistory, ICONS, LABELS, COLORS } from '@/hooks/useTransactionHistory';
import { AlertIcon, BankIcon, ClipboardIcon, InboxIcon } from '@/components/Icons';
import { supplyApr } from '@/lib/rates';

const ORIG_FEE  = 0.001;
const MAX_LTV   = 70;
const LIQ_THRES = 80;

function hColor(hf: number) { return !isFinite(hf) || hf >= 2 ? '#2BD9A2' : hf >= 1.5 ? '#FFB224' : '#E5484D'; }
function hLabel(hf: number) { return !isFinite(hf) || hf >= 2 ? 'Safe' : hf >= 1.5 ? 'Moderate' : 'At Risk'; }
function rm(n: number, d = 0) { return 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function short(addr: string) { return addr.slice(0, 6) + '…' + addr.slice(-4); }
function pct(n: number, d = 1) { return n.toFixed(d) + '%'; }
function addDays(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function formatDate(d: Date) { return d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }); }

function RowSkeleton() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5,
                bgcolor: '#0B1226', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <MuiSkeleton variant="circular" width={36} height={36} sx={{ bgcolor: 'rgba(255,255,255,0.12)' }} />
        <Box><MuiSkeleton width={112} height={12} sx={{ bgcolor: 'rgba(255,255,255,0.12)', mb: 0.75 }} /><MuiSkeleton width={80} height={12} sx={{ bgcolor: 'rgba(255,255,255,0.12)' }} /></Box>
      </Box>
      <MuiSkeleton width={96} height={12} sx={{ bgcolor: 'rgba(255,255,255,0.12)' }} />
    </Box>
  );
}

export default function PortfolioPage() {
  const wallet     = useWallet();
  const { prices } = usePrices();
  // Live variable borrow rate from the contract (falls back to 4.8% until the
  // redeployed contract is on-chain).
  const APR        = wallet.borrowAprBps / 100;
  const effAPR     = wallet.currentAprBps / 100;
  const isLive     = wallet.isConnected && wallet.isCorrectNetwork && wallet.isDeployed;
  const { events: txHistory, loading: txLoading } = useTransactionHistory(isLive ? wallet.address ?? undefined : undefined);

  const ethMYR  = prices.ethereum.myr;
  const loan    = wallet.loanInfo;
  const colEth  = loan ? parseFloat(ethers.formatEther(loan.collateral)) : 0;
  const borMYR  = loan ? Number(loan.borrowed) / 1e6 : 0;
  const colMYR  = colEth * (isLive ? wallet.ethPriceMYR : ethMYR);
  const netMYR  = colMYR - borMYR;
  const hf      = loan?.healthFactor ?? Infinity;
  const hc      = hColor(hf);
  const ltvUsed = colMYR > 0 ? (borMYR / colMYR) * 100 : 0;
  const liqPrice  = colEth > 0 && borMYR > 0 ? borMYR / (colEth * (LIQ_THRES / 100)) : 0;
  const priceDrop = isLive && wallet.ethPriceMYR > 0 && liqPrice > 0
    ? ((wallet.ethPriceMYR - liqPrice) / wallet.ethPriceMYR) * 100 : 0;

  // Supply earnings — deposited ETH earns a share of the borrow APR (moved here from
  // the Deposit modal, which only ever showed it while that dialog happened to be open).
  const ethSupplyApr = supplyApr(effAPR, 0.38);
  const earnedSoFar   = wallet.pendingYieldMYR;
  const hourlyEarn    = colEth > 0 ? colEth * (isLive ? wallet.ethPriceMYR : ethMYR) * (ethSupplyApr / 100) / 8760 : 0;
  const hasClaim       = earnedSoFar > 0.000001;

  const LOAN_TERM    = 90;
  const startTime    = loan?.startTime ?? BigInt(0);
  const borrowDate   = startTime > BigInt(0) ? new Date(Number(startTime) * 1000) : null;
  const today        = new Date();
  // Loan LIFETIME clock (for the timeline/progress bar): plain calendar days
  // since the original borrow, unrelated to the interest clock below.
  const daysElapsed  = borrowDate ? Math.max(0, Math.floor((today.getTime() - borrowDate.getTime()) / 86400000)) : 0;
  const daysLeft     = Math.max(0, LOAN_TERM - daysElapsed);
  const maturityDate = borrowDate ? addDays(borrowDate, LOAN_TERM) : null;
  const progressPct  = LOAN_TERM > 0 ? Math.min((daysElapsed / LOAN_TERM) * 100, 100) : 0;

  // INTEREST clock (for "Accrued Interest × N days" and the daily/projected
  // figures): mirrors CryptoLoan.accruedInterest() exactly — Malaysia-midnight
  // (UTC+8) calendar days since the last repay (not the original borrow date,
  // since every repay resets the clock), with a minimum of one day BEFORE the
  // loan's first ever repay only (firstAccrual) — see dashboard/page.tsx's
  // daysSince() for the same logic and why the firstAccrual guard exists (a
  // same-day repeat repay must not get charged a phantom extra day).
  const DAY_MS = 86_400_000;
  const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;
  const lastRepaySec = loan ? Number(loan.lastRepayTime) : 0;
  const sinceMs       = lastRepaySec > 0 ? lastRepaySec * 1000 : 0;
  const firstAccrual  = loan ? Number(loan.lastRepayTime) === Number(loan.startTime) : true;
  const interestDays  = (() => {
    if (sinceMs <= 0) return 0;
    const lastDay = Math.floor((sinceMs + TZ_OFFSET_MS) / DAY_MS);
    const curDay  = Math.floor((Date.now() + TZ_OFFSET_MS) / DAY_MS);
    const diff    = curDay - lastDay;
    return diff === 0 && firstAccrual ? 1 : diff;
  })();

  const origFee      = borMYR * ORIG_FEE;
  const accruedInt   = loan ? Number(loan.accruedInterest) / 1e6 : 0;
  // effAPR (base + utilization premium) — the same rate accruedInterest()
  // actually charges. Using the flat base rate here used to under-quote the
  // daily/projected figures against what the dashboard (and the contract)
  // show for the same position.
  const projTotalInt = borMYR * (effAPR / 100) * (LOAN_TERM / 365);
  const totalRepay   = borMYR + accruedInt;
  const fullRepay    = borMYR + projTotalInt;
  const dailyInt     = borMYR * (effAPR / 100) / 365;

  const cardSx = { p: 3, bgcolor: '#111B38', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3 };
  const rowSx  = { p: 2, bgcolor: '#0B1226', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2 };

  if (!wallet.isConnected) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#0B1226' }}>
        <Box sx={{ maxWidth: 480, mx: 'auto', px: 3, py: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Box sx={{ width: 80, height: 80, borderRadius: 3, bgcolor: 'rgba(110,139,255,0.08)',
                      border: '1px solid rgba(110,139,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#6E8BFF', mb: 3 }}>
            <BankIcon size={32} />
          </Box>
          <Typography variant="h4" color="text.primary" sx={{ fontWeight: 700, mb: 1.5 }}>Your Portfolio</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4, maxWidth: 360 }}>
            Connect your MetaMask wallet to view your live positions, collateral, borrowed MYR, and health factor.
          </Typography>
          <Button variant="contained" onClick={wallet.connect}
            sx={{ px: 4, py: 1.25, bgcolor: '#6E8BFF', color: 'white', boxShadow: 'none',
                  '&:hover': { bgcolor: '#9DB1FF', boxShadow: 'none' } }}>
            Connect Wallet
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0B1226' }}>
      <Box component="main" sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, sm: 3 }, py: 4 }}>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Box>
            <Typography variant="h4" color="text.primary" sx={{ fontWeight: 700, mb: 0.25 }}>Portfolio</Typography>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.65)' }}>{wallet.address}</Typography>
          </Box>
          <Button size="small" onClick={wallet.refresh} variant="outlined"
            sx={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.65)', bgcolor: '#111B38', fontSize: 12,
                  '&:hover': { borderColor: '#6E8BFF', bgcolor: 'rgba(110,139,255,0.06)' } }}>
            ↻ Refresh
          </Button>
        </Box>

        {/* Risk alert */}
        {isLive && isFinite(hf) && hf < 1.5 && borMYR > 0 && (
          <Alert severity="error" icon={<AlertIcon size={18} />}
            sx={{ mb: 3, bgcolor: '#E5484D15', color: '#E5484D', border: '1px solid #E5484D40',
                  '& .MuiAlert-icon': { color: '#E5484D' }, borderRadius: 2 }}
            action={
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button component={Link} href="/dashboard?tab=deposit" size="small"
                  sx={{ bgcolor: '#6E8BFF', color: 'white', fontSize: 11, '&:hover': { bgcolor: '#9DB1FF' } }}>
                  Add Collateral
                </Button>
                <Button component={Link} href="/dashboard?tab=repay" size="small"
                  sx={{ bgcolor: '#E5484D', color: 'white', fontSize: 11, '&:hover': { bgcolor: '#C93A3F' } }}>
                  Repay Now
                </Button>
              </Box>
            }>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {hf < 1.2 ? 'Critical: Liquidation Imminent' : 'Warning: Low Health Factor'}
            </Typography>
            <Typography variant="caption" sx={{ mt: 0.5, display: 'block' }}>
              Your health factor is <strong style={{ color: '#E5484D' }}>{hf.toFixed(2)}</strong>.
              {hf < 1.2
                ? ' Your position may be liquidated at any time. Repay debt or add collateral immediately.'
                : ' Add more collateral or repay some debt to bring it above 2.0.'}
            </Typography>
          </Alert>
        )}

        {/* Overview cards */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
          {isLive && wallet.isRefreshing ? (
            [0,1,2,3].map(i => (
              <Paper key={i} sx={{ p: 2.5, bgcolor: '#111B38', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2 }}>
                <MuiSkeleton width={96} height={12} sx={{ bgcolor: 'rgba(255,255,255,0.12)', mb: 1.5 }} />
                <MuiSkeleton width={120} height={28} sx={{ bgcolor: 'rgba(255,255,255,0.12)', mb: 0.75 }} />
                <MuiSkeleton width={80} height={12} sx={{ bgcolor: 'rgba(255,255,255,0.12)' }} />
              </Paper>
            ))
          ) : (
            [
              { label: 'ETH Collateral',  value: `${colEth.toFixed(4)} ETH`,              sub: rm(colMYR),               sc: '#2BD9A2' },
              { label: 'Total Borrowed',  value: rm(borMYR, 2),                            sub: `${pct(ltvUsed)} LTV used`, sc: '#FFB224' },
              { label: 'Accrued Interest',value: borMYR > 0 ? rm(accruedInt, 2) : '—',    sub: `${effAPR.toFixed(2)}% APR · ${interestDays}d this cycle`, sc: '#FFB224' },
              { label: 'Health Factor',   value: isFinite(hf) ? hf.toFixed(2) : '∞',      sub: hLabel(hf),               sc: hc },
            ].map(s => (
              <Paper key={s.label} sx={{ p: 2.5, bgcolor: '#111B38', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                <Typography variant="h5" color="text.primary" sx={{ fontWeight: 700, my: 0.5 }}>{s.value}</Typography>
                <Typography variant="caption" sx={{ color: s.sc }}>{s.sub}</Typography>
              </Paper>
            ))
          )}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3 }}>

          {/* Left / main */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* Active Position */}
            <Paper sx={cardSx}>
              <Typography variant="h6" color="text.primary" sx={{ fontWeight: 600, mb: 3 }}>Active Position</Typography>

              {isLive && wallet.isRefreshing ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {[0,1,2].map(i => (
                    <Paper key={i} sx={{ p: 2, bgcolor: '#0B1226', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                        <MuiSkeleton width={112} height={12} sx={{ bgcolor: 'rgba(255,255,255,0.12)' }} />
                        <MuiSkeleton width={80} height={12} sx={{ bgcolor: 'rgba(255,255,255,0.12)' }} />
                      </Box>
                      <MuiSkeleton width="100%" height={8} sx={{ bgcolor: 'rgba(255,255,255,0.12)', borderRadius: 1 }} />
                    </Paper>
                  ))}
                </Box>
              ) : colEth > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

                  {/* Collateral */}
                  <Box sx={rowSx}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" color="text.secondary">ETH Collateral</Typography>
                      <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>{colEth.toFixed(4)} ETH</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">Value: {rm(colMYR)}</Typography>
                      <Typography variant="caption" color="text.secondary">@ {rm(isLive ? wallet.ethPriceMYR : ethMYR)} / ETH</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={100}
                      sx={{ height: 8, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.12)', '& .MuiLinearProgress-bar': { bgcolor: '#627EEA', borderRadius: 1 } }} />
                  </Box>

                  {/* LTV */}
                  <Box sx={rowSx}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" color="text.secondary">Loan-to-Value</Typography>
                      <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>{pct(ltvUsed)} / {MAX_LTV}% max</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                      <Typography variant="caption" color="text.secondary">Borrowed: {rm(borMYR, 2)}</Typography>
                      <Typography variant="caption" color="text.secondary">Available: {rm(Math.max(0, colMYR * MAX_LTV / 100 - borMYR), 2)}</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={Math.min(ltvUsed / MAX_LTV * 100, 100)}
                      sx={{ height: 8, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.12)',
                            '& .MuiLinearProgress-bar': { borderRadius: 1, bgcolor: ltvUsed > 60 ? '#E5484D' : ltvUsed > 40 ? '#FFB224' : '#2BD9A2' } }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75 }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>0%</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>Liquidation risk &gt; 60%</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{MAX_LTV}%</Typography>
                    </Box>
                  </Box>

                  {/* Health factor */}
                  <Box sx={rowSx}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                      <Typography variant="body2" color="text.secondary">Health Factor</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="h6" sx={{ color: hc, fontWeight: 700 }}>{isFinite(hf) ? hf.toFixed(2) : '∞'}</Typography>
                        <Chip label={hLabel(hf)} size="small" sx={{ bgcolor: `${hc}1A`, color: hc, fontWeight: 600, height: 20, fontSize: 11 }} />
                      </Box>
                    </Box>
                    <LinearProgress variant="determinate" value={Math.min((isFinite(hf) ? hf : 3) / 3 * 100, 100)}
                      sx={{ height: 12, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.12)', '& .MuiLinearProgress-bar': { bgcolor: hc, borderRadius: 1.5 } }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75 }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>Liquidation (1.0)</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>Moderate (1.5)</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>Safe (2.0+)</Typography>
                    </Box>
                    {isLive && liqPrice > 0 && (
                      <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" color="text.secondary">Liquidation price</Typography>
                        <Typography variant="caption" sx={{ color: '#E5484D' }}>
                          ≈ {rm(liqPrice)} / ETH
                          {priceDrop > 0 && <Box component="span" sx={{ color: 'rgba(255,255,255,0.65)' }}> ({priceDrop.toFixed(1)}% drop)</Box>}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  {/* Supply earnings on deposited ETH collateral */}
                  <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(43,217,162,0.06)', border: '1px solid rgba(43,217,162,0.25)' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>
                        Supply Earnings
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.25 }}>
                        <Chip label={`${ethSupplyApr.toFixed(2)}% APR`} size="small"
                          sx={{ bgcolor: 'rgba(43,217,162,0.15)', color: '#2BD9A2', fontWeight: 600, height: 20, fontSize: 11 }} />
                        {/* APR restated per hour — same rate, just the unit borrowers
                            actually feel while watching the "Earned so far" ticker. */}
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>
                          {(ethSupplyApr / 8760).toFixed(6)}% APR / hr
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Earned so far</Typography>
                        <Typography variant="h6" sx={{ color: '#2BD9A2', fontWeight: 700 }}>{rm(earnedSoFar, 4)}</Typography>
                        <Typography variant="caption" color="text.secondary">≈ {rm(hourlyEarn, 4)} / hr on {colEth.toFixed(4)} ETH</Typography>
                      </Box>
                      {isLive && hasClaim && (
                        <Button size="small" variant="contained" disableElevation
                          onClick={() => wallet.claimSupplyInterest()}
                          disabled={wallet.txStatus === 'pending'}
                          sx={{ bgcolor: '#2BD9A2', color: '#0B1226', fontWeight: 700, fontSize: 12, px: 2,
                                '&:hover': { bgcolor: '#22c98f' } }}>
                          Claim MYR
                        </Button>
                      )}
                    </Box>
                  </Box>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 5, textAlign: 'center',
                            bgcolor: '#0B1226', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5, color: 'rgba(255,255,255,0.4)' }}><InboxIcon size={30} /></Box>
                  <Typography variant="body2" color="text.primary" sx={{ fontWeight: 500, mb: 0.5 }}>No open position</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 2.5 }}>Deposit ETH collateral to start borrowing</Typography>
                  <Button component={Link} href="/dashboard" variant="contained"
                    sx={{ bgcolor: '#6E8BFF', color: 'white', fontSize: 12, boxShadow: 'none',
                          '&:hover': { bgcolor: '#9DB1FF', boxShadow: 'none' } }}>
                    Go to Dashboard
                  </Button>
                </Box>
              )}
            </Paper>

            {/* Loan timeline & interest */}
            {borMYR > 0 && (
              <Paper sx={cardSx}>
                <Typography variant="h6" color="text.primary" sx={{ fontWeight: 600, mb: 3 }}>Loan Timeline & Interest</Typography>

                {borrowDate && maturityDate && (
                  <Box sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="caption" color="text.secondary">Start: {formatDate(borrowDate)}</Typography>
                      <Typography variant="caption" color="text.secondary">Maturity: {formatDate(maturityDate)}</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={progressPct}
                      sx={{ height: 12, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.12)',
                            '& .MuiLinearProgress-bar': { bgcolor: '#6E8BFF', borderRadius: 1.5 } }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75 }}>
                      <Typography variant="caption" color="text.secondary">{daysElapsed} days elapsed</Typography>
                      <Typography variant="caption" color="text.secondary">{daysLeft} days remaining</Typography>
                    </Box>
                  </Box>
                )}

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {[
                    { label: 'Principal Borrowed',       value: rm(borMYR, 2),               sub: 'Original loan amount',              vc: '#F2F5FF' },
                    { label: 'Origination Fee (0.1%)',   value: rm(origFee, 2),               sub: 'Charged at disbursement',           vc: 'rgba(255,255,255,0.65)' },
                    { label: 'Accrued Interest',         value: rm(accruedInt, 2),            sub: `${effAPR.toFixed(2)}% APR × ${interestDays} day${interestDays === 1 ? '' : 's'} since last repay`, vc: '#FFB224' },
                    { label: 'Daily Interest Rate',      value: rm(dailyInt, 2) + '/day',     sub: 'Steps once per calendar day',       vc: 'rgba(255,255,255,0.65)' },
                    { label: 'Projected Total Interest', value: rm(projTotalInt, 2),          sub: `If held full ${LOAN_TERM} days`,    vc: 'rgba(255,255,255,0.65)' },
                  ].map(r => (
                    <Box key={r.label} sx={{ ...rowSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5 }}>
                      <Box>
                        <Typography variant="caption" color="text.primary" sx={{ fontWeight: 500 }}>{r.label}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', display: 'block' }}>{r.sub}</Typography>
                      </Box>
                      <Typography variant="body2" sx={{ color: r.vc, fontWeight: 600 }}>{r.value}</Typography>
                    </Box>
                  ))}

                  <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(110,139,255,0.06)', border: '1px solid rgba(110,139,255,0.2)' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>Repay Today</Typography>
                        <Typography variant="caption" color="text.secondary">Principal + accrued interest</Typography>
                      </Box>
                      <Typography variant="h6" sx={{ color: '#6E8BFF', fontWeight: 700 }}>{rm(totalRepay, 2)}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ ...rowSx, p: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="body2" color="text.primary" sx={{ fontWeight: 500 }}>Full-Term Repayment</Typography>
                        <Typography variant="caption" color="text.secondary">If held to {LOAN_TERM}-day maturity</Typography>
                      </Box>
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>{rm(fullRepay, 2)}</Typography>
                    </Box>
                  </Box>
                </Box>

                <Button component={Link} href="/dashboard?tab=repay" fullWidth variant="contained"
                  sx={{ mt: 3, py: 1.25, bgcolor: '#6E8BFF', color: 'white', boxShadow: 'none',
                        '&:hover': { bgcolor: '#9DB1FF', boxShadow: 'none' } }}>
                  Repay Loan →
                </Button>
              </Paper>
            )}

            {/* Transaction History */}
            {isLive && (
              <Paper sx={cardSx}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                  <Typography variant="h6" color="text.primary" sx={{ fontWeight: 600 }}>Transaction History</Typography>
                  {txLoading && <Typography variant="caption" color="text.secondary">Loading…</Typography>}
                </Box>

                {txLoading ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {[0,1,2].map(i => <RowSkeleton key={i} />)}
                  </Box>
                ) : txHistory.length === 0 ? (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4, textAlign: 'center',
                              bgcolor: '#0B1226', border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1, color: 'rgba(255,255,255,0.4)' }}><ClipboardIcon size={26} /></Box>
                    <Typography variant="body2" color="text.primary" sx={{ fontWeight: 500, mb: 0.5 }}>No transactions yet</Typography>
                    <Typography variant="caption" color="text.secondary">Deposit collateral or borrow MYR to see history</Typography>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {txHistory.map((tx, i) => {
                      const isMyr  = tx.type === 'Borrowed' || tx.type === 'Repaid' || tx.type === 'MYRPurchased';
                      const fmtAmt = isMyr
                        ? 'RM ' + (Number(tx.amount) / 1e6).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : parseFloat(ethers.formatEther(tx.amount)).toFixed(4) + ' ETH';
                      const TxIcon = ICONS[tx.type];
                      return (
                        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: '#0B1226', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2 }}>
                          <Box sx={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      bgcolor: `${COLORS[tx.type]}1A`, color: COLORS[tx.type] }}>
                            <TxIcon size={17} />
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>{LABELS[tx.type]}</Typography>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'rgba(255,255,255,0.45)' }} noWrap>
                              Block #{tx.blockNumber} · {tx.txHash.slice(0, 10)}…
                            </Typography>
                          </Box>
                          <Typography variant="body2" sx={{ color: COLORS[tx.type], fontWeight: 700, flexShrink: 0 }}>{fmtAmt}</Typography>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Paper>
            )}

            {/* Wallet Balances */}
            <Paper sx={cardSx}>
              <Typography variant="h6" color="text.primary" sx={{ fontWeight: 600, mb: 3 }}>Wallet Balances</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {isLive && wallet.isRefreshing ? (
                  [0,1].map(i => <RowSkeleton key={i} />)
                ) : (
                  <>
                    {/* ETH row */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bgcolor: '#0B1226', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: '#627EEA1A', color: '#627EEA',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>Ξ</Box>
                        <Box>
                          <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>ETH</Typography>
                          <Typography variant="caption" color="text.secondary">Ethereum</Typography>
                        </Box>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>{wallet.ethBalance} ETH</Typography>
                        <Typography variant="caption" color="text.secondary">{rm(parseFloat(wallet.ethBalance) * (isLive ? wallet.ethPriceMYR : ethMYR))}</Typography>
                      </Box>
                    </Box>

                    {/* MockMYR row with Add to MetaMask */}
                    <Box sx={{ p: 1.5, bgcolor: '#0B1226', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: '#2BD9A21A', color: '#2BD9A2',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>M</Box>
                          <Box>
                            <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>MockMYR</Typography>
                            <Typography variant="caption" color="text.secondary">On-chain stablecoin (ERC-20)</Typography>
                          </Box>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>RM {wallet.myrBalance}</Typography>
                          <Typography variant="caption" color="text.secondary">Borrowed token</Typography>
                        </Box>
                      </Box>
                      {isLive && !wallet.myrTokenAdded && (
                        <Button size="small" variant="outlined"
                          onClick={() => wallet.addTokenToWallet()}
                          sx={{ mt: 1.25, width: '100%', fontSize: 11, borderColor: 'rgba(43,217,162,0.25)',
                                color: '#2BD9A2', '&:hover': { bgcolor: 'rgba(43,217,162,0.06)', borderColor: '#2BD9A2' } }}>
                          + Add MockMYR to MetaMask
                        </Button>
                      )}
                      {isLive && wallet.myrTokenAdded && (
                        <Typography variant="caption" sx={{ mt: 1.25, display: 'block', color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>
                          ✓ MYR token in wallet
                        </Typography>
                      )}
                    </Box>
                  </>
                )}
              </Box>
            </Paper>
          </Box>

          {/* Right sidebar */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* Loan Terms */}
            <Paper sx={cardSx}>
              <Typography variant="body1" color="text.primary" sx={{ fontWeight: 600, mb: 2.5 }}>Loan Terms</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {[
                  { label: 'Annual Rate (APR)',      value: `${APR}%`,             vc: '#2BD9A2' },
                  { label: 'Max LTV',                value: `${MAX_LTV}%`,         vc: '#F2F5FF' },
                  { label: 'Liquidation Threshold',  value: `${LIQ_THRES}% LTV`,  vc: '#F2F5FF' },
                  { label: 'Origination Fee',        value: `${ORIG_FEE * 100}%`,  vc: '#F2F5FF' },
                  { label: 'Collateral Asset',       value: 'ETH',                 vc: '#627EEA' },
                  { label: 'Borrow Asset',           value: 'MYR (Mock)',          vc: '#2BD9A2' },
                  { label: 'Interest Type',          value: 'Variable APR',        vc: '#FFB224' },
                  { label: 'Liquidation Penalty',    value: '10%',                 vc: '#E5484D' },
                ].map(r => (
                  <Box key={r.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                    <Typography variant="caption" color="text.secondary">{r.label}</Typography>
                    <Typography variant="caption" sx={{ color: r.vc, fontWeight: 600 }}>{r.value}</Typography>
                  </Box>
                ))}
              </Box>
            </Paper>

            {/* Quick Actions */}
            <Paper sx={cardSx}>
              <Typography variant="body1" color="text.primary" sx={{ fontWeight: 600, mb: 2 }}>Quick Actions</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {[
                  { label: 'Deposit Collateral', sub: 'Add ETH to position',    href: '/dashboard?tab=deposit', bg: '#6E8BFF' },
                  { label: 'Borrow MYR',         sub: 'Borrow against ETH',     href: '/dashboard?tab=borrow',  bg: '#4458E8' },
                  { label: 'Repay Loan',         sub: 'Reduce debt + interest', href: '/dashboard?tab=repay',   bg: '#9DB1FF' },
                  { label: 'KYC Verification',   sub: 'Required to borrow',     href: '/kyc',          bg: '#6E8BFF' },
                ].map(a => (
                  <Box key={a.label} component={Link} href={a.href}
                    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5,
                          borderRadius: 2, color: 'white', textDecoration: 'none', background: a.bg,
                          transition: 'opacity 0.15s', '&:hover': { opacity: 0.9 } }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{ a.label}</Typography>
                      <Typography variant="caption" sx={{ opacity: 0.7 }}>{a.sub}</Typography>
                    </Box>
                    <Typography sx={{ fontSize: 18 }}>→</Typography>
                  </Box>
                ))}
              </Box>
            </Paper>

            {/* Net Position */}
            <Paper sx={cardSx}>
              <Typography variant="body1" color="text.primary" sx={{ fontWeight: 600, mb: 2.5 }}>Net Position</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {[
                  { label: 'Collateral Value', value: rm(colMYR),                   vc: '#2BD9A2' },
                  { label: 'Outstanding Debt', value: `− ${rm(borMYR, 2)}`,         vc: '#E5484D' },
                  { label: 'Accrued Interest', value: `− ${rm(accruedInt, 2)}`,     vc: '#FFB224' },
                ].map(r => (
                  <Box key={r.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                    <Typography variant="caption" color="text.secondary">{r.label}</Typography>
                    <Typography variant="caption" sx={{ color: r.vc, fontWeight: 600 }}>{r.value}</Typography>
                  </Box>
                ))}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 1.5 }}>
                  <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>Net Equity</Typography>
                  <Typography variant="body2" sx={{ color: netMYR >= 0 ? '#2BD9A2' : '#E5484D', fontWeight: 700 }}>
                    {rm(netMYR - accruedInt)}
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Connection */}
            <Paper sx={cardSx}>
              <Typography variant="body1" color="text.primary" sx={{ fontWeight: 600, mb: 2.5 }}>Connection</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {[
                  { label: 'Address',   value: short(wallet.address!), vc: '#F2F5FF', mono: true },
                  { label: 'Network',   value: isLive ? 'Hardhat Local' : 'Wrong network', vc: isLive ? '#2BD9A2' : '#E5484D' },
                  { label: 'Chain ID',  value: `${wallet.chainId ?? '—'}`, vc: '#F2F5FF' },
                  { label: 'Contracts', value: wallet.isDeployed ? 'Deployed' : 'Not deployed', vc: '#F2F5FF' },
                  { label: 'KYC',       value: wallet.kycApproved ? 'Approved' : 'Pending', vc: wallet.kycApproved ? '#2BD9A2' : '#FFB224' },
                ].map(r => (
                  <Box key={r.label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" color="text.secondary">{r.label}</Typography>
                    <Typography variant="caption" sx={{ color: r.vc, fontFamily: r.mono ? 'monospace' : 'inherit' }}>{r.value}</Typography>
                  </Box>
                ))}
              </Box>
            </Paper>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
