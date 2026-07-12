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
import { usePrices, SYMBOL_TO_ID } from '@/hooks/usePrices';

const MARKETS = [
  { symbol: 'BTC',   name: 'Bitcoin',   icon: '₿', color: '#F7931A', id: 'bitcoin',     supplyAPR: 2.1, borrowAPR: 5.2, maxLTV: 70, liqThresh: 80, liquidity: 'RM 11.2B', totalBorrowed: 'RM 7.8B',  util: 70 },
  { symbol: 'ETH',   name: 'Ethereum',  icon: 'Ξ', color: '#627EEA', id: 'ethereum',    supplyAPR: 1.8, borrowAPR: 4.8, maxLTV: 75, liqThresh: 85, liquidity: 'RM 8.5B',  totalBorrowed: 'RM 5.3B',  util: 62 },
  { symbol: 'SOL',   name: 'Solana',    icon: '◎', color: '#9945FF', id: 'solana',      supplyAPR: 3.2, borrowAPR: 6.5, maxLTV: 65, liqThresh: 75, liquidity: 'RM 1.9B',  totalBorrowed: 'RM 1.1B',  util: 58 },
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

export default function MarketsPage() {
  const { prices, loading, lastUpdated, flash } = usePrices();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const getPrice = (m: typeof MARKETS[0]) => {
    const key = SYMBOL_TO_ID[m.symbol];
    return key ? prices[key] : { myr: 0, usd: 0, change24h: 0 };
  };

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
  );

  if (sortKey) {
    displayed = [...displayed].sort((a, b) => {
      let va = 0, vb = 0;
      if (sortKey === 'price')     { va = getPrice(a).myr;   vb = getPrice(b).myr; }
      if (sortKey === 'change')    { va = getPrice(a).change24h; vb = getPrice(b).change24h; }
      if (sortKey === 'maxLTV')    { va = a.maxLTV;    vb = b.maxLTV; }
      if (sortKey === 'borrowAPR') { va = a.borrowAPR; vb = b.borrowAPR; }
      if (sortKey === 'supplyAPR') { va = a.supplyAPR; vb = b.supplyAPR; }
      if (sortKey === 'util')      { va = a.util;      vb = b.util; }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }

  const thSx = { color: '#5A6675', bgcolor: '#EEF1F5', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', userSelect: 'none' };
  const thBtn = (col: SortKey, label: string) => (
    <Box onClick={() => handleSort(col)}
      sx={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', '&:hover': { color: '#10151C' } }}>
      {label}<SortIcon col={col} />
    </Box>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F4F6F8', color: 'text.primary' }}>
      <Box component="main" sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, sm: 3 }, py: 4 }}>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 4 }}>
          <Box>
            <Typography variant="h4" color="text.primary" gutterBottom sx={{ fontWeight: 700 }}>Markets</Typography>
            <Typography variant="body2" color="text.secondary">
              Borrow MYR against your crypto collateral · Prices in Malaysian Ringgit (RM)
            </Typography>
          </Box>
          {loading ? (
            <MuiSkeleton width={144} height={12} sx={{ bgcolor: '#E7EBF1', mt: 1 }} />
          ) : lastUpdated && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
              Last updated: {lastUpdated.toLocaleTimeString()}
            </Typography>
          )}
        </Box>

        {/* Market stats */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 4 }}>
          {[
            { label: 'Total Value Locked', value: 'RM 28.3B', sub: 'Across all assets', c: '#0E9F6E' },
            { label: 'Total Borrowed',     value: 'RM 17.5B', sub: '61.8% utilisation',  c: '#C77700' },
            { label: 'Avg Borrow APR',     value: '7.1%',      sub: 'Weighted average',   c: '#E5484D' },
            { label: 'Avg Supply APR',     value: '3.9%',      sub: 'Weighted average',   c: '#0E9F6E' },
          ].map(s => (
            <Paper key={s.label} sx={{ p: 2, bgcolor: '#FFFFFF', border: '1px solid #E2E7EE', borderRadius: 2 }}>
              <Typography variant="caption" color="text.secondary">{s.label}</Typography>
              <Typography variant="h5" color="text.primary" sx={{ my: 0.5, fontWeight: 700 }}>{s.value}</Typography>
              <Typography variant="caption" sx={{ color: s.c }}>{s.sub}</Typography>
            </Paper>
          ))}
        </Box>

        {/* Search */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 2.5, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {sortKey && (
              <Chip
                label={`Sorted by ${sortKey} ${sortDir === 'asc' ? '▲' : '▼'}`}
                size="small"
                onDelete={() => { setSortKey(null); }}
                sx={{ bgcolor: '#EEF1F5', color: '#5A6675', fontSize: 11, height: 24 }}
              />
            )}
            {search && (
              <Chip
                label={`"${search}"`}
                size="small"
                onDelete={() => setSearch('')}
                sx={{ bgcolor: '#EEF1F5', color: '#5A6675', fontSize: 11, height: 24 }}
              />
            )}
          </Box>
          <TextField
            size="small"
            placeholder="Search asset…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            sx={{ width: 180, '& .MuiOutlinedInput-root': { fontSize: 12 } }}
          />
        </Box>

        {/* Markets table */}
        <TableContainer component={Paper} sx={{ bgcolor: 'transparent', border: '1px solid #E2E7EE', borderRadius: 3, overflowX: 'auto' }}>
          <Table sx={{ minWidth: 800 }}>
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
                  <TableCell colSpan={9} sx={{ textAlign: 'center', py: 6, color: '#8B96A5', borderColor: '#E2E7EE' }}>
                    No assets match &ldquo;{search}&rdquo;
                  </TableCell>
                </TableRow>
              ) : displayed.map((m, i) => {
                const p        = getPrice(m);
                const key      = SYMBOL_TO_ID[m.symbol] as keyof typeof flash | undefined;
                const flashDir = key ? flash[key] : undefined;
                return (
                  <TableRow key={m.symbol} sx={{ bgcolor: i % 2 === 0 ? '#FFFFFF' : '#FAFBFC', '&:hover': { bgcolor: '#EEF1F5' } }}>

                    <TableCell sx={{ borderColor: '#E2E7EE' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box sx={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 14, fontWeight: 700, flexShrink: 0, bgcolor: `${m.color}1A`, color: m.color }}>
                          {m.icon}
                        </Box>
                        <Box>
                          <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>{m.symbol}</Typography>
                          <Typography variant="caption" color="text.secondary">{m.name}</Typography>
                        </Box>
                      </Box>
                    </TableCell>

                    <TableCell className={flashDir ? `price-flash-${flashDir}` : ''} sx={{ borderColor: '#E2E7EE' }}>
                      {loading ? (
                        <Box>
                          <MuiSkeleton width={96} height={16} sx={{ bgcolor: '#E7EBF1', mb: 0.5 }} />
                          <MuiSkeleton width={64} height={12} sx={{ bgcolor: '#E7EBF1' }} />
                        </Box>
                      ) : (
                        <Box>
                          <Typography variant="body2" color="text.primary" sx={{ fontWeight: 500 }}>
                            {`RM ${p.myr.toLocaleString('en-MY', { minimumFractionDigits: p.myr < 10 ? 3 : 0, maximumFractionDigits: p.myr < 10 ? 3 : 0 })}`}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ${p.usd.toLocaleString('en-US', { minimumFractionDigits: p.usd < 10 ? 3 : 0, maximumFractionDigits: p.usd < 10 ? 3 : 0 })}
                          </Typography>
                        </Box>
                      )}
                    </TableCell>

                    <TableCell sx={{ borderColor: '#E2E7EE' }}>
                      {loading ? (
                        <MuiSkeleton width={56} height={20} sx={{ bgcolor: '#E7EBF1', borderRadius: 999 }} />
                      ) : (
                        <Chip label={`${p.change24h >= 0 ? '+' : ''}${p.change24h.toFixed(2)}%`} size="small"
                          sx={{ bgcolor: p.change24h >= 0 ? '#0E9F6E20' : '#E5484D20',
                                color: p.change24h >= 0 ? '#0E9F6E' : '#E5484D', fontSize: 11, fontWeight: 600, height: 20 }} />
                      )}
                    </TableCell>

                    <TableCell sx={{ borderColor: '#E2E7EE', color: '#2A3FD6', fontWeight: 600 }}>{m.maxLTV}%</TableCell>
                    <TableCell sx={{ borderColor: '#E2E7EE' }}>
                      <Typography variant="caption" color="text.secondary">{m.liqThresh}%</Typography>
                    </TableCell>
                    <TableCell sx={{ borderColor: '#E2E7EE' }}>
                      <Chip label={`${m.borrowAPR}%`} size="small"
                        sx={{ bgcolor: '#E5484D20', color: '#E5484D', fontSize: 11, fontWeight: 600, height: 20 }} />
                    </TableCell>
                    <TableCell sx={{ borderColor: '#E2E7EE' }}>
                      <Chip label={`${m.supplyAPR}%`} size="small"
                        sx={{ bgcolor: '#0E9F6E20', color: '#0E9F6E', fontSize: 11, fontWeight: 600, height: 20 }} />
                    </TableCell>

                    <TableCell sx={{ borderColor: '#E2E7EE' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinearProgress variant="determinate" value={m.util}
                          sx={{ flex: 1, minWidth: 48, height: 6, borderRadius: 1, bgcolor: '#E7EBF1',
                                '& .MuiLinearProgress-bar': { borderRadius: 1,
                                  bgcolor: m.util > 75 ? '#E5484D' : m.util > 50 ? '#C77700' : '#0E9F6E' } }} />
                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 28 }}>{m.util}%</Typography>
                      </Box>
                    </TableCell>

                    <TableCell sx={{ borderColor: '#E2E7EE' }}>
                      <Button component={Link} href={`/?asset=${m.symbol}`} size="small" variant="contained"
                        sx={{ bgcolor: '#2A3FD6', color: 'white', fontSize: 11, px: 1.5, whiteSpace: 'nowrap', boxShadow: 'none', '&:hover': { bgcolor: '#1E2FA8', boxShadow: 'none' } }}>
                        Borrow
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 3 }}>
          Prices sourced from CoinGecko API · Click column headers to sort · For testnet use only
        </Typography>
      </Box>
    </Box>
  );
}
