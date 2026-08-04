'use client';

import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';

import { Badge, C, PageHeader } from './ui';
import { HIDDEN, MAINTENANCE, ON, type FlagState } from '@/lib/features';

interface FlagRow {
  key: string;
  label: string;
  group: string;
  description: string;
  states: FlagState[];
  defaultMessage: string;
  state: FlagState;
  message: string;
}

const STATE_LABEL: Record<string, string> = {
  [ON]: 'On',
  [MAINTENANCE]: 'Maintenance',
  [HIDDEN]: 'Hidden',
};

const STATE_TONE = {
  [ON]: 'green', [MAINTENANCE]: 'amber', [HIDDEN]: 'neutral',
} as const;

const STATE_HINT: Record<string, string> = {
  [ON]: 'Fully available to everyone.',
  [MAINTENANCE]: 'Still visible, but opening it shows your message and all writes are refused.',
  [HIDDEN]: 'Removed from navigation; visiting the URL directly returns 404.',
};

export default function AdminFeatures() {
  const [flags, setFlags]   = useState<FlagRow[]>([]);
  const [loading, setLoad]  = useState(true);
  const [error, setError]   = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    fetch('/api/admin/features')
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? 'Failed to load');
        return d;
      })
      .then(d => { setFlags(d.flags); setError(''); })
      .catch(e => setError(e.message))
      .finally(() => setLoad(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (key: string, state: FlagState, message: string) => {
    // Optimistic: the switch should feel instant, and a failure re-syncs below.
    setFlags(f => f.map(x => (x.key === key ? { ...x, state, message } : x)));
    try {
      const res = await fetch('/api/admin/features', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, state, message }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Save failed'); load(); return; }
      setError('');
      setNotice(`${key} → ${STATE_LABEL[state]}`);
      setTimeout(() => setNotice(''), 2500);
    } catch {
      setError('Network error');
      load();
    }
  };

  const groups = [...new Set(flags.map(f => f.group))];
  const offCount = flags.filter(f => f.state !== ON).length;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: '#080E1F', minHeight: '100vh' }}>
      <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
        <PageHeader
          title="Features"
          subtitle="Turn parts of the product off, put them under maintenance, or hide them entirely."
          actions={offCount > 0 ? <Badge label={`${offCount} not fully on`} tone="amber" /> : undefined}
        />

        <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
          Admins are never blocked by these toggles — you can always open a paused page to verify a
          fix before switching it back on. Note that toggles govern <em>this interface</em>: a paused
          action stops CryptoLend from submitting it, but the underlying contract stays live and a
          user&apos;s own wallet can still reach it. To halt the protocol itself you would need the
          contract&apos;s <code>pause()</code>, which this panel deliberately does not expose.
        </Alert>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
        {notice && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{notice}</Alert>}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress size={28} /></Box>
        ) : (
          groups.map(group => (
            <Box key={group} sx={{ mb: 4 }}>
              <Typography sx={{
                fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
                color: C.muted, mb: 1.25,
              }}>
                {group}
              </Typography>
              <Card sx={{ border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', overflow: 'hidden', bgcolor: '#0D1628' }}>
                {flags.filter(f => f.group === group).map((f, i) => (
                  // Keying on the saved message remounts the row whenever the
                  // server value changes, which resets the draft field without
                  // needing an effect to sync a prop into state.
                  <FlagControl key={`${f.key}:${f.message}`} flag={f} divider={i > 0} onSave={save} />
                ))}
              </Card>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}

function FlagControl({ flag, divider, onSave }: {
  flag: FlagRow;
  divider: boolean;
  onSave: (key: string, state: FlagState, message: string) => void;
}) {
  const [message, setMessage] = useState(flag.message);
  const [dirty, setDirty]     = useState(false);

  const showMessageBox = flag.state === MAINTENANCE;

  return (
    <Box sx={{
      p: 2.5,
      borderTop: divider ? `1px solid ${C.border}` : 'none',
      bgcolor: flag.state === ON ? '#0D1628' : 'rgba(255,178,36,0.03)',
    }}>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 240 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 14, color: C.ink }}>{flag.label}</Typography>
            <Badge label={STATE_LABEL[flag.state]} tone={STATE_TONE[flag.state] ?? 'neutral'} />
          </Box>
          <Typography variant="body2" sx={{ color: C.slate, fontSize: 12.5, mt: 0.5, lineHeight: 1.6 }}>
            {flag.description}
          </Typography>
          <Typography variant="caption" sx={{ color: C.muted, fontFamily: 'monospace', fontSize: 10.5 }}>
            {flag.key}
          </Typography>
        </Box>

        <ToggleButtonGroup
          exclusive size="small" value={flag.state}
          onChange={(_, v: FlagState | null) => v && onSave(flag.key, v, message)}
          sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 1.75, fontSize: 12, borderRadius: 2 } }}
        >
          {flag.states.map(s => (
            <ToggleButton key={s} value={s}>
              <Tooltip title={STATE_HINT[s]} placement="top">
                <span>{STATE_LABEL[s]}</span>
              </Tooltip>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {showMessageBox && (
        <Box sx={{ mt: 2, display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          <TextField
            size="small" fullWidth multiline minRows={1}
            label="Message shown to users"
            placeholder={flag.defaultMessage}
            value={message}
            onChange={e => { setMessage(e.target.value); setDirty(true); }}
            // The placeholder makes the field look filled, so the label must be
            // pinned up. Left to float it sat across the input and struck
            // through its own text against the placeholder behind it.
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13, bgcolor: '#080E1F' } }}
            helperText={dirty ? 'Unsaved' : 'Leave blank to use the default wording.'}
          />
          <Button
            size="small" variant="contained" disableElevation disabled={!dirty}
            onClick={() => onSave(flag.key, flag.state, message)}
            sx={{ textTransform: 'none', borderRadius: 2, mt: 0.5, whiteSpace: 'nowrap' }}
          >
            Save
          </Button>
        </Box>
      )}
    </Box>
  );
}
