'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
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
import Tooltip from '@mui/material/Tooltip';

import { Badge, C, EmptyState, PageHeader, ReadOnlyNotice, cellSx, headSx, monoSx } from './ui';
import { DownloadIcon } from '@/components/Icons';
import { TX_LABELS, TX_TYPES, TX_UNIT, formatTxAmount } from '@/lib/tx-query';

interface LoanTx {
  id: string; wallet: string; type: string; amount: string;
  txHash: string; blockNumber: number; createdAt: string;
  user: { id: string; name: string | null; email: string | null; status: string } | null;
}
interface TransferTx {
  id: string; referenceNo: string; amountMYR: number; status: string;
  bankName: string; accountLast4: string; createdAt: string; completedAt: string | null;
  user: { id: string; name: string | null; email: string | null; status: string } | null;
}

const TYPE_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'neutral'> = {
  CollateralDeposited: 'blue',
  CollateralWithdrawn: 'amber',
  Borrowed:            'amber',
  Repaid:              'green',
  MYRPurchased:        'green',
};
const TRANSFER_TONE: Record<string, 'green' | 'amber' | 'red' | 'neutral'> = {
  COMPLETED: 'green', PROCESSING: 'amber', PENDING: 'amber', FAILED: 'red',
};

const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13.5, bgcolor: '#0D1628' } };

export default function AdminTransactions() {
  const [source, setSource] = useState<'loan' | 'transfer'>('loan');
  const [rows, setRows]     = useState<(LoanTx | TransferTx)[]>([]);
  /** Which tab the rows in state actually came from. The two tabs return
   *  different row shapes, so the table is chosen by this rather than by the
   *  selected tab — that way a row can never be rendered by the wrong table. */
  const [rowsFrom, setRowsFrom] = useState<'loan' | 'transfer'>('loan');
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [total, setTotal]   = useState(0);
  const [pages, setPages]   = useState(1);

  const [q, setQ]         = useState('');
  const [type, setType]   = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom]   = useState('');
  const [to, setTo]       = useState('');
  const [page, setPage]   = useState(1);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set('source', source);
    if (q) p.set('q', q);
    if (source === 'loan' && type) p.set('type', type);
    if (source === 'transfer' && status) p.set('status', status);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    p.set('page', String(page));
    return p.toString();
  }, [source, q, type, status, from, to, page]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/transactions?${query}`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? 'Failed to load');
        return d;
      })
      // Trust the server's echoed `source`, not the local one: a slow response
      // for the previous tab could otherwise land after the user switched.
      .then(d => { setRows(d.txs); setRowsFrom(d.source); setTotal(d.total); setPages(d.pages); setError(''); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  // Changing a filter returns to page 1 — staying on page 3 of a narrower
  // result set would just show an empty table. Done in the handler rather than
  // an effect so it is one render, not a cascade.
  const onFilter = (set: (v: string) => void) =>
    (e: { target: { value: string } }) => { set(e.target.value); setPage(1); };

  // Clearing rows is not cosmetic. The two tabs render different shapes, and
  // switching used to leave the previous tab's rows in state for the duration
  // of the debounce — so TransferTable would read `amountMYR` off a loan row
  // and crash the page on `undefined.toLocaleString()`.
  const pickSource = (v: 'loan' | 'transfer') => {
    setSource(v);
    setPage(1);
    setRows([]);
    setLoading(true);
    setError('');
  };

  const clearFilters = () => { setQ(''); setType(''); setStatus(''); setFrom(''); setTo(''); setPage(1); };
  const hasFilters = !!(q || type || status || from || to);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: '#080E1F', minHeight: '100vh' }}>
      <Box sx={{ maxWidth: 1440, mx: 'auto' }}>
        <PageHeader
          title="Transactions"
          subtitle={`${total} record${total === 1 ? '' : 's'} · Supabase mirror`}
          actions={
            <Button
              variant="outlined" size="small"
              href={`/api/admin/transactions?${query}&format=csv`}
              startIcon={<DownloadIcon size={16} />}
              sx={{ textTransform: 'none', borderRadius: 2 }}
            >
              Export CSV
            </Button>
          }
        />

        {/* Source toggle — pill-style */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2.5 }}>
          {([['loan', 'On-chain activity'], ['transfer', 'Bank transfers']] as const).map(([v, lbl]) => (
            <Box
              key={v} onClick={() => pickSource(v)}
              sx={{
                px: 2, py: 0.75, borderRadius: 2, cursor: 'pointer',
                border: `1px solid ${source === v ? C.blue : C.border}`,
                bgcolor: source === v ? `${C.blue}14` : 'transparent',
                color: source === v ? C.blue : C.muted,
                fontSize: 13, fontWeight: source === v ? 600 : 500,
                transition: 'all .15s',
                '&:hover': { borderColor: C.blue, color: C.blue },
              }}
            >
              {lbl}
            </Box>
          ))}
        </Box>

        {source === 'loan' ? (
          <ReadOnlyNotice>
            <strong>Read-only mirror.</strong> These rows are a copy of events emitted by the
            CryptoLoan contract, kept so history survives a node restart. They cannot be edited or
            deleted from this panel — the chain is the record of truth, and a mirror you can rewrite
            is worse than no mirror. Bank transfers, on the next tab, are genuinely off-chain.
          </ReadOnlyNotice>
        ) : (
          <ReadOnlyNotice>
            <strong>Off-chain records.</strong> Bank transfers live only in this database. They are
            shown here in full, including the account holder&apos;s identity, because they are not
            public data — unlike the on-chain tab, none of this is visible in the public explorer.
          </ReadOnlyNotice>
        )}

        <Card sx={{ p: 2, mb: 2.5, border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#0D1628' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1.2fr 1fr 1fr auto' }, gap: 1.5, alignItems: 'center' }}>
            <TextField
              size="small" sx={fieldSx} value={q} onChange={onFilter(setQ)}
              placeholder={source === 'loan' ? 'Search wallet, tx hash or block number…' : 'Search reference, bank, user…'}
            />
            {source === 'loan' ? (
              <TextField select size="small" label="Type" value={type} onChange={onFilter(setType)} sx={fieldSx}>
                <MenuItem value="">All types</MenuItem>
                {TX_TYPES.map(t => <MenuItem key={t} value={t}>{TX_LABELS[t]}</MenuItem>)}
              </TextField>
            ) : (
              <TextField select size="small" label="Status" value={status} onChange={onFilter(setStatus)} sx={fieldSx}>
                <MenuItem value="">All statuses</MenuItem>
                {['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </TextField>
            )}
            <TextField type="date" size="small" label="From" slotProps={{ inputLabel: { shrink: true } }}
              value={from} onChange={onFilter(setFrom)} sx={fieldSx} />
            <TextField type="date" size="small" label="To" slotProps={{ inputLabel: { shrink: true } }}
              value={to} onChange={onFilter(setTo)} sx={fieldSx} />
            <Button size="small" disabled={!hasFilters} onClick={clearFilters} sx={{ textTransform: 'none' }}>
              Clear
            </Button>
          </Box>
        </Card>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

        {loading && rows.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress size={28} /></Box>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="search"
            title={hasFilters ? 'No transactions match these filters' : 'No transactions recorded yet'}
            hint={hasFilters ? 'Try widening the date range or clearing the search.' : 'Records appear here once users transact.'}
          />
        ) : (
          <Card sx={{ border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#0D1628' }}>
            <TableContainer sx={{ overflowX: 'auto' }}>
              {rowsFrom === 'loan'
                ? <LoanTable rows={rows as LoanTx[]} />
                : <TransferTable rows={rows as TransferTx[]} />}
            </TableContainer>
          </Card>
        )}

        {pages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1.5, mt: 3 }}>
            <Button size="small" disabled={page <= 1} onClick={() => setPage(p => p - 1)} sx={{ textTransform: 'none', borderRadius: 2, px: 2 }}>← Prev</Button>
            {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
              const p = pages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= pages - 3 ? pages - 6 + i : page - 3 + i;
              return (
                <Button key={p} size="small" onClick={() => setPage(p)}
                  variant={page === p ? 'contained' : 'text'} disableElevation
                  sx={{ textTransform: 'none', minWidth: 36, borderRadius: 2, fontSize: 12 }}>
                  {p}
                </Button>
              );
            })}
            <Button size="small" disabled={page >= pages} onClick={() => setPage(p => p + 1)} sx={{ textTransform: 'none', borderRadius: 2, px: 2 }}>Next →</Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function LoanTable({ rows }: { rows: LoanTx[] }) {
  return (
    <Table size="small" sx={{ minWidth: 1080 }}>
      <TableHead>
        <TableRow>
          {['Type', 'Amount', 'Wallet', 'Account', 'Block', 'Tx hash', 'Recorded'].map(h => (
            <TableCell key={h} sx={headSx}>{h}</TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((t, i) => (
          <TableRow key={t.id} sx={{ bgcolor: i % 2 ? '#0A1220' : '#0D1628', '&:hover': { bgcolor: '#0F1730' } }}>
            <TableCell sx={cellSx}>
              <Badge label={TX_LABELS[t.type] ?? t.type} tone={TYPE_TONE[t.type] ?? 'neutral'} />
            </TableCell>
            <TableCell sx={{ ...cellSx, color: C.ink, fontWeight: 600, fontSize: 13 }}>
              {formatTxAmount(t.type, t.amount)} <span style={{ color: C.muted, fontWeight: 400 }}>{TX_UNIT[t.type] ?? ''}</span>
            </TableCell>
            <TableCell sx={monoSx}>
              <Tooltip title={t.wallet}><span>{t.wallet.slice(0, 10)}…{t.wallet.slice(-4)}</span></Tooltip>
            </TableCell>
            <TableCell sx={cellSx}>
              {t.user
                ? <Tooltip title={t.user.email ?? t.user.id}>
                    <span style={{ color: t.user.status === 'RESTRICTED' ? C.red : C.slate }}>
                      {t.user.email ?? t.user.name ?? t.user.id}
                    </span>
                  </Tooltip>
                : <span style={{ color: C.muted }}>unlinked wallet</span>}
            </TableCell>
            <TableCell sx={monoSx}>{t.blockNumber}</TableCell>
            <TableCell sx={monoSx}>
              <Tooltip title={t.txHash}><span>{t.txHash.slice(0, 12)}…{t.txHash.slice(-6)}</span></Tooltip>
            </TableCell>
            <TableCell sx={cellSx}>{new Date(t.createdAt).toLocaleString('en-MY')}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TransferTable({ rows }: { rows: TransferTx[] }) {
  return (
    <Table size="small" sx={{ minWidth: 1080 }}>
      <TableHead>
        <TableRow>
          {['Reference', 'Amount', 'Status', 'Bank', 'Account', 'User', 'Created', 'Completed'].map(h => (
            <TableCell key={h} sx={headSx}>{h}</TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((t, i) => (
          <TableRow key={t.id} sx={{ bgcolor: i % 2 ? '#0A1220' : '#0D1628', '&:hover': { bgcolor: '#0F1730' } }}>
            <TableCell sx={monoSx}>{t.referenceNo}</TableCell>
            <TableCell sx={{ ...cellSx, color: C.ink, fontWeight: 600, fontSize: 13 }}>
              RM {t.amountMYR.toLocaleString('en-MY', { minimumFractionDigits: 2 })}
            </TableCell>
            <TableCell sx={cellSx}>
              <Badge label={t.status} tone={TRANSFER_TONE[t.status] ?? 'neutral'} />
            </TableCell>
            <TableCell sx={cellSx}>{t.bankName}</TableCell>
            <TableCell sx={monoSx}>••••{t.accountLast4}</TableCell>
            <TableCell sx={cellSx}>
              <span style={{ color: t.user?.status === 'RESTRICTED' ? C.red : C.slate }}>
                {t.user?.email ?? t.user?.name ?? '—'}
              </span>
            </TableCell>
            <TableCell sx={cellSx}>{new Date(t.createdAt).toLocaleString('en-MY')}</TableCell>
            <TableCell sx={cellSx}>
              {t.completedAt ? new Date(t.completedAt).toLocaleString('en-MY') : <span style={{ color: C.muted }}>—</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
