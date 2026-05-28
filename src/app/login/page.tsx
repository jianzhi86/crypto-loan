'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

const FEATURES = [
  { icon: '🔒', text: 'Non-custodial — your keys, your crypto' },
  { icon: '⚡', text: 'Instant MYR loans against crypto collateral' },
  { icon: '📈', text: 'Up to 75% LTV with competitive APR' },
  { icon: '🛡️', text: 'KYC-verified and compliance-ready' },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') ?? '/';
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Login failed'); setLoading(false); return; }
      router.push(nextPath);
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  const handleWalletLogin = async () => {
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
      if (!res.ok) { setError(data.error ?? 'Wallet login failed'); setWalletLoading(false); return; }
      router.push(nextPath);
    } catch (e: unknown) {
      const code = (e as { code?: number }).code;
      if (code !== 4001) setError('Wallet sign-in failed. Please try again.');
      setWalletLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0A0C18', display: 'flex' }}>

      {/* Left panel — branding */}
      <Box sx={{
        display: { xs: 'none', lg: 'flex' },
        flexDirection: 'column',
        justifyContent: 'center',
        px: 8,
        flex: '0 0 480px',
        background: 'linear-gradient(160deg, #0D0F1A 0%, #12152A 50%, #0D1130 100%)',
        borderRight: '1px solid #1E2035',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative glow */}
        <Box sx={{ position: 'absolute', top: '25%', left: '-80px', width: 320, height: 320,
                    borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: '20%', right: '-60px', width: 240, height: 240,
                    borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 6 }}>
          <Box sx={{ width: 44, height: 44, borderRadius: 2, background: 'linear-gradient(135deg, #7C3AED, #06B6D4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ color: 'white', fontSize: 20, fontWeight: 700 }}>C</Typography>
          </Box>
          <Typography variant="h5" sx={{ color: 'white', fontWeight: 700, letterSpacing: '-0.5px' }}>CryptoLend</Typography>
        </Box>

        <Typography variant="h3" color="text.primary" sx={{ fontWeight: 800, lineHeight: 1.2, mb: 2, letterSpacing: '-1px' }}>
          Borrow smarter.<br />
          <Box component="span" sx={{ background: 'linear-gradient(135deg, #A78BFA, #06B6D4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Keep your crypto.
          </Box>
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 5, lineHeight: 1.7 }}>
          The crypto-backed lending platform built on Ethereum. Get MYR liquidity without selling your assets.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {FEATURES.map(f => (
            <Box key={f.text} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: 'rgba(124,58,237,0.15)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                {f.icon}
              </Box>
              <Typography variant="body2" color="text.secondary">{f.text}</Typography>
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
            <Box sx={{ width: 40, height: 40, borderRadius: 2, background: 'linear-gradient(135deg, #7C3AED, #06B6D4)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography sx={{ color: 'white', fontSize: 18, fontWeight: 700 }}>C</Typography>
            </Box>
            <Typography variant="h6" sx={{ color: 'text.primary', fontWeight: 700 }}>CryptoLend</Typography>
          </Box>

          <Typography variant="h5" color="text.primary" sx={{ fontWeight: 700, mb: 0.5 }}>Welcome back</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3.5 }}>
            Sign in to your account to continue
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2.5, bgcolor: '#450a0a20', color: '#ef4444',
              border: '1px solid #ef444433', '& .MuiAlert-icon': { color: '#ef4444' } }}>
              {error}
            </Alert>
          )}

          {/* Email/password form */}
          <Box component="form" onSubmit={handleLogin} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Email address" type="email" required size="small" fullWidth
              autoComplete="email" value={email}
              onChange={e => setEmail(e.target.value)}
            />
            <TextField
              label="Password" type={showPwd ? 'text' : 'password'} required size="small" fullWidth
              autoComplete="current-password" value={password}
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

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: -0.5 }}>
              <Typography variant="caption" sx={{ color: '#A78BFA', cursor: 'pointer',
                '&:hover': { textDecoration: 'underline' } }}>
                Forgot password?
              </Typography>
            </Box>

            <Button type="submit" fullWidth variant="contained" disabled={loading || !email || !password}
              sx={{
                py: 1.25, fontWeight: 600,
                background: 'linear-gradient(135deg, #7C3AED, #06B6D4)', color: 'white',
                '&:hover': { background: 'linear-gradient(135deg, #6d28d9, #0891B2)' },
                '&.Mui-disabled': { background: 'rgba(124,58,237,0.3)', color: 'rgba(255,255,255,0.4)' },
              }}>
              {loading ? <CircularProgress size={20} sx={{ color: 'white' }} /> : 'Sign In'}
            </Button>
          </Box>

          <Divider sx={{ my: 3, '&::before, &::after': { borderColor: '#1E2035' } }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>or continue with</Typography>
          </Divider>

          {/* MetaMask button */}
          <Button fullWidth variant="outlined" onClick={handleWalletLogin} disabled={walletLoading}
            sx={{
              py: 1.25, borderColor: '#1E2035', color: 'text.primary', gap: 1.5,
              bgcolor: '#131629',
              '&:hover': { borderColor: '#7C3AED', bgcolor: 'rgba(124,58,237,0.08)' },
              '&.Mui-disabled': { opacity: 0.5 },
            }}>
            {walletLoading ? (
              <CircularProgress size={20} sx={{ color: '#A78BFA' }} />
            ) : (
              <>
                <Typography sx={{ fontSize: 20, lineHeight: 1 }}>🦊</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Continue with MetaMask</Typography>
              </>
            )}
          </Button>

          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 3.5 }}>
            {"Don't have an account? "}
            <Box component={Link} href="/signup"
              sx={{ color: '#A78BFA', textDecoration: 'none', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}>
              Create account
            </Box>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
