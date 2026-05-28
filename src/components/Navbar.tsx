'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import { useState } from 'react';
import { useWallet } from '@/lib/WalletContext';
import { usePrices, SYMBOL_TO_ID } from '@/hooks/usePrices';
import { useAuth } from '@/hooks/useAuth';

const NAV = [
  { href: '/',          label: 'Dashboard' },
  { href: '/markets',   label: 'Markets'   },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/docs',      label: 'Docs'      },
  { href: '/kyc',       label: 'KYC'       },
  { href: '/settings',  label: 'Settings'  },
];

const TICKER_COINS = [
  { symbol: 'BTC',  color: '#F7931A' },
  { symbol: 'ETH',  color: '#627EEA' },
  { symbol: 'SOL',  color: '#9945FF' },
  { symbol: 'BNB',  color: '#F3BA2F' },
  { symbol: 'XRP',  color: '#00AAE4' },
  { symbol: 'AVAX', color: '#E84142' },
  { symbol: 'LINK', color: '#2A5ADA' },
  { symbol: 'DOT',  color: '#E6007A' },
  { symbol: 'ADA',  color: '#0033AD' },
];

function short(addr: string) { return addr.slice(0, 6) + '…' + addr.slice(-4); }

export default function Navbar() {
  const pathname = usePathname();
  const router   = useRouter();
  const wallet   = useWallet();
  const { prices, loading } = usePrices();
  const { user, logout } = useAuth();
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    if (!wallet.address) return;
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const isLive = wallet.isConnected && wallet.isCorrectNetwork;

  return (
    <>
      <AppBar position="sticky" sx={{ zIndex: 1200 }}>
        {/* Main nav bar */}
        <Toolbar sx={{ maxWidth: 1280, width: '100%', mx: 'auto', px: { xs: 2, sm: 3 }, minHeight: '56px !important' }}>
          {/* Logo + links */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
            <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Box sx={{ width: 32, height: 32, borderRadius: 1.5, background: 'linear-gradient(135deg, #7C3AED, #06B6D4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography sx={{ color: 'white', fontSize: 14, fontWeight: 700 }}>C</Typography>
              </Box>
              <Typography variant="h6" sx={{ color: 'text.primary', letterSpacing: '-0.5px', fontSize: 18, fontWeight: 700 }}>
                CryptoLend
              </Typography>
            </Link>

            <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 3 }}>
              {NAV.map(({ href, label }) => (
                <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                  <Typography
                    variant="body2"
                    sx={{
                      color: pathname === href ? '#06B6D4' : '#64748B',
                      transition: 'color 0.15s',
                      '&:hover': { color: 'text.primary' },
                    }}
                  >
                    {label}
                  </Typography>
                </Link>
              ))}
            </Box>
          </Box>

          {/* Right side */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            {/* Network status */}
            <Chip
              size="small"
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: isLive ? '#22c55e' : wallet.isConnected ? '#F59E0B' : '#475569' }} />
                  <Typography variant="caption" sx={{ color: isLive ? '#94A3B8' : '#F59E0B' }}>
                    {isLive ? 'Hardhat Local' : wallet.isConnected ? 'Wrong Network' : 'Not Connected'}
                  </Typography>
                </Box>
              }
              sx={{ bgcolor: '#131629', border: '1px solid #1E2035', display: { xs: 'none', sm: 'flex' }, height: 28 }}
            />

            {/* KYC status */}
            {isLive && (
              <Button
                size="small"
                onClick={() => router.push('/kyc')}
                sx={{
                  display: { xs: 'none', sm: 'flex' },
                  gap: 0.75,
                  bgcolor: wallet.kycApproved ? '#052e16' : '#1a0f2e',
                  color: wallet.kycApproved ? '#22c55e' : '#A78BFA',
                  border: `1px solid ${wallet.kycApproved ? 'rgba(34,197,94,0.27)' : 'rgba(124,58,237,0.33)'}`,
                  fontSize: 11,
                  height: 28,
                  '&:hover': { bgcolor: wallet.kycApproved ? '#063b1e' : '#23143d' },
                }}
              >
                <span>{wallet.kycApproved ? '✓' : '🪪'}</span>
                {wallet.kycApproved ? 'KYC Verified' : 'KYC Required'}
              </Button>
            )}

            {/* Logged-in user + logout */}
            {user && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {user.email && (
                  <Typography variant="caption" sx={{ color: '#64748B', display: { xs: 'none', md: 'block' } }}>
                    {user.email}
                  </Typography>
                )}
                <Button
                  size="small"
                  onClick={() => { logout(); router.push('/login'); }}
                  sx={{ color: '#64748B', fontSize: 11, px: 1, minWidth: 'auto', '&:hover': { color: '#ef4444' } }}
                >
                  Logout
                </Button>
              </Box>
            )}

            {/* Wallet button / address */}
            {wallet.isConnected ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {!wallet.isCorrectNetwork && (
                  <Button
                    size="small"
                    onClick={wallet.switchToHardhat}
                    sx={{ bgcolor: 'rgba(245,158,11,0.13)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.27)', fontSize: 11 }}
                  >
                    Switch to Hardhat
                  </Button>
                )}
                <Box onClick={copyAddress}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
                        bgcolor: '#131629', border: '1px solid #1E2035', borderRadius: 1.5,
                        cursor: 'pointer', transition: 'border-color 0.15s',
                        '&:hover': { borderColor: copied ? '#22c55e' : '#7C3AED' } }}
                  title="Click to copy address">
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#22c55e' }} />
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }} color="text.primary">
                    {copied ? '✓ Copied' : short(wallet.address!)}
                  </Typography>
                  <Typography sx={{ color: '#64748B', fontSize: 12 }}>·</Typography>
                  <Typography variant="caption" color="text.secondary">{wallet.ethBalance} ETH</Typography>
                </Box>
              </Box>
            ) : (
              <Button
                variant="contained"
                size="small"
                onClick={wallet.connect}
                sx={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)', color: 'white', px: 2 }}
              >
                Connect Wallet
              </Button>
            )}
          </Box>
        </Toolbar>

        {/* Live price ticker */}
        <Box sx={{ overflow: 'hidden', bgcolor: '#090B15', borderBottom: '1px solid #1A1C30' }}>
          <Box className="ticker-track" sx={{ py: 0.75 }}>
            {[...TICKER_COINS, ...TICKER_COINS].map((coin, i) => {
              const key    = SYMBOL_TO_ID[coin.symbol];
              const p      = prices[key];
              const myr    = p?.myr ?? 0;
              const change = p?.change24h ?? 0;
              const fmt    = myr >= 100000 ? `RM ${(myr / 1000).toFixed(0)}K`
                           : myr >= 1000   ? `RM ${(myr / 1000).toFixed(1)}K`
                           : myr >= 1      ? `RM ${myr.toFixed(0)}`
                           :                 `RM ${myr.toFixed(2)}`;
              return (
                <Box key={`${coin.symbol}-${i}`} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 2.5, whiteSpace: 'nowrap' }}>
                  <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, color: coin.color }}>{coin.symbol}</Typography>
                  <Typography component="span" sx={{ fontSize: 11, fontWeight: 500, color: 'text.primary' }}>{loading ? '···' : fmt}</Typography>
                  {!loading && (
                    <Typography component="span" sx={{ fontSize: 11, color: change >= 0 ? '#22c55e' : '#ef4444' }}>
                      {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </Typography>
                  )}
                  <Typography component="span" sx={{ fontSize: 11, color: '#252840' }}>│</Typography>
                </Box>
              );
            })}
          </Box>
        </Box>
      </AppBar>

      {/* Network warning */}
      {wallet.isConnected && !wallet.isCorrectNetwork && (
        <Alert
          severity="warning"
          action={
            <Button size="small" onClick={wallet.switchToHardhat} sx={{ color: '#fb923c', fontSize: 11 }}>
              Switch Now
            </Button>
          }
          sx={{ bgcolor: '#431407', color: '#fb923c', borderRadius: 0, border: 'none', borderBottom: '1px solid #7c2d12', '& .MuiAlert-icon': { color: '#fb923c' } }}
        >
          Wrong network. Switch to Hardhat Local (localhost:8545, chain ID 31337).
        </Alert>
      )}

      {/* Contracts not deployed warning */}
      {wallet.isConnected && wallet.isCorrectNetwork && !wallet.isDeployed && (
        <Alert
          severity="info"
          sx={{ bgcolor: '#1e1b3a', color: '#A78BFA', borderRadius: 0, border: 'none', borderBottom: '1px solid #2e2654', '& .MuiAlert-icon': { color: '#A78BFA' } }}
        >
          Contracts not deployed yet. Run <Box component="code" sx={{ fontFamily: 'monospace', bgcolor: 'rgba(0,0,0,0.3)', px: 0.75, borderRadius: 0.5, fontSize: 12 }}>npm run deploy:local</Box> first.
        </Alert>
      )}
    </>
  );
}
