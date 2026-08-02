'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { RefreshIcon } from '@/components/Icons';

/**
 * One button that restores the on-chain KYC flag for every entitled wallet
 * (approved accounts + admins). Replaces the per-row "Re-sync chain" buttons —
 * after a Hardhat restart everything is out of sync at once, so syncing one
 * row at a time was busywork.
 */
export function AdminResyncAllBtn() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg]   = useState('');
  const [err, setErr]   = useState('');

  const run = async () => {
    setBusy(true); setMsg(''); setErr('');
    try {
      const res = await fetch('/api/kyc/resync', { method: 'POST' });
      const d = await res.json() as { synced?: number; skipped?: number; failed?: number; error?: string };
      if (!res.ok) {
        setErr(d.error ?? 'Re-sync failed');
      } else {
        const parts = [`${d.synced} wallet${d.synced === 1 ? '' : 's'} re-synced`];
        if (d.skipped) parts.push(`${d.skipped} without a wallet`);
        if (d.failed)  parts.push(`${d.failed} failed`);
        setMsg(parts.join(' · '));
      }
    } catch {
      setErr('Network error');
    }
    setBusy(false);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
      <Button
        size="small"
        variant="outlined"
        onClick={run}
        disabled={busy}
        startIcon={busy ? undefined : <RefreshIcon size={13} />}
        sx={{
          borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.75)',
          fontSize: 12, whiteSpace: 'nowrap',
          '&:hover': { borderColor: '#06B6D4', color: '#06B6D4' },
          '&.Mui-disabled': { opacity: 0.5 },
        }}
      >
        {busy ? 'Re-syncing…' : 'Re-sync all on-chain'}
      </Button>
      {msg && <Typography variant="caption" sx={{ color: '#2BD9A2' }}>{msg}</Typography>}
      {err && <Typography variant="caption" sx={{ color: '#E5484D' }}>{err}</Typography>}
    </Box>
  );
}
