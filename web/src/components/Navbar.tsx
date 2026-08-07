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
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Divider from '@mui/material/Divider';
import { useRef, useState } from 'react';
import { useWallet } from '@/lib/WalletContext';
import { usePrices, SYMBOL_TO_ID } from '@/hooks/usePrices';
import { useAuth } from '@/hooks/useAuth';
import { useViewer } from '@/lib/ViewerContext';
import {
  isDevModeUnlocked, setDevModeUnlocked, TAPS_TO_UNLOCK, TAP_WINDOW_MS,
} from '@/components/dev/dev-mode-client';

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
  const viewer = useViewer();
  const [copied, setCopied] = useState(false);
  const [walletMenuEl, setWalletMenuEl] = useState<null | HTMLElement>(null);

  // Android-style easter egg: 7 quick taps on the network chip unlock the
  // developer panel (time travel / mock price / base rate — dev builds only).
  // The countdown is shown by briefly hijacking the chip's own label, so the
  // egg needs no extra UI of its own.
  const devTaps = useRef(0);
  const devLastTap = useRef(0);
  const devMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [devTapMsg, setDevTapMsg] = useState<string | null>(null);
  const showDevMsg = (msg: string, ms = 1600) => {
    setDevTapMsg(msg);
    if (devMsgTimer.current) clearTimeout(devMsgTimer.current);
    devMsgTimer.current = setTimeout(() => setDevTapMsg(null), ms);
  };
  const onNetworkChipTap = () => {
    if (process.env.NODE_ENV === 'production') return;
    if (isDevModeUnlocked()) { showDevMsg('Developer mode is already on'); return; }
    const now = Date.now();
    if (now - devLastTap.current > TAP_WINDOW_MS) devTaps.current = 0;
    devLastTap.current = now;
    devTaps.current += 1;
    const left = TAPS_TO_UNLOCK - devTaps.current;
    if (left <= 0) {
      devTaps.current = 0;
      setDevModeUnlocked(true);
      showDevMsg('Developer mode enabled ✓', 2400);
    } else if (left <= 4) {
      showDevMsg(`${left} more tap${left === 1 ? '' : 's'} for developer mode`);
    }
  };
  // The server said this document belongs to a signed-in account, or the client
  // session agrees. Either alone is enough to offer Logout — hiding it because
  // one of the two answers hiccuped strands people in a session they cannot end.
  const signedIn = viewer.isAuthenticated || !!user;

  const copyAddress = () => {
    if (!wallet.address) return;
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const isLive = wallet.isConnected && wallet.isCorrectNetwork;
  // Connected (a browser-session fact) vs linked (an account fact) — the chip
  // menu spells the difference out, because showing one word for both taught
  // people that plugging MetaMask in was the same as linking. It is not.
  const isLinkedWallet = !!user?.walletAddress && !!wallet.address &&
    user.walletAddress.toLowerCase() === wallet.address.toLowerCase();

  return (
    <>
      <AppBar position="sticky" sx={{ zIndex: 1200 }}>
        {/* Main nav. Full-width, not a centred column: the app has a left
            sidebar hugging the viewport edge, and a navbar centred at 1320px
            left the logo floating a few hundred pixels inward on wide screens
            with nothing above the sidebar. Flush left lines the logo up with
            the rail below it. */}
        <Toolbar sx={{
          width: '100%',
          px: { xs: 2, sm: 3 }, minHeight: '64px !important',
        }}>
          {/* Logo */}
          <Link href="/dashboard" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, marginRight: 40 }}>
            {/* Transparent brand mark — no rounding or shadow box needed. */}
            <Image
              src="/logo-mark.png"
              alt="CryptoLend logo"
              width={36}
              height={35}
              priority
            />
            <Typography sx={{
              fontFamily: 'var(--font-display), system-ui, sans-serif', color: '#FFFFFF', letterSpacing: '-0.3px', fontSize: 19, fontWeight: 700,
            }}>
              Crypto<Box component="span" sx={{ color: '#6E8BFF' }}>Lend</Box>
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

            {/* Network dot — also the developer-mode easter egg (7 quick taps) */}
            <Chip
              size="small"
              onClick={onNetworkChipTap}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{
                    width: 6, height: 6, borderRadius: '50%',
                    bgcolor: devTapMsg ? '#6E8BFF' : isLive ? '#0E9F6E' : wallet.isConnected ? '#C77700' : 'rgba(16,21,28,0.2)',
                    boxShadow: devTapMsg ? '0 0 6px #6E8BFF' : isLive ? '0 0 6px #0E9F6E' : 'none',
                  }} />
                  <Typography variant="caption" sx={{ color: devTapMsg ? '#6E8BFF' : wallet.isConnected && !isLive ? '#FFB224' : 'rgba(255,255,255,0.7)', fontSize: 11 }}>
                    {devTapMsg ?? (isLive ? 'Hardhat Local' : wallet.isConnected ? 'Wrong Network' : 'Not Connected')}
                  </Typography>
                </Box>
              }
              sx={{
                bgcolor: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                display: { xs: 'none', sm: 'flex' },
                height: 30,
                userSelect: 'none',
                // Keep the chip looking inert — the egg should not advertise
                // itself with a pointer cursor or hover/click effects.
                cursor: 'default',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
                '& .MuiChip-label': { px: 1.5 },
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
                  // Brightened for the navy chrome — the light-surface tones went muddy.
                  bgcolor: wallet.kycApproved ? 'rgba(43,217,162,0.12)' : 'rgba(255,178,36,0.12)',
                  color: wallet.kycApproved ? '#2BD9A2' : '#FFB224',
                  border: `1px solid ${wallet.kycApproved ? 'rgba(43,217,162,0.3)' : 'rgba(255,178,36,0.3)'}`,
                  fontSize: 11, height: 30, borderRadius: 2,
                  '&:hover': {
                    bgcolor: wallet.kycApproved ? 'rgba(43,217,162,0.18)' : 'rgba(255,178,36,0.18)',
                  },
                }}
              >
                {wallet.kycApproved ? 'KYC Verified' : 'KYC Required'}
              </Button>
            )}

            {/* User identity + logout. People recognise themselves by the name
                they registered with, not their email — show the name when one
                exists, and fall back to the email. */}
            {signedIn && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {(user?.name || user?.email) && (
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: { xs: 'none', md: 'block' }, fontSize: 12 }}>
                    {user.name || user.email}
                  </Typography>
                )}
                <Button
                  size="small"
                  // Full navigation, mirroring login: the cookie just changed,
                  // and a client-side push would carry the signed-in document's
                  // server-resolved state (viewer verdict, seeded session) into
                  // the signed-out world.
                  onClick={async () => { wallet.disconnect(); await logout(); window.location.assign('/login'); }}
                  sx={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, px: 1, minWidth: 'auto', borderRadius: 2, '&:hover': { color: '#FF7A7E' } }}
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
                {/* Opens the wallet menu — copy, manage link, disconnect. It
                    used to copy the address on click, which nobody could
                    discover and surprised everyone who expected wallet
                    actions here. */}
                <Box
                  onClick={e => setWalletMenuEl(e.currentTarget)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.25,
                    px: 1.75, py: 0.875,
                    bgcolor: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 2.5, cursor: 'pointer', transition: 'all 0.15s',
                    '&:hover': { bgcolor: 'rgba(110,139,255,0.08)', borderColor: 'rgba(110,139,255,0.35)' },
                  }}
                >
                  <Box sx={{
                    width: 8, height: 8, borderRadius: '50%', bgcolor: '#2BD9A2',
                    boxShadow: '0 0 6px #2BD9A2',
                  }} />
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: '#FFFFFF', letterSpacing: 0.5 }}>
                    {short(wallet.address!)}
                  </Typography>
                  <Box sx={{ width: 1, height: 14, bgcolor: 'rgba(255,255,255,0.15)' }} />
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>
                    {wallet.ethBalance} ETH
                  </Typography>
                  {/* Caret — the affordance that says "this opens a menu" */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </Box>

                <Menu
                  anchorEl={walletMenuEl}
                  open={!!walletMenuEl}
                  onClose={() => setWalletMenuEl(null)}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                  slotProps={{ paper: { sx: { mt: 1, minWidth: 260 } } }}
                >
                  <Box sx={{ px: 2, pt: 1.25, pb: 1 }}>
                    <Typography sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'text.secondary', mb: 0.5 }}>
                      Connected wallet
                    </Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.primary', wordBreak: 'break-all', lineHeight: 1.5 }}>
                      {wallet.address}
                    </Typography>
                    <Chip
                      label={isLinkedWallet ? 'Linked to your account' : 'Not linked to your account'}
                      size="small"
                      sx={{
                        mt: 1, height: 20, fontSize: 10.5, fontWeight: 700,
                        bgcolor: isLinkedWallet ? 'rgba(43,217,162,0.12)' : 'rgba(255,178,36,0.12)',
                        color: isLinkedWallet ? '#2BD9A2' : '#FFB224',
                        border: `1px solid ${isLinkedWallet ? 'rgba(43,217,162,0.3)' : 'rgba(255,178,36,0.3)'}`,
                      }}
                    />
                  </Box>
                  <Divider />
                  <MenuItem onClick={copyAddress} sx={{ fontSize: 13.5, py: 1.25 }}>
                    {copied ? '✓ Copied to clipboard' : 'Copy address'}
                  </MenuItem>
                  {isLinkedWallet ? (
                    <MenuItem
                      onClick={() => { setWalletMenuEl(null); router.push('/settings'); }}
                      sx={{ fontSize: 13.5, py: 1.25 }}
                    >
                      Unlink from account… (Settings)
                    </MenuItem>
                  ) : (
                    <MenuItem
                      // connect() IS the link flow: availability check,
                      // ownership signature, link, on-chain grant — one click.
                      onClick={() => { setWalletMenuEl(null); void wallet.connect(); }}
                      sx={{ fontSize: 13.5, py: 1.25 }}
                    >
                      Link to account
                    </MenuItem>
                  )}
                  <MenuItem
                    onClick={() => { setWalletMenuEl(null); wallet.disconnect(); }}
                    sx={{ fontSize: 13.5, py: 1.25, color: '#FF9CA0' }}
                  >
                    Disconnect for this session
                  </MenuItem>
                </Menu>
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
        <Box sx={{ overflow: 'hidden', bgcolor: '#0F1730', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
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
                  <Typography component="span" sx={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.85)' }}>
                    {loading ? '···' : fmt}
                  </Typography>
                  {!loading && (
                    <Typography component="span" sx={{ fontSize: 11, color: change >= 0 ? '#0E9F6E' : '#E5484D' }}>
                      {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </Typography>
                  )}
                  <Typography component="span" sx={{ fontSize: 10, color: 'rgba(255,255,255,0.15)' }}>│</Typography>
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
