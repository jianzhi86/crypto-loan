'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { IdCardIcon, WalletIcon } from '@/components/Icons';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/lib/WalletContext';

const cardSx = {
  bgcolor: '#111B38',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 2,
  p: 3,
};

const inputSx = {
  '& .MuiInputBase-input': { color: 'text.primary' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.12)' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.65)' },
  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.65)' },
  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#6E8BFF' },
};

// Small uppercase eyebrow label used to separate the page's sections.
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', mb: 1.5 }}>
      {children}
    </Typography>
  );
}

export default function SettingsPage() {
  const { user, refresh: refreshAuth } = useAuth();
  const wallet = useWallet();

  // ── Account & sign-in ──────────────────────────────────────────────────
  // Display name, email, password. This is also where a wallet-registered
  // account (no credentials) adds an email + password — the prerequisite for
  // unlinking its wallet.
  const [acctLoading, setAcctLoading] = useState(true);
  const [acctName, setAcctName]       = useState('');
  const [acctEmail, setAcctEmail]     = useState('');
  const [savedEmail, setSavedEmail]   = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [currentPw, setCurrentPw]     = useState('');
  const [newPw, setNewPw]             = useState('');
  const [acctSaving, setAcctSaving]   = useState(false);
  const [acctError, setAcctError]     = useState('');
  const [acctSuccess, setAcctSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/profile/account')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { name?: string | null; email?: string | null; hasPassword?: boolean }) => {
        setAcctName(d.name ?? '');
        setAcctEmail(d.email ?? '');
        setSavedEmail(d.email ?? null);
        setHasPassword(!!d.hasPassword);
      })
      .catch(() => {})
      .finally(() => setAcctLoading(false));
  }, []);

  const saveAccount = async () => {
    setAcctError(''); setAcctSuccess(false);
    if (newPw && hasPassword && !currentPw) {
      setAcctError('Please enter your current password to set a new one.');
      return;
    }
    setAcctSaving(true);
    try {
      const res = await fetch('/api/profile/account', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: acctName,
          ...(acctEmail.trim() ? { email: acctEmail } : {}),
          ...(newPw ? { currentPassword: currentPw, newPassword: newPw } : {}),
        }),
      });
      const d = await res.json() as { name?: string | null; email?: string | null; hasPassword?: boolean; error?: string };
      if (!res.ok) { setAcctError(d.error ?? 'Save failed'); return; }
      setSavedEmail(d.email ?? null);
      setHasPassword(!!d.hasPassword);
      setCurrentPw(''); setNewPw('');
      setAcctSuccess(true);
      setTimeout(() => setAcctSuccess(false), 4000);
      // The navbar shows the display name — pull the fresh session so it updates.
      void refreshAuth();
    } catch {
      setAcctError('Network error. Please try again.');
    } finally {
      setAcctSaving(false);
    }
  };
  const [unlinkOpen, setUnlinkOpen]   = useState(false);
  const [unlinking, setUnlinking]     = useState(false);
  const [unlinkError, setUnlinkError] = useState('');
  const linkedWallet = user?.walletAddress ?? null;

  // wallet.connect() IS the link flow: it opens MetaMask's picker, checks the
  // chosen wallet isn't owned by another account, proves ownership with a
  // one-time signature, links it, and grants on-chain borrowing when KYC is
  // approved. Errors surface through the global transaction toast.
  const handleLink = () => { void wallet.connect(); };

  const handleUnlink = async () => {
    setUnlinking(true); setUnlinkError('');
    try {
      const res = await fetch('/api/wallet/unlink', { method: 'POST' });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setUnlinkError(data.error ?? 'Unlink failed'); setUnlinking(false); return; }
      // Drop the client-side connection too, then reload so every
      // server-resolved value (session seed, KYC status, auto-connect)
      // reflects the unlinked state.
      wallet.disconnect();
      window.location.reload();
    } catch {
      setUnlinkError('Network error. Please try again.');
      setUnlinking(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0B1226', pb: 8 }}>
      <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, sm: 3 }, pt: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 3 }}>
          <Eyebrow>Profile &amp; access</Eyebrow>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
            Settings
          </Typography>
          <Typography variant="body2" color="text.secondary">
            How you sign in, and which wallet your account is anchored to.
          </Typography>
        </Box>

        {/* Account & sign-in — who you are and how you log in. Wallet-registered
            accounts add their email + password here (required before they can
            unlink their wallet). */}
        <Paper sx={{ ...cardSx, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: 'rgba(110,139,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6E8BFF' }}>
              <IdCardIcon size={20} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 600, color: 'text.primary' }}>Account &amp; sign-in</Typography>
              <Typography variant="caption" color="text.secondary">
                Your display name, email and password
              </Typography>
            </Box>
          </Box>

          {acctLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={24} sx={{ color: '#6E8BFF' }} />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <TextField
                label="Display name" size="small" fullWidth
                value={acctName}
                onChange={e => setAcctName(e.target.value)}
                placeholder="How you want to be shown in the app"
                sx={inputSx}
              />
              <TextField
                label="Email" size="small" fullWidth type="email"
                value={acctEmail}
                onChange={e => setAcctEmail(e.target.value)}
                placeholder="you@example.com"
                helperText={!savedEmail
                  ? 'Adding an email and password lets you sign in without MetaMask — and is required before you can unlink your wallet.'
                  : undefined}
                slotProps={{ formHelperText: { sx: { color: 'rgba(255,255,255,0.65)' } } }}
                sx={inputSx}
              />

              <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)', mt: 0.5 }} />
              <Eyebrow>{hasPassword ? 'Change password' : 'Set a password'}</Eyebrow>
              {hasPassword && (
                <TextField
                  label="Current password" size="small" fullWidth type="password"
                  value={currentPw}
                  onChange={e => { setCurrentPw(e.target.value); setAcctError(''); }}
                  error={/current password/i.test(acctError)}
                  helperText={/current password/i.test(acctError) ? acctError : undefined}
                  slotProps={{ formHelperText: { sx: { color: '#FF9CA0' } } }}
                  sx={inputSx}
                />
              )}
              <TextField
                label={hasPassword ? 'New password' : 'Password'} size="small" fullWidth type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                helperText="At least 8 characters. Leave blank to keep your password unchanged."
                slotProps={{ formHelperText: { sx: { color: 'rgba(255,255,255,0.65)' } } }}
                sx={inputSx}
              />

              {acctError && !/current password/i.test(acctError) && (
                <Alert severity="error" sx={{ bgcolor: 'rgba(229,72,77,0.14)', color: '#FF9CA0' }}>{acctError}</Alert>
              )}
              {acctSuccess && <Alert severity="success" sx={{ bgcolor: 'rgba(43,217,162,0.12)', color: '#2BD9A2' }}>Account details saved.</Alert>}

              <Box>
                <Button
                  variant="contained" disableElevation
                  onClick={saveAccount}
                  disabled={acctSaving}
                  sx={{ bgcolor: '#6E8BFF', color: 'white', px: 3, '&:hover': { bgcolor: '#9DB1FF' } }}
                >
                  {acctSaving ? 'Saving…' : 'Save Account Details'}
                </Button>
              </Box>
            </Box>
          )}
        </Paper>

        {/* Linked wallet — the account's KYC identity anchor, with the exit
            that linking previously lacked. */}
        <Paper sx={{ ...cardSx, mt: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: 'rgba(110,139,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6E8BFF' }}>
              <WalletIcon size={20} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 600, color: 'text.primary' }}>Linked wallet</Typography>
              <Typography variant="caption" color="text.secondary">
                The wallet your identity verification is anchored to
              </Typography>
            </Box>
          </Box>

          {linkedWallet ? (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.75, py: 1, borderRadius: 2, bgcolor: '#0F1730', border: '1px solid rgba(255,255,255,0.12)' }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#2BD9A2', boxShadow: '0 0 6px #2BD9A2' }} />
                <Typography sx={{ fontFamily: 'monospace', fontSize: 13, color: 'text.primary', letterSpacing: 0.5 }}>
                  {linkedWallet.slice(0, 10)}…{linkedWallet.slice(-8)}
                </Typography>
              </Box>
              <Button
                variant="outlined"
                onClick={() => setUnlinkOpen(true)}
                sx={{
                  color: '#FF9CA0', borderColor: 'rgba(229,72,77,0.4)', px: 2.5,
                  '&:hover': { borderColor: '#E5484D', bgcolor: 'rgba(229,72,77,0.1)' },
                }}
              >
                Unlink wallet
              </Button>
            </Box>
          ) : (
            // Not linked — one action does everything: MetaMask opens, the
            // user picks a wallet, signs the ownership message, and the wallet
            // is linked (with on-chain borrowing granted if KYC is approved).
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, mb: 2 }}>
                No wallet is linked yet. Linking opens MetaMask so you can pick a wallet and sign a
                one-time message proving you own it. The wallet then belongs to your account: it
                auto-connects when you sign in, and borrowing unlocks once your KYC is approved.
                One wallet can belong to only one CryptoLend account.
              </Typography>
              <Button
                variant="contained" disableElevation
                onClick={handleLink}
                disabled={wallet.isConnecting}
                sx={{ bgcolor: '#6E8BFF', color: 'white', px: 3, py: 1, '&:hover': { bgcolor: '#9DB1FF' } }}
              >
                {wallet.isConnecting ? 'Waiting for MetaMask…' : 'Link MetaMask Wallet'}
              </Button>
            </Box>
          )}
        </Paper>

        {/* Unlink confirmation — self-service at any time. The server can
            still refuse (the wallet is the account's only login method, or it
            has an active loan / locked collateral); that error is surfaced
            below. */}
        <Dialog open={unlinkOpen} onClose={() => !unlinking && setUnlinkOpen(false)} maxWidth="xs" fullWidth>
          <DialogContent sx={{ pt: 3.5, px: 3.5 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 17, color: 'text.primary', mb: 1.5 }}>
              Unlink this wallet?
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7, mb: 2 }}>
              Unlinking removes the wallet from your account:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, mb: 2, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {[
                'Your KYC verification stays with your account — link a wallet again anytime and borrowing re-enables automatically',
                'This wallet stops auto-connecting when you sign in',
                'Any on-chain borrow permission this wallet holds is revoked',
              ].map(t => (
                <Typography key={t} component="li" variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                  {t}
                </Typography>
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.6 }}>
              Your funds are not affected — the wallet and any position it holds on-chain remain
              fully yours in MetaMask.
            </Typography>
            {unlinkError && (
              <Alert severity="error" sx={{ mt: 2, bgcolor: 'rgba(229,72,77,0.14)', color: '#FF9CA0' }}>
                {unlinkError}
              </Alert>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3.5, pb: 3, gap: 1 }}>
            <Button onClick={() => setUnlinkOpen(false)} disabled={unlinking} sx={{ color: 'text.secondary' }}>
              Keep wallet
            </Button>
            <Button
              variant="contained" disableElevation
              onClick={handleUnlink}
              disabled={unlinking}
              sx={{ bgcolor: '#E5484D', px: 3, '&:hover': { bgcolor: '#C93A3F' } }}
            >
              {unlinking ? 'Unlinking…' : 'Unlink wallet'}
            </Button>
          </DialogActions>
        </Dialog>

      </Box>
    </Box>
  );
}
