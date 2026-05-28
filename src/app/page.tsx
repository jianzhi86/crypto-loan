'use client';

import { useState } from 'react';
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
import Navbar from '@/components/Navbar';
import { useWallet } from '@/lib/WalletContext';
import { usePrices, SYMBOL_TO_ID } from '@/hooks/usePrices';

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

function hColor(hf: number) { return !isFinite(hf) || hf >= 2 ? '#22c55e' : hf >= 1.5 ? '#eab308' : '#ef4444'; }
function hLabel(hf: number) { return !isFinite(hf) || hf >= 2 ? 'Safe' : hf >= 1.5 ? 'Moderate' : 'At Risk'; }
function rm(n: number, dec = 0) { return 'RM ' + n.toLocaleString('en-MY', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }

function Row({ label, value, vc, bold }: { label: string; value: string; vc?: string; bold?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="caption" sx={{ color: vc ?? '#F1F5F9', fontWeight: bold ? 600 : 400 }}>{value}</Typography>
    </Box>
  );
}

function StatCardSkeleton() {
  return (
    <Paper sx={{ p: 2.5, bgcolor: '#131629', border: '1px solid #1E2035', borderRadius: 2 }}>
      <MuiSkeleton width={80} height={12} sx={{ bgcolor: '#1E2035', mb: 1.5 }} />
      <MuiSkeleton width={120} height={28} sx={{ bgcolor: '#1E2035', mb: 0.75 }} />
      <MuiSkeleton width={96} height={12} sx={{ bgcolor: '#1E2035' }} />
    </Paper>
  );
}

const cardSx = { p: 3, bgcolor: '#131629', border: '1px solid #1E2035', borderRadius: 3 };
const rowBoxSx = { p: 1.5, bgcolor: '#0D0F1A', border: '1px solid #1E2035', borderRadius: 2 };

export default function Dashboard() {
  const wallet  = useWallet();
  const router  = useRouter();
  const { prices, loading, flash } = usePrices();

  const [calcAssetIdx, setCalcAssetIdx] = useState(() => {
    if (typeof window === 'undefined') return 1;
    const asset = new URLSearchParams(window.location.search).get('asset')?.toUpperCase();
    const idx = asset ? ASSETS.findIndex(a => a.symbol === asset) : -1;
    return idx >= 0 ? idx : 1;
  });
  const [collAmt, setCollAmt]             = useState('1');
  const [ltv, setLtv]                     = useState(50);
  const [activeTab, setActiveTab]         = useState<'deposit' | 'borrow' | 'repay'>(() => {
    if (typeof window === 'undefined') return 'deposit';
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'borrow' || tab === 'repay') return tab;
    return 'deposit';
  });
  const [depositAmt, setDepositAmt]                   = useState('');
  const [borrowAmt, setBorrowAmt]                     = useState('');
  const [repayAmt, setRepayAmt]                       = useState('');
  const [loanTermDays, setLoanTermDays]               = useState(90);
  const [holdMultiplier, setHoldMultiplier]           = useState(1.5);
  const [deliveryMethod, setDeliveryMethod]           = useState<'token' | 'bank'>('token');
  const [transferResult, setTransferResult]           = useState<{ refNo: string; bankName: string; last4: string } | null>(null);
  const [transferError, setTransferError]             = useState('');

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

  const colAmtNum    = parseFloat(collAmt || '0');
  const targetPrice  = assetPrice * holdMultiplier;
  const ethGain      = colAmtNum * assetPrice * (holdMultiplier - 1);
  const netAdvantage = ethGain - calcInterest;
  const breakEvenPrice   = colAmtNum > 0 ? (collUSD + calcInterest) / colAmtNum : 0;
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

  const ltvColor = ltvPct > 0.85 ? '#ef4444' : ltvPct > 0.6 ? '#eab308' : '#06B6D4';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0D0F1A' }}>
      <Navbar />
      <Box component="main" sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, sm: 3 }, py: 4 }}>

        {/* Protocol Stats Banner */}
        <Paper sx={{ p: 3, mb: 4, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 3,
                      background: 'linear-gradient(135deg, #12152A 0%, #0D1020 100%)', border: '1px solid #1E2035', borderRadius: 3 }}>
          {[
            { label: 'Total Value Locked', value: 'RM 892M',   sub: '+3.2% this week',   color: '#22c55e' },
            { label: 'Active Loans',       value: '2,847',     sub: 'Across all assets',  color: '#06B6D4' },
            { label: 'Total Borrowed',     value: 'RM 534M',   sub: '59.9% utilisation',  color: '#eab308' },
            { label: 'Base Borrow Rate',   value: '4.80% APR', sub: 'ETH collateral',     color: '#A78BFA' },
          ].map(s => (
            <Box key={s.label}>
              <Typography variant="caption" sx={{ color: '#475569', display: 'block', mb: 0.5 }}>{s.label}</Typography>
              <Typography variant="h5" sx={{ color: s.color, fontWeight: 700, my: 0.25 }}>{s.value}</Typography>
              <Typography variant="caption" sx={{ color: '#475569' }}>{s.sub}</Typography>
            </Box>
          ))}
        </Paper>

        {/* User Stats */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
          {isLive && wallet.isRefreshing ? (
            [0,1,2,3].map(i => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <Paper sx={{ p: 2.5, bgcolor: '#131629', border: '1px solid #1E2035', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">My Collateral</Typography>
                <Typography variant="h5" color="text.primary" sx={{ fontWeight: 700, my: 0.5 }}>
                  {isLive && liveColMktMYR !== null ? rm(liveColMktMYR) : 'RM 233,838'}
                </Typography>
                <Typography variant="caption" sx={{ color: '#22c55e' }}>
                  {isLive ? `${colEth.toFixed(4)} ETH · live market` : 'Demo data'}
                </Typography>
                {isLive && liveColMYR !== null && hasPriceMismatch && (
                  <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mt: 0.5 }}>
                    Contract: {rm(liveColMYR)}
                  </Typography>
                )}
              </Paper>

              <Paper sx={{ p: 2.5, bgcolor: '#131629', border: '1px solid #1E2035', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">Outstanding Debt</Typography>
                <Typography variant="h5" color="text.primary" sx={{ fontWeight: 700, my: 0.5 }}>
                  {isLive && liveBorMYR !== null ? rm(liveBorMYR, 2) : 'RM 129,000'}
                </Typography>
                <Typography variant="caption" sx={{ color: '#eab308' }}>
                  {isLive ? `${wallet.myrBalance} MYR balance` : '55.2% utilisation'}
                </Typography>
              </Paper>

              <Paper sx={{ p: 2.5, bgcolor: '#131629', border: '1px solid #1E2035', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">Net Position</Typography>
                <Typography variant="h5" color="text.primary" sx={{ fontWeight: 700, my: 0.5 }}>
                  {isLive && mktNetPos !== null ? rm(mktNetPos) : 'RM 104,838'}
                </Typography>
                <Typography variant="caption" sx={{ color: mktNetPos !== null && mktNetPos >= 0 ? '#22c55e' : '#ef4444' }}>
                  {isLive ? 'Market collateral − Debt' : 'Demo data'}
                </Typography>
              </Paper>

              <Paper sx={{ p: 2.5, bgcolor: '#131629', border: '1px solid #1E2035', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">Health Factor</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, my: 0.5,
                  color: isLive && mktHF !== null ? hColor(mktHF) : isLive && liveHF !== null ? hColor(liveHF) : '#eab308' }}>
                  {isLive && mktHF !== null
                    ? (isFinite(mktHF) ? mktHF.toFixed(2) : '∞')
                    : isLive && liveHF !== null
                      ? (isFinite(liveHF) ? liveHF.toFixed(2) : '∞')
                      : '1.58'}
                </Typography>
                <Typography variant="caption" sx={{ color: isLive && mktHF !== null ? hColor(mktHF) : '#eab308' }}>
                  {isLive && mktHF !== null
                    ? `${hLabel(mktHF)} · market price`
                    : isLive && liveHF !== null ? hLabel(liveHF) : 'Moderate risk'}
                </Typography>
                {isLive && liveHF !== null && hasPriceMismatch && (
                  <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mt: 0.5 }}>
                    Contract HF: {isFinite(liveHF) ? liveHF.toFixed(2) : '∞'}
                  </Typography>
                )}
              </Paper>
            </>
          )}
        </Box>

        {/* Price Mismatch Warning */}
        {hasPriceMismatch && (
          <Alert severity="warning" icon={<Typography sx={{ fontSize: 16 }}>⚠️</Typography>}
            sx={{ mb: 3, bgcolor: '#1C1200', color: '#fbbf24', border: '1px solid #854d0e55',
                  '& .MuiAlert-icon': { color: '#fbbf24' }, borderRadius: 2 }}
            action={
              <Button size="small" onClick={async () => {
                await fetch('/api/admin/sync-price', { method: 'POST' });
                wallet.refresh();
              }}
                sx={{ color: '#06B6D4', borderColor: 'rgba(6,182,212,0.3)', border: '1px solid', fontSize: 11,
                      whiteSpace: 'nowrap', '&:hover': { bgcolor: 'rgba(6,182,212,0.1)' } }}>
                ⟳ Sync Price
              </Button>
            }>
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#fbbf24' }}>
              On-chain price differs from live market
            </Typography>
            <Typography variant="caption" sx={{ color: '#92400e', display: 'block', mt: 0.5 }}>
              Contract uses{' '}
              <Box component="span" sx={{ color: '#fbbf24' }}>{rm(onChainPrice)}/ETH</Box>
              {' '}·{' '}
              Live price is{' '}
              <Box component="span" sx={{ color: '#fbbf24' }}>{rm(mktEthPrice)}/ETH</Box>
              {' '}({priceDiffPct.toFixed(1)}% diff). Your collateral is worth{' '}
              <Box component="span" sx={{ color: '#fbbf24' }}>
                {colEth > 0 ? rm(colEth * mktEthPrice) : 'less'} at market
              </Box>
              {' '}vs{' '}
              <Box component="span" sx={{ color: '#92400e' }}>
                {colEth > 0 ? rm(colEth * onChainPrice) : 'more'} on-chain
              </Box>.
            </Typography>
          </Alert>
        )}

        {/* How It Works */}
        {!wallet.isConnected && (
          <Paper sx={{ ...cardSx, mb: 4 }}>
            <Typography variant="h6" color="text.primary" sx={{ fontWeight: 600, mb: 3 }}>How CryptoLend Works</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' }, gap: 2 }}>
              {[
                { step: '01', icon: '🪪', title: 'Complete KYC',      desc: 'Verify your identity as required by Malaysian financial regulations (BNM).' },
                { step: '02', icon: '🔒', title: 'Deposit Collateral', desc: 'Lock your crypto (ETH, BTC, SOL) as collateral to secure your loan.' },
                { step: '03', icon: '💸', title: 'Borrow MYR',         desc: 'Receive Mock Malaysian Ringgit instantly — up to 70% of your collateral value.' },
                { step: '04', icon: '✅', title: 'Repay & Unlock',     desc: 'Repay your loan at any time to unlock and withdraw your collateral.' },
              ].map(s => (
                <Box key={s.step} sx={{ p: 2, bgcolor: '#0D0F1A', border: '1px solid #1E2035', borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <Box sx={{ px: 1, py: 0.25, borderRadius: 999, bgcolor: '#7C3AED22' }}>
                      <Typography variant="caption" sx={{ color: '#A78BFA', fontWeight: 700 }}>{s.step}</Typography>
                    </Box>
                    <Typography sx={{ fontSize: 20 }}>{s.icon}</Typography>
                  </Box>
                  <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600, mb: 0.5 }}>{s.title}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>{s.desc}</Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        )}

        {/* Main grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, gap: 3 }}>

          {/* ── Left column ── */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* Loan Calculator */}
            <Paper sx={cardSx}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h6" color="text.primary" sx={{ fontWeight: 600 }}>Loan Calculator</Typography>
                <Chip label={loading ? 'Loading prices…' : 'Live MYR prices'} size="small"
                  sx={{ bgcolor: loading ? '#1E2035' : '#06B6D422', color: loading ? '#64748B' : '#06B6D4', fontSize: 11 }} />
              </Box>

              {/* Asset selector */}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Collateral Asset</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(5, 1fr)', lg: 'repeat(3, 1fr)', xl: 'repeat(5, 1fr)' }, gap: 1, mb: 3 }}>
                {ASSETS.map((asset, i) => {
                  const p   = prices[SYMBOL_TO_ID[asset.symbol]];
                  const myr = p?.myr ?? 0;
                  const fmt = myr >= 100000 ? `RM ${(myr / 1000).toFixed(0)}K`
                            : myr >= 1000   ? `RM ${(myr / 1000).toFixed(1)}K`
                            : myr >= 1      ? `RM ${myr.toFixed(0)}`
                            :                 `RM ${myr.toFixed(2)}`;
                  return (
                    <Box key={asset.symbol}
                      onClick={() => { setCalcAssetIdx(i); setLtv(Math.min(ltv, asset.maxLTV)); }}
                      sx={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
                        p: 1.5, borderRadius: 2, cursor: 'pointer', transition: 'all 0.15s', minWidth: 0,
                        bgcolor: calcAssetIdx === i ? '#1E1B3A' : '#0D0F1A',
                        border: `1px solid ${calcAssetIdx === i ? '#7C3AED' : '#1E2035'}`,
                        '&:hover': { borderColor: '#7C3AED' },
                      }}>
                      <Typography sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1, color: asset.color }}>{asset.icon}</Typography>
                      <Typography variant="caption" color="text.primary" sx={{ fontWeight: 600 }}>{asset.symbol}</Typography>
                      <Typography variant="caption" sx={{ color: '#64748B', fontSize: 10 }}>{loading ? '…' : fmt}</Typography>
                    </Box>
                  );
                })}
              </Box>

              {/* Collateral Amount */}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Collateral Amount</Typography>
              <Box sx={{ ...rowBoxSx, display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.75 }}>
                <Typography sx={{ fontSize: 20, fontWeight: 700, color: calcAsset.color, lineHeight: 1 }}>{calcAsset.icon}</Typography>
                <InputBase type="number" value={collAmt} onChange={e => setCollAmt(e.target.value)}
                  placeholder="0.00" sx={{ flex: 1, color: 'text.primary', fontSize: 18, fontWeight: 500 }} />
                <Typography variant="caption" sx={{ color: '#64748B', fontWeight: 600 }}>{calcAsset.symbol}</Typography>
              </Box>
              <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mb: 3 }}>≈ {rm(collUSD, 2)} MYR</Typography>

              {/* LTV Slider */}
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="caption" color="text.secondary">Loan-to-Value (LTV)</Typography>
                  <Typography variant="caption" sx={{ color: ltvColor, fontWeight: 600 }}>
                    {ltv}% / {calcAsset.maxLTV}% max
                  </Typography>
                </Box>
                <Slider min={0} max={calcAsset.maxLTV} value={ltv}
                  onChange={(_, val) => setLtv(val as number)}
                  sx={{ color: ltvColor, '& .MuiSlider-thumb': { width: 16, height: 16 } }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary">0%</Typography>
                  <Typography variant="caption" sx={{ color: '#22c55e' }}>Safe ≤50%</Typography>
                  <Typography variant="caption" sx={{ color: '#ef4444' }}>Max {calcAsset.maxLTV}%</Typography>
                </Box>
              </Box>

              {/* Loan Term */}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Loan Term</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1, mb: 3 }}>
                {LOAN_TERMS.map(t => (
                  <Box key={t.days} onClick={() => setLoanTermDays(t.days)}
                    sx={{
                      py: 1, textAlign: 'center', borderRadius: 1.5, cursor: 'pointer', transition: 'all 0.15s',
                      bgcolor: loanTermDays === t.days ? '#7C3AED' : '#0D0F1A',
                      border: `1px solid ${loanTermDays === t.days ? '#7C3AED' : '#1E2035'}`,
                    }}>
                    <Typography variant="caption" sx={{ color: loanTermDays === t.days ? 'white' : '#64748B', fontWeight: 600 }}>
                      {t.label}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {/* Hold vs Sell Comparison */}
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">Why Not Just Sell? — Price Scenario</Typography>
                  <Typography variant="caption" sx={{ color: '#64748B' }}>
                    {calcAsset.symbol} at {holdMultiplier}× = {rm(targetPrice)}
                  </Typography>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1, mb: 2 }}>
                  {[
                    { label: 'Flat', mult: 1.0 },
                    { label: '+50%', mult: 1.5 },
                    { label: '2×',   mult: 2.0 },
                    { label: '3×',   mult: 3.0 },
                  ].map(opt => (
                    <Box key={opt.mult} onClick={() => setHoldMultiplier(opt.mult)}
                      sx={{
                        py: 1, textAlign: 'center', borderRadius: 1.5, cursor: 'pointer', transition: 'all 0.15s',
                        bgcolor: holdMultiplier === opt.mult ? '#22c55e' : '#0D0F1A',
                        border: `1px solid ${holdMultiplier === opt.mult ? '#22c55e' : '#1E2035'}`,
                      }}>
                      <Typography variant="caption" sx={{ color: holdMultiplier === opt.mult ? 'white' : '#64748B', fontWeight: 600 }}>
                        {opt.label}
                      </Typography>
                    </Box>
                  ))}
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                  {/* Sell */}
                  <Box sx={{ p: 1.5, bgcolor: '#0D0F1A', border: '1px solid #ef444433', borderRadius: 2 }}>
                    <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 600, display: 'block', mb: 1 }}>✗ Sell Today</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>You receive</Typography>
                    <Typography variant="body1" color="text.primary" sx={{ fontWeight: 700 }}>{rm(collUSD)}</Typography>
                    <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid #1E2035', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Row label="Cash" value={rm(collUSD)} />
                      <Row label={`${calcAsset.symbol} position`} value="Gone" vc="#ef4444" />
                      <Row label={`If ${calcAsset.symbol} → ${rm(targetPrice)}`} value={`Miss ${rm(ethGain)}`} vc="#ef4444" />
                    </Box>
                  </Box>

                  {/* Borrow + Hold */}
                  <Box sx={{ p: 1.5, bgcolor: '#0D0F1A', border: '1px solid #22c55e33', borderRadius: 2 }}>
                    <Typography variant="caption" sx={{ color: '#22c55e', fontWeight: 600, display: 'block', mb: 1 }}>✓ Borrow + Hold</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>Cash + ETH upside</Typography>
                    <Typography variant="body1" color="text.primary" sx={{ fontWeight: 700 }}>
                      {rm(borrowable)}{' '}
                      <Box component="span" sx={{ fontSize: 11, color: '#64748B', fontWeight: 400 }}>+ ETH</Box>
                    </Typography>
                    <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid #1E2035', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Row label="Cash borrowed" value={rm(borrowable)} />
                      <Row label={`${calcAsset.symbol} position`} value="Kept" vc="#22c55e" />
                      <Row label={`Gain at ${rm(targetPrice)}`} value={`+${rm(ethGain)}`} vc={ethGain > 0 ? '#22c55e' : '#94A3B8'} />
                      <Row label={`Interest (${loanTermDays}d)`} value={`−${rm(calcInterest, 2)}`} vc="#eab308" />
                    </Box>
                  </Box>
                </Box>

                {/* Net advantage */}
                <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 2,
                    background: netAdvantage >= 0 ? 'linear-gradient(135deg, #05140a, #052e16)' : 'linear-gradient(135deg, #1a0505, #450a0a)',
                    border: `1px solid ${netAdvantage >= 0 ? '#22c55e33' : '#ef444433'}` }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography variant="caption" sx={{ color: netAdvantage >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                        {netAdvantage >= 0 ? '✓ Borrowing wins by' : '✗ Selling was better by'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#64748B', display: 'block', mt: 0.5 }}>
                        vs selling at today&apos;s price ({rm(assetPrice)})
                      </Typography>
                    </Box>
                    <Typography variant="h6" sx={{ color: netAdvantage >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                      {rm(Math.abs(netAdvantage))}
                    </Typography>
                  </Box>
                  {assetPrice > 0 && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 1, pt: 1,
                        borderTop: `1px solid ${netAdvantage >= 0 ? '#22c55e22' : '#ef444422'}`, color: '#64748B' }}>
                      Break-even: {calcAsset.symbol} needs to drop below {rm(breakEvenPrice)} (−{breakEvenDropPct.toFixed(1)}% from today) for selling to have been smarter.
                    </Typography>
                  )}
                </Box>
              </Box>

              {/* Result card */}
              <Box sx={{ p: 2.5, borderRadius: 2, background: 'linear-gradient(135deg, #1A1535 0%, #0D1520 100%)', border: '1px solid #7C3AED33' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2.5 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>You Can Borrow</Typography>
                    <Typography variant="h4" sx={{ color: '#06B6D4', fontWeight: 700 }}>{rm(borrowable)}</Typography>
                    <Typography variant="caption" color="text.secondary">Malaysian Ringgit</Typography>
                  </Box>
                  <Chip label={`HF ${isFinite(calcHF) ? calcHF.toFixed(2) : '∞'}`} size="small"
                    sx={{ bgcolor: `${hColor(calcHF)}22`, color: hColor(calcHF), fontWeight: 600 }} />
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 2, borderTop: '1px solid #7C3AED22', mb: 2.5 }}>
                  <Row label="Interest Rate"           value={`${calcAsset.borrowAPR}% APR`} />
                  <Row label={`Interest (${loanTermDays}d)`} value={rm(calcInterest, 2)} vc="#eab308" />
                  <Row label="Origination Fee (0.1%)"  value={rm(originationFee, 2)} />
                  <Row label="Monthly Payment"         value={rm(calcMonthly, 2)} vc="#A78BFA" />
                  <Box sx={{ pt: 1, borderTop: '1px solid #7C3AED22' }}>
                    <Row label="Total Repayment"       value={rm(calcTotal, 2)} vc="#22c55e" bold />
                  </Box>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, pt: 2, borderTop: '1px solid #7C3AED22' }}>
                  {[
                    { label: 'Liq. Price',      value: rm(assetPrice * (1 - calcAsset.maxLTV / 100 * 0.9)) },
                    { label: 'Min. Collateral', value: (borrowable / assetPrice / (calcAsset.maxLTV / 100)).toFixed(4) + ' ' + calcAsset.symbol },
                  ].map(({ label, value }) => (
                    <Box key={label}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>{label}</Typography>
                      <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>{value}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Paper>

            {/* Supported Assets Table */}
            <Paper sx={cardSx}>
              <Typography variant="h6" color="text.primary" sx={{ fontWeight: 600, mb: 3 }}>Supported Assets</Typography>
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 480 }}>
                  <TableHead>
                    <TableRow>
                      {['Asset', 'Price (MYR)', 'Max LTV', 'Borrow APR', 'Supply APR', 'Liquidity'].map(h => (
                        <TableCell key={h} sx={{ color: '#64748B', bgcolor: 'transparent', fontSize: 11, fontWeight: 500, border: 'none', borderBottom: '1px solid #1E2035', pb: 1.5 }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ASSETS.map((a, i) => {
                      const p = prices[SYMBOL_TO_ID[a.symbol]];
                      const change = p?.change24h ?? 0;
                      return (
                        <TableRow key={a.symbol} onClick={() => setCalcAssetIdx(i)}
                          sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'rgba(124,58,237,0.04)' } }}>
                          <TableCell sx={{ borderColor: i < ASSETS.length - 1 ? '#1E2035' : 'transparent', py: 1.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                              <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: `${a.color}1A`, color: a.color,
                                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                                {a.icon}
                              </Box>
                              <Box>
                                <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>{a.symbol}</Typography>
                                <Typography variant="caption" color="text.secondary">{a.name}</Typography>
                              </Box>
                            </Box>
                          </TableCell>
                          <TableCell className={flash[SYMBOL_TO_ID[a.symbol]] ? `price-flash-${flash[SYMBOL_TO_ID[a.symbol]]}` : ''}
                            sx={{ borderColor: i < ASSETS.length - 1 ? '#1E2035' : 'transparent', py: 1.5 }}>
                            <Typography variant="body2" color="text.primary" sx={{ fontWeight: 500 }}>
                              {loading ? '…' : `RM ${(p?.myr ?? 0).toLocaleString()}`}
                            </Typography>
                            <Typography variant="caption" sx={{ color: change >= 0 ? '#22c55e' : '#ef4444' }}>
                              {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ borderColor: i < ASSETS.length - 1 ? '#1E2035' : 'transparent', py: 1.5 }}>
                            <Typography variant="body2" sx={{ color: '#06B6D4', fontWeight: 600 }}>{a.maxLTV}%</Typography>
                          </TableCell>
                          <TableCell sx={{ borderColor: i < ASSETS.length - 1 ? '#1E2035' : 'transparent', py: 1.5 }}>
                            <Chip label={`${a.borrowAPR}%`} size="small" sx={{ bgcolor: '#ef444420', color: '#ef4444', fontSize: 11, fontWeight: 600, height: 20 }} />
                          </TableCell>
                          <TableCell sx={{ borderColor: i < ASSETS.length - 1 ? '#1E2035' : 'transparent', py: 1.5 }}>
                            <Chip label={`${a.supplyAPR}%`} size="small" sx={{ bgcolor: '#22c55e20', color: '#22c55e', fontSize: 11, fontWeight: 600, height: 20 }} />
                          </TableCell>
                          <TableCell sx={{ borderColor: i < ASSETS.length - 1 ? '#1E2035' : 'transparent', py: 1.5 }}>
                            <Typography variant="caption" color="text.secondary">{a.liquidity}</Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Box>

          {/* ── Right column ── */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* My Active Loans */}
            <Paper sx={cardSx}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h6" color="text.primary" sx={{ fontWeight: 600 }}>My Active Loans</Typography>
                <Chip label={isLive ? 'Live' : 'Demo'} size="small"
                  sx={{ bgcolor: isLive ? '#22c55e22' : '#7C3AED22', color: isLive ? '#22c55e' : '#A78BFA', fontWeight: 600, fontSize: 11 }} />
              </Box>

              {isLive && wallet.loanInfo && (() => {
                const { collateral, borrowed, healthFactor: hf, available } = wallet.loanInfo;
                const hc     = hColor(hf);
                const colEth = parseFloat(ethers.formatEther(collateral)).toFixed(4);
                const borMYR = (Number(borrowed) / 1e6).toFixed(2);
                const avMYR  = (Number(available) / 1e6).toFixed(2);
                const ltvNow = wallet.loanInfo.collateralValueMYR > 0
                  ? ((Number(borrowed) / 1e6) / wallet.loanInfo.collateralValueMYR * 100).toFixed(1)
                  : '0.0';
                const hasLoan = collateral > BigInt(0);
                return hasLoan ? (
                  <Box sx={{ p: 2, bgcolor: '#0D0F1A', border: '1px solid #1E2035', borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: '#627EEA1A', color: '#627EEA',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>Ξ</Box>
                        <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>ETH → MYR Loan</Typography>
                      </Box>
                      <Chip label={hLabel(hf)} size="small" sx={{ bgcolor: `${hc}1A`, color: hc, fontWeight: 600, fontSize: 11, height: 20 }} />
                    </Box>

                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Collateral Locked</Typography>
                        <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600, my: 0.25 }}>{colEth} ETH</Typography>
                        <Typography variant="caption" color="text.secondary">{rm(wallet.loanInfo.collateralValueMYR)}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Outstanding Debt</Typography>
                        <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600, my: 0.25 }}>RM {borMYR}</Typography>
                        <Typography variant="caption" color="text.secondary">{ltvNow}% LTV · 4.8% APR</Typography>
                      </Box>
                    </Box>

                    {Number(borrowed) > 0 && (
                      <Box sx={{ mb: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                          <Typography variant="caption" color="text.secondary">Health Factor</Typography>
                          <Typography variant="caption" sx={{ color: hc, fontWeight: 600 }}>{isFinite(hf) ? hf.toFixed(2) : '∞'}</Typography>
                        </Box>
                        <LinearProgress variant="determinate" value={Math.min((isFinite(hf) ? hf : 3) / 3 * 100, 100)}
                          sx={{ height: 6, borderRadius: 1, bgcolor: '#1E2035', '& .MuiLinearProgress-bar': { bgcolor: hc, borderRadius: 1 } }} />
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                          <Typography variant="caption" sx={{ color: '#475569', fontSize: 10 }}>Liquidation (1.0)</Typography>
                          <Typography variant="caption" sx={{ color: '#475569', fontSize: 10 }}>Safe (2.0+)</Typography>
                        </Box>
                        {hf < 1.5 && isFinite(hf) && (
                          <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#450a0a44', border: '1px solid #ef444433', borderRadius: 1.5 }}>
                            <Typography variant="caption" sx={{ color: '#ef4444' }}>
                              ⚠ Risk Alert: Your health factor is below 1.5. Consider repaying or adding collateral.
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    )}

                    <Box sx={{ pt: 1.5, borderTop: '1px solid #1E2035' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                        <Typography variant="caption" color="text.secondary">Available to borrow</Typography>
                        <Typography variant="caption" sx={{ color: '#06B6D4', fontWeight: 600 }}>RM {avMYR}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button fullWidth size="small" onClick={() => setActiveTab('deposit')}
                          sx={{ bgcolor: '#7C3AED22', color: '#A78BFA', fontSize: 11, '&:hover': { bgcolor: '#7C3AED44' } }}>
                          Add Collateral
                        </Button>
                        <Button fullWidth size="small" onClick={() => setActiveTab('repay')}
                          sx={{ bgcolor: '#06B6D422', color: '#06B6D4', fontSize: 11, '&:hover': { bgcolor: '#06B6D444' } }}>
                          Repay Loan
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4, textAlign: 'center',
                              bgcolor: '#0D0F1A', border: '1px dashed #1E2035', borderRadius: 2 }}>
                    <Typography sx={{ fontSize: 36, mb: 1 }}>🏦</Typography>
                    <Typography variant="body2" color="text.primary" sx={{ fontWeight: 500, mb: 0.5 }}>No Active Loan</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 2.5 }}>Deposit ETH collateral to start borrowing MYR</Typography>
                    <Button size="small" variant="contained" onClick={() => setActiveTab('deposit')}
                      sx={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)', color: 'white',
                            '&:hover': { background: 'linear-gradient(135deg, #6d28d9, #0891B2)' } }}>
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
                      <Box key={loan.id} sx={{ p: 2, bgcolor: '#0D0F1A', border: '1px solid #1E2035', borderRadius: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: `${meta.color}1A`, color: meta.color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                              {meta.icon}
                            </Box>
                            <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>{loan.collateral} → MYR</Typography>
                          </Box>
                          <Chip label={hLabel(loan.hf)} size="small" sx={{ bgcolor: `${hc}1A`, color: hc, fontWeight: 600, fontSize: 11, height: 20 }} />
                        </Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 1.5 }}>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Collateral</Typography>
                            <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600, my: 0.25 }}>{loan.colAmt} {loan.collateral}</Typography>
                            <Typography variant="caption" color="text.secondary">{rm(loan.colVal)}</Typography>
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary">Outstanding Debt</Typography>
                            <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600, my: 0.25 }}>{rm(loan.borrowed)}</Typography>
                            <Typography variant="caption" color="text.secondary">{loan.apr}% APR · {loan.days}d</Typography>
                          </Box>
                        </Box>
                        <Box sx={{ pt: 1, borderTop: '1px solid #1E2035', display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="caption" color="text.secondary">Accrued interest</Typography>
                          <Typography variant="caption" sx={{ color: '#eab308' }}>
                            RM {((loan.borrowed * loan.apr / 100) * (loan.days / 365)).toFixed(2)}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                  <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', pt: 0.5 }}>
                    Connect MetaMask to interact with real contracts
                  </Typography>
                </Box>
              )}
            </Paper>

            {/* Deposit / Borrow / Repay */}
            <Paper sx={cardSx}>
              {/* Tab switcher */}
              <Box sx={{ display: 'flex', bgcolor: '#0D0F1A', borderRadius: 1.5, p: 0.5, mb: 3 }}>
                {(['deposit', 'borrow', 'repay'] as const).map(tab => (
                  <Box key={tab} onClick={() => setActiveTab(tab)}
                    sx={{ flex: 1, py: 1, textAlign: 'center', borderRadius: 1, cursor: 'pointer', transition: 'all 0.15s',
                          bgcolor: activeTab === tab ? '#7C3AED' : 'transparent' }}>
                    <Typography variant="caption" sx={{ color: activeTab === tab ? 'white' : '#64748B', fontWeight: 600 }}>
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {!wallet.isConnected && (
                <Box sx={{ mb: 2.5, p: 2, bgcolor: '#0D0F1A', border: '1px dashed #1E2035', borderRadius: 2, textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                    Connect MetaMask to use live transactions
                  </Typography>
                  <Button size="small" variant="contained" onClick={wallet.connect}
                    sx={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)', color: 'white', fontSize: 11,
                          '&:hover': { background: 'linear-gradient(135deg, #6d28d9, #0891B2)' } }}>
                    Connect Wallet
                  </Button>
                </Box>
              )}

              {/* DEPOSIT */}
              {activeTab === 'deposit' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>ETH Amount to Deposit</Typography>
                    <Box sx={{ ...rowBoxSx, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Typography sx={{ fontSize: 18, fontWeight: 700, color: '#627EEA', lineHeight: 1 }}>Ξ</Typography>
                      <InputBase type="number" value={depositAmt} onChange={e => setDepositAmt(e.target.value)}
                        placeholder="0.00" sx={{ flex: 1, color: 'text.primary', fontSize: 18, fontWeight: 500 }} />
                      <Button size="small" onClick={() => setDepositAmt(Math.max(0, parseFloat(wallet.ethBalance || '0') - 0.01).toFixed(4))}
                        sx={{ bgcolor: '#7C3AED22', color: '#A78BFA', fontSize: 10, minWidth: 'auto', py: 0.25, px: 1 }}>
                        MAX
                      </Button>
                    </Box>
                    {wallet.isConnected && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                        Wallet balance: {wallet.ethBalance} ETH
                      </Typography>
                    )}
                  </Box>

                  {(() => {
                    const depEth = parseFloat(depositAmt || '0');
                    const price  = isLive ? wallet.ethPriceMYR : ethPriceMYR;
                    const colValue  = depEth * price;
                    const maxBorrow = colValue * 0.70;
                    const alreadyBorrowed = isLive && wallet.loanInfo ? Number(wallet.loanInfo.borrowed) / 1e6 : 0;
                    const totalColAfter   = (isLive && wallet.loanInfo ? parseFloat(ethers.formatEther(wallet.loanInfo.collateral)) : 0) + depEth;
                    const totalColMYR     = totalColAfter * price;
                    const newMaxBorrow    = totalColMYR * 0.70;
                    const newAvailable    = Math.max(0, newMaxBorrow - alreadyBorrowed);
                    return (
                      <Box sx={{ ...rowBoxSx, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Typography variant="caption" color="text.primary" sx={{ fontWeight: 600 }}>Borrowing Power</Typography>
                        <Row label="ETH Price (on-chain)"                                       value={rm(price)} />
                        <Row label={`${depEth.toFixed(4)} ETH × RM ${price.toLocaleString()}`} value={rm(colValue)} />
                        <Row label="× Max LTV (70%)"                                            value={`= ${rm(maxBorrow)}`} vc="#06B6D4" />
                        {isLive && alreadyBorrowed > 0 && (
                          <Box sx={{ pt: 1, borderTop: '1px solid #1E2035', display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Row label="Total collateral after deposit" value={`${totalColAfter.toFixed(4)} ETH`} />
                            <Row label="New max borrowable"             value={rm(newMaxBorrow)} />
                            <Row label="Already borrowed"               value={`− ${rm(alreadyBorrowed, 2)}`} vc="#eab308" />
                          </Box>
                        )}
                        <Box sx={{ pt: 1, borderTop: '1px solid #1E2035' }}>
                          <Row
                            label={isLive && alreadyBorrowed > 0 ? 'Available after deposit' : 'Max you can borrow'}
                            value={rm(isLive && alreadyBorrowed > 0 ? newAvailable : maxBorrow, 2) + ' MYR'}
                            vc="#06B6D4" bold />
                        </Box>
                      </Box>
                    );
                  })()}

                  <Box sx={{ p: 1.5, bgcolor: '#052e1620', border: '1px solid #22c55e22', borderRadius: 1.5 }}>
                    <Typography variant="caption" sx={{ color: '#22c55e' }}>
                      ✓ Your collateral is locked in a non-custodial smart contract. Only you can withdraw it after repaying.
                    </Typography>
                  </Box>

                  <Button fullWidth variant="contained" disabled={!isLive || !depositAmt || wallet.txStatus === 'pending'}
                    onClick={() => wallet.depositCollateral(depositAmt).then(() => setDepositAmt(''))}
                    sx={{ py: 1.5, fontWeight: 700, background: 'linear-gradient(135deg, #7C3AED, #06B6D4)', color: 'white',
                          '&:hover': { background: 'linear-gradient(135deg, #6d28d9, #0891B2)' },
                          '&.Mui-disabled': { background: 'rgba(124,58,237,0.3)', color: 'rgba(255,255,255,0.4)' } }}>
                    {wallet.txStatus === 'pending' ? 'Waiting for confirmation…' : 'Deposit Collateral'}
                  </Button>
                </Box>
              )}

              {/* BORROW */}
              {activeTab === 'borrow' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {isLive && !wallet.kycApproved && (
                    <Box sx={{ p: 3, bgcolor: '#1a0f2e', border: '1px solid #7C3AED55', borderRadius: 2, textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 36, mb: 1 }}>🪪</Typography>
                      <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600, mb: 0.75 }}>KYC Verification Required</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                        Complete identity verification before borrowing, as required by Malaysian financial regulations (BNM AML/CFT).
                      </Typography>
                      <Button variant="contained" onClick={() => router.push('/kyc')}
                        sx={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)', color: 'white',
                              '&:hover': { background: 'linear-gradient(135deg, #6d28d9, #0891B2)' } }}>
                        Complete KYC →
                      </Button>
                    </Box>
                  )}

                  {(!isLive || wallet.kycApproved) && (
                    <>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Loan Term</Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1 }}>
                          {LOAN_TERMS.map(t => (
                            <Box key={t.days} onClick={() => setLoanTermDays(t.days)}
                              sx={{ py: 1, textAlign: 'center', borderRadius: 1.5, cursor: 'pointer',
                                    bgcolor: loanTermDays === t.days ? '#7C3AED' : '#0D0F1A',
                                    border: `1px solid ${loanTermDays === t.days ? '#7C3AED' : '#1E2035'}` }}>
                              <Typography variant="caption" sx={{ color: loanTermDays === t.days ? 'white' : '#64748B', fontWeight: 600 }}>
                                {t.label}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Borrow Amount (MYR)</Typography>
                        <Box sx={{ ...rowBoxSx, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Typography variant="body2" sx={{ color: '#06B6D4', fontWeight: 700 }}>RM</Typography>
                          <InputBase type="number" value={borrowAmt} onChange={e => { setBorrowAmt(e.target.value); setTransferResult(null); setTransferError(''); }}
                            placeholder="0.00" sx={{ flex: 1, color: 'text.primary', fontSize: 18, fontWeight: 500 }} />
                          <Button size="small" onClick={() => isLive && wallet.loanInfo
                              ? setBorrowAmt((Number(wallet.loanInfo.available) / 1e6).toFixed(2)) : undefined}
                            sx={{ bgcolor: '#7C3AED22', color: '#A78BFA', fontSize: 10, minWidth: 'auto', py: 0.25, px: 1 }}>
                            MAX
                          </Button>
                        </Box>
                        {isLive && wallet.loanInfo && (() => {
                          const contractAvail = Number(wallet.loanInfo!.available) / 1e6;
                          const mktAvail = Math.max(0, colEth * mktEthPrice * 0.7 - (Number(wallet.loanInfo!.borrowed) / 1e6));
                          return (
                            <Box sx={{ mt: 0.75 }}>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                Available (contract): RM {contractAvail.toFixed(2)}
                              </Typography>
                              {hasPriceMismatch && (
                                <Typography variant="caption" sx={{ display: 'block', color: mktAvail < contractAvail ? '#eab308' : '#94A3B8' }}>
                                  Available (market price): RM {mktAvail.toFixed(2)}
                                </Typography>
                              )}
                            </Box>
                          );
                        })()}
                      </Box>

                      {/* Delivery method */}
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Receive As</Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                          {([
                            { key: 'token', icon: '🪙', title: 'MYR Token',    sub: 'MockMYR to your wallet' },
                            { key: 'bank',  icon: '🏦', title: 'Bank Transfer', sub: 'DuitNow to your account' },
                          ] as const).map(opt => (
                            <Box key={opt.key} onClick={() => { setDeliveryMethod(opt.key); setTransferResult(null); setTransferError(''); }}
                              sx={{ p: 1.5, borderRadius: 1.5, cursor: 'pointer', border: `1px solid ${deliveryMethod === opt.key ? '#06B6D4' : '#1E2035'}`,
                                    bgcolor: deliveryMethod === opt.key ? 'rgba(6,182,212,0.06)' : '#0D0F1A', transition: 'all 0.15s' }}>
                              <Typography sx={{ fontSize: 18, mb: 0.25 }}>{opt.icon}</Typography>
                              <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, color: deliveryMethod === opt.key ? '#06B6D4' : 'text.primary' }}>
                                {opt.title}
                              </Typography>
                              <Typography sx={{ fontSize: 10, color: '#475569' }}>{opt.sub}</Typography>
                            </Box>
                          ))}
                        </Box>
                        {deliveryMethod === 'bank' && (
                          <Box sx={{ mt: 1, p: 1.25, bgcolor: 'rgba(6,182,212,0.05)', border: '1px solid rgba(6,182,212,0.2)', borderRadius: 1.5 }}>
                            <Typography variant="caption" sx={{ color: '#64748B' }}>
                              ℹ️ Borrowed MYR will be transferred to your registered bank account via DuitNow. No account yet?{' '}
                              <Box component="span" onClick={() => router.push('/settings')}
                                sx={{ color: '#06B6D4', cursor: 'pointer', textDecoration: 'underline' }}>
                                Add one in Settings →
                              </Box>
                            </Typography>
                          </Box>
                        )}
                      </Box>

                      <Box sx={{ ...rowBoxSx, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Row label="Principal"                          value={borrowMYR > 0 ? rm(borrowMYR, 2) : '—'} />
                        <Row label={`Interest (${loanTermDays}d · 4.80% APR)`} value={borrowMYR > 0 ? rm(panelInterest, 2) : '—'} vc="#eab308" />
                        <Row label="Origination Fee (0.10%)"           value={borrowMYR > 0 ? rm(borrowMYR * 0.001, 2) : '—'} />
                        <Row label="Monthly Payment (est.)"            value={borrowMYR > 0 ? rm(panelMonthly, 2) : '—'} vc="#A78BFA" />
                        <Box sx={{ pt: 1, borderTop: '1px solid #1E2035' }}>
                          <Row label="Total to Repay"                  value={borrowMYR > 0 ? rm(panelTotal, 2) : '—'} vc="#06B6D4" bold />
                        </Box>
                        {(() => {
                          if (!isLive || !wallet.loanInfo || !borrowAmt) {
                            return <Row label="Health Factor After" value="—" vc="#22c55e" />;
                          }
                          const newBor = Number(wallet.loanInfo.borrowed) / 1e6 + parseFloat(borrowAmt);
                          if (newBor <= 0) return <Row label="Health Factor After" value="∞" vc="#22c55e" />;
                          const contractHF = (wallet.loanInfo.collateralValueMYR * 0.8) / newBor;
                          const mktHFAfter = (colEth * mktEthPrice * 0.8) / newBor;
                          const saferHF = Math.min(contractHF, mktHFAfter);
                          const hc = hColor(saferHF);
                          return (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <Typography variant="caption" color="text.secondary">Health Factor After</Typography>
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="caption" sx={{ color: hColor(contractHF), fontWeight: 600, display: 'block' }}>
                                  {contractHF.toFixed(2)} (contract)
                                </Typography>
                                {hasPriceMismatch && (
                                  <Typography variant="caption" sx={{ color: hColor(mktHFAfter), fontWeight: 600, display: 'block' }}>
                                    {mktHFAfter.toFixed(2)} (market) {mktHFAfter < 1.5 ? '⚠️' : ''}
                                  </Typography>
                                )}
                              </Box>
                            </Box>
                          );
                        })()}
                      </Box>

                      {transferError && (
                        <Alert severity="warning" sx={{ bgcolor: '#1a140a', color: '#fbbf24', '& .MuiAlert-icon': { color: '#fbbf24' } }}>
                          {transferError}
                        </Alert>
                      )}

                      {transferResult && (
                        <Alert severity="success" sx={{ bgcolor: '#052e16', color: '#4ade80', '& .MuiAlert-icon': { color: '#4ade80' } }}>
                          <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: '#4ade80' }}>
                            {transferResult.refNo === 'ON-CHAIN' ? '✓ On-chain transfer confirmed' : '✓ DuitNow transfer initiated'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {transferResult.bankName} ****{transferResult.last4}
                            {transferResult.refNo !== 'ON-CHAIN' && ` · Ref: ${transferResult.refNo}`}
                          </Typography>
                        </Alert>
                      )}

                      <Button fullWidth variant="contained"
                        disabled={!isLive || !borrowAmt || wallet.txStatus === 'pending' ||
                          (isLive && wallet.loanInfo != null && parseFloat(borrowAmt) > Number(wallet.loanInfo.available) / 1e6)}
                        onClick={async () => {
                          setTransferResult(null);
                          setTransferError('');

                          // Pre-validate against contract available
                          const available = wallet.loanInfo ? Number(wallet.loanInfo.available) / 1e6 : 0;
                          if (parseFloat(borrowAmt) > available) {
                            setTransferError(`Exceeds available borrowing capacity (RM ${available.toFixed(2)}). Deposit more collateral first.`);
                            return;
                          }
                          // Warn if borrowing more than market price allows (liquidation risk after price sync)
                          const mktAvail = Math.max(0, colEth * mktEthPrice * 0.7 - (wallet.loanInfo ? Number(wallet.loanInfo.borrowed) / 1e6 : 0));
                          if (hasPriceMismatch && parseFloat(borrowAmt) > mktAvail) {
                            setTransferError(`Warning: At the live market price (${rm(mktEthPrice)}/ETH), your safe borrow limit is RM ${mktAvail.toFixed(2)}. Borrowing more may risk liquidation after a price sync.`);
                            return;
                          }

                          const borrowed = await wallet.borrow(borrowAmt);
                          if (!borrowed) return;

                          if (deliveryMethod === 'bank') {
                            try {
                              // Fetch bank account to get on-chain recipient address
                              const bankRes = await fetch('/api/profile/bank-account');
                              const bankData = await bankRes.json() as { account?: { recipientAddress?: string; bankName?: string; accountNumber?: string } };
                              const recipientAddr = bankData.account?.recipientAddress ?? '';

                              if (recipientAddr && /^0x[0-9a-fA-F]{40}$/.test(recipientAddr)) {
                                // On-chain MockMYR transfer to Hardhat bank wallet
                                const sent = await wallet.transferMYR(borrowAmt, recipientAddr);
                                if (sent) {
                                  const last4 = bankData.account?.accountNumber?.slice(-4) ?? '????';
                                  setTransferResult({ refNo: 'ON-CHAIN', bankName: bankData.account?.bankName ?? 'Bank', last4 });
                                } else {
                                  setTransferError('On-chain transfer failed. MYR tokens remain in your wallet.');
                                }
                              } else {
                                // Fallback: simulated DuitNow transfer
                                const res  = await fetch('/api/transfers', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ amountMYR: parseFloat(borrowAmt) }),
                                });
                                const data = await res.json() as { transfer?: { referenceNo: string; bankName: string; accountLast4: string }; error?: string };
                                if (res.ok && data.transfer) {
                                  setTransferResult({ refNo: data.transfer.referenceNo, bankName: data.transfer.bankName, last4: data.transfer.accountLast4 });
                                } else {
                                  setTransferError(data.error ?? 'No recipient wallet set. Go to Settings → add a Hardhat address.');
                                }
                              }
                            } catch {
                              setTransferError('Network error initiating transfer.');
                            }
                          }
                          setBorrowAmt('');
                        }}
                        sx={{ py: 1.5, fontWeight: 700, background: 'linear-gradient(135deg, #7C3AED, #06B6D4)', color: 'white',
                              '&:hover': { background: 'linear-gradient(135deg, #6d28d9, #0891B2)' },
                              '&.Mui-disabled': { background: 'rgba(124,58,237,0.3)', color: 'rgba(255,255,255,0.4)' } }}>
                        {wallet.txStatus === 'pending' ? 'Waiting for confirmation…'
                          : deliveryMethod === 'bank' ? 'Borrow + Transfer to Bank' : 'Borrow MYR Token'}
                      </Button>
                    </>
                  )}
                </Box>
              )}

              {/* REPAY */}
              {activeTab === 'repay' && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Repay Amount (MYR)</Typography>
                    <Box sx={{ ...rowBoxSx, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Typography variant="body2" sx={{ color: '#06B6D4', fontWeight: 700 }}>RM</Typography>
                      <InputBase type="number" value={repayAmt} onChange={e => setRepayAmt(e.target.value)}
                        placeholder="0.00" sx={{ flex: 1, color: 'text.primary', fontSize: 18, fontWeight: 500 }} />
                      <Button size="small" onClick={() => {
                          if (!isLive || !wallet.loanInfo) return;
                          const due = (Number(wallet.loanInfo.borrowed) + Number(wallet.loanInfo.accruedInterest)) / 1e6;
                          setRepayAmt(due.toFixed(2));
                        }}
                        sx={{ bgcolor: '#06B6D422', color: '#06B6D4', fontSize: 10, minWidth: 'auto', py: 0.25, px: 1 }}>
                        FULL
                      </Button>
                    </Box>
                    {isLive && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
                        MYR balance: {wallet.myrBalance}
                      </Typography>
                    )}
                  </Box>

                  <Box sx={{ ...rowBoxSx, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Row label="Outstanding Principal"
                      value={isLive && wallet.loanInfo ? `RM ${(Number(wallet.loanInfo.borrowed)/1e6).toFixed(2)}` : '—'} />
                    <Row label="Accrued Interest"
                      value={isLive && wallet.loanInfo ? `RM ${(Number(wallet.loanInfo.accruedInterest)/1e6).toFixed(4)}` : '—'} vc="#F59E0B" />
                    <Row label="Total Due"
                      value={isLive && wallet.loanInfo
                        ? `RM ${((Number(wallet.loanInfo.borrowed)+Number(wallet.loanInfo.accruedInterest))/1e6).toFixed(2)}`
                        : '—'} vc="#06B6D4" />
                    <Row label="Repaying" value={repayAmt ? `RM ${parseFloat(repayAmt).toFixed(2)}` : '—'} vc="#22c55e" />
                    <Box sx={{ pt: 1, borderTop: '1px solid #1E2035' }}>
                      <Row label="New Health Factor"
                        value={(() => {
                          if (!isLive || !wallet.loanInfo || !repayAmt) return '—';
                          const interest = Number(wallet.loanInfo.accruedInterest) / 1e6;
                          const principal = Number(wallet.loanInfo.borrowed) / 1e6;
                          const paying = parseFloat(repayAmt);
                          const principalPaid = Math.max(0, paying - interest);
                          const rem = Math.max(0, principal - principalPaid);
                          if (rem <= 0) return '∞';
                          return ((wallet.loanInfo.collateralValueMYR * 0.8) / rem).toFixed(2);
                        })()} vc="#22c55e" bold />
                    </Box>
                  </Box>

                  <Box sx={{ p: 1.5, bgcolor: '#0D1520', border: '1px solid #1E2035', borderRadius: 1.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      ℹ Two MetaMask confirmations: (1) Approve MYR spend, (2) Repay loan. Full repayment unlocks your collateral.
                    </Typography>
                  </Box>

                  <Button fullWidth variant="contained" disabled={!isLive || !repayAmt || wallet.txStatus === 'pending'}
                    onClick={() => wallet.repay(repayAmt).then(() => setRepayAmt(''))}
                    sx={{ py: 1.5, fontWeight: 700, background: 'linear-gradient(135deg, #06B6D4, #7C3AED)', color: 'white',
                          '&:hover': { background: 'linear-gradient(135deg, #0891B2, #6d28d9)' },
                          '&.Mui-disabled': { background: 'rgba(124,58,237,0.3)', color: 'rgba(255,255,255,0.4)' } }}>
                    {wallet.txStatus === 'pending' ? 'Waiting for confirmation…' : 'Repay Loan'}
                  </Button>
                </Box>
              )}
            </Paper>
          </Box>
        </Box>
      </Box>

      {/* Footer */}
      <Box component="footer" sx={{ mt: 8, py: 4, borderTop: '1px solid #1E2035', textAlign: 'center' }}>
        <Typography variant="caption" sx={{ color: '#475569', display: 'block', mb: 1 }}>
          CryptoLend © 2026 — Decentralised Crypto-Backed Lending · Hardhat Testnet (Chain ID 31337)
        </Typography>
        <Typography variant="caption" sx={{ color: '#334155', maxWidth: 560, mx: 'auto', display: 'block' }}>
          This is a demonstration application built for educational purposes. All transactions occur on a local test blockchain.
          Not financial advice. Crypto lending carries risk of liquidation.
        </Typography>
      </Box>
    </Box>
  );
}
