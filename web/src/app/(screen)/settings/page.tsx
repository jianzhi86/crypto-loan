'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { BankIcon, WalletIcon } from '@/components/Icons';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/lib/WalletContext';

const BANKS = [
  'Maybank', 'CIMB Bank', 'Public Bank', 'RHB Bank', 'Hong Leong Bank',
  'AmBank', 'Bank Islam', 'Bank Muamalat', 'Bank Rakyat', 'Affin Bank',
  'Alliance Bank', 'HSBC Bank Malaysia', 'OCBC Bank Malaysia', 'Standard Chartered',
  'UOB Malaysia', 'BSN (Bank Simpanan Nasional)',
];

const HARDHAT_ACCOUNTS = [
  { label: 'Account #1', address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' },
  { label: 'Account #2', address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' },
  { label: 'Account #3', address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' },
];

interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  recipientAddress: string;
  updatedAt: string;
}

const cardSx = {
  bgcolor: '#111B38',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 2,
  p: 3,
};

const DISBURSEMENT_STEPS = [
  'After a successful borrow, choose "Transfer to Bank" in the loan calculator.',
  'Funds are sent via DuitNow Instant Transfer to your registered account.',
  'Processing typically completes within 10 seconds (simulated in this demo).',
  'A transfer reference number is generated for each disbursement.',
  'View all transfer history on the Portfolio page.',
];

// Group a digit string into blocks of four for readability: 1234567890 → 1234 5678 90
function groupDigits(s: string) { return s.replace(/(.{4})/g, '$1 ').trim(); }

// Mask all but the last four digits, then group: 1234567890 → •••• •••• 7890
function maskAccount(s: string) {
  if (!s) return '•••• •••• ••••';
  const last4  = s.slice(-4);
  const masked = '•'.repeat(Math.max(0, s.length - 4)) + last4;
  return groupDigits(masked);
}

// Small uppercase eyebrow label used to separate the page's sections.
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', mb: 1.5 }}>
      {children}
    </Typography>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const wallet = useWallet();
  const [unlinkOpen, setUnlinkOpen]   = useState(false);
  const [unlinking, setUnlinking]     = useState(false);
  const [unlinkError, setUnlinkError] = useState('');
  const linkedWallet = user?.walletAddress ?? null;

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

  const [account, setAccount]     = useState<BankAccount | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState('');

  const [bankName, setBankName]                 = useState('');
  const [accountNumber, setAccountNumber]       = useState('');
  const [accountHolder, setAccountHolder]       = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');

  useEffect(() => {
    fetch('/api/profile/bank-account')
      .then(r => r.json())
      .then((d: { account: BankAccount | null }) => {
        if (d.account) {
          setAccount(d.account);
          setBankName(d.account.bankName);
          setAccountNumber(d.account.accountNumber);
          setAccountHolder(d.account.accountHolder);
          setRecipientAddress(d.account.recipientAddress ?? '');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setError('');
    setSuccess(false);
    if (!bankName) { setError('Please select a bank.'); return; }
    if (accountNumber.length < 8) { setError('Account number must be at least 8 digits.'); return; }
    if (!accountHolder.trim()) { setError('Please enter the account holder name.'); return; }
    setSaving(true);
    try {
      const res  = await fetch('/api/profile/bank-account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankName, accountNumber, accountHolder, recipientAddress }),
      });
      const data = await res.json() as { account?: BankAccount; error?: string };
      if (!res.ok) { setError(data.error ?? 'Save failed'); return; }
      setAccount(data.account!);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0B1226', pb: 8 }}>
      <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, sm: 3 }, pt: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 3 }}>
          <Eyebrow>Profile &amp; payouts</Eyebrow>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
            Settings
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Where your ringgit lands when a loan is disbursed.
          </Typography>
        </Box>

        {/* Passbook preview — the registered disbursement account, passbook-style */}
        <Box sx={{
          position: 'relative', overflow: 'hidden', mb: 3,
          borderRadius: 2.5, p: 3, bgcolor: '#6E8BFF', color: '#fff',
          boxShadow: '0 8px 24px -12px rgba(110,139,255,0.6)',
        }}>
          {/* faint passbook ruling */}
          <Box sx={{ position: 'absolute', inset: 0, opacity: 0.12, pointerEvents: 'none',
            backgroundImage: 'repeating-linear-gradient(transparent, transparent 27px, #fff 27px, #fff 28px)' }} />
          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>
              DuitNow disbursement account
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: account ? '#3DD68C' : 'rgba(255,255,255,0.45)',
                boxShadow: account ? '0 0 8px #3DD68C' : 'none' }} />
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                {account ? 'Active' : 'Not set up'}
              </Typography>
            </Box>
          </Box>
          <Typography className="tnum" sx={{ position: 'relative',
            fontSize: { xs: 22, sm: 26 }, fontWeight: 600, letterSpacing: 3, mb: 3 }}>
            {maskAccount(accountNumber)}
          </Typography>
          <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 2 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', mb: 0.25 }}>
                Account holder
              </Typography>
              <Typography noWrap sx={{ fontSize: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {accountHolder || '—'}
              </Typography>
            </Box>
            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
              <Typography sx={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', mb: 0.25 }}>
                Bank
              </Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                {bankName || '—'}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Bank Account section */}
        <Paper sx={cardSx}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: 'rgba(110,139,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6E8BFF' }}>
              <BankIcon size={20} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 600, color: 'text.primary' }}>
                Payout details
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Edit your DuitNow account and on-chain recipient
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)', mb: 3 }} />

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} sx={{ color: '#6E8BFF' }} />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Eyebrow>Bank details</Eyebrow>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ color: 'rgba(255,255,255,0.65)' }}>Bank Name</InputLabel>
                <Select
                  value={bankName}
                  label="Bank Name"
                  onChange={e => setBankName(e.target.value)}
                  sx={{
                    color: 'text.primary',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.12)' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.65)' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#6E8BFF' },
                    '& .MuiSvgIcon-root': { color: 'rgba(255,255,255,0.65)' },
                  }}
                  MenuProps={{ slotProps: { paper: { sx: { bgcolor: '#111B38', border: '1px solid rgba(255,255,255,0.12)' } } } }}
                >
                  {BANKS.map(b => (
                    <MenuItem key={b} value={b} sx={{ color: 'text.primary', '&:hover': { bgcolor: '#0F1730' } }}>
                      {b}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Account Number"
                size="small"
                fullWidth
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                slotProps={{ htmlInput: { maxLength: 20 }, formHelperText: { sx: { color: 'rgba(255,255,255,0.65)' } } }}
                helperText="Digits only · dashes and spaces are removed automatically"
                placeholder="e.g. 1234567890"
                sx={{
                  '& .MuiInputBase-input': { color: 'text.primary' },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.12)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.65)' },
                  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.65)' },
                  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#6E8BFF' },
                }}
              />

              <TextField
                label="Account Holder Name"
                size="small"
                fullWidth
                value={accountHolder}
                onChange={e => setAccountHolder(e.target.value)}
                placeholder="As per bank records"
                sx={{
                  '& .MuiInputBase-input': { color: 'text.primary' },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.12)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.65)' },
                  '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.65)' },
                  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#6E8BFF' },
                }}
              />

              {/* On-chain recipient wallet — a separate, technical concern from the bank account */}
              <Divider sx={{ borderColor: 'rgba(255,255,255,0.12)', mt: 0.5 }} />
              <Box>
                <Eyebrow>On-chain recipient</Eyebrow>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  Where MockMYR is sent when you borrow with Bank Transfer. Any Hardhat test account works.
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  value={recipientAddress}
                  onChange={e => setRecipientAddress(e.target.value.trim())}
                  placeholder="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
                  slotProps={{ formHelperText: { sx: { color: 'rgba(255,255,255,0.65)' } } }}
                  sx={{
                    '& .MuiInputBase-input': { color: 'text.primary', fontFamily: 'monospace', fontSize: 12 },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.12)' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.65)' },
                    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.65)' },
                    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#6E8BFF' },
                  }}
                />
                <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', alignSelf: 'center' }}>Quick fill:</Typography>
                  {HARDHAT_ACCOUNTS.map(a => (
                    <Box key={a.address} onClick={() => setRecipientAddress(a.address)}
                      sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: '#0F1730', cursor: 'pointer', border: `1px solid ${recipientAddress === a.address ? '#6E8BFF' : 'transparent'}`,
                            '&:hover': { borderColor: '#6E8BFF' } }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace', fontSize: 10 }}>
                        {a.label} · {a.address.slice(0, 10)}…
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>

              {error   && <Alert severity="error"   sx={{ bgcolor: 'rgba(229,72,77,0.14)', color: '#E5484D' }}>{error}</Alert>}
              {success && <Alert severity="success" sx={{ bgcolor: 'rgba(43,217,162,0.12)', color: '#2BD9A2' }}>Bank account saved successfully.</Alert>}

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pt: 1 }}>
                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={saving || !bankName || !accountNumber || !accountHolder}
                  sx={{ bgcolor: '#6E8BFF', color: 'white', px: 3, boxShadow: 'none', '&:hover': { bgcolor: '#9DB1FF', boxShadow: 'none' } }}
                >
                  {saving ? 'Saving…' : account ? 'Update Bank Account' : 'Save Bank Account'}
                </Button>
                {account && (
                  <Typography variant="caption" color="text.secondary">
                    Last updated: {new Date(account.updatedAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </Typography>
                )}
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
          ) : wallet.isConnected && wallet.address ? (
            // Connected in MetaMask but not linked — the distinction that
            // kept confusing people: connecting is a browser-session fact,
            // linking is an account fact that happens at KYC submission.
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.75, py: 1, borderRadius: 2, bgcolor: '#0F1730', border: '1px solid rgba(255,255,255,0.12)' }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#FFB224', boxShadow: '0 0 6px #FFB224' }} />
                  <Typography sx={{ fontFamily: 'monospace', fontSize: 13, color: 'text.primary', letterSpacing: 0.5 }}>
                    {wallet.address.slice(0, 10)}…{wallet.address.slice(-8)}
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ color: '#FFB224', fontWeight: 700 }}>
                  Connected · not linked
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                This wallet is connected for the current session only. It becomes linked to your
                account when you submit KYC with it — that makes it your verified identity and it
                will auto-connect every time you sign in. If this wallet already belongs to another
                CryptoLend account, switch MetaMask to a different one first.
              </Typography>
              <Button
                variant="outlined" size="small"
                onClick={() => window.location.assign('/kyc')}
                sx={{ mt: 2, color: '#6E8BFF', borderColor: 'rgba(110,139,255,0.4)', '&:hover': { borderColor: '#6E8BFF', bgcolor: 'rgba(110,139,255,0.08)' } }}
              >
                Verify identity to link this wallet
              </Button>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No wallet is linked yet. Connect a wallet and complete KYC to link one — it becomes
              your verified identity and auto-connects on sign-in.
            </Typography>
          )}
        </Paper>

        {/* Unlink confirmation — spells out exactly what changes. Server-side
            rules may still refuse: a wallet that is the only login method, or
            an already-approved KYC (admin review required), cannot be unlinked
            here — the error is surfaced below. */}
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
                'Your KYC submission stays with your account — link a wallet again to continue verification without re-filling the form',
                'Revokes the on-chain borrow permission for this wallet',
                'Stops this wallet auto-connecting when you sign in',
                'If your KYC is already approved, wallet changes require administrator review and will be refused here',
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

        {/* How disbursement works — a real sequence, rendered as ruled ledger steps */}
        <Paper sx={{ ...cardSx, mt: 3, p: 0, overflow: 'hidden' }}>
          <Box sx={{ px: 3, pt: 2.5, pb: 1.5 }}>
            <Eyebrow>How a bank disbursement works</Eyebrow>
          </Box>
          {DISBURSEMENT_STEPS.map((line, i) => (
            <Box key={i} sx={{
              display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 1.5,
              borderTop: '1px solid #0F1730',
            }}>
              <Typography className="tnum" sx={{ fontSize: 12,
                fontWeight: 600, color: '#6E8BFF', width: 22, flexShrink: 0 }}>
                {String(i + 1).padStart(2, '0')}
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                {line}
              </Typography>
            </Box>
          ))}
        </Paper>
      </Box>
    </Box>
  );
}
