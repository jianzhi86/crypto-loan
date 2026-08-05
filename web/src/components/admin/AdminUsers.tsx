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
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Alert from '@mui/material/Alert';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';

import { Badge, C, EmptyState, PageHeader, ReadOnlyNotice, cellSx, headSx, monoSx } from './ui';

interface AdminUser {
  id: string;
  name: string | null;
  email: string | null;
  walletAddress: string | null;
  isAdmin: boolean;
  status: string;
  statusReason: string | null;
  statusChangedAt: string | null;
  createdAt: string;
  kyc: { status: string; fullName: string; submittedAt: string } | null;
}

const STATUS_TONE = { ACTIVE: 'green', RESTRICTED: 'red' } as const;
const KYC_TONE: Record<string, 'green' | 'amber' | 'red'> = {
  approved: 'green', pending: 'amber', rejected: 'red',
};

const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13.5, bgcolor: '#0D1628' } };

export default function AdminUsers() {
  const [users, setUsers]     = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [total, setTotal]     = useState(0);
  const [pages, setPages]     = useState(1);

  const [q, setQ]           = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole]     = useState('');
  const [kyc, setKyc]       = useState('');
  const [page, setPage]     = useState(1);

  const [editing, setEditing]   = useState<AdminUser | null>(null);
  const [notice, setNotice]     = useState<{ severity: 'success' | 'error' | 'info'; text: string } | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (status) p.set('status', status);
    if (role) p.set('role', role);
    if (kyc) p.set('kyc', kyc);
    p.set('page', String(page));
    return p.toString();
  }, [q, status, role, kyc, page]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/admin/users?${query}`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? 'Failed to load users');
        return d;
      })
      .then(d => { setUsers(d.users); setTotal(d.total); setPages(d.pages); setError(''); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [query]);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  // Changing a filter returns to page 1 — staying on page 3 of a narrower
  // result set would just show an empty table. Done in the handler rather than
  // an effect so it is one render, not a cascade.
  const onFilter = (set: (v: string) => void) =>
    (e: { target: { value: string } }) => { set(e.target.value); setPage(1); };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: '#080E1F', minHeight: '100vh' }}>
      <Box sx={{ maxWidth: 1440, mx: 'auto' }}>
        <PageHeader
          title="Users"
          subtitle={`${total} account${total === 1 ? '' : 's'} · off-chain records only`}
        />

        <ReadOnlyNotice>
          <strong>Off-chain scope.</strong> Everything on this page edits this application&apos;s
          database. Restricting an account stops CryptoLend from acting for that user — it does
          not and cannot stop their wallet from calling the loan contract directly. On-chain
          balances, collateral and debt are never editable from here.
        </ReadOnlyNotice>

        {notice && (
          <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mb: 2.5, borderRadius: 2 }}>
            {notice.text}
          </Alert>
        )}

        {/* Filters */}
        <Card sx={{ p: 2, mb: 2.5, border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#0D1628' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr 1fr' }, gap: 1.5 }}>
            <TextField
              size="small" placeholder="Search name, email, wallet or user ID…"
              value={q} onChange={onFilter(setQ)} sx={fieldSx}
            />
            <TextField select size="small" label="Status" value={status} onChange={onFilter(setStatus)} sx={fieldSx}>
              <MenuItem value="">All statuses</MenuItem>
              <MenuItem value="ACTIVE">Active</MenuItem>
              <MenuItem value="RESTRICTED">Restricted</MenuItem>
            </TextField>
            <TextField select size="small" label="Role" value={role} onChange={onFilter(setRole)} sx={fieldSx}>
              <MenuItem value="">All roles</MenuItem>
              <MenuItem value="admin">Admins</MenuItem>
              <MenuItem value="user">Users</MenuItem>
            </TextField>
            <TextField select size="small" label="KYC" value={kyc} onChange={onFilter(setKyc)} sx={fieldSx}>
              <MenuItem value="">Any KYC</MenuItem>
              <MenuItem value="approved">Approved</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="rejected">Rejected</MenuItem>
              <MenuItem value="none">No submission</MenuItem>
            </TextField>
          </Box>
          {kyc && (
            <Typography variant="caption" sx={{ color: C.muted, mt: 1.25, display: 'block' }}>
              KYC is filtered across the current page of results — clear the KYC filter before
              changing pages to avoid missing matches.
            </Typography>
          )}
        </Card>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

        {loading && users.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress size={28} /></Box>
        ) : users.length === 0 ? (
          <EmptyState icon="search" title="No users match these filters" hint="Try clearing the search or filters." />
        ) : (
          <Card sx={{ border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#0D1628' }}>
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 1080 }}>
                <TableHead>
                  <TableRow>
                    {['User', 'Email', 'Wallet', 'Role', 'Status', 'KYC', 'Joined', ''].map((h, i) => (
                      <TableCell key={h + i} sx={headSx}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((u, i) => (
                    <UserRow
                      key={u.id} user={u} striped={i % 2 === 1}
                      onEdit={() => setEditing(u)}
                      onDone={(msg, sev) => { setNotice({ text: msg, severity: sev }); load(); }}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        )}

        {pages > 1 && !kyc && (
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

        {editing && (
          <EditUserDialog
            user={editing}
            onClose={() => setEditing(null)}
            onSaved={msg => { setEditing(null); setNotice({ text: msg, severity: 'success' }); load(); }}
          />
        )}
      </Box>
    </Box>
  );
}

function UserRow({ user, striped, onEdit, onDone }: {
  user: AdminUser;
  striped: boolean;
  onEdit: () => void;
  onDone: (msg: string, sev: 'success' | 'error' | 'info') => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy]     = useState(false);
  const [confirm, setConfirm] = useState<null | { action: string; title: string; body: string; danger?: boolean }>(null);

  const restricted = user.status === 'RESTRICTED';

  const run = async (action: string, reason?: string) => {
    setBusy(true);
    setAnchor(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json();
      if (!res.ok) { onDone(data.error ?? 'Action failed', 'error'); return; }

      if (data.tempPassword) {
        // Shown once and never persisted — the admin must copy it now.
        onDone(
          `Password reset for ${user.email}. Temporary password (shown once, copy it now): ${data.tempPassword} — all their existing sessions have been signed out.`,
          'success',
        );
      } else {
        onDone(data.note ?? `Done: ${action.replace(/-/g, ' ')}`, data.note ? 'info' : 'success');
      }
    } catch {
      onDone('Network error', 'error');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const items: { key: string; label: string; danger?: boolean; disabled?: boolean; hint?: string }[] = [
    restricted
      ? { key: 'unrestrict', label: 'Lift restriction' }
      : { key: 'restrict', label: 'Restrict (read-only)', danger: true },
    { key: 'reset-password', label: 'Reset password', disabled: !user.email, hint: !user.email ? 'Wallet-only account' : undefined },
    { key: 'reset-kyc',      label: 'Reset KYC to pending', disabled: !user.kyc, hint: !user.kyc ? 'No KYC submission' : undefined },
    { key: 'unlink-wallet',  label: 'Unlink wallet', disabled: !user.walletAddress || !user.email, hint: !user.walletAddress ? 'No wallet linked' : !user.email ? 'Would leave no way to sign in' : undefined },
  ];

  const CONFIRMS: Record<string, { title: string; body: string; danger?: boolean }> = {
    restrict: {
      title: 'Restrict this account?',
      body: 'They will still be able to sign in and view their dashboard, but every write — borrowing, repaying, transfers, KYC and settings — will be refused. This does not affect what their wallet can do on-chain.',
      danger: true,
    },
    'reset-password': {
      title: 'Reset this password?',
      body: 'A temporary password is generated and shown once. Every session this user currently has will be signed out immediately.',
    },
    'reset-kyc': {
      title: 'Reset KYC to pending?',
      body: 'Their submission goes back to pending and must be reviewed again. The on-chain KYC flag is NOT revoked — if they were already approved on-chain, they can still borrow.',
      danger: true,
    },
    'unlink-wallet': {
      title: 'Unlink this wallet?',
      body: 'The wallet is detached from the account and its on-chain borrow permission is revoked. Their KYC verification stays with the account — linking a new wallet re-enables borrowing automatically.',
      danger: true,
    },
  };

  return (
    <>
      <TableRow sx={{ bgcolor: striped ? '#0A1220' : '#0D1628', '&:hover': { bgcolor: '#0F1730' }, opacity: busy ? 0.55 : 1 }}>
        <TableCell sx={{ ...cellSx, color: C.ink, fontWeight: 500, fontSize: 13 }}>
          {user.name || <span style={{ color: C.muted }}>—</span>}
        </TableCell>
        <TableCell sx={cellSx}>{user.email ?? <span style={{ color: C.muted }}>wallet-only</span>}</TableCell>
        <TableCell sx={monoSx}>
          {user.walletAddress
            ? <Tooltip title={user.walletAddress}><span>{user.walletAddress.slice(0, 8)}…{user.walletAddress.slice(-4)}</span></Tooltip>
            : <span style={{ color: C.muted }}>—</span>}
        </TableCell>
        <TableCell sx={cellSx}>
          {user.isAdmin ? <Badge label="admin" tone="blue" /> : <span style={{ color: C.muted }}>user</span>}
        </TableCell>
        <TableCell sx={cellSx}>
          <Badge
            label={restricted ? 'restricted' : 'active'}
            tone={STATUS_TONE[user.status as keyof typeof STATUS_TONE] ?? 'neutral'}
            title={user.statusReason ?? undefined}
          />
        </TableCell>
        <TableCell sx={cellSx}>
          {user.kyc
            ? <Badge label={user.kyc.status} tone={KYC_TONE[user.kyc.status] ?? 'neutral'} />
            : <span style={{ color: C.muted }}>none</span>}
        </TableCell>
        <TableCell sx={cellSx}>{new Date(user.createdAt).toLocaleDateString('en-MY')}</TableCell>
        <TableCell sx={{ ...cellSx, textAlign: 'right' }}>
          <Button size="small" onClick={onEdit} disabled={busy}
            sx={{ textTransform: 'none', fontSize: 12, minWidth: 0, mr: 0.5 }}>
            Edit
          </Button>
          <IconButton size="small" onClick={e => setAnchor(e.currentTarget)} disabled={busy} aria-label="More actions">
            <Box component="span" sx={{ fontSize: 16, lineHeight: 1, color: C.slate }}>⋯</Box>
          </IconButton>
        </TableCell>
      </TableRow>

      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {items.map(it => (
          <Tooltip key={it.key} title={it.hint ?? ''} placement="left">
            {/* span keeps the tooltip working on a disabled MenuItem */}
            <span>
              <MenuItem
                disabled={it.disabled}
                onClick={() => { setAnchor(null); setConfirm({ action: it.key, ...CONFIRMS[it.key] }); }}
                sx={{ fontSize: 13.5, color: it.danger ? C.red : C.ink }}
              >
                {it.label}
              </MenuItem>
            </span>
          </Tooltip>
        ))}
      </Menu>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          danger={confirm.danger}
          needsReason={confirm.action === 'restrict'}
          onCancel={() => setConfirm(null)}
          onConfirm={reason => run(confirm.action, reason)}
        />
      )}
    </>
  );
}

function ConfirmDialog({ title, body, danger, needsReason, onCancel, onConfirm }: {
  title: string; body: string; danger?: boolean; needsReason?: boolean;
  onCancel: () => void; onConfirm: (reason?: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 17 }}>{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: C.slate, lineHeight: 1.7 }}>{body}</Typography>
        {needsReason && (
          <TextField
            fullWidth size="small" multiline minRows={2} sx={{ mt: 2.5, ...fieldSx }}
            label="Reason (shown to the user)" value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Pending review of submitted documents"
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onCancel} sx={{ textTransform: 'none' }}>Cancel</Button>
        <Button
          variant="contained" disableElevation
          color={danger ? 'error' : 'primary'}
          onClick={() => onConfirm(reason)}
          sx={{ textTransform: 'none', borderRadius: 2 }}
        >
          Confirm
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function EditUserDialog({ user, onClose, onSaved }: {
  user: AdminUser; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const [name, setName]       = useState(user.name ?? '');
  const [email, setEmail]     = useState(user.email ?? '');
  const [isAdmin, setIsAdmin] = useState(user.isAdmin);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  const save = async () => {
    setSaving(true); setErr('');
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email: email || null, isAdmin }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error ?? 'Save failed'); return; }
      onSaved(`Updated ${data.user.email ?? data.user.name ?? 'user'}`);
    } catch {
      setErr('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: 17 }}>
        Edit user
        <Typography variant="caption" sx={{ display: 'block', color: C.muted, fontWeight: 400, mt: 0.25 }}>
          {user.id}
        </Typography>
      </DialogTitle>
      <DialogContent>
        {err && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{err}</Alert>}

        <Box sx={{ display: 'grid', gap: 2, mt: 0.5 }}>
          <TextField label="Display name" size="small" fullWidth sx={fieldSx}
            value={name} onChange={e => setName(e.target.value)} />
          <TextField label="Email" size="small" fullWidth sx={fieldSx}
            value={email} onChange={e => setEmail(e.target.value)}
            helperText={user.email ? undefined : 'This account currently signs in by wallet only.'} />

          <FormControlLabel
            control={<Switch checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} />}
            label={<Typography variant="body2">Administrator</Typography>}
          />

          {/* Read-only context: these are either on-chain or belong elsewhere. */}
          <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#080E1F', border: `1px solid ${C.border}` }}>
            <Typography variant="caption" sx={{ color: C.slate, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', fontSize: 10.5 }}>
              Not editable here
            </Typography>
            <Box sx={{ mt: 1.25, display: 'grid', gap: 0.75 }}>
              <ReadOnlyRow label="Wallet" value={user.walletAddress ?? '—'} note="Use “Unlink wallet” to detach it." />
              <ReadOnlyRow label="KYC" value={user.kyc ? `${user.kyc.status} · ${user.kyc.fullName}` : 'no submission'} note="Review it on the KYC tab." />
              <ReadOnlyRow label="Collateral & debt" value="on-chain" note="Held by the CryptoLoan contract; no admin can alter it." />
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>Cancel</Button>
        <Button variant="contained" disableElevation onClick={save} disabled={saving}
          sx={{ textTransform: 'none', borderRadius: 2 }}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ReadOnlyRow({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <Typography variant="caption" sx={{ color: C.muted, minWidth: 108 }}>{label}</Typography>
      <Typography variant="caption" sx={{ color: C.ink, fontFamily: 'monospace', fontSize: 11.5, wordBreak: 'break-all' }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: C.muted, fontSize: 10.5 }}>{note}</Typography>
    </Box>
  );
}
