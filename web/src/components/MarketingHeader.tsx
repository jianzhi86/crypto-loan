'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useWallet } from '@/lib/WalletContext';

const LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
];

function short(addr: string) { return addr.slice(0, 6) + '…' + addr.slice(-4); }

export default function MarketingHeader() {
  const wallet = useWallet();
  const [copied, setCopied] = useState(false);

  const copyAddress = () => {
    if (!wallet.address) return;
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppBar position="sticky" sx={{ zIndex: 1200 }}>
      <Toolbar
        sx={{
          maxWidth: 1320,
          width: '100%',
          mx: 'auto',
          px: { xs: 2, sm: 3 },
          minHeight: '64px !important',
          gap: 2,
        }}
      >
        {/* Logo */}
        <Link
          href="/home"
          style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <Image
            src="/Logo.png"
            alt="CryptoLend logo"
            width={34}
            height={34}
            priority
            style={{ borderRadius: 10, boxShadow: '0 2px 8px rgba(42,63,214,0.3)' }}
          />
          <Typography
            sx={{ fontFamily: 'var(--font-display), system-ui, sans-serif', color: '#10151C', letterSpacing: '-0.3px', fontSize: 19, fontWeight: 700 }}
          >
            Crypto
            <Box component="span" sx={{ color: '#2A3FD6' }}>
              Lend
            </Box>
          </Typography>
        </Link>

        {/* Center anchor links */}
        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            alignItems: 'center',
            gap: 0.5,
            flex: 1,
            justifyContent: 'center',
          }}
        >
          {LINKS.map(({ href, label }) => (
            <Box
              key={href}
              component="a"
              href={href}
              sx={{
                px: 1.75,
                py: 0.75,
                borderRadius: 2,
                textDecoration: 'none',
                transition: 'all 0.15s',
                '&:hover': { bgcolor: 'rgba(42,63,214,0.06)' },
              }}
            >
              <Typography variant="body2" sx={{ color: '#5A6675', fontSize: 13.5, fontWeight: 500 }}>
                {label}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Right CTAs */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, ml: { xs: 'auto', md: 0 } }}>
          {wallet.isConnected ? (
            <Box
              onClick={copyAddress}
              sx={{
                display: { xs: 'none', sm: 'flex' },
                alignItems: 'center', gap: 1.25,
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
          ) : (
            <Button
              component={Link}
              href="/login"
              size="small"
              sx={{
                display: { xs: 'none', sm: 'inline-flex' },
                color: '#10151C',
                fontSize: 13,
                px: 2,
                borderRadius: 2.5,
                border: '1px solid #E2E7EE',
                '&:hover': { borderColor: '#2A3FD6', bgcolor: 'rgba(42,63,214,0.05)' },
              }}
            >
              Log in
            </Button>
          )}
          <Button
            component={Link}
            href="/dashboard"
            variant="contained"
            size="small"
            sx={{ px: 2.5, py: 0.875, fontSize: 13, borderRadius: 2.5, fontWeight: 700 }}
          >
            Launch App
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
