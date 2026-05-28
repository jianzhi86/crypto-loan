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
import Chip from '@mui/material/Chip';
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
  bgcolor: '#0D1117',
  border: '1px solid #1A1C30',
  borderRadius: 2,
  p: 3,
};

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
    <Box sx={{ minHeight: '100vh', bgcolor: '#060812', pb: 8 }}>
      <Navbar />
      <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, sm: 3 }, pt: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
            Settings
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage your profile and payment preferences
          </Typography>
        </Box>

        {/* Bank Account section */}
        <Paper sx={cardSx}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: 'rgba(6,182,212,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
              🏦
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 600, color: 'text.primary' }}>
                Bank Account
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Used to receive MYR loan disbursements via DuitNow
              </Typography>
            </Box>
            {account && (
              <Chip
                label="Registered"
                size="small"
                sx={{ ml: 'auto', bgcolor: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)', fontSize: 11 }}
              />
            )}
          </Box>

          <Divider sx={{ borderColor: '#1A1C30', mb: 3 }} />

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} sx={{ color: '#06B6D4' }} />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <FormControl fullWidth size="small">
                <InputLabel sx={{ color: '#475569' }}>Bank Name</InputLabel>
                <Select
                  value={bankName}
                  label="Bank Name"
                  onChange={e => setBankName(e.target.value)}
                  sx={{
                    color: 'text.primary',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#1E2035' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#06B6D4' },
                    '& .MuiSvgIcon-root': { color: '#475569' },
                  }}
                  MenuProps={{ slotProps: { paper: { sx: { bgcolor: '#0D1117', border: '1px solid #1E2035' } } } }}
                >
                  {BANKS.map(b => (
                    <MenuItem key={b} value={b} sx={{ color: 'text.primary', '&:hover': { bgcolor: '#131629' } }}>
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
                slotProps={{ htmlInput: { maxLength: 20 }, formHelperText: { sx: { color: '#475569' } } }}
                helperText="Digits only · dashes and spaces are removed automatically"
                placeholder="e.g. 1234567890"
                sx={{
                  '& .MuiInputBase-input': { color: 'text.primary' },
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#1E2035' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                  '& .MuiInputLabel-root': { color: '#475569' },
                  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#06B6D4' },
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
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#1E2035' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                  '& .MuiInputLabel-root': { color: '#475569' },
                  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#06B6D4' },
                }}
              />

              {/* On-chain recipient wallet */}
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                  Hardhat Recipient Wallet <Box component="span" sx={{ color: '#475569' }}>(for on-chain MYR transfer)</Box>
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  value={recipientAddress}
                  onChange={e => setRecipientAddress(e.target.value.trim())}
                  placeholder="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
                  helperText="Enter any Hardhat test account address — MockMYR tokens will be sent here on-chain when you borrow with Bank Transfer"
                  slotProps={{ formHelperText: { sx: { color: '#475569' } } }}
                  sx={{
                    '& .MuiInputBase-input': { color: 'text.primary', fontFamily: 'monospace', fontSize: 12 },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#1E2035' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#475569' },
                    '& .MuiInputLabel-root': { color: '#475569' },
                    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#8247E5' },
                  }}
                />
                <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                  <Typography variant="caption" sx={{ color: '#475569', alignSelf: 'center' }}>Quick fill:</Typography>
                  {HARDHAT_ACCOUNTS.map(a => (
                    <Box key={a.address} onClick={() => setRecipientAddress(a.address)}
                      sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: '#1E2035', cursor: 'pointer', border: `1px solid ${recipientAddress === a.address ? '#8247E5' : 'transparent'}`,
                            '&:hover': { borderColor: '#8247E5' } }}>
                      <Typography variant="caption" sx={{ color: '#94A3B8', fontFamily: 'monospace', fontSize: 10 }}>
                        {a.label} · {a.address.slice(0, 10)}…
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>

              {error   && <Alert severity="error"   sx={{ bgcolor: '#1a0a0a', color: '#f87171' }}>{error}</Alert>}
              {success && <Alert severity="success" sx={{ bgcolor: '#052e16', color: '#4ade80' }}>Bank account saved successfully.</Alert>}

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pt: 1 }}>
                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={saving || !bankName || !accountNumber || !accountHolder}
                  sx={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)', color: 'white', px: 3 }}
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

        {/* Info box */}
        <Paper sx={{ ...cardSx, mt: 3, bgcolor: 'rgba(6,182,212,0.04)', border: '1px solid rgba(6,182,212,0.15)' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#06B6D4', mb: 1 }}>
            How bank disbursement works
          </Typography>
          <Box component="ul" sx={{ pl: 2, m: 0, color: 'text.secondary' }}>
            {[
              'After a successful borrow, choose "Transfer to Bank" in the loan calculator.',
              'Funds are sent via DuitNow Instant Transfer to your registered account.',
              'Processing typically completes within 10 seconds (simulated in this demo).',
              'A transfer reference number is generated for each disbursement.',
              'View all transfer history in the Portfolio page.',
            ].map((line, i) => (
              <Typography key={i} component="li" variant="caption" color="text.secondary" sx={{ mb: 0.75 }}>
                {line}
              </Typography>
            ))}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
