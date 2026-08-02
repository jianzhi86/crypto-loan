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

import { Badge, C, EmptyState, PageHeader, ReadOnlyNotice, cellSx, headSx, monoSx } from './ui';

interface Entry {
  id: string; actorId: string; actorEmail: string | null;
  action: string; targetType: string; targetId: string;
  detail: string | null; createdAt: string;
}

const ACTIONS = [
  'USER_UPDATE', 'USER_RESTRICT', 'USER_UNRESTRICT', 'USER_RESET_PASSWORD',
  'USER_RESET_KYC', 'USER_UNLINK_WALLET', 'USER_CLEAR_BANK', 'USER_SET_ADMIN',
  'KYC_APPROVE', 'KYC_REJECT', 'KYC_DELETE', 'FLAG_UPDATE', 'PRICE_SYNC',
];

const TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'neutral'> = {
  USER_RESTRICT: 'red', USER_CLEAR_BANK: 'red', KYC_DELETE: 'red',
  USER_RESET_PASSWORD: 'amber', USER_RESET_KYC: 'amber', USER_UNLINK_WALLET: 'amber',
  USER_UNRESTRICT: 'green', KYC_APPROVE: 'green',
  KYC_REJECT: 'red',
  FLAG_UPDATE: 'blue', USER_SET_ADMIN: 'blue', PRICE_SYNC: 'neutral',
};

export default function AdminAudit() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [total, setTotal]     = useState(0);
  const [pages, setPages]     = useState(1);

  const [q, setQ]           = useState('');
  const [action, setAction] = useState('');
  const [page, setPage]     = useState(1);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (action) p.set('action', action);
    p.set('page', String(page));
    return p.toString();
  }, [q, action, page]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/audit?${query}`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? 'Failed to load');
        return d;
      })
      .then(d => { setEntries(d.entries); setTotal(d.total); setPages(d.pages); setError(''); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  // Reset paging in the handler rather than an effect, to avoid a second render.
  const onFilter = (set: (v: string) => void) =>
    (e: { target: { value: string } }) => { set(e.target.value); setPage(1); };

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1280, mx: 'auto' }}>
        <PageHeader title="Audit log" subtitle={`${total} recorded admin action${total === 1 ? '' : 's'}`} />

        <ReadOnlyNotice>
          <strong>Append-only.</strong> Every admin mutation lands here automatically, and there is
          no endpoint to edit or delete an entry — an audit log an admin can rewrite is not an audit
          log. Password resets record that a reset happened, never the password that was set.
        </ReadOnlyNotice>

        <Card sx={{ p: 2, mb: 2.5, border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 1.5 }}>
            <TextField size="small" placeholder="Search admin, target or detail…"
              value={q} onChange={onFilter(setQ)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13.5, bgcolor: '#111B38' } }} />
            <TextField select size="small" label="Action" value={action} onChange={onFilter(setAction)}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13.5, bgcolor: '#111B38' } }}>
              <MenuItem value="">All actions</MenuItem>
              {ACTIONS.map(a => <MenuItem key={a} value={a}>{a.replace(/_/g, ' ').toLowerCase()}</MenuItem>)}
            </TextField>
          </Box>
        </Card>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

        {loading && entries.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress size={28} /></Box>
        ) : entries.length === 0 ? (
          <EmptyState icon="clipboard" title="Nothing logged yet" hint="Admin actions are recorded here as they happen." />
        ) : (
          <Card sx={{ border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none' }}>
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 900 }}>
                <TableHead>
                  <TableRow>
                    {['When', 'Admin', 'Action', 'Target', 'Detail'].map(h => (
                      <TableCell key={h} sx={headSx}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((e, i) => (
                    <TableRow key={e.id} sx={{ bgcolor: i % 2 ? '#0F1A3D' : '#111B38', '&:hover': { bgcolor: '#0F1730' } }}>
                      <TableCell sx={cellSx}>{new Date(e.createdAt).toLocaleString('en-MY')}</TableCell>
                      <TableCell sx={cellSx}>{e.actorEmail ?? e.actorId}</TableCell>
                      <TableCell sx={cellSx}>
                        <Badge label={e.action.replace(/_/g, ' ').toLowerCase()} tone={TONE[e.action] ?? 'neutral'} />
                      </TableCell>
                      <TableCell sx={monoSx}>
                        <span style={{ color: C.muted }}>{e.targetType}/</span>{e.targetId}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, whiteSpace: 'normal', maxWidth: 380 }}>
                        <Detail raw={e.detail} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}

        {pages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 3 }}>
            <Button size="small" disabled={page <= 1} onClick={() => setPage(p => p - 1)} sx={{ textTransform: 'none' }}>← Previous</Button>
            <Typography variant="body2" sx={{ color: C.slate }}>Page {page} of {pages}</Typography>
            <Button size="small" disabled={page >= pages} onClick={() => setPage(p => p + 1)} sx={{ textTransform: 'none' }}>Next →</Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function Detail({ raw }: { raw: string | null }) {
  if (!raw) return <span style={{ color: C.muted }}>—</span>;
  let pretty = raw;
  try {
    pretty = JSON.stringify(JSON.parse(raw), null, 0);
  } catch {
    // Stored as opaque text — show it verbatim rather than hiding it.
  }
  return (
    <Typography component="code" sx={{ fontFamily: 'monospace', fontSize: 11, color: C.slate, wordBreak: 'break-word' }}>
      {pretty}
    </Typography>
  );
}
