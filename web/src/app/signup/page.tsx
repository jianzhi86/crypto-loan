'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';

function passwordStrength(pwd: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pwd.length >= 8)  score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const map = [
    { label: '', color: '#E2E7EE' },
    { label: 'Very weak', color: '#ef4444' },
    { label: 'Weak',      color: '#f97316' },
    { label: 'Fair',      color: '#eab308' },
    { label: 'Strong',    color: '#22c55e' },
    { label: 'Very strong', color: '#2A3FD6' },
  ];
  return { score, ...map[score] };
}

export default function SignupPage() {
  const router = useRouter();
  const [name,      setName]      = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPwd,   setShowPwd]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [error, setError] = useState('');

  const pwdStrength = passwordStrength(password);
  const pwdMismatch = confirm.length > 0 && confirm !== password;

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (pwdStrength.score < 2) { setError('Please use a stronger password'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Sign up failed'); setLoading(false); return; }
      router.push('/dashboard');
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  const handleWalletSignup = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eth = (window as any).ethereum;
    if (!eth) { setError('MetaMask is not installed. Install it from metamask.io.'); return; }
    setWalletLoading(true); setError('');
    try {
      const [address]: string[] = await eth.request({ method: 'eth_requestAccounts' });
      const { nonce } = await fetch(`/api/auth/wallet-nonce?address=${address}`).then(r => r.json());
      const message = `Sign in to CryptoLend\nNonce: ${nonce}`;
      const signature: string = await eth.request({ method: 'personal_sign', params: [message, address] });
      const res = await fetch('/api/auth/wallet-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature, nonce }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Wallet sign-up failed'); setWalletLoading(false); return; }
      router.push('/dashboard');
    } catch (e: unknown) {
      const code = (e as { code?: number }).code;
      if (code !== 4001) setError('Wallet sign-up failed. Please try again.');
      setWalletLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F4F6F8', display: 'flex' }}>

      {/* Left panel */}
      <Box sx={{
        display: { xs: 'none', lg: 'flex' },
        flexDirection: 'column',
        justifyContent: 'center',
        px: 8,
        flex: '0 0 480px',
        background: 'linear-gradient(160deg, #FFFFFF 0%, #F4F6F8 50%, #EEF1F5 100%)',
        borderRight: '1px solid #E2E7EE',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <Box sx={{ position: 'absolute', top: '20%', right: '-80px', width: 360, height: 360,
                    borderRadius: '50%', background: 'radial-gradient(circle, rgba(14,159,110,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: '25%', left: '-60px', width: 280, height: 280,
                    borderRadius: '50%', background: 'radial-gradient(circle, rgba(42,63,214,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 6 }}>
          <Box sx={{ width: 44, height: 44, borderRadius: 2, background: 'linear-gradient(135deg, #2A3FD6, #2A3FD6)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ color: 'white', fontSize: 20, fontWeight: 700 }}>C</Typography>
          </Box>
          <Typography variant="h5" sx={{ fontFamily: 'var(--font-display), system-ui, sans-serif', color: '#10151C', fontWeight: 700, letterSpacing: '-0.3px' }}>CryptoLend</Typography>
        </Box>

        <Typography variant="h3" color="text.primary" sx={{ fontWeight: 800, lineHeight: 1.2, mb: 2, letterSpacing: '-1px' }}>
          Join thousands of{' '}
          <Box component="span" sx={{ background: 'linear-gradient(135deg, #2A3FD6, #2A3FD6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            smart borrowers.
          </Box>
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 5, lineHeight: 1.7 }}>
          Create your account in minutes. Start using your crypto as collateral to access instant MYR liquidity.
        </Typography>

        {/* Steps */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {[
            { n: '01', title: 'Create account', desc: 'Sign up with email or connect your wallet' },
            { n: '02', title: 'Complete KYC',   desc: 'Verify your identity in under 5 minutes' },
            { n: '03', title: 'Start borrowing', desc: 'Deposit crypto and borrow MYR instantly' },
          ].map(s => (
            <Box key={s.n} sx={{ display: 'flex', gap: 2 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: 1.5, flexShrink: 0, mt: 0.25,
                          background: 'linear-gradient(135deg, rgba(42,63,214,0.2), rgba(14,159,110,0.2))',
                          border: '1px solid rgba(42,63,214,0.3)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="caption" sx={{ color: '#2A3FD6', fontWeight: 700 }}>{s.n}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>{s.title}</Typography>
                <Typography variant="caption" color="text.secondary">{s.desc}</Typography>
              </Box>
            </Box>
          ))}
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 8, opacity: 0.5 }}>
          Testnet only · For demonstration purposes
        </Typography>
      </Box>

      {/* Right panel — form */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', px: { xs: 2, sm: 4 }, py: 4 }}>
        <Box sx={{ width: '100%', maxWidth: 440 }}>

          {/* Mobile logo */}
          <Box sx={{ display: { xs: 'flex', lg: 'none' }, alignItems: 'center', gap: 1.5, mb: 5, justifyContent: 'center' }}>
            <Box sx={{ width: 40, height: 40, borderRadius: 2, background: 'linear-gradient(135deg, #2A3FD6, #2A3FD6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography sx={{ color: 'white', fontSize: 18, fontWeight: 700 }}>C</Typography>
            </Box>
            <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 700 }}>CryptoLend</Typography>
          </Box>

          <Typography variant="h5" color="text.primary" sx={{ fontWeight: 700, mb: 0.5 }}>Create an account</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3.5 }}>
            Get started with CryptoLend today
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2.5, bgcolor: '#FEF2F2', color: '#B42318',
              border: '1px solid #FECDCA', '& .MuiAlert-icon': { color: '#E5484D' } }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSignup} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Full name" size="small" fullWidth
              autoComplete="name" value={name}
              onChange={e => setName(e.target.value)}
            />
            <TextField
              label="Email address" type="email" required size="small" fullWidth
              autoComplete="email" value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <Box>
              <TextField
                label="Password" type={showPwd ? 'text' : 'password'} required size="small" fullWidth
                autoComplete="new-password" value={password}
                onChange={e => setPassword(e.target.value)}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowPwd(p => !p)} edge="end"
                          sx={{ color: '#64748B', mr: -0.5 }}>
                          <Typography sx={{ fontSize: 15, userSelect: 'none' }}>{showPwd ? '🙈' : '👁'}</Typography>
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              {password.length > 0 && (
                <Box sx={{ mt: 0.75, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LinearProgress variant="determinate" value={(pwdStrength.score / 5) * 100}
                    sx={{ flex: 1, height: 4, bgcolor: '#E2E7EE', borderRadius: 2,
                          '& .MuiLinearProgress-bar': { bgcolor: pwdStrength.color, borderRadius: 2 } }} />
                  <Typography variant="caption" sx={{ color: pwdStrength.color, minWidth: 64, textAlign: 'right', fontSize: 10 }}>
                    {pwdStrength.label}
                  </Typography>
                </Box>
              )}
            </Box>
            <TextField
              label="Confirm password" type={showPwd ? 'text' : 'password'} required size="small" fullWidth
              autoComplete="new-password" value={confirm}
              onChange={e => setConfirm(e.target.value)}
              error={pwdMismatch}
              helperText={pwdMismatch ? 'Passwords do not match' : ''}
            />

            <Button type="submit" fullWidth variant="contained"
              disabled={loading || !email || !password || !confirm || pwdMismatch}
              sx={{
                py: 1.25, fontWeight: 600, mt: 0.5,
                background: '#2A3FD6', color: 'white',
                '&:hover': { background: '#1E2FA8' },
                '&.Mui-disabled': { background: 'rgba(42,63,214,0.3)', color: 'rgba(255,255,255,0.4)' },
              }}>
              {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Create Account'}
            </Button>
          </Box>

          <Divider sx={{ my: 3, '&::before, &::after': { borderColor: '#E2E7EE' } }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>or sign up with</Typography>
          </Divider>

          <Button fullWidth variant="outlined" onClick={handleWalletSignup} disabled={walletLoading}
            sx={{
              py: 1.25, borderColor: '#E2E7EE', color: 'text.primary', gap: 1.5,
              bgcolor: '#FFFFFF',
              '&:hover': { borderColor: '#2A3FD6', bgcolor: 'rgba(42,63,214,0.08)' },
              '&.Mui-disabled': { opacity: 0.5 },
            }}>
            {walletLoading ? (
              <CircularProgress size={20} sx={{ color: '#2A3FD6' }} />
            ) : (
              <>
                <Typography sx={{ fontSize: 20, lineHeight: 1 }}>🦊</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Continue with MetaMask</Typography>
              </>
            )}
          </Button>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 2 }}>
            By creating an account, you agree to our{' '}
            <Box component="span" sx={{ color: '#2A3FD6', cursor: 'pointer' }}>Terms of Service</Box>
            {' '}and{' '}
            <Box component="span" sx={{ color: '#2A3FD6', cursor: 'pointer' }}>Privacy Policy</Box>.
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 2.5 }}>
            Already have an account?{' '}
            <Box component={Link} href="/login"
              sx={{ color: '#2A3FD6', textDecoration: 'none', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}>
              Sign in
            </Box>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
