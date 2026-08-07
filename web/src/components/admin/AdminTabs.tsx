'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import {
  ShieldIcon, SearchIcon, IdCardIcon,
  WrenchIcon, ClipboardIcon, AlertIcon,
} from '@/components/Icons';
import { C } from './ui';

// No Transactions tab: the public Explorer already renders the same ledger
// (identity joins and all admin-only views were dropped with it).
const TABS = [
  { href: '/admin',              label: 'Overview',     Icon: ShieldIcon    },
  { href: '/admin/users',        label: 'Users',        Icon: SearchIcon    },
  { href: '/admin/kyc',          label: 'KYC',          Icon: IdCardIcon    },
  { href: '/admin/recovery',     label: 'Recovery',     Icon: AlertIcon     },
  { href: '/admin/features',     label: 'Features',     Icon: WrenchIcon    },
  { href: '/admin/audit',        label: 'Audit Log',    Icon: ClipboardIcon },
];

export default function AdminTabs() {
  const pathname = usePathname();
  // The recovery notification: how many loans are currently seizable. Polled
  // rather than pushed — a loan becomes claimable when a deadline passes or a
  // price moves, so nothing in the app can fire an event at the moment it
  // happens. 60s matches the dashboard's own chain-refresh cadence.
  const [recoverable, setRecoverable] = useState(0);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch('/api/admin/recovery', { cache: 'no-store' });
        if (!res.ok) return;
        const d = await res.json() as { loans?: unknown[] };
        if (alive) setRecoverable(Array.isArray(d.loans) ? d.loans.length : 0);
      } catch { /* a down node must not break navigation */ }
    };
    void check();
    const id = setInterval(check, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [pathname]);

  return (
    <Box sx={{
      position: 'sticky', top: 0, zIndex: 100,
      borderBottom: `1px solid ${C.border}`,
      bgcolor: 'rgba(8,14,31,0.95)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    }}>
      <Box sx={{
        maxWidth: 1440, mx: 'auto',
        px: { xs: 1.5, md: 3 },
        display: 'flex', alignItems: 'center',
        overflowX: 'auto',
        /* hide scrollbar but keep scroll */
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}>

        {/* Brand — shrink: 0 so it never gets squished */}
        <Box sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          pr: 2, mr: 0.5, flexShrink: 0, py: 1.25,
          borderRight: `1px solid ${C.border}`,
        }}>
          <Box sx={{
            width: 26, height: 26, borderRadius: 1.5,
            bgcolor: `${C.blue}20`, border: `1px solid ${C.blue}35`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.blue,
          }}>
            <ShieldIcon size={13} />
          </Box>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: -0.2, whiteSpace: 'nowrap' }}>
            Admin
          </Typography>
          <Box sx={{ px: 0.75, py: 0.2, borderRadius: 0.75, bgcolor: `${C.blue}15`, border: `1px solid ${C.blue}28` }}>
            <Typography sx={{ fontSize: 9, fontWeight: 700, color: C.blue, letterSpacing: 0.5 }}>
              PANEL
            </Typography>
          </Box>
        </Box>

        {/* Tab items — each whiteSpace: nowrap so they never wrap */}
        {TABS.map(t => {
          const active = t.href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(t.href);

          const TabIcon = t.Icon;
          const alert = t.href === '/admin/recovery' && recoverable > 0;
          return (
            <Link key={t.href} href={t.href} style={{ textDecoration: 'none', flexShrink: 0 }}>
              <Box sx={{
                display: 'flex', alignItems: 'center', gap: 0.75,
                px: 1.5, py: 1, mx: 0.25, borderRadius: 2, my: 0.75,
                whiteSpace: 'nowrap', transition: 'background .15s, color .15s',
                bgcolor: active ? `${C.blue}16` : 'transparent',
                color: active ? C.blue : alert ? C.red : C.muted,
                '&:hover': {
                  bgcolor: active ? `${C.blue}20` : 'rgba(255,255,255,0.05)',
                  color: active ? C.blue : alert ? C.red : C.slate,
                },
              }}>
                <TabIcon size={13} color="currentColor" />
                <Typography sx={{
                  fontSize: 12.5,
                  fontWeight: active || alert ? 650 : 500,
                  color: 'inherit',
                  letterSpacing: -0.1,
                }}>
                  {t.label}
                </Typography>
                {alert && (
                  <Box sx={{
                    minWidth: 17, height: 17, px: 0.5, borderRadius: '9px',
                    bgcolor: C.red, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }} title={`${recoverable} loan${recoverable === 1 ? '' : 's'} can be recovered`}>
                    <Typography sx={{ fontSize: 10, fontWeight: 800, lineHeight: 1, color: 'inherit' }}>
                      {recoverable}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Link>
          );
        })}
      </Box>
    </Box>
  );
}
