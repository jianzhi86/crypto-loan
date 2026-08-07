'use client';

import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { ethers } from 'ethers';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import InputBase from '@mui/material/InputBase';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { AlertIcon } from '@/components/Icons';
import { C } from './ui';

// The last recipient the admin swept to, remembered locally. On a local dev
// chain the owner account doubles as the server keeper (importing it into
// MetaMask causes the "Nonce too low" mess), so admins usually want fees in a
// DIFFERENT account they actually use — remembering it saves re-pasting.
const RECIPIENT_KEY = 'cryptolend:fees-recipient';

const rm = (n: number) =>
  `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The remembered recipient read as an external store: the server snapshot is
// '' (localStorage is client-only), the client snapshot is whatever was saved.
// useSyncExternalStore reconciles the two without a hydration mismatch or a
// setState-in-effect — equal strings satisfy its Object.is comparison.
const noSubscribe = () => () => {};
const readSavedRecipient = () => {
  try { return localStorage.getItem(RECIPIENT_KEY) ?? ''; } catch { return ''; }
};

/**
 * Sweeps accumulated protocol fees (borrow interest revenue) to a wallet the
 * admin chooses — defaults to the contract owner, but any address works (the
 * transaction is still signed by the owner key; only the destination moves).
 * Confirmed via a styled dialog in the RecoveryConfirmDialog mould — it's real
 * money with no undo, and a browser confirm() gets dismissed on reflex.
 */
export function AdminWithdrawFees({ feesMYR, ownerAddress }: { feesMYR: number; ownerAddress: string }) {
  const router = useRouter();
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState<{ amountMYR: number; txHash?: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  // The saved recipient pre-fills the field until the admin types; from then
  // on their edit (even clearing it) wins for the life of this mount.
  const savedRecipient = useSyncExternalStore(noSubscribe, readSavedRecipient, () => '');
  const [toEdited, setToEdited] = useState<string | null>(null);
  const to = toEdited ?? savedRecipient;
  const setTo = (v: string) => setToEdited(v);

  const trimmed   = to.trim();
  const isOwner   = trimmed === '' || trimmed.toLowerCase() === ownerAddress.toLowerCase();
  const validAddr = trimmed === '' || ethers.isAddress(trimmed);
  const disabled  = busy || feesMYR <= 0 || !validAddr;
  const target    = trimmed === '' ? ownerAddress : trimmed;

  const withdraw = async () => {
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
      setConfirming(false);
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
        onClick={() => setConfirming(true)} disabled={disabled} variant="contained" disableElevation size="small"
        sx={{
          bgcolor: C.amber, color: '#0B1226', fontWeight: 700, fontSize: 12, px: 2, textTransform: 'none',
          '&:hover': { bgcolor: '#e6a01f' },
          '&.Mui-disabled': { bgcolor: 'rgba(255,178,36,0.15)', color: C.muted },
        }}>
        Withdraw Fees
      </Button>
      {error && <Typography sx={{ fontSize: 10.5, color: C.red, maxWidth: 220, textAlign: 'right' }}>{error}</Typography>}
      {done && (
        <Typography sx={{ fontSize: 10.5, color: C.green, maxWidth: 220, textAlign: 'right' }}>
          Sent RM {done.amountMYR.toFixed(2)}{done.txHash ? ` · ${done.txHash.slice(0, 10)}…` : ''}
        </Typography>
      )}

      <Dialog
        open={confirming}
        onClose={busy ? undefined : () => setConfirming(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { bgcolor: '#0D1628', backgroundImage: 'none', border: `1px solid ${C.border}`, borderRadius: 3 } } }}
      >
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 0.5 }}>
            <Box sx={{ color: C.amber, display: 'flex' }}><AlertIcon size={18} /></Box>
            <Typography sx={{ fontSize: 17, fontWeight: 800, color: C.ink, letterSpacing: -0.3 }}>
              Withdraw protocol fees
            </Typography>
          </Box>
          <Typography sx={{ fontSize: 12.5, color: C.muted, mb: 2.5, lineHeight: 1.6 }}>
            Sweeps the interest revenue the protocol has earned to the wallet
            below, as MYR tokens. The transaction is signed by the owner key on
            the server; only the destination is yours to choose.
          </Typography>

          <Box sx={{ border: `1px solid ${C.border}`, borderRadius: 2, overflow: 'hidden', mb: 2 }}>
            {([
              ['Amount',  rm(feesMYR)],
              ['Send to', target],
              ['Wallet',  isOwner ? 'The contract owner (default)' : 'Custom wallet — make sure it is yours'],
            ] as [string, string][]).map(([k, v], i) => (
              <Box key={k} sx={{
                display: 'flex', gap: 2, px: 1.75, py: 1.1,
                bgcolor: i % 2 ? 'transparent' : 'rgba(255,255,255,0.02)',
              }}>
                <Typography sx={{ fontSize: 11.5, color: C.muted, minWidth: 80, flexShrink: 0 }}>{k}</Typography>
                <Typography sx={{
                  fontSize: 12, color: C.ink, fontWeight: 600, wordBreak: 'break-all',
                  fontFamily: k === 'Send to' ? 'monospace' : undefined,
                }}>
                  {v}
                </Typography>
              </Box>
            ))}
          </Box>

          <Typography sx={{ fontSize: 12, color: C.muted, mb: 2.5, lineHeight: 1.65 }}>
            This sends a real on-chain transaction. There is no undo, and the
            action is written to the audit log against your account.
          </Typography>

          <Box sx={{ display: 'flex', gap: 1.25, justifyContent: 'flex-end' }}>
            <Button
              onClick={() => setConfirming(false)}
              disabled={busy}
              sx={{ fontSize: 12.5, color: C.muted, textTransform: 'none', px: 2 }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => { void withdraw(); }}
              disabled={busy}
              variant="contained" disableElevation
              sx={{
                fontSize: 12.5, fontWeight: 700, textTransform: 'none', px: 2.5,
                bgcolor: C.amber, color: '#0B1226', borderRadius: 1.5,
                '&:hover': { bgcolor: '#e6a01f' },
                '&.Mui-disabled': { bgcolor: 'rgba(255,178,36,0.15)', color: C.muted },
              }}
            >
              {busy ? (
                <>
                  <CircularProgress size={14} sx={{ color: C.muted, mr: 1 }} />
                  Withdrawing…
                </>
              ) : (
                `Withdraw ${rm(feesMYR)}`
              )}
            </Button>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
}
