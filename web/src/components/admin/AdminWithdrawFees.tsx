'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { C } from './ui';

/**
 * Sweeps accumulated protocol fees (borrow interest revenue) to the contract
 * owner's own address — the one on-chain, fund-moving action this admin
 * panel exposes (see authz.ts's scope note). Confirmed via a native dialog
 * since it's real money, even on a test chain, and there's no undo.
 */
export function AdminWithdrawFees({ feesMYR, ownerAddress }: { feesMYR: number; ownerAddress: string }) {
  const router = useRouter();
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const [done, setDone]   = useState<{ amountMYR: number; txHash?: string } | null>(null);

  const disabled = busy || feesMYR <= 0;

  const onClick = async () => {
    if (!window.confirm(
      `Withdraw RM ${feesMYR.toFixed(2)} in protocol fees to the owner wallet\n${ownerAddress}?\n\nThis sends a real on-chain transaction.`,
    )) return;
    setBusy(true); setError(''); setDone(null);
    try {
      const res  = await fetch('/api/admin/withdraw-fees', { method: 'POST' });
      const data = await res.json() as { amountMYR?: number; txHash?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Withdrawal failed');
      setDone({ amountMYR: data.amountMYR ?? feesMYR, txHash: data.txHash });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Withdrawal failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
      <Button
        onClick={onClick} disabled={disabled} variant="contained" disableElevation size="small"
        sx={{
          bgcolor: C.amber, color: '#0B1226', fontWeight: 700, fontSize: 12, px: 2, textTransform: 'none',
          '&:hover': { bgcolor: '#e6a01f' },
          '&.Mui-disabled': { bgcolor: 'rgba(255,178,36,0.15)', color: C.muted },
        }}>
        {busy ? <CircularProgress size={14} sx={{ color: C.muted, mr: 1 }} /> : null}
        {busy ? 'Withdrawing…' : 'Withdraw Fees'}
      </Button>
      {error && <Typography sx={{ fontSize: 10.5, color: C.red, maxWidth: 220, textAlign: 'right' }}>{error}</Typography>}
      {done && (
        <Typography sx={{ fontSize: 10.5, color: C.green, maxWidth: 220, textAlign: 'right' }}>
          Sent RM {done.amountMYR.toFixed(2)}{done.txHash ? ` · ${done.txHash.slice(0, 10)}…` : ''}
        </Typography>
      )}
    </Box>
  );
}
