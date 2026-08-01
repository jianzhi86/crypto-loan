'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';

import { TX_LABELS, TX_TYPES, TX_UNIT, formatTxAmount } from '@/lib/tx-query';
import { LiveDot, SearchIcon } from '@/components/Icons';

interface Row {
  id: string; type: string; amount: string; wallet: string;
  txHash: string; blockNumber: number; createdAt: string;
}

const C = {
  border: 'rgba(255,255,255,0.12)', head: '#0B1430', slate: 'rgba(255,255,255,0.65)',
  ink: '#F2F5FF', muted: 'rgba(255,255,255,0.4)', blue: '#6E8BFF',
  green: '#2BD9A2', amber: '#FFB224',
};

const TONE: Record<string, { bg: string; color: string }> = {
  CollateralDeposited: { bg: 'rgba(6,182,212,.12)',   color: '#22D3EE' },
  CollateralWithdrawn: { bg: 'rgba(234,179,8,.14)',   color: '#FBBF24' },
  Borrowed:            { bg: 'rgba(167,139,250,.18)', color: '#A78BFA' },
  Repaid:              { bg: 'rgba(34,197,94,.14)',   color: '#4ADE80' },
  MYRPurchased:        { bg: 'rgba(43,217,162,.12)',  color: C.green },
};

const TX_ICONS: Record<string, string> = {
  CollateralDeposited: '⬇',
  CollateralWithdrawn: '⬆',
  Borrowed:            '💳',
  Repaid:              '✅',
  MYRPurchased:        '🏦',
};

/** "9 seconds ago" */
function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 2, fontSize: 14, bgcolor: '#111B38',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.35)' },
  },
  '& .MuiInputLabel-root': { fontSize: 14 },
};

export default function ExplorerContent() {
  const [rows, setRows]       = useState<Row[]>([]);
  const [byType, setByType]   = useState<Record<string, number>>({});
  const [total, setTotal]     = useState(0);
  const [pages, setPages]     = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [q, setQ]       = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo]     = useState('');
  const [page, setPage] = useState(1);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (type) p.set('type', type);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    p.set('page', String(page));
    return p.toString();
  }, [q, type, from, to, page]);

  const load = useCallback(() => {
    fetch(`/api/explorer?${query}`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? 'Failed to load');
        return d;
      })
      .then(d => { setRows(d.txs); setTotal(d.total); setPages(d.pages); setByType(d.byType); setError(''); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  useEffect(() => {
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  const onFilter = (set: (v: string) => void) =>
    (e: { target: { value: string } }) => { set(e.target.value); setPage(1); };

  const pickType = (t: string) => { setType(t); setPage(1); };

  const hasFilters = !!(q || type || from || to);

  const PAGE_SIZE = 20;
  const rowStart = (page - 1) * PAGE_SIZE + 1;
  const rowEnd   = Math.min(page * PAGE_SIZE, total);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0B1226', p: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>

        {/* Header */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: C.ink }}>Transaction Explorer</Typography>
            <Chip
              size="small"
              icon={<Box sx={{ display: 'flex', ml: '9px !important', mr: '-2px !important' }}><LiveDot color={C.green} /></Box>}
              label="Live · updates every 15s"
              sx={{ bgcolor: 'rgba(43,217,162,.1)', color: C.green, fontWeight: 600, height: 22, fontSize: 11 }}
            />
          </Box>
          <Typography variant="body2" sx={{ color: C.slate, mt: 0.75, maxWidth: 780, lineHeight: 1.7 }}>
            Every loan action on the protocol, newest first. Wallet addresses are shortened —
            no personal information or KYC record is ever published here.
          </Typography>
        </Box>

        {/* Activity summary cards */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(6, 1fr)' }, gap: 1.5, mb: 3 }}>
          <Paper sx={{
            p: 1.75, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.blue}`,
            borderRadius: 2, boxShadow: 'none', bgcolor: '#111B38',
            transition: 'transform .15s', '&:hover': { transform: 'translateY(-2px)' },
          }}>
            <Typography variant="caption" sx={{ color: C.slate }}>Total Txs</Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 700, color: C.ink }}>{total}</Typography>
          </Paper>
          {TX_TYPES.map(t => {
            const tone = TONE[t] ?? { bg: 'rgba(90,102,117,.1)', color: C.slate };
            return (
              <Paper key={t} onClick={() => pickType(type === t ? '' : t)} sx={{
                p: 1.75, borderRadius: 2, boxShadow: 'none', cursor: 'pointer',
                bgcolor: type === t ? `${tone.color}18` : '#111B38',
                border:  `1px solid ${type === t ? tone.color : C.border}`,
                borderLeft: `3px solid ${tone.color}`,
                transition: 'border-color .15s, background .15s, transform .15s',
                '&:hover': { borderColor: tone.color, transform: 'translateY(-2px)' },
              }}>
                <Typography variant="caption" sx={{ color: C.slate, fontSize: 11 }}>{TX_LABELS[t]}</Typography>
                <Typography sx={{ fontSize: 22, fontWeight: 700, color: tone.color }}>
                  {byType[t] ?? 0}
                </Typography>
              </Paper>
            );
          })}
        </Box>

        {/* Filter bar */}
        <Card sx={{ p: 2.5, mb: 2.5, border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#111B38' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '2fr 1.2fr 1fr 1fr auto' }, gap: 1.5, alignItems: 'center' }}>
            <TextField sx={fieldSx} value={q} onChange={onFilter(setQ)}
              placeholder="Search wallet, tx hash or block…" />
            <TextField select label="Type" value={type} onChange={onFilter(setType)} sx={fieldSx}>
              <MenuItem value="">All types</MenuItem>
              {TX_TYPES.map(t => <MenuItem key={t} value={t}>{TX_LABELS[t]}</MenuItem>)}
            </TextField>
            <TextField type="date" label="From" slotProps={{ inputLabel: { shrink: true } }}
              value={from} onChange={onFilter(setFrom)} sx={fieldSx} />
            <TextField type="date" label="To" slotProps={{ inputLabel: { shrink: true } }}
              value={to} onChange={onFilter(setTo)} sx={fieldSx} />
            <Button disabled={!hasFilters}
              onClick={() => { setQ(''); setType(''); setFrom(''); setTo(''); setPage(1); }}
              sx={{ textTransform: 'none', fontSize: 14, color: C.slate, '&:not(:disabled):hover': { color: C.ink } }}>
              Clear
            </Button>
          </Box>
        </Card>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

        {loading && rows.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
            <CircularProgress size={28} sx={{ color: C.blue }} />
          </Box>
        ) : rows.length === 0 ? (
          <Paper sx={{ p: 8, textAlign: 'center', border: `1px dashed ${C.border}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#111B38' }}>
            <Box sx={{ width: 48, height: 48, mx: 'auto', mb: 2, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        bgcolor: '#0B1226', color: C.muted }}>
              <SearchIcon size={22} />
            </Box>
            <Typography sx={{ fontWeight: 500, color: C.ink }}>
              {hasFilters ? 'No transactions match these filters' : 'No transactions yet'}
            </Typography>
            <Typography variant="body2" sx={{ color: C.slate, mt: 0.5 }}>
              {hasFilters ? 'Try clearing the search or widening the dates.' : 'Activity will appear here as users borrow and repay.'}
            </Typography>
          </Paper>
        ) : (
          <>
            {/* ── TABLE — wide screens ────────────────────────────────────── */}
            <Card sx={{ border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', display: { xs: 'none', md: 'block' } }}>
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table sx={{ minWidth: 860 }}>
                  <TableHead>
                    <TableRow>
                      {['Block', 'Type', 'Amount', 'Wallet', 'Tx Hash', 'Time'].map(h => (
                        <TableCell key={h} sx={{
                          color: C.slate, bgcolor: C.head, fontSize: 13,
                          fontWeight: 700, whiteSpace: 'nowrap',
                          borderBottom: `1px solid ${C.border}`,
                          py: 1.75, px: 2,
                        }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((t, i) => {
                      const tone = TONE[t.type] ?? { bg: 'rgba(90,102,117,.1)', color: C.slate };
                      return (
                        <TableRow key={t.id} sx={{
                          bgcolor: i % 2 ? '#0F1A3D' : '#111B38',
                          borderLeft: '3px solid transparent',
                          transition: 'background .12s, border-color .12s',
                          '&:hover': { bgcolor: '#142040', borderLeft: `3px solid ${tone.color}` },
                        }}>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 600, color: C.blue, borderColor: 'rgba(255,255,255,0.07)', whiteSpace: 'nowrap', py: 1.75, px: 2 }}>
                            #{t.blockNumber}
                          </TableCell>
                          <TableCell sx={{ borderColor: 'rgba(255,255,255,0.07)', whiteSpace: 'nowrap', py: 1.75, px: 2 }}>
                            <Chip
                              label={`${TX_ICONS[t.type] ?? ''} ${TX_LABELS[t.type] ?? t.type}`}
                              sx={{ bgcolor: tone.bg, color: tone.color, fontWeight: 700, height: 30, fontSize: 13, borderRadius: 1.5,
                                    '& .MuiChip-label': { px: 1.25 } }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontSize: 15, fontWeight: 700, color: C.ink, borderColor: 'rgba(255,255,255,0.07)', whiteSpace: 'nowrap', py: 1.75, px: 2 }}>
                            {formatTxAmount(t.type, t.amount)}{' '}
                            <Box component="span" sx={{ color: C.muted, fontWeight: 500, fontSize: 13 }}>
                              {TX_UNIT[t.type] ?? ''}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 13, color: C.slate, borderColor: 'rgba(255,255,255,0.07)', whiteSpace: 'nowrap', py: 1.75, px: 2 }}>
                            {t.wallet}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 13, color: C.slate, borderColor: 'rgba(255,255,255,0.07)', whiteSpace: 'nowrap', py: 1.75, px: 2 }}>
                            {t.txHash}
                          </TableCell>
                          <TableCell sx={{ fontSize: 13, color: C.muted, borderColor: 'rgba(255,255,255,0.07)', whiteSpace: 'nowrap', py: 1.75, px: 2 }}>
                            {ago(t.createdAt, now)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>

            {/* ── CARD LIST — mobile ───────────────────────────────────────── */}
            <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 0,
                        border: `1px solid ${C.border}`, borderRadius: 3, overflow: 'hidden' }}>
              {rows.map((t, i) => {
                const tone = TONE[t.type] ?? { bg: 'rgba(90,102,117,.1)', color: C.slate };
                return (
                  <Box key={t.id} sx={{
                    bgcolor: i % 2 ? '#0F1A3D' : '#111B38',
                    borderBottom: i < rows.length - 1 ? `1px solid rgba(255,255,255,0.07)` : 'none',
                    borderLeft: `3px solid ${tone.color}`,
                    p: 1.5,
                  }}>
                    {/* Row 1: type chip + time + block */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
                      <Chip
                        label={`${TX_ICONS[t.type] ?? ''} ${TX_LABELS[t.type] ?? t.type}`}
                        sx={{ bgcolor: tone.bg, color: tone.color, fontWeight: 700, height: 28, fontSize: 13, borderRadius: 1.5,
                              '& .MuiChip-label': { px: 1.25 } }}
                      />
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontSize: 13, color: C.muted }}>{ago(t.createdAt, now)}</Typography>
                        <Typography sx={{ fontSize: 12, fontFamily: 'monospace', color: C.blue, fontWeight: 600 }}>#{t.blockNumber}</Typography>
                      </Box>
                    </Box>
                    {/* Row 2: amount */}
                    <Typography sx={{ fontSize: 17, fontWeight: 700, color: C.ink, mb: 1 }}>
                      {formatTxAmount(t.type, t.amount)}{' '}
                      <Box component="span" sx={{ fontSize: 14, color: C.muted, fontWeight: 500 }}>{TX_UNIT[t.type] ?? ''}</Box>
                    </Typography>
                    {/* Row 3: wallet + hash */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Typography sx={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>Wallet</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontSize: 12.5, color: C.slate, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.wallet}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Typography sx={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>Tx</Typography>
                        <Typography sx={{ fontFamily: 'monospace', fontSize: 12.5, color: C.slate, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.txHash}</Typography>
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 3, flexWrap: 'wrap', gap: 1 }}>
            <Typography sx={{ fontSize: 13, color: C.muted }}>
              Showing {rowStart}–{rowEnd} of {total} transactions
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button variant="outlined" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                sx={{ textTransform: 'none', fontSize: 14, borderColor: C.border, color: C.slate, '&:not(:disabled):hover': { borderColor: C.blue, color: C.blue } }}>
                ← Previous
              </Button>
              <Typography sx={{ fontSize: 14, color: C.slate, px: 1 }}>
                {page} / {pages}
              </Typography>
              <Button variant="outlined" disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                sx={{ textTransform: 'none', fontSize: 14, borderColor: C.border, color: C.slate, '&:not(:disabled):hover': { borderColor: C.blue, color: C.blue } }}>
                Next →
              </Button>
            </Box>
          </Box>
        )}

        <Typography sx={{ display: 'block', textAlign: 'center', fontSize: 13, color: C.muted, mt: 4, lineHeight: 1.8 }}>
          Records mirrored from CryptoLoan contract events · ETH values in ether · MYR values in ringgit
        </Typography>

      </Box>
    </Box>
  );
}
