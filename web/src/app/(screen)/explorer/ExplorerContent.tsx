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
  border: '#E2E7EE', head: '#EEF1F5', slate: '#5A6675',
  ink: '#10151C', muted: '#A9B2BD', blue: '#2A3FD6',
  green: '#0E9F6E', amber: '#C77700',
};

const TONE: Record<string, { bg: string; color: string }> = {
  CollateralDeposited: { bg: 'rgba(6,182,212,.1)',  color: '#0891B2' },
  CollateralWithdrawn: { bg: 'rgba(234,179,8,.12)', color: '#A16207' },
  Borrowed:            { bg: 'rgba(167,139,250,.15)', color: '#7C3AED' },
  Repaid:              { bg: 'rgba(34,197,94,.12)', color: '#15803D' },
  MYRPurchased:        { bg: 'rgba(14,159,110,.1)', color: C.green },
};

/** "9 seconds ago" — the relative clock a block explorer is expected to have. */
function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60)    return `${s} second${s === 1 ? '' : 's'} ago`;
  const m = Math.floor(s / 60);
  if (m < 60)    return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24)    return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13.5, bgcolor: '#fff' } };

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

  // Ticks once a second so "9 seconds ago" actually counts up. Held in state
  // rather than read inline so every row re-renders from the same instant.
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

  // Reset paging in the handler rather than an effect, to avoid a second render.
  const onFilter = (set: (v: string) => void) =>
    (e: { target: { value: string } }) => { set(e.target.value); setPage(1); };

  const pickType = (t: string) => { setType(t); setPage(1); };

  // Keep the feed live, the way a real explorer does.
  useEffect(() => {
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  const hasFilters = !!(q || type || from || to);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F4F6F8', p: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>

        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: C.ink }}>Transaction Explorer</Typography>
            <Chip
              size="small"
              icon={<Box sx={{ display: 'flex', ml: '9px !important', mr: '-2px !important' }}><LiveDot color={C.green} /></Box>}
              label="Live"
              sx={{ bgcolor: 'rgba(14,159,110,.1)', color: C.green, fontWeight: 600, height: 22, fontSize: 11 }}
            />
          </Box>
          <Typography variant="body2" sx={{ color: C.slate, mt: 0.75, maxWidth: 780, lineHeight: 1.7 }}>
            Every loan action on the protocol, newest first. These are public contract events —
            the same data any block explorer would show. Wallet addresses are shortened and no
            personal information, KYC record or bank detail is ever published here.
          </Typography>
        </Box>

        {/* Activity summary */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(6, 1fr)' },
          gap: 1.5, mb: 3,
        }}>
          <Paper sx={{ p: 1.75, border: `1px solid ${C.border}`, borderRadius: 2, boxShadow: 'none' }}>
            <Typography variant="caption" sx={{ color: C.slate }}>Total</Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 700, color: C.ink }}>{total}</Typography>
          </Paper>
          {TX_TYPES.map(t => (
            <Paper key={t} sx={{
              p: 1.75, border: `1px solid ${C.border}`, borderRadius: 2, boxShadow: 'none',
              cursor: 'pointer', transition: 'border-color .15s',
              borderColor: type === t ? C.blue : C.border,
              '&:hover': { borderColor: C.blue },
            }}
              onClick={() => pickType(type === t ? '' : t)}
            >
              <Typography variant="caption" sx={{ color: C.slate, fontSize: 11 }}>{TX_LABELS[t]}</Typography>
              <Typography sx={{ fontSize: 22, fontWeight: 700, color: TONE[t]?.color ?? C.ink }}>
                {byType[t] ?? 0}
              </Typography>
            </Paper>
          ))}
        </Box>

        <Card sx={{ p: 2, mb: 2.5, border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1.2fr 1fr 1fr auto' }, gap: 1.5, alignItems: 'center' }}>
            <TextField size="small" sx={fieldSx} value={q} onChange={onFilter(setQ)}
              placeholder="Search by wallet, tx hash or block number…" />
            <TextField select size="small" label="Type" value={type} onChange={onFilter(setType)} sx={fieldSx}>
              <MenuItem value="">All types</MenuItem>
              {TX_TYPES.map(t => <MenuItem key={t} value={t}>{TX_LABELS[t]}</MenuItem>)}
            </TextField>
            <TextField type="date" size="small" label="From" slotProps={{ inputLabel: { shrink: true } }}
              value={from} onChange={onFilter(setFrom)} sx={fieldSx} />
            <TextField type="date" size="small" label="To" slotProps={{ inputLabel: { shrink: true } }}
              value={to} onChange={onFilter(setTo)} sx={fieldSx} />
            <Button size="small" disabled={!hasFilters}
              onClick={() => { setQ(''); setType(''); setFrom(''); setTo(''); setPage(1); }}
              sx={{ textTransform: 'none' }}>
              Clear
            </Button>
          </Box>
        </Card>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

        {loading && rows.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress size={28} /></Box>
        ) : rows.length === 0 ? (
          <Paper sx={{ p: 8, textAlign: 'center', border: `1px dashed ${C.border}`, borderRadius: 3, boxShadow: 'none' }}>
            <Box sx={{
              width: 48, height: 48, mx: 'auto', mb: 2, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: '#F4F6F8', color: C.muted,
            }}>
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
          <Card sx={{ border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none' }}>
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 820 }}>
                <TableHead>
                  <TableRow>
                    {['Block', 'Type', 'Amount', 'Wallet', 'Tx hash', 'Time'].map(h => (
                      <TableCell key={h} sx={{
                        color: C.slate, bgcolor: C.head, fontSize: 11,
                        fontWeight: 600, whiteSpace: 'nowrap', borderColor: C.border,
                      }}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((t, i) => {
                    const tone = TONE[t.type] ?? { bg: 'rgba(90,102,117,.1)', color: C.slate };
                    return (
                      <TableRow key={t.id} sx={{
                        bgcolor: i % 2 ? '#FAFBFC' : '#FFFFFF',
                        '&:hover': { bgcolor: '#EEF1F5' },
                      }}>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, color: C.blue, borderColor: C.border, whiteSpace: 'nowrap' }}>
                          {t.blockNumber}
                        </TableCell>
                        <TableCell sx={{ borderColor: C.border, whiteSpace: 'nowrap' }}>
                          <Chip label={TX_LABELS[t.type] ?? t.type} size="small"
                            sx={{ bgcolor: tone.bg, color: tone.color, fontWeight: 600, height: 20, fontSize: 11, borderRadius: 1 }} />
                        </TableCell>
                        <TableCell sx={{ fontSize: 13, fontWeight: 600, color: C.ink, borderColor: C.border, whiteSpace: 'nowrap' }}>
                          {formatTxAmount(t.type, t.amount)}{' '}
                          <Box component="span" sx={{ color: C.muted, fontWeight: 400, fontSize: 11 }}>
                            {TX_UNIT[t.type] ?? ''}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 11.5, color: C.slate, borderColor: C.border, whiteSpace: 'nowrap' }}>
                          {t.wallet}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 11.5, color: C.slate, borderColor: C.border, whiteSpace: 'nowrap' }}>
                          {t.txHash}
                        </TableCell>
                        <TableCell sx={{ fontSize: 12, color: C.slate, borderColor: C.border, whiteSpace: 'nowrap' }}>
                          {ago(t.createdAt, now)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}

        {pages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 3 }}>
            <Button size="small" disabled={page <= 1} onClick={() => setPage(p => p - 1)} sx={{ textTransform: 'none' }}>
              ← Previous
            </Button>
            <Typography variant="body2" sx={{ color: C.slate }}>Page {page} of {pages}</Typography>
            <Button size="small" disabled={page >= pages} onClick={() => setPage(p => p + 1)} sx={{ textTransform: 'none' }}>
              Next Page →
            </Button>
          </Box>
        )}

        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: C.muted, mt: 4, lineHeight: 1.8 }}>
          Records are mirrored from CryptoLoan contract events. Amounts are shown as emitted —
          ETH values in ether, MYR values in ringgit.
        </Typography>

      </Box>
    </Box>
  );
}
