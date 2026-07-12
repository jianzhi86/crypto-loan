'use client';

import { ethers } from 'ethers';
import { useEffect, useState } from 'react';
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

interface BankTransfer {
  id: string;
  amountMYR: number;
  status: string;
  referenceNo: string;
  bankName: string;
  accountLast4: string;
  createdAt: string;
  completedAt: string | null;
}

const TRANSFER_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:    { label: 'Pending',    color: '#C77700', bg: 'rgba(199,119,0,0.1)'   },
  PROCESSING: { label: 'Processing', color: '#2A3FD6', bg: 'rgba(42,63,214,0.1)'   },
  COMPLETED:  { label: 'Completed',  color: '#0E9F6E', bg: 'rgba(14,159,110,0.1)'  },
  FAILED:     { label: 'Failed',     color: '#E5484D', bg: 'rgba(229,72,77,0.1)'   },
};

const APR       = 4.8;
const ORIG_FEE  = 0.001;
const MAX_LTV   = 70;
const LIQ_THRES = 80;

function hColor(hf: number) { return !isFinite(hf) || hf >= 2 ? '#0E9F6E' : hf >= 1.5 ? '#C77700' : '#E5484D'; }
function hLabel(hf: number) { return !isFinite(hf) || hf >= 2 ? 'Safe' : hf >= 1.5 ? 'Moderate' : 'At Risk'; }
function rm(n: number, d = 0) { return 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function short(addr: string) { return addr.slice(0, 6) + '…' + addr.slice(-4); }
function pct(n: number, d = 1) { return n.toFixed(d) + '%'; }
function addDays(date: Date, days: number) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function formatDate(d: Date) { return d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }); }

function RowSkeleton() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5,
                bgcolor: '#F4F6F8', border: '1px solid #E2E7EE', borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <MuiSkeleton variant="circular" width={36} height={36} sx={{ bgcolor: '#E2E7EE' }} />
        <Box><MuiSkeleton width={112} height={12} sx={{ bgcolor: '#E2E7EE', mb: 0.75 }} /><MuiSkeleton width={80} height={12} sx={{ bgcolor: '#E2E7EE' }} /></Box>
      </Box>
      <MuiSkeleton width={96} height={12} sx={{ bgcolor: '#E2E7EE' }} />
    </Box>
  );
}

export default function PortfolioPage() {
  const wallet     = useWallet();
  const { prices } = usePrices();
  const isLive     = wallet.isConnected && wallet.isCorrectNetwork && wallet.isDeployed;
  const { events: txHistory, loading: txLoading } = useTransactionHistory(isLive ? wallet.address ?? undefined : undefined);

  const [transfers, setTransfers]       = useState<BankTransfer[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(false);

  useEffect(() => {
    setTransfersLoading(true);
    fetch('/api/transfers')
      .then(r => r.ok ? r.json() : { transfers: [] })
      .then((d: { transfers: BankTransfer[] }) => setTransfers(d.transfers ?? []))
      .finally(() => setTransfersLoading(false));

    // Poll every 5 s to pick up simulated status changes
    const id = setInterval(() => {
      fetch('/api/transfers')
        .then(r => r.ok ? r.json() : { transfers: [] })
        .then((d: { transfers: BankTransfer[] }) => setTransfers(d.transfers ?? []));
    }, 5000);
    return () => clearInterval(id);
  }, []);

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

  const LOAN_TERM    = 90;
  const startTime    = loan?.startTime ?? BigInt(0);
  const borrowDate   = startTime > BigInt(0) ? new Date(Number(startTime) * 1000) : null;
  const today        = new Date();
  const daysElapsed  = borrowDate ? Math.max(0, Math.floor((today.getTime() - borrowDate.getTime()) / 86400000)) : 0;
  const daysLeft     = Math.max(0, LOAN_TERM - daysElapsed);
  const maturityDate = borrowDate ? addDays(borrowDate, LOAN_TERM) : null;
  const progressPct  = LOAN_TERM > 0 ? Math.min((daysElapsed / LOAN_TERM) * 100, 100) : 0;

  const origFee      = borMYR * ORIG_FEE;
  const accruedInt   = loan ? Number(loan.accruedInterest) / 1e6 : 0;
  const projTotalInt = borMYR * (APR / 100) * (LOAN_TERM / 365);
  const totalRepay   = borMYR + accruedInt;
  const fullRepay    = borMYR + projTotalInt;
  const dailyInt     = borMYR * (APR / 100) / 365;

  const cardSx = { p: 3, bgcolor: '#FFFFFF', border: '1px solid #E2E7EE', borderRadius: 3 };
  const rowSx  = { p: 2, bgcolor: '#F4F6F8', border: '1px solid #E2E7EE', borderRadius: 2 };

  if (!wallet.isConnected) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#F4F6F8' }}>
        <Box sx={{ maxWidth: 480, mx: 'auto', px: 3, py: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Box sx={{ width: 80, height: 80, borderRadius: 3, bgcolor: 'rgba(42,63,214,0.08)',
                      border: '1px solid rgba(42,63,214,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 36, mb: 3 }}>
            🏦
          </Box>
          <Typography variant="h4" color="text.primary" sx={{ fontWeight: 700, mb: 1.5 }}>Your Portfolio</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4, maxWidth: 360 }}>
            Connect your MetaMask wallet to view your live positions, collateral, borrowed MYR, and health factor.
          </Typography>
          <Button variant="contained" onClick={wallet.connect}
            sx={{ px: 4, py: 1.25, bgcolor: '#2A3FD6', color: 'white', boxShadow: 'none',
                  '&:hover': { bgcolor: '#1E2FA8', boxShadow: 'none' } }}>
            Connect Wallet
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F4F6F8' }}>
      <Box component="main" sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, sm: 3 }, py: 4 }}>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Box>
            <Typography variant="h4" color="text.primary" sx={{ fontWeight: 700, mb: 0.25 }}>Portfolio</Typography>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#5A6675' }}>{wallet.address}</Typography>
          </Box>
          <Button size="small" onClick={wallet.refresh} variant="outlined"
            sx={{ borderColor: '#E2E7EE', color: '#5A6675', bgcolor: '#FFFFFF', fontSize: 12,
                  '&:hover': { borderColor: '#2A3FD6', bgcolor: 'rgba(42,63,214,0.06)' } }}>
            ↻ Refresh
          </Button>
        </Box>

        {/* Risk alert */}
        {isLive && isFinite(hf) && hf < 1.5 && borMYR > 0 && (
          <Alert severity="error" icon={<Typography sx={{ fontSize: 18 }}>⚠️</Typography>}
            sx={{ mb: 3, bgcolor: '#E5484D15', color: '#E5484D', border: '1px solid #E5484D40',
                  '& .MuiAlert-icon': { color: '#E5484D' }, borderRadius: 2 }}
            action={
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button component={Link} href="/?tab=deposit" size="small"
                  sx={{ bgcolor: '#2A3FD6', color: 'white', fontSize: 11, '&:hover': { bgcolor: '#1E2FA8' } }}>
                  Add Collateral
                </Button>
                <Button component={Link} href="/?tab=repay" size="small"
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
              <Paper key={i} sx={{ p: 2.5, bgcolor: '#FFFFFF', border: '1px solid #E2E7EE', borderRadius: 2 }}>
                <MuiSkeleton width={96} height={12} sx={{ bgcolor: '#E2E7EE', mb: 1.5 }} />
                <MuiSkeleton width={120} height={28} sx={{ bgcolor: '#E2E7EE', mb: 0.75 }} />
                <MuiSkeleton width={80} height={12} sx={{ bgcolor: '#E2E7EE' }} />
              </Paper>
            ))
          ) : (
            [
              { label: 'ETH Collateral',  value: `${colEth.toFixed(4)} ETH`,              sub: rm(colMYR),               sc: '#0E9F6E' },
              { label: 'Total Borrowed',  value: rm(borMYR, 2),                            sub: `${pct(ltvUsed)} LTV used`, sc: '#C77700' },
              { label: 'Accrued Interest',value: borMYR > 0 ? rm(accruedInt, 2) : '—',    sub: `${APR}% APR · ${daysElapsed}d elapsed`, sc: '#C77700' },
              { label: 'Health Factor',   value: isFinite(hf) ? hf.toFixed(2) : '∞',      sub: hLabel(hf),               sc: hc },
            ].map(s => (
              <Paper key={s.label} sx={{ p: 2.5, bgcolor: '#FFFFFF', border: '1px solid #E2E7EE', borderRadius: 2 }}>
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
                    <Paper key={i} sx={{ p: 2, bgcolor: '#F4F6F8', border: '1px solid #E2E7EE', borderRadius: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                        <MuiSkeleton width={112} height={12} sx={{ bgcolor: '#E2E7EE' }} />
                        <MuiSkeleton width={80} height={12} sx={{ bgcolor: '#E2E7EE' }} />
                      </Box>
                      <MuiSkeleton width="100%" height={8} sx={{ bgcolor: '#E2E7EE', borderRadius: 1 }} />
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
                      sx={{ height: 8, borderRadius: 1, bgcolor: '#E2E7EE', '& .MuiLinearProgress-bar': { bgcolor: '#627EEA', borderRadius: 1 } }} />
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
                      sx={{ height: 8, borderRadius: 1, bgcolor: '#E2E7EE',
                            '& .MuiLinearProgress-bar': { borderRadius: 1, bgcolor: ltvUsed > 60 ? '#E5484D' : ltvUsed > 40 ? '#C77700' : '#0E9F6E' } }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75 }}>
                      <Typography variant="caption" sx={{ color: '#8B96A5' }}>0%</Typography>
                      <Typography variant="caption" sx={{ color: '#8B96A5' }}>Liquidation risk &gt; 60%</Typography>
                      <Typography variant="caption" sx={{ color: '#8B96A5' }}>{MAX_LTV}%</Typography>
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
                      sx={{ height: 12, borderRadius: 1.5, bgcolor: '#E2E7EE', '& .MuiLinearProgress-bar': { bgcolor: hc, borderRadius: 1.5 } }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75 }}>
                      <Typography variant="caption" sx={{ color: '#8B96A5' }}>Liquidation (1.0)</Typography>
                      <Typography variant="caption" sx={{ color: '#8B96A5' }}>Moderate (1.5)</Typography>
                      <Typography variant="caption" sx={{ color: '#8B96A5' }}>Safe (2.0+)</Typography>
                    </Box>
                    {isLive && liqPrice > 0 && (
                      <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid #E2E7EE', display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" color="text.secondary">Liquidation price</Typography>
                        <Typography variant="caption" sx={{ color: '#E5484D' }}>
                          ≈ {rm(liqPrice)} / ETH
                          {priceDrop > 0 && <Box component="span" sx={{ color: '#5A6675' }}> ({priceDrop.toFixed(1)}% drop)</Box>}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 5, textAlign: 'center',
                            bgcolor: '#F4F6F8', border: '1px dashed #E2E7EE', borderRadius: 2 }}>
                  <Typography sx={{ fontSize: 36, mb: 1.5 }}>📭</Typography>
                  <Typography variant="body2" color="text.primary" sx={{ fontWeight: 500, mb: 0.5 }}>No open position</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 2.5 }}>Deposit ETH collateral to start borrowing</Typography>
                  <Button component={Link} href="/" variant="contained"
                    sx={{ bgcolor: '#2A3FD6', color: 'white', fontSize: 12, boxShadow: 'none',
                          '&:hover': { bgcolor: '#1E2FA8', boxShadow: 'none' } }}>
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
                      sx={{ height: 12, borderRadius: 1.5, bgcolor: '#E2E7EE',
                            '& .MuiLinearProgress-bar': { bgcolor: '#2A3FD6', borderRadius: 1.5 } }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.75 }}>
                      <Typography variant="caption" color="text.secondary">{daysElapsed} days elapsed</Typography>
                      <Typography variant="caption" color="text.secondary">{daysLeft} days remaining</Typography>
                    </Box>
                  </Box>
                )}

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {[
                    { label: 'Principal Borrowed',       value: rm(borMYR, 2),               sub: 'Original loan amount',              vc: '#10151C' },
                    { label: 'Origination Fee (0.1%)',   value: rm(origFee, 2),               sub: 'Charged at disbursement',           vc: '#5A6675' },
                    { label: 'Accrued Interest',         value: rm(accruedInt, 2),            sub: `${APR}% APR × ${daysElapsed} days`, vc: '#C77700' },
                    { label: 'Daily Interest Rate',      value: rm(dailyInt, 2) + '/day',     sub: 'Accruing continuously',             vc: '#5A6675' },
                    { label: 'Projected Total Interest', value: rm(projTotalInt, 2),          sub: `If held full ${LOAN_TERM} days`,    vc: '#5A6675' },
                  ].map(r => (
                    <Box key={r.label} sx={{ ...rowSx, display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5 }}>
                      <Box>
                        <Typography variant="caption" color="text.primary" sx={{ fontWeight: 500 }}>{r.label}</Typography>
                        <Typography variant="caption" sx={{ color: '#8B96A5', display: 'block' }}>{r.sub}</Typography>
                      </Box>
                      <Typography variant="body2" sx={{ color: r.vc, fontWeight: 600 }}>{r.value}</Typography>
                    </Box>
                  ))}

                  <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(42,63,214,0.06)', border: '1px solid rgba(42,63,214,0.2)' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>Repay Today</Typography>
                        <Typography variant="caption" color="text.secondary">Principal + accrued interest</Typography>
                      </Box>
                      <Typography variant="h6" sx={{ color: '#2A3FD6', fontWeight: 700 }}>{rm(totalRepay, 2)}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ ...rowSx, p: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="body2" color="text.primary" sx={{ fontWeight: 500 }}>Full-Term Repayment</Typography>
                        <Typography variant="caption" color="text.secondary">If held to {LOAN_TERM}-day maturity</Typography>
                      </Box>
                      <Typography variant="body2" sx={{ color: '#5A6675', fontWeight: 600 }}>{rm(fullRepay, 2)}</Typography>
                    </Box>
                  </Box>
                </Box>

                <Button component={Link} href="/?tab=repay" fullWidth variant="contained"
                  sx={{ mt: 3, py: 1.25, bgcolor: '#2A3FD6', color: 'white', boxShadow: 'none',
                        '&:hover': { bgcolor: '#1E2FA8', boxShadow: 'none' } }}>
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
                              bgcolor: '#F4F6F8', border: '1px dashed #E2E7EE', borderRadius: 2 }}>
                    <Typography sx={{ fontSize: 28, mb: 1 }}>📋</Typography>
                    <Typography variant="body2" color="text.primary" sx={{ fontWeight: 500, mb: 0.5 }}>No transactions yet</Typography>
                    <Typography variant="caption" color="text.secondary">Deposit collateral or borrow MYR to see history</Typography>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {txHistory.map((tx, i) => {
                      const isMyr  = tx.type === 'Borrowed' || tx.type === 'Repaid';
                      const fmtAmt = isMyr
                        ? 'RM ' + (Number(tx.amount) / 1e6).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : parseFloat(ethers.formatEther(tx.amount)).toFixed(4) + ' ETH';
                      return (
                        <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, bgcolor: '#F4F6F8', border: '1px solid #E2E7EE', borderRadius: 2 }}>
                          <Box sx={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, fontSize: 18,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      bgcolor: `${COLORS[tx.type]}1A` }}>
                            {ICONS[tx.type]}
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>{LABELS[tx.type]}</Typography>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#8B96A5' }} noWrap>
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

            {/* Bank Transfer History */}
            <Paper sx={cardSx}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h6" color="text.primary" sx={{ fontWeight: 600 }}>Bank Transfers</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {transfersLoading && <Typography variant="caption" color="text.secondary">Loading…</Typography>}
                  <Button size="small" onClick={() => window.location.assign('/settings')}
                    sx={{ fontSize: 11, color: '#2A3FD6', border: '1px solid rgba(42,63,214,0.25)', bgcolor: 'transparent',
                          '&:hover': { bgcolor: 'rgba(42,63,214,0.06)' } }}>
                    + Add Bank
                  </Button>
                </Box>
              </Box>

              {transfers.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography sx={{ fontSize: 32, mb: 1 }}>🏦</Typography>
                  <Typography variant="body2" color="text.secondary">No bank transfers yet.</Typography>
                  <Typography variant="caption" color="text.secondary">
                    When you borrow and choose "Bank Transfer", disbursements will appear here.
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {transfers.map(t => {
                    const st = TRANSFER_STATUS[t.status] ?? TRANSFER_STATUS.PENDING;
                    return (
                      <Box key={t.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5,
                                            bgcolor: '#F4F6F8', border: '1px solid #E2E7EE', borderRadius: 2 }}>
                        <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: 'rgba(42,63,214,0.1)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                          🏦
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                            <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>
                              {t.bankName} ****{t.accountLast4}
                            </Typography>
                            <Chip label={st.label} size="small"
                              sx={{ height: 18, fontSize: 10, bgcolor: st.bg, color: st.color, border: `1px solid ${st.color}44` }} />
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {t.referenceNo} · {new Date(t.createdAt).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#0E9F6E' }}>
                            {rm(t.amountMYR, 2)}
                          </Typography>
                          {t.completedAt && (
                            <Typography variant="caption" color="text.secondary">
                              {new Date(t.completedAt).toLocaleString('en-MY', { hour: '2-digit', minute: '2-digit' })}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Paper>

            {/* Wallet Balances */}
            <Paper sx={cardSx}>
              <Typography variant="h6" color="text.primary" sx={{ fontWeight: 600, mb: 3 }}>Wallet Balances</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {isLive && wallet.isRefreshing ? (
                  [0,1].map(i => <RowSkeleton key={i} />)
                ) : (
                  <>
                    {/* ETH row */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bgcolor: '#F4F6F8', border: '1px solid #E2E7EE', borderRadius: 2 }}>
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
                    <Box sx={{ p: 1.5, bgcolor: '#F4F6F8', border: '1px solid #E2E7EE', borderRadius: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: '#0E9F6E1A', color: '#0E9F6E',
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
                          sx={{ mt: 1.25, width: '100%', fontSize: 11, borderColor: 'rgba(14,159,110,0.25)',
                                color: '#0E9F6E', '&:hover': { bgcolor: 'rgba(14,159,110,0.06)', borderColor: '#0E9F6E' } }}>
                          + Add MockMYR to MetaMask
                        </Button>
                      )}
                      {isLive && wallet.myrTokenAdded && (
                        <Typography variant="caption" sx={{ mt: 1.25, display: 'block', color: '#5A6675', fontWeight: 600 }}>
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
                  { label: 'Annual Rate (APR)',      value: `${APR}%`,             vc: '#0E9F6E' },
                  { label: 'Max LTV',                value: `${MAX_LTV}%`,         vc: '#10151C' },
                  { label: 'Liquidation Threshold',  value: `${LIQ_THRES}% LTV`,  vc: '#10151C' },
                  { label: 'Origination Fee',        value: `${ORIG_FEE * 100}%`,  vc: '#10151C' },
                  { label: 'Collateral Asset',       value: 'ETH',                 vc: '#627EEA' },
                  { label: 'Borrow Asset',           value: 'MYR (Mock)',          vc: '#0E9F6E' },
                  { label: 'Interest Type',          value: 'Variable APR',        vc: '#C77700' },
                  { label: 'Liquidation Penalty',    value: '10%',                 vc: '#E5484D' },
                ].map(r => (
                  <Box key={r.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #E2E7EE' }}>
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
                  { label: 'Deposit Collateral', sub: 'Add ETH to position',    href: '/?tab=deposit', bg: '#2A3FD6' },
                  { label: 'Borrow MYR',         sub: 'Borrow against ETH',     href: '/?tab=borrow',  bg: '#4458E8' },
                  { label: 'Repay Loan',         sub: 'Reduce debt + interest', href: '/?tab=repay',   bg: '#1E2FA8' },
                  { label: 'KYC Verification',   sub: 'Required to borrow',     href: '/kyc',          bg: '#2A3FD6' },
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
                  { label: 'Collateral Value', value: rm(colMYR),                   vc: '#0E9F6E' },
                  { label: 'Outstanding Debt', value: `− ${rm(borMYR, 2)}`,         vc: '#E5484D' },
                  { label: 'Accrued Interest', value: `− ${rm(accruedInt, 2)}`,     vc: '#C77700' },
                ].map(r => (
                  <Box key={r.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #E2E7EE' }}>
                    <Typography variant="caption" color="text.secondary">{r.label}</Typography>
                    <Typography variant="caption" sx={{ color: r.vc, fontWeight: 600 }}>{r.value}</Typography>
                  </Box>
                ))}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 1.5 }}>
                  <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>Net Equity</Typography>
                  <Typography variant="body2" sx={{ color: netMYR >= 0 ? '#0E9F6E' : '#E5484D', fontWeight: 700 }}>
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
                  { label: 'Address',   value: short(wallet.address!), vc: '#10151C', mono: true },
                  { label: 'Network',   value: isLive ? 'Hardhat Local' : 'Wrong network', vc: isLive ? '#0E9F6E' : '#E5484D' },
                  { label: 'Chain ID',  value: `${wallet.chainId ?? '—'}`, vc: '#10151C' },
                  { label: 'Contracts', value: wallet.isDeployed ? 'Deployed' : 'Not deployed', vc: '#10151C' },
                  { label: 'KYC',       value: wallet.kycApproved ? 'Approved' : 'Pending', vc: wallet.kycApproved ? '#0E9F6E' : '#C77700' },
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
