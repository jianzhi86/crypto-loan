'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';

import { Badge, C, EmptyState, PageHeader, ReadOnlyNotice } from './ui';

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
  USER_RESTRICT: 'red',    USER_CLEAR_BANK: 'red',    KYC_DELETE: 'red',     KYC_REJECT: 'red',
  USER_RESET_PASSWORD: 'amber', USER_RESET_KYC: 'amber', USER_UNLINK_WALLET: 'amber',
  USER_UNRESTRICT: 'green', KYC_APPROVE: 'green',
  FLAG_UPDATE: 'blue', USER_SET_ADMIN: 'blue',
  PRICE_SYNC: 'neutral',
};

const TONE_COLOR: Record<string, string> = {
  green: C.green, amber: C.amber, red: C.red, blue: C.blue, neutral: C.muted,
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13.5, bgcolor: '#0D1628' } };

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
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? 'Failed to load'); return d; })
      .then(d => { setEntries(d.entries); setTotal(d.total); setPages(d.pages); setError(''); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const onFilter = (set: (v: string) => void) =>
    (e: { target: { value: string } }) => { set(e.target.value); setPage(1); };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: '#080E1F', minHeight: '100vh' }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <PageHeader
          title="Audit Log"
          subtitle={`${total} recorded admin action${total === 1 ? '' : 's'} · append-only`}
        />

        <ReadOnlyNotice>
          <strong>Append-only.</strong> Every admin mutation lands here automatically — there is no endpoint to edit or delete
          an entry. Password resets record that a reset happened, never the password that was set.
        </ReadOnlyNotice>

        {/* Filters */}
        <Card sx={{ p: 2, mb: 2.5, border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#0D1628' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 1.5 }}>
            <TextField size="small" placeholder="Search admin, target or detail…"
              value={q} onChange={onFilter(setQ)} sx={fieldSx} />
            <TextField select size="small" label="Action" value={action} onChange={onFilter(setAction)} sx={fieldSx}>
              <MenuItem value="">All actions</MenuItem>
              {ACTIONS.map(a => <MenuItem key={a} value={a}>{a.replace(/_/g, ' ').toLowerCase()}</MenuItem>)}
            </TextField>
          </Box>
        </Card>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

        {loading && entries.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress size={28} /></Box>
        ) : entries.length === 0 ? (
          <EmptyState icon="clipboard" title="Nothing logged yet" hint="Admin actions are recorded here as they happen." />
        ) : (
          <Card sx={{ border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#0D1628', overflow: 'hidden' }}>
            {entries.map((e, i) => {
              const tone = TONE[e.action] ?? 'neutral';
              const dot  = TONE_COLOR[tone] ?? C.muted;
              return (
                <Box key={e.id}>
                  <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '32px 1fr' },
                    gap: 2, px: 2.5, py: 1.75,
                    alignItems: 'flex-start',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.025)' },
                    borderLeft: `3px solid ${dot}28`,
                  }}>
                    {/* Timeline dot */}
                    <Box sx={{ display: { xs: 'none', sm: 'flex' }, justifyContent: 'center', pt: 0.5 }}>
                      <Box sx={{
                        width: 28, height: 28, borderRadius: '50%',
                        bgcolor: `${dot}14`, border: `1px solid ${dot}30`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: dot }} />
                      </Box>
                    </Box>

                    {/* Content */}
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                        <Badge label={e.action.replace(/_/g, ' ').toLowerCase()} tone={tone} />
                        <Typography sx={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>
                          {relativeTime(e.createdAt)}
                          {' · '}
                          {new Date(e.createdAt).toLocaleString('en-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                      </Box>

                      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Box>
                          <Typography sx={{ fontSize: 10.5, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, mb: 0.2 }}>Admin</Typography>
                          <Typography sx={{ fontSize: 12, color: C.slate, fontFamily: 'monospace' }}>
                            {e.actorEmail ?? e.actorId.slice(0, 28) + '…'}
                          </Typography>
                        </Box>
                        <Box sx={{ width: 1, height: 24, bgcolor: C.border }} />
                        <Box>
                          <Typography sx={{ fontSize: 10.5, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, mb: 0.2 }}>Target</Typography>
                          <Typography sx={{ fontSize: 12, fontFamily: 'monospace', color: C.slate }}>
                            <span style={{ color: C.muted }}>{e.targetType}/</span>{e.targetId.length > 20 ? e.targetId.slice(0, 20) + '…' : e.targetId}
                          </Typography>
                        </Box>
                        {e.detail && (
                          <>
                            <Box sx={{ width: 1, height: 24, bgcolor: C.border }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography sx={{ fontSize: 10.5, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4, mb: 0.2 }}>Detail</Typography>
                              <Detail raw={e.detail} />
                            </Box>
                          </>
                        )}
                      </Box>
                    </Box>
                  </Box>
                  {i < entries.length - 1 && <Divider sx={{ borderColor: C.border }} />}
                </Box>
              );
            })}
          </Card>
        )}

        {pages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1.5, mt: 3 }}>
            <Button size="small" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              sx={{ textTransform: 'none', borderRadius: 2, px: 2 }}>
              ← Prev
            </Button>
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
            <Button size="small" disabled={page >= pages} onClick={() => setPage(p => p + 1)}
              sx={{ textTransform: 'none', borderRadius: 2, px: 2 }}>
              Next →
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function Detail({ raw }: { raw: string | null }) {
  if (!raw) return <span style={{ color: C.muted }}>—</span>;
  let pretty = raw;
  try { pretty = JSON.stringify(JSON.parse(raw), null, 0); } catch { /* verbatim */ }
  return (
    <Typography component="code" sx={{ fontFamily: 'monospace', fontSize: 11, color: C.slate, wordBreak: 'break-word' }}>
      {pretty}
    </Typography>
  );
}
