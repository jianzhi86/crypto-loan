'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

const TABS = [
  { href: '/admin',              label: 'Overview' },
  { href: '/admin/users',        label: 'Users' },
  { href: '/admin/kyc',          label: 'KYC' },
  { href: '/admin/transactions', label: 'Transactions' },
  { href: '/admin/features',     label: 'Features' },
  { href: '/admin/audit',        label: 'Audit log' },
];

export default function AdminTabs() {
  const pathname = usePathname();

  return (
    <Box sx={{ borderBottom: '1px solid #E2E7EE', bgcolor: '#FFFFFF', px: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1440, mx: 'auto', display: 'flex', gap: 0.5, overflowX: 'auto' }}>
        {TABS.map(t => {
          // Overview is an exact match; the rest match their subtree so a detail
          // route keeps its parent tab highlighted.
          const active = t.href === '/admin' ? pathname === '/admin' : pathname.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} style={{ textDecoration: 'none' }}>
              <Box sx={{
                px: 2, py: 1.75, position: 'relative', whiteSpace: 'nowrap',
                borderBottom: '2px solid',
                borderColor: active ? '#2A3FD6' : 'transparent',
                transition: 'color .15s, border-color .15s',
                '&:hover': { color: '#2A3FD6' },
                color: active ? '#2A3FD6' : '#5A6675',
              }}>
                <Typography sx={{ fontSize: 13.5, fontWeight: active ? 650 : 500, color: 'inherit' }}>
                  {t.label}
                </Typography>
              </Box>
            </Link>
          );
        })}
      </Box>
    </Box>
  );
}
