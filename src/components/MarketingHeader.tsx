'use client';

import Link from 'next/link';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

const LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
];

export default function MarketingHeader() {
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
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 2.5,
              bgcolor: '#2A3FD6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(42,63,214,0.3)',
            }}
          >
            <Typography sx={{ fontFamily: 'var(--font-display), system-ui, sans-serif', color: '#fff', fontSize: 17, fontWeight: 700, lineHeight: 1 }}>
              C
            </Typography>
          </Box>
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
          <Button
            component={Link}
            href="/"
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
