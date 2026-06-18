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
  { href: '/ico',       label: 'Buy MYRC'  },
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
        {/* Main nav */}
        <Toolbar sx={{
          maxWidth: 1320, width: '100%', mx: 'auto',
          px: { xs: 2, sm: 3 }, minHeight: '64px !important',
        }}>
          {/* Logo */}
          <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, marginRight: 40 }}>
            <Box sx={{
              width: 36, height: 36, borderRadius: 2,
              background: 'linear-gradient(135deg, #00C8A0 0%, #0090D0 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,200,160,0.35)',
            }}>
              <Typography sx={{ color: '#fff', fontSize: 15, fontWeight: 800, letterSpacing: '-0.5px' }}>C</Typography>
            </Box>
            <Typography variant="h6" sx={{
              color: '#E2EBF9', letterSpacing: '-0.5px', fontSize: 18, fontWeight: 800,
            }}>
              Crypto<Box component="span" sx={{ color: '#00C8A0' }}>Lend</Box>
            </Typography>
          </Link>

          {/* Nav links */}
          <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.5, flex: 1 }}>
            {NAV.map(({ href, label }) => {
              const active = pathname === href;
              return (
                <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                  <Box sx={{
                    px: 1.5, py: 0.75, borderRadius: 2, transition: 'all 0.15s',
                    bgcolor: active ? 'rgba(0,200,160,0.1)' : 'transparent',
                    '&:hover': { bgcolor: active ? 'rgba(0,200,160,0.1)' : 'rgba(255,255,255,0.05)' },
                  }}>
                    <Typography variant="body2" sx={{
                      color: active ? '#00C8A0' : '#7A90B6',
                      fontWeight: active ? 600 : 400,
                      fontSize: 13.5,
                      transition: 'color 0.15s',
                    }}>
                      {label}
                    </Typography>
                  </Box>
                </Link>
              );
            })}
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
                    bgcolor: isLive ? '#00C8A0' : wallet.isConnected ? '#FFB800' : 'rgba(255,255,255,0.2)',
                    boxShadow: isLive ? '0 0 6px #00C8A0' : 'none',
                  }} />
                  <Typography variant="caption" sx={{ color: isLive ? '#7A90B6' : wallet.isConnected ? '#FFB800' : '#7A90B6', fontSize: 11 }}>
                    {isLive ? 'Hardhat Local' : wallet.isConnected ? 'Wrong Network' : 'Not Connected'}
                  </Typography>
                </Box>
              }
              sx={{
                bgcolor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
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
                  bgcolor: wallet.kycApproved ? 'rgba(0,200,160,0.1)' : 'rgba(255,184,0,0.1)',
                  color: wallet.kycApproved ? '#00C8A0' : '#FFB800',
                  border: `1px solid ${wallet.kycApproved ? 'rgba(0,200,160,0.25)' : 'rgba(255,184,0,0.25)'}`,
                  fontSize: 11, height: 30, borderRadius: 2,
                  '&:hover': {
                    bgcolor: wallet.kycApproved ? 'rgba(0,200,160,0.15)' : 'rgba(255,184,0,0.15)',
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
                  <Typography variant="caption" sx={{ color: '#7A90B6', display: { xs: 'none', md: 'block' }, fontSize: 12 }}>
                    {user.email}
                  </Typography>
                )}
                <Button
                  size="small"
                  onClick={() => { logout(); router.push('/login'); }}
                  sx={{ color: '#7A90B6', fontSize: 11, px: 1, minWidth: 'auto', borderRadius: 2, '&:hover': { color: '#FF4560' } }}
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
                      bgcolor: 'rgba(255,184,0,0.1)', color: '#FFB800',
                      border: '1px solid rgba(255,184,0,0.25)', fontSize: 11, borderRadius: 2,
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
                    '&:hover': { bgcolor: 'rgba(0,200,160,0.07)', borderColor: 'rgba(0,200,160,0.3)' },
                  }}
                  title="Click to copy address"
                >
                  <Box sx={{
                    width: 8, height: 8, borderRadius: '50%', bgcolor: '#00C8A0',
                    boxShadow: '0 0 6px #00C8A0',
                  }} />
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#E2EBF9', letterSpacing: 0.5 }}>
                    {copied ? '✓ Copied' : short(wallet.address!)}
                  </Typography>
                  <Box sx={{ width: 1, height: 14, bgcolor: 'rgba(255,255,255,0.1)' }} />
                  <Typography variant="caption" sx={{ color: '#7A90B6', fontSize: 11 }}>
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
        <Box sx={{ overflow: 'hidden', bgcolor: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
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
                  <Typography component="span" sx={{ fontSize: 11, fontWeight: 500, color: '#E2EBF9' }}>
                    {loading ? '···' : fmt}
                  </Typography>
                  {!loading && (
                    <Typography component="span" sx={{ fontSize: 11, color: change >= 0 ? '#00C8A0' : '#FF4560' }}>
                      {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </Typography>
                  )}
                  <Typography component="span" sx={{ fontSize: 10, color: 'rgba(255,255,255,0.1)' }}>│</Typography>
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
              sx={{ color: '#FFB800', fontSize: 11, borderRadius: 2 }}>
              Switch Now
            </Button>
          }
          sx={{
            bgcolor: 'rgba(255,184,0,0.08)', color: '#FFB800',
            borderRadius: 0, border: 'none', borderBottom: '1px solid rgba(255,184,0,0.2)',
            '& .MuiAlert-icon': { color: '#FFB800' },
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
            bgcolor: 'rgba(0,200,160,0.06)', color: '#00C8A0',
            borderRadius: 0, border: 'none', borderBottom: '1px solid rgba(0,200,160,0.15)',
            '& .MuiAlert-icon': { color: '#00C8A0' },
          }}
        >
          Contracts not deployed. Run{' '}
          <Box component="code" sx={{ fontFamily: 'monospace', bgcolor: 'rgba(0,0,0,0.3)', px: 0.75, borderRadius: 0.5, fontSize: 12 }}>
            npm run deploy:local
          </Box>{' '}
          to get started.
        </Alert>
      )}
    </>
  );
}
