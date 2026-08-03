'use client';

import { useState } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import LinearProgress from '@mui/material/LinearProgress';
import MuiSkeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import { usePrices, SYMBOL_TO_ID } from '@/hooks/usePrices';
import { useSparklines } from '@/hooks/useSparklines';
import Sparkline from '@/components/Sparkline';
import { dynamicApr } from '@/lib/rates';
import { BankIcon, CashIcon, CoinIcon, SolanaIcon, TrendUpIcon } from '@/components/Icons';

const MARKETS = [
  { symbol: 'BTC',   name: 'Bitcoin',   icon: '₿', color: '#F7931A', id: 'bitcoin',     supplyAPR: 2.1, borrowAPR: 5.2, maxLTV: 70, liqThresh: 80, liquidity: 'RM 11.2B', totalBorrowed: 'RM 7.8B',  util: 70 },
  { symbol: 'ETH',   name: 'Ethereum',  icon: 'Ξ', color: '#627EEA', id: 'ethereum',    supplyAPR: 1.8, borrowAPR: 4.8, maxLTV: 75, liqThresh: 85, liquidity: 'RM 8.5B',  totalBorrowed: 'RM 5.3B',  util: 62 },
  { symbol: 'SOL',   name: 'Solana',    icon: <SolanaIcon size={18} />, color: '#9945FF', id: 'solana',      supplyAPR: 3.2, borrowAPR: 6.5, maxLTV: 65, liqThresh: 75, liquidity: 'RM 1.9B',  totalBorrowed: 'RM 1.1B',  util: 58 },
  { symbol: 'BNB',   name: 'BNB Chain', icon: 'B', color: '#F3BA2F', id: 'binancecoin', supplyAPR: 2.4, borrowAPR: 5.8, maxLTV: 65, liqThresh: 75, liquidity: 'RM 3.1B',  totalBorrowed: 'RM 1.7B',  util: 55 },
  { symbol: 'XRP',   name: 'XRP',       icon: 'X', color: '#00AAE4', id: 'ripple',      supplyAPR: 4.8, borrowAPR: 7.8, maxLTV: 55, liqThresh: 65, liquidity: 'RM 720M',  totalBorrowed: 'RM 288M',  util: 40 },
  { symbol: 'AVAX',  name: 'Avalanche', icon: 'A', color: '#E84142', id: 'avax',        supplyAPR: 4.1, borrowAPR: 7.2, maxLTV: 60, liqThresh: 70, liquidity: 'RM 840M',  totalBorrowed: 'RM 420M',  util: 50 },
  { symbol: 'LINK',  name: 'Chainlink', icon: 'L', color: '#2A5ADA', id: 'chainlink',   supplyAPR: 4.5, borrowAPR: 7.5, maxLTV: 60, liqThresh: 70, liquidity: 'RM 520M',  totalBorrowed: 'RM 240M',  util: 46 },
  { symbol: 'DOT',   name: 'Polkadot',  icon: 'D', color: '#E6007A', id: 'polkadot',    supplyAPR: 5.0, borrowAPR: 8.0, maxLTV: 55, liqThresh: 65, liquidity: 'RM 310M',  totalBorrowed: 'RM 130M',  util: 42 },
  { symbol: 'ADA',   name: 'Cardano',   icon: '₳', color: '#0033AD', id: 'cardano',     supplyAPR: 5.5, borrowAPR: 8.5, maxLTV: 50, liqThresh: 60, liquidity: 'RM 280M',  totalBorrowed: 'RM 108M',  util: 38 },
  { symbol: 'MATIC', name: 'Polygon',   icon: 'M', color: '#8247E5', id: 'polygon',     supplyAPR: 5.2, borrowAPR: 8.5, maxLTV: 55, liqThresh: 65, liquidity: 'RM 445M',  totalBorrowed: 'RM 196M',  util: 44 },
];

type SortKey = 'price' | 'change' | 'maxLTV' | 'borrowAPR' | 'supplyAPR' | 'util' | null;
type SortDir = 'asc' | 'desc';
type RiskFilter = 'all' | 'conservative' | 'balanced' | 'aggressive';

const RISK_FILTERS: { id: RiskFilter; label: string; desc: string }[] = [
  { id: 'all',          label: 'All Assets',    desc: 'Show all markets' },
  { id: 'conservative', label: 'Conservative',  desc: 'Max LTV ≥ 70% — lower liquidation risk' },
  { id: 'balanced',     label: 'Balanced',      desc: 'Max LTV 60–69%' },
  { id: 'aggressive',   label: 'High APR',      desc: 'Borrow APR > 7%' },
];

export default function MarketsPage() {
  const { prices, loading, lastUpdated, flash } = usePrices();
  const sparklines = useSparklines();
  const [search,    setSearch]    = useState('');
  const [sortKey,   setSortKey]   = useState<SortKey>(null);
  const [sortDir,   setSortDir]   = useState<SortDir>('desc');
  const [risk,      setRisk]      = useState<RiskFilter>('all');
  const [cardView,  setCardView]  = useState(false);

  const getPrice = (m: typeof MARKETS[0]) => {
    const key = SYMBOL_TO_ID[m.symbol];
    return key ? prices[key] : { myr: 0, usd: 0, change24h: 0 };
  };

  // Variable borrow APR — the listed base rate plus a live risk premium from
  // the asset's 24h market move (see lib/rates.ts).
  const getApr = (m: typeof MARKETS[0]) => dynamicApr(m.borrowAPR, getPrice(m).change24h);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => (
    <Box component="span" sx={{ ml: 0.5, opacity: sortKey === col ? 1 : 0.3, fontSize: 10 }}>
      {sortKey === col ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
    </Box>
  );

  let displayed = MARKETS.filter(m =>
    m.symbol.toLowerCase().includes(search.toLowerCase()) ||
    m.name.toLowerCase().includes(search.toLowerCase())
  ).filter(m => {
    if (risk === 'conservative') return m.maxLTV >= 70;
    if (risk === 'balanced')     return m.maxLTV >= 60 && m.maxLTV < 70;
    if (risk === 'aggressive')   return m.borrowAPR > 7;
    return true;
  });

  if (sortKey) {
    displayed = [...displayed].sort((a, b) => {
      let va = 0, vb = 0;
      if (sortKey === 'price')     { va = getPrice(a).myr;        vb = getPrice(b).myr; }
      if (sortKey === 'change')    { va = getPrice(a).change24h;   vb = getPrice(b).change24h; }
      if (sortKey === 'maxLTV')    { va = a.maxLTV;    vb = b.maxLTV; }
      if (sortKey === 'borrowAPR') { va = getApr(a);   vb = getApr(b); }
      if (sortKey === 'supplyAPR') { va = a.supplyAPR; vb = b.supplyAPR; }
      if (sortKey === 'util')      { va = a.util;      vb = b.util; }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }

  // find top gainer symbol for badge
  const topGainerSymbol = !loading && Object.keys(prices).length > 0
    ? MARKETS.reduce((best, m) => {
        const p = getPrice(m);
        return p.change24h > getPrice(best).change24h ? m : best;
      }, MARKETS[0]).symbol
    : null;

  const thSx = {
    color: 'rgba(255,255,255,0.65)', bgcolor: '#0B1430', fontSize: 11,
    fontWeight: 600, whiteSpace: 'nowrap', userSelect: 'none',
    borderBottom: '1px solid rgba(255,255,255,0.12)',
  };
  const thBtn = (col: SortKey, label: string) => (
    <Box onClick={() => handleSort(col)}
      sx={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', '&:hover': { color: '#F2F5FF' } }}>
      {label}<SortIcon col={col} />
    </Box>
  );

  const fmtMyr = (myr: number) =>
    `RM ${myr.toLocaleString('en-MY', { minimumFractionDigits: myr < 10 ? 3 : 0, maximumFractionDigits: myr < 10 ? 3 : 0 })}`;
  const fmtUsd = (usd: number) =>
    `$${usd.toLocaleString('en-US', { minimumFractionDigits: usd < 10 ? 3 : 0, maximumFractionDigits: usd < 10 ? 3 : 0 })}`;

  const utilColor = (u: number) => u > 75 ? '#E5484D' : u > 50 ? '#FFB224' : '#2BD9A2';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0B1226', color: 'text.primary' }}>
      <Box component="main" sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, sm: 3 }, py: 4 }}>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 4 }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
              <Typography variant="h4" color="text.primary" sx={{ fontWeight: 700 }}>Markets</Typography>
              {/* LIVE badge */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, bgcolor: '#2BD9A215', border: '1px solid #2BD9A240',
                          borderRadius: 999, px: 1, py: 0.25 }}>
                <Box sx={{
                  width: 7, height: 7, borderRadius: '50%', bgcolor: '#2BD9A2', flexShrink: 0,
                  '@keyframes livePulse': {
                    '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                    '50%':      { opacity: 0.4, transform: 'scale(1.4)' },
                  },
                  animation: 'livePulse 2s ease-in-out infinite',
                }} />
                <Typography sx={{ fontSize: 10, fontWeight: 700, color: '#2BD9A2', letterSpacing: 1 }}>LIVE</Typography>
              </Box>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Borrow MYR against your crypto collateral · Prices in Malaysian Ringgit (RM)
            </Typography>
          </Box>
          {loading ? (
            <MuiSkeleton width={144} height={12} sx={{ bgcolor: 'rgba(255,255,255,0.12)', mt: 1 }} />
          ) : lastUpdated && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              Updated {lastUpdated.toLocaleTimeString()}
            </Typography>
          )}
        </Box>

        {/* Market stats */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
          {[
            { label: 'Total Value Locked', value: 'RM 28.3B', sub: 'Across all assets',  icon: <BankIcon size={15} />, c: '#2BD9A2', bc: '#2BD9A2' },
            { label: 'Total Borrowed',     value: 'RM 17.5B', sub: '61.8% utilisation',   icon: <CashIcon size={15} />, c: '#FFB224', bc: '#FFB224' },
            {
              label: 'Avg Borrow APR',
              value: loading ? '…' : `${(MARKETS.reduce((sum, m) => sum + getApr(m), 0) / MARKETS.length).toFixed(1)}%`,
              sub: 'Variable · live average', icon: <TrendUpIcon size={15} />, c: '#E5484D', bc: '#E5484D',
            },
            { label: 'Avg Supply APR',     value: '3.9%',      sub: 'Weighted average',    icon: <CoinIcon size={15} />, c: '#2BD9A2', bc: '#2BD9A2' },
          ].map(s => (
            <Paper key={s.label} sx={{
              p: 2, bgcolor: '#111B38', borderRadius: 2,
              border: '1px solid rgba(255,255,255,0.1)',
              borderLeft: `3px solid ${s.bc}`,
              transition: 'transform 0.15s, box-shadow 0.15s',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: `0 8px 24px ${s.bc}18` },
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <Box sx={{ display: 'flex', color: s.bc }}>{s.icon}</Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>{s.label}</Typography>
              </Box>
              <Typography variant="h5" color="text.primary" sx={{ my: 0.25, fontWeight: 700, fontSize: { xs: 18, sm: 22 } }}>{s.value}</Typography>
              <Typography variant="caption" sx={{ color: s.c }}>{s.sub}</Typography>
            </Paper>
          ))}
        </Box>

        {/* Filter + Search + View toggle */}
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' },
                    justifyContent: 'space-between', gap: 1.5, mb: 2.5, flexWrap: 'wrap' }}>

          {/* Risk filter chips */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            {RISK_FILTERS.map(f => (
              <Tooltip key={f.id} title={f.desc} placement="top" arrow>
                <Chip
                  label={f.label}
                  size="small"
                  onClick={() => setRisk(f.id)}
                  sx={{
                    fontSize: 11, height: 26, cursor: 'pointer',
                    bgcolor:      risk === f.id ? '#6E8BFF' : '#111B38',
                    color:        risk === f.id ? '#fff'    : 'rgba(255,255,255,0.65)',
                    border:       risk === f.id ? '1px solid #6E8BFF' : '1px solid rgba(255,255,255,0.15)',
                    '&:hover': { bgcolor: risk === f.id ? '#9DB1FF' : '#1C2A50' },
                  }}
                />
              </Tooltip>
            ))}
            {(sortKey || search) && (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {sortKey && (
                  <Chip label={`${sortKey} ${sortDir === 'asc' ? '▲' : '▼'}`} size="small" onDelete={() => setSortKey(null)}
                    sx={{ bgcolor: '#0F1730', color: 'rgba(255,255,255,0.55)', fontSize: 10, height: 24 }} />
                )}
                {search && (
                  <Chip label={`"${search}"`} size="small" onDelete={() => setSearch('')}
                    sx={{ bgcolor: '#0F1730', color: 'rgba(255,255,255,0.55)', fontSize: 10, height: 24 }} />
                )}
              </Box>
            )}
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* Desktop view toggle */}
            <Box sx={{ display: { xs: 'none', md: 'flex' }, bgcolor: '#111B38', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 1.5, overflow: 'hidden' }}>
              {[
                { id: false, icon: '☰', tip: 'Table view' },
                { id: true,  icon: '⊞', tip: 'Card view'  },
              ].map(v => (
                <Tooltip key={String(v.id)} title={v.tip} placement="top" arrow>
                  <Box onClick={() => setCardView(v.id as boolean)}
                    sx={{
                      px: 1.25, py: 0.6, cursor: 'pointer', fontSize: 14,
                      bgcolor:   cardView === v.id ? '#6E8BFF' : 'transparent',
                      color:     cardView === v.id ? '#fff'    : 'rgba(255,255,255,0.5)',
                      transition: 'background 0.15s',
                      '&:hover': { bgcolor: cardView === v.id ? '#6E8BFF' : '#1C2A50' },
                    }}>
                    {v.icon}
                  </Box>
                </Tooltip>
              ))}
            </Box>

            <TextField
              size="small"
              placeholder="Search asset…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              sx={{
                width: 170,
                '& .MuiOutlinedInput-root': {
                  fontSize: 12,
                  bgcolor: '#111B38',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.35)' },
                },
              }}
            />
          </Box>
        </Box>

        {/* ── TABLE VIEW (wide screen default) ─────────────────────────────── */}
        {!cardView && (
          <TableContainer component={Paper} sx={{
            bgcolor: 'transparent', borderRadius: 3, overflowX: 'auto',
            border: '1px solid rgba(255,255,255,0.12)',
            display: { xs: 'none', md: 'block' },
          }}>
            <Table sx={{ minWidth: 820 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={thSx}>Asset</TableCell>
                  <TableCell sx={thSx}>{thBtn('price', 'Price (MYR)')}</TableCell>
                  <TableCell sx={thSx}>{thBtn('change', '24h')}</TableCell>
                  <TableCell sx={thSx}>{thBtn('maxLTV', 'Max LTV')}</TableCell>
                  <TableCell sx={thSx}>Liq. Threshold</TableCell>
                  <TableCell sx={thSx}>{thBtn('borrowAPR', 'Borrow APR')}</TableCell>
                  <TableCell sx={thSx}>{thBtn('supplyAPR', 'Supply APR')}</TableCell>
                  <TableCell sx={thSx}>{thBtn('util', 'Utilisation')}</TableCell>
                  <TableCell sx={thSx}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayed.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} sx={{ textAlign: 'center', py: 6, color: 'rgba(255,255,255,0.45)', borderColor: 'transparent' }}>
                      No assets match &ldquo;{search}&rdquo;
                    </TableCell>
                  </TableRow>
                ) : displayed.map((m, i) => {
                  const p        = getPrice(m);
                  const key      = SYMBOL_TO_ID[m.symbol] as keyof typeof flash | undefined;
                  const flashDir = key ? flash[key] : undefined;
                  const isTop    = m.symbol === topGainerSymbol;
                  return (
                    <TableRow key={m.symbol} sx={{
                      bgcolor: i % 2 === 0 ? '#0E1830' : '#0B1530',
                      borderLeft: `3px solid transparent`,
                      transition: 'background 0.15s, border-color 0.15s',
                      '&:hover': { bgcolor: '#142040', borderLeft: `3px solid ${m.color}` },
                    }}>
                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: 14, fontWeight: 700, bgcolor: `${m.color}1A`, color: m.color }}>
                            {m.icon}
                          </Box>
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>{m.symbol}</Typography>
                              {isTop && !loading && (
                                <Chip label="Top Gainer" size="small"
                                  sx={{ height: 16, fontSize: 9, fontWeight: 700, bgcolor: '#2BD9A220', color: '#2BD9A2', px: 0.25 }} />
                              )}
                            </Box>
                            <Typography variant="caption" color="text.secondary">{m.name}</Typography>
                          </Box>
                        </Box>
                      </TableCell>

                      <TableCell className={flashDir ? `price-flash-${flashDir}` : ''} sx={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                        {loading ? (
                          <Box>
                            <MuiSkeleton width={90} height={15} sx={{ bgcolor: 'rgba(255,255,255,0.1)', mb: 0.5 }} />
                            <MuiSkeleton width={60} height={11} sx={{ bgcolor: 'rgba(255,255,255,0.08)' }} />
                          </Box>
                        ) : (
                          <Box>
                            <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>{fmtMyr(p.myr)}</Typography>
                            <Typography variant="caption" color="text.secondary">{fmtUsd(p.usd)}</Typography>
                          </Box>
                        )}
                      </TableCell>

                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                        {loading ? (
                          <MuiSkeleton width={72} height={24} sx={{ bgcolor: 'rgba(255,255,255,0.1)', borderRadius: 1 }} />
                        ) : (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                            <Sparkline points={sparklines[SYMBOL_TO_ID[m.symbol]] ?? []} up={p.change24h >= 0} width={80} height={26} />
                            <Typography variant="caption" sx={{
                              color: p.change24h >= 0 ? '#2BD9A2' : '#E5484D', fontWeight: 700, fontSize: 10.5, lineHeight: 1,
                            }}>
                              {p.change24h >= 0 ? '+' : ''}{p.change24h.toFixed(2)}%
                            </Typography>
                          </Box>
                        )}
                      </TableCell>

                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.07)', color: '#6E8BFF', fontWeight: 700 }}>{m.maxLTV}%</TableCell>

                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                        <Typography variant="caption" color="text.secondary">{m.liqThresh}%</Typography>
                      </TableCell>

                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                        <Chip label={`${getApr(m).toFixed(2)}%`} size="small"
                          title="Variable rate — base rate plus a live market-risk premium"
                          sx={{ bgcolor: '#E5484D20', color: '#E5484D', fontSize: 11, fontWeight: 700, height: 20 }} />
                      </TableCell>

                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                        <Chip label={`${m.supplyAPR}%`} size="small"
                          sx={{ bgcolor: '#2BD9A220', color: '#2BD9A2', fontSize: 11, fontWeight: 700, height: 20 }} />
                      </TableCell>

                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <LinearProgress variant="determinate" value={m.util}
                            sx={{ flex: 1, minWidth: 52, height: 6, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.1)',
                                  '& .MuiLinearProgress-bar': { borderRadius: 1, bgcolor: utilColor(m.util) } }} />
                          <Typography variant="caption" sx={{ color: utilColor(m.util), fontWeight: 600, minWidth: 30 }}>{m.util}%</Typography>
                        </Box>
                      </TableCell>

                      <TableCell sx={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                        <Button component={Link} href={`/dashboard?tab=borrow&asset=${m.symbol}`} size="small" variant="contained"
                          sx={{ bgcolor: '#6E8BFF', color: 'white', fontSize: 11, px: 1.5, whiteSpace: 'nowrap',
                                boxShadow: 'none', borderRadius: 1.5, fontWeight: 700,
                                '&:hover': { bgcolor: '#9DB1FF', boxShadow: '0 4px 12px #6E8BFF40' } }}>
                          Borrow
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* ── CARD GRID VIEW (desktop, when toggled) ───────────────────────── */}
        {cardView && (
          <Box sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
            {displayed.length === 0 ? (
              <Typography sx={{ py: 6, textAlign: 'center', color: 'rgba(255,255,255,0.45)', gridColumn: '1/-1' }}>
                No assets match &ldquo;{search}&rdquo;
              </Typography>
            ) : displayed.map(m => {
              const p        = getPrice(m);
              const key      = SYMBOL_TO_ID[m.symbol] as keyof typeof flash | undefined;
              const flashDir = key ? flash[key] : undefined;
              const isTop    = m.symbol === topGainerSymbol;
              return (
                <Paper key={m.symbol} sx={{
                  bgcolor: '#111B38', borderRadius: 2.5, p: 2.5,
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderTop: `3px solid ${m.color}`,
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  '&:hover': { transform: 'translateY(-3px)', boxShadow: `0 12px 32px ${m.color}20` },
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                    <Box sx={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 18, fontWeight: 800, bgcolor: `${m.color}18`, color: m.color }}>
                      {m.icon}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 15, color: '#F2F5FF' }}>{m.symbol}</Typography>
                        {isTop && !loading && (
                          <Chip label="Top" size="small"
                            sx={{ height: 16, fontSize: 9, fontWeight: 700, bgcolor: '#2BD9A220', color: '#2BD9A2' }} />
                        )}
                      </Box>
                      <Typography variant="caption" color="text.secondary">{m.name}</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      {loading ? (
                        <MuiSkeleton width={80} height={14} sx={{ bgcolor: 'rgba(255,255,255,0.12)' }} />
                      ) : (
                        <>
                          <Typography className={flashDir ? `price-flash-${flashDir}` : ''}
                            sx={{ fontWeight: 700, fontSize: 14, color: '#F2F5FF' }}>{fmtMyr(p.myr)}</Typography>
                          <Typography variant="caption" sx={{ color: p.change24h >= 0 ? '#2BD9A2' : '#E5484D', fontWeight: 600 }}>
                            {p.change24h >= 0 ? '▲' : '▼'} {Math.abs(p.change24h).toFixed(2)}%
                          </Typography>
                        </>
                      )}
                    </Box>
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.25, mb: 1.75 }}>
                    {[
                      { label: 'Max LTV',    value: `${m.maxLTV}%`,    vc: '#6E8BFF' },
                      { label: 'Liq. Thresh',value: `${m.liqThresh}%`, vc: 'rgba(255,255,255,0.55)' },
                      { label: 'Borrow APR', value: `${getApr(m).toFixed(2)}%`, vc: '#E5484D' },
                      { label: 'Supply APR', value: `${m.supplyAPR}%`, vc: '#2BD9A2' },
                    ].map(s => (
                      <Box key={s.label} sx={{ bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 1.5, p: 1 }}>
                        <Typography sx={{ fontSize: 9.5, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.25 }}>{s.label}</Typography>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: s.vc }}>{s.value}</Typography>
                      </Box>
                    ))}
                  </Box>
                  <Box sx={{ mb: 1.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography sx={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Utilisation</Typography>
                      <Typography sx={{ fontSize: 11, fontWeight: 700, color: utilColor(m.util) }}>{m.util}%</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={m.util}
                      sx={{ height: 5, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.1)',
                            '& .MuiLinearProgress-bar': { borderRadius: 1, bgcolor: utilColor(m.util) } }} />
                  </Box>
                  <Button component={Link} href={`/dashboard?tab=borrow&asset=${m.symbol}`}
                    fullWidth variant="contained"
                    sx={{ bgcolor: '#6E8BFF', color: 'white', fontWeight: 700, fontSize: 13, boxShadow: 'none',
                          borderRadius: 1.5, '&:hover': { bgcolor: '#9DB1FF', boxShadow: `0 6px 18px #6E8BFF40` } }}>
                    Borrow {m.symbol}
                  </Button>
                </Paper>
              );
            })}
          </Box>
        )}

        {/* ── MOBILE CARD LIST (always cards on xs/sm) ─────────────────────── */}
        <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 0, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' }}>
          {displayed.length === 0 ? (
            <Typography sx={{ py: 6, textAlign: 'center', color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>
              No assets match &ldquo;{search}&rdquo;
            </Typography>
          ) : displayed.map((m, i) => {
            const p        = getPrice(m);
            const key      = SYMBOL_TO_ID[m.symbol] as keyof typeof flash | undefined;
            const flashDir = key ? flash[key] : undefined;
            const isTop    = m.symbol === topGainerSymbol;
            return (
              <Box key={m.symbol} sx={{
                bgcolor: i % 2 === 0 ? '#111B38' : '#0F1A3D',
                borderBottom: i < displayed.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                borderLeft: `3px solid ${m.color}`,
                p: 1.75,
              }}>
                {/* Row 1: icon + name + price */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 16, fontWeight: 800, bgcolor: `${m.color}1A`, color: m.color }}>
                    {m.icon}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 14, color: '#F2F5FF' }}>{m.symbol}</Typography>
                      {isTop && !loading && (
                        <Chip label="Top Gainer" size="small"
                          sx={{ height: 16, fontSize: 9, fontWeight: 700, bgcolor: '#2BD9A220', color: '#2BD9A2', px: 0.25 }} />
                      )}
                    </Box>
                    <Typography variant="caption" color="text.secondary">{m.name}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    {loading ? (
                      <>
                        <MuiSkeleton width={80} height={14} sx={{ bgcolor: 'rgba(255,255,255,0.12)', mb: 0.25 }} />
                        <MuiSkeleton width={48} height={11} sx={{ bgcolor: 'rgba(255,255,255,0.08)' }} />
                      </>
                    ) : (
                      <>
                        <Typography className={flashDir ? `price-flash-${flashDir}` : ''}
                          sx={{ fontWeight: 700, fontSize: 14, color: '#F2F5FF' }}>{fmtMyr(p.myr)}</Typography>
                        <Typography variant="caption" sx={{ color: p.change24h >= 0 ? '#2BD9A2' : '#E5484D', fontWeight: 600 }}>
                          {p.change24h >= 0 ? '▲' : '▼'} {Math.abs(p.change24h).toFixed(2)}%
                        </Typography>
                      </>
                    )}
                  </Box>
                </Box>

                {/* Row 2: 2×2 stat grid */}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, mb: 1.5 }}>
                  {[
                    { label: 'Max LTV',    value: `${m.maxLTV}%`,    vc: '#6E8BFF' },
                    { label: 'Liq. Thresh',value: `${m.liqThresh}%`, vc: 'rgba(255,255,255,0.55)' },
                    { label: 'Borrow APR', value: `${m.borrowAPR}%`, vc: '#E5484D' },
                    { label: 'Supply APR', value: `${m.supplyAPR}%`, vc: '#2BD9A2' },
                  ].map(s => (
                    <Box key={s.label} sx={{ bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 1.5, p: 0.75 }}>
                      <Typography sx={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.4, mb: 0.2 }}>{s.label}</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: s.vc }}>{s.value}</Typography>
                    </Box>
                  ))}
                </Box>

                {/* Util bar */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography sx={{ fontSize: 9.5, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Utilisation</Typography>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: utilColor(m.util) }}>{m.util}%</Typography>
                </Box>
                <LinearProgress variant="determinate" value={m.util}
                  sx={{ height: 4, borderRadius: 1, mb: 1.5, bgcolor: 'rgba(255,255,255,0.1)',
                        '& .MuiLinearProgress-bar': { borderRadius: 1, bgcolor: utilColor(m.util) } }} />

                <Button component={Link} href={`/dashboard?tab=borrow&asset=${m.symbol}`}
                  fullWidth size="small" variant="contained"
                  sx={{ bgcolor: '#6E8BFF', color: 'white', fontWeight: 700, fontSize: 13, boxShadow: 'none',
                        borderRadius: 1.5, '&:hover': { bgcolor: '#9DB1FF', boxShadow: 'none' } }}>
                  Borrow {m.symbol}
                </Button>
              </Box>
            );
          })}
        </Box>

        {/* Result count + footer */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2.5, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {displayed.length} of {MARKETS.length} assets
            {risk !== 'all' && ` · filtered: ${RISK_FILTERS.find(f => f.id === risk)?.label}`}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Prices from CoinGecko · For testnet use only
          </Typography>
        </Box>

      </Box>
    </Box>
  );
}
