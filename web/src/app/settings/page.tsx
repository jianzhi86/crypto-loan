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
import Navbar from '@/components/Navbar';

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
  bgcolor: '#FFFFFF',
  border: '1px solid #E2E7EE',
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
    <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#8B96A5', mb: 1.5 }}>
      {children}
    </Typography>
  );
}

export default function SettingsPage() {
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
    <Box sx={{ minHeight: '100vh', bgcolor: '#F4F6F8', pb: 8 }}>
      <Navbar />
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
          borderRadius: 2.5, p: 3, bgcolor: '#2A3FD6', color: '#fff',
          boxShadow: '0 8px 24px -12px rgba(42,63,214,0.6)',
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
            <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: 'rgba(42,63,214,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              🏦
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

          <Divider sx={{ borderColor: '#E2E7EE', mb: 3 }} />

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} sx={{ color: '#2A3FD6' }} />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Eyebrow>Bank details</Eyebrow>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ color: '#5A6675' }}>Bank Name</InputLabel>
                <Select
                  value={bankName}
                  label="Bank Name"
                  onChange={e => setBankName(e.target.value)}
                  sx={{
                    color: 'text.primary',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#E2E7EE' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#5A6675' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2A3FD6' },
                    '& .MuiSvgIcon-root': { color: '#5A6675' },
                  }}
                  MenuProps={{ slotProps: { paper: { sx: { bgcolor: '#FFFFFF', border: '1px solid #E2E7EE' } } } }}
                >
                  {BANKS.map(b => (
                    <MenuItem key={b} value={b} sx={{ color: 'text.primary', '&:hover': { bgcolor: '#EEF1F5' } }}>
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
                slotProps={{ htmlInput: { maxLength: 20 }, formHelperText: { sx: { color: '#5A6675' } } }}
                helperText="Digits only · dashes and spaces are removed automatically"
                placeholder="e.g. 1234567890"
                sx={{
                  '& .MuiInputBase-input': { color: 'text.primary' },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#E2E7EE' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#5A6675' },
                  '& .MuiInputLabel-root': { color: '#5A6675' },
                  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2A3FD6' },
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
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#E2E7EE' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#5A6675' },
                  '& .MuiInputLabel-root': { color: '#5A6675' },
                  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2A3FD6' },
                }}
              />

              {/* On-chain recipient wallet — a separate, technical concern from the bank account */}
              <Divider sx={{ borderColor: '#E2E7EE', mt: 0.5 }} />
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
                  slotProps={{ formHelperText: { sx: { color: '#5A6675' } } }}
                  sx={{
                    '& .MuiInputBase-input': { color: 'text.primary', fontFamily: 'monospace', fontSize: 12 },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#E2E7EE' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#5A6675' },
                    '& .MuiInputLabel-root': { color: '#5A6675' },
                    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#2A3FD6' },
                  }}
                />
                <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                  <Typography variant="caption" sx={{ color: '#5A6675', alignSelf: 'center' }}>Quick fill:</Typography>
                  {HARDHAT_ACCOUNTS.map(a => (
                    <Box key={a.address} onClick={() => setRecipientAddress(a.address)}
                      sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: '#EEF1F5', cursor: 'pointer', border: `1px solid ${recipientAddress === a.address ? '#2A3FD6' : 'transparent'}`,
                            '&:hover': { borderColor: '#2A3FD6' } }}>
                      <Typography variant="caption" sx={{ color: '#5A6675', fontFamily: 'monospace', fontSize: 10 }}>
                        {a.label} · {a.address.slice(0, 10)}…
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>

              {error   && <Alert severity="error"   sx={{ bgcolor: '#FEF2F2', color: '#E5484D' }}>{error}</Alert>}
              {success && <Alert severity="success" sx={{ bgcolor: '#ECFDF3', color: '#0E9F6E' }}>Bank account saved successfully.</Alert>}

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pt: 1 }}>
                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={saving || !bankName || !accountNumber || !accountHolder}
                  sx={{ bgcolor: '#2A3FD6', color: 'white', px: 3, boxShadow: 'none', '&:hover': { bgcolor: '#1E2FA8', boxShadow: 'none' } }}
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

        {/* How disbursement works — a real sequence, rendered as ruled ledger steps */}
        <Paper sx={{ ...cardSx, mt: 3, p: 0, overflow: 'hidden' }}>
          <Box sx={{ px: 3, pt: 2.5, pb: 1.5 }}>
            <Eyebrow>How a bank disbursement works</Eyebrow>
          </Box>
          {DISBURSEMENT_STEPS.map((line, i) => (
            <Box key={i} sx={{
              display: 'flex', alignItems: 'center', gap: 2, px: 3, py: 1.5,
              borderTop: '1px solid #EEF1F5',
            }}>
              <Typography className="tnum" sx={{ fontSize: 12,
                fontWeight: 600, color: '#2A3FD6', width: 22, flexShrink: 0 }}>
                {String(i + 1).padStart(2, '0')}
              </Typography>
              <Typography variant="body2" sx={{ color: '#5A6675', lineHeight: 1.5 }}>
                {line}
              </Typography>
            </Box>
          ))}
        </Paper>
      </Box>
    </Box>
  );
}
