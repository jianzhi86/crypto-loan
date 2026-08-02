'use client';

import { useState, Suspense } from 'react';
import Tooltip from '@mui/material/Tooltip';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
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
import { BoltIcon, EyeIcon, EyeOffIcon, LockIcon, ShieldIcon, TrendUpIcon } from '@/components/Icons';

const FEATURES = [
  { icon: <LockIcon size={18} />, text: 'Non-custodial — your keys, your crypto' },
  { icon: <BoltIcon size={18} />, text: 'Instant MYR loans against crypto collateral' },
  { icon: <TrendUpIcon size={18} />, text: 'Up to 75% LTV with competitive APR' },
  { icon: <ShieldIcon size={18} />, text: 'KYC-verified and compliance-ready' },
];

function LoginForm() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') ?? '/dashboard';
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
      // Full navigation, not router.push: signing in changes the auth cookie,
      // and everything the server resolves per document — the viewer verdict,
      // the seeded session, the maintenance decision — was computed for the
      // *previous* identity. A client-side push keeps all of that alive, which
      // is how an admin could land on /admin with a sidebar still locked for
      // the stranger they used to be. A document load re-runs the root layout.
      window.location.assign(data.isAdmin ? '/admin' : nextPath);
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
      // Full navigation — same reasoning as the email form above. The wallet
      // reconnects on the next document via the linked-wallet auto-restore.
      window.location.assign(data.isAdmin ? '/admin' : nextPath);
    } catch (e: unknown) {
      const code = (e as { code?: number }).code;
      if (code !== 4001) setError('Wallet sign-in failed. Please try again.');
      setWalletLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F4F6F8', display: 'flex' }}>

      {/* Left panel — branding */}
      <Box sx={{
        display: { xs: 'none', lg: 'flex' },
        flexDirection: 'column',
        justifyContent: 'center',
        px: 8,
        flex: '0 0 480px',
        background: 'linear-gradient(160deg, #FFFFFF 0%, #F4F6F8 55%, #EEF1F5 100%)',
        borderRight: '1px solid #E2E7EE',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative glow */}
        <Box sx={{ position: 'absolute', top: '25%', left: '-80px', width: 320, height: 320,
                    borderRadius: '50%', background: 'radial-gradient(circle, rgba(42,63,214,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', bottom: '20%', right: '-60px', width: 240, height: 240,
                    borderRadius: '50%', background: 'radial-gradient(circle, rgba(14,159,110,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Logo — full wordmark with tagline, transparent background */}
        <Box sx={{ mb: 6 }}>
          <Image
            src="/logo-full.png"
            alt="CryptoLend — Borrow Ringgit, Not Your Future"
            width={300}
            height={86}
            priority
            style={{ width: 300, height: 'auto' }}
          />
        </Box>

        <Typography sx={{ fontFamily: 'var(--font-display), system-ui, sans-serif', color: '#10151C', fontSize: 44, fontWeight: 600, lineHeight: 1.12, mb: 2.5, letterSpacing: '-1px' }}>
          Borrow smarter.<br />
          <Box component="span" sx={{ color: '#2A3FD6' }}>
            Keep your crypto.
          </Box>
        </Typography>
        {/* Signature: indigo seam */}
        <Box sx={{ width: 72, height: '2px', mb: 3, background: 'linear-gradient(90deg, #2A3FD6, #4458E8, transparent)' }} />
        <Typography variant="body1" color="text.secondary" sx={{ mb: 5, lineHeight: 1.7 }}>
          The crypto-backed lending platform built on Ethereum. Get MYR liquidity without selling your assets.
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {FEATURES.map(f => (
            <Box key={f.text} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: 'rgba(42,63,214,0.08)',
                          border: '1px solid rgba(42,63,214,0.15)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2A3FD6', flexShrink: 0 }}>
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
            <Image src="/logo-mark.png" alt="CryptoLend logo" width={40} height={39} />
            <Typography sx={{ fontFamily: 'var(--font-display), system-ui, sans-serif', color: 'text.primary', fontSize: 21, fontWeight: 600 }}>
              Crypto<Box component="span" sx={{ color: '#2A3FD6' }}>Lend</Box>
            </Typography>
          </Box>

          <Typography sx={{ fontFamily: 'var(--font-display), system-ui, sans-serif', color: 'text.primary', fontSize: 30, fontWeight: 600, mb: 0.5, letterSpacing: '-0.3px' }}>Welcome back</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3.5 }}>
            Sign in to your account to continue
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2.5, bgcolor: '#FEF2F2', color: '#B42318',
              border: '1px solid #FECDCA', '& .MuiAlert-icon': { color: '#E5484D' } }}>
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
                        {showPwd ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: -0.5 }}>
              <Tooltip
                title="Password reset is not available in this demo. If you linked a MetaMask wallet, use 'Continue with MetaMask' below."
                placement="top"
                arrow
              >
                <Typography variant="caption" sx={{ color: '#2A3FD6', cursor: 'help',
                  '&:hover': { textDecoration: 'underline' } }}>
                  Forgot password?
                </Typography>
              </Tooltip>
            </Box>

            <Button type="submit" fullWidth variant="contained" disabled={loading || !email || !password}
              sx={{
                py: 1.25, fontWeight: 700,
                background: '#2A3FD6', color: '#fff',
                boxShadow: '0 2px 8px rgba(42,63,214,0.25)',
                '&:hover': { background: '#1E2FA8' },
                '&.Mui-disabled': { background: '#E2E7EE', color: '#A9B4C2' },
              }}>
              {loading ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Sign in'}
            </Button>
          </Box>

          <Divider sx={{ my: 3, '&::before, &::after': { borderColor: '#E2E7EE' } }}>
            <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>or continue with</Typography>
          </Divider>

          {/* MetaMask button */}
          <Button fullWidth variant="outlined" onClick={handleWalletLogin} disabled={walletLoading}
            sx={{
              py: 1.25, borderColor: '#E2E7EE', color: 'text.primary', gap: 1.5,
              bgcolor: '#FFFFFF',
              '&:hover': { borderColor: '#2A3FD6', bgcolor: 'rgba(42,63,214,0.05)' },
              '&.Mui-disabled': { opacity: 0.5 },
            }}>
            {walletLoading ? (
              <CircularProgress size={20} sx={{ color: '#2A3FD6' }} />
            ) : (
              <>
                <Box component="img" src="/metamask.png" alt="MetaMask"
                  sx={{ width: 50, height: 50, objectFit: 'contain' }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Continue with MetaMask</Typography>
              </>
            )}
          </Button>

          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 3.5 }}>
            {"Don't have an account? "}
            <Box component={Link} href="/signup"
              sx={{ color: '#2A3FD6', textDecoration: 'none', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}>
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
