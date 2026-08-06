'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ethers } from 'ethers';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputBase from '@mui/material/InputBase';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { C } from './ui';

// The last recipient the admin swept to, remembered locally. On a local dev
// chain the owner account doubles as the server keeper (importing it into
// MetaMask causes the "Nonce too low" mess), so admins usually want fees in a
// DIFFERENT account they actually use — remembering it saves re-pasting.
const RECIPIENT_KEY = 'cryptolend:fees-recipient';

/**
 * Sweeps accumulated protocol fees (borrow interest revenue) to a wallet the
 * admin chooses — defaults to the contract owner, but any address works (the
 * transaction is still signed by the owner key; only the destination moves).
 * Confirmed via a native dialog since it's real money, even on a test chain,
 * and there's no undo.
 */
export function AdminWithdrawFees({ feesMYR, ownerAddress }: { feesMYR: number; ownerAddress: string }) {
  const router = useRouter();
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');
  const [done, setDone]   = useState<{ amountMYR: number; txHash?: string } | null>(null);
  const [to, setTo]       = useState('');

  // Restore the remembered recipient once mounted (localStorage is
  // client-only; reading it during render would break hydration).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECIPIENT_KEY);
      if (saved) setTo(saved);
    } catch { /* storage unavailable */ }
  }, []);

  const trimmed   = to.trim();
  const isOwner   = trimmed === '' || trimmed.toLowerCase() === ownerAddress.toLowerCase();
  const validAddr = trimmed === '' || ethers.isAddress(trimmed);
  const disabled  = busy || feesMYR <= 0 || !validAddr;

  const onClick = async () => {
    const target = trimmed === '' ? ownerAddress : trimmed;
    if (!window.confirm(
      `Withdraw RM ${feesMYR.toFixed(2)} in protocol fees to ${isOwner ? 'the owner wallet' : 'this wallet'}\n${target}?\n\nThis sends a real on-chain transaction.`,
    )) return;
    setBusy(true); setError(''); setDone(null);
    try {
      const res  = await fetch('/api/admin/withdraw-fees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trimmed === '' ? {} : { to: trimmed }),
      });
      const data = await res.json() as { amountMYR?: number; txHash?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Withdrawal failed');
      try { localStorage.setItem(RECIPIENT_KEY, trimmed); } catch { /* storage unavailable */ }
      setDone({ amountMYR: data.amountMYR ?? feesMYR, txHash: data.txHash });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Withdrawal failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.75, minWidth: 200 }}>
      <Box sx={{
        width: '100%', px: 1.25, py: 0.5, borderRadius: 1.5,
        bgcolor: 'rgba(255,255,255,0.04)',
        border: `1px solid ${!validAddr ? C.red : 'rgba(255,255,255,0.12)'}`,
      }}>
        <Typography sx={{ fontSize: 9, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Send to
        </Typography>
        <InputBase
          value={to}
          onChange={e => { setTo(e.target.value); setError(''); }}
          placeholder={`${ownerAddress.slice(0, 10)}… (owner)`}
          fullWidth
          sx={{ fontSize: 11, fontFamily: 'monospace', color: C.ink, '& input': { p: 0 } }}
        />
      </Box>
      <Typography sx={{ fontSize: 9.5, color: !validAddr ? C.red : C.muted, textAlign: 'right' }}>
        {!validAddr
          ? 'Not a valid address'
          : isOwner
            ? 'Empty = owner wallet · paste any address (e.g. your MetaMask account)'
            : 'Fees will be sent to this wallet as MYR'}
      </Typography>
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
