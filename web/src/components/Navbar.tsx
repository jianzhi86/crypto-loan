'use client';

import Link from 'next/link';
import Image from 'next/image';
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

// const NAV = [
//   { href: '/dashboard',          label: 'Dashboard' },
//   { href: '/markets',   label: 'Markets'   },
//   { href: '/portfolio', label: 'Portfolio' },
//   { href: '/docs',      label: 'Docs'      },
//   { href: '/kyc',       label: 'KYC'       },
//   { href: '/settings',  label: 'Settings'  },
// ];

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
        {/* Main nav */}
        <Toolbar sx={{
          maxWidth: 1320, width: '100%', mx: 'auto',
          px: { xs: 2, sm: 3 }, minHeight: '64px !important',
        }}>
          {/* Logo */}
          <Link href="/home" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, marginRight: 40 }}>
            <Image
              src="/Logo.png"
              alt="CryptoLend logo"
              width={34}
              height={34}
              priority
              style={{ borderRadius: 10, boxShadow: '0 2px 8px rgba(42,63,214,0.3)' }}
            />
            <Typography sx={{
              fontFamily: 'var(--font-display), system-ui, sans-serif', color: '#10151C', letterSpacing: '-0.3px', fontSize: 19, fontWeight: 700,
            }}>
              Crypto<Box component="span" sx={{ color: '#2A3FD6' }}>Lend</Box>
            </Typography>
          </Link>

          {/* Nav links */}
          <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.5, flex: 1 }}>
            {/* {NAV.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                  <Box sx={{
                    px: 1.5, py: 0.75, borderRadius: 2, transition: 'all 0.15s',
                    bgcolor: active ? 'rgba(42,63,214,0.1)' : 'transparent',
                    '&:hover': { bgcolor: active ? 'rgba(42,63,214,0.1)' : 'rgba(42,63,214,0.05)' },
                  }}>
                    <Typography variant="body2" sx={{
                      color: active ? '#2A3FD6' : '#5A6675',
                      fontWeight: active ? 600 : 400,
                      fontSize: 13.5,
                      transition: 'color 0.15s',
                    }}>
                      {label}
                    </Typography>
                  </Box>
                </Link>
              );
            })} */}
          </Box>

          {/* Right side */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>

            {/* Network dot */}
            <Chip
              size="small"
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{
                    width: 6, height: 6, borderRadius: '50%',
                    bgcolor: isLive ? '#0E9F6E' : wallet.isConnected ? '#C77700' : 'rgba(16,21,28,0.2)',
                    boxShadow: isLive ? '0 0 6px #0E9F6E' : 'none',
                  }} />
                  <Typography variant="caption" sx={{ color: isLive ? '#5A6675' : wallet.isConnected ? '#C77700' : '#5A6675', fontSize: 11 }}>
                    {isLive ? 'Hardhat Local' : wallet.isConnected ? 'Wrong Network' : 'Not Connected'}
                  </Typography>
                </Box>
              }
              sx={{
                bgcolor: 'rgba(16,21,28,0.03)',
                border: '1px solid #E2E7EE',
                display: { xs: 'none', sm: 'flex' },
                height: 30,
              }}
            />

            {/* KYC status */}
            {isLive && (
              <Button
                size="small"
                onClick={() => router.push('/kyc')}
                sx={{
                  display: { xs: 'none', sm: 'flex' },
                  gap: 0.75,
                  bgcolor: wallet.kycApproved ? 'rgba(14,159,110,0.1)' : 'rgba(199,119,0,0.1)',
                  color: wallet.kycApproved ? '#0E9F6E' : '#C77700',
                  border: `1px solid ${wallet.kycApproved ? 'rgba(14,159,110,0.25)' : 'rgba(199,119,0,0.25)'}`,
                  fontSize: 11, height: 30, borderRadius: 2,
                  '&:hover': {
                    bgcolor: wallet.kycApproved ? 'rgba(14,159,110,0.15)' : 'rgba(199,119,0,0.15)',
                  },
                }}
              >
                {wallet.kycApproved ? '✓ KYC Verified' : '⚠ KYC Required'}
              </Button>
            )}

            {/* User email + logout */}
            {user && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {user.email && (
                  <Typography variant="caption" sx={{ color: '#5A6675', display: { xs: 'none', md: 'block' }, fontSize: 12 }}>
                    {user.email}
                  </Typography>
                )}
                <Button
                  size="small"
                  onClick={() => { logout(); router.push('/dashboard'); }}
                  sx={{ color: '#5A6675', fontSize: 11, px: 1, minWidth: 'auto', borderRadius: 2, '&:hover': { color: '#E5484D' } }}
                >
                  Logout
                </Button>
              </Box>
            )}

            {/* Wallet */}
            {wallet.isConnected ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {!wallet.isCorrectNetwork && (
                  <Button
                    size="small"
                    onClick={wallet.switchToHardhat}
                    sx={{
                      bgcolor: 'rgba(199,119,0,0.1)', color: '#C77700',
                      border: '1px solid rgba(199,119,0,0.25)', fontSize: 11, borderRadius: 2,
                    }}
                  >
                    Switch Network
                  </Button>
                )}
                <Box
                  onClick={copyAddress}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.25,
                    px: 1.75, py: 0.875,
                    bgcolor: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 2.5, cursor: 'pointer', transition: 'all 0.15s',
                    '&:hover': { bgcolor: 'rgba(14,159,110,0.07)', borderColor: 'rgba(14,159,110,0.3)' },
                  }}
                  title="Click to copy address"
                >
                  <Box sx={{
                    width: 8, height: 8, borderRadius: '50%', bgcolor: '#0E9F6E',
                    boxShadow: '0 0 6px #0E9F6E',
                  }} />
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#10151C', letterSpacing: 0.5 }}>
                    {copied ? '✓ Copied' : short(wallet.address!)}
                  </Typography>
                  <Box sx={{ width: 1, height: 14, bgcolor: 'rgba(16,21,28,0.15)' }} />
                  <Typography variant="caption" sx={{ color: '#5A6675', fontSize: 11 }}>
                    {wallet.ethBalance} ETH
                  </Typography>
                </Box>
              </Box>
            ) : (
              <Button
                variant="contained"
                size="small"
                onClick={wallet.connect}
                sx={{ px: 2.5, py: 0.875, fontSize: 13, borderRadius: 2.5, fontWeight: 700 }}
              >
                Connect Wallet
              </Button>
            )}
          </Box>
        </Toolbar>

        {/* Live price ticker */}
        <Box sx={{ overflow: 'hidden', bgcolor: '#EEF1F5', borderBottom: '1px solid #E2E7EE' }}>
          <Box className="ticker-track" sx={{ py: 0.875 }}>
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
                <Box key={`${coin.symbol}-${i}`} component="span"
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 3, whiteSpace: 'nowrap' }}>
                  <Box sx={{
                    width: 4, height: 4, borderRadius: '50%', bgcolor: coin.color,
                    flexShrink: 0,
                  }} />
                  <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, color: coin.color }}>
                    {coin.symbol}
                  </Typography>
                  <Typography component="span" sx={{ fontSize: 11, fontWeight: 500, color: '#10151C' }}>
                    {loading ? '···' : fmt}
                  </Typography>
                  {!loading && (
                    <Typography component="span" sx={{ fontSize: 11, color: change >= 0 ? '#0E9F6E' : '#E5484D' }}>
                      {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </Typography>
                  )}
                  <Typography component="span" sx={{ fontSize: 10, color: 'rgba(16,21,28,0.15)' }}>│</Typography>
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
            <Button size="small" onClick={wallet.switchToHardhat}
              sx={{ color: '#C77700', fontSize: 11, borderRadius: 2 }}>
              Switch Now
            </Button>
          }
          sx={{
            bgcolor: 'rgba(199,119,0,0.08)', color: '#C77700',
            borderRadius: 0, border: 'none', borderBottom: '1px solid rgba(199,119,0,0.2)',
            '& .MuiAlert-icon': { color: '#C77700' },
          }}
        >
          Wrong network detected. Switch to Hardhat Local (localhost:8545, chain ID 31337).
        </Alert>
      )}

      {/* Contract not deployed warning */}
      {wallet.isConnected && wallet.isCorrectNetwork && !wallet.isDeployed && (
        <Alert
          severity="info"
          sx={{
            bgcolor: 'rgba(14,159,110,0.06)', color: '#0E9F6E',
            borderRadius: 0, border: 'none', borderBottom: '1px solid rgba(14,159,110,0.15)',
            '& .MuiAlert-icon': { color: '#0E9F6E' },
          }}
        >
          Contracts not deployed. Run{' '}
          <Box component="code" sx={{ fontFamily: 'monospace', bgcolor: '#EEF1F5', px: 0.75, borderRadius: 0.5, fontSize: 12 }}>
            npm run deploy:local
          </Box>{' '}
          to get started.
        </Alert>
      )}
    </>
  );
}
