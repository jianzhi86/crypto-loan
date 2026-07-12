'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/lib/WalletContext';
import { NAV_SECTIONS, LockIcon, type NavItem } from './navItems';
import { checkAcl, lockReason, type AclContext } from './acl';

const WIDTH_OPEN = 232;
const WIDTH_CLOSED = 64;
const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const STORAGE_KEY = 'sidebar-open';

const C = {
  border: '#E2E7EE',
  blue:   '#2A3FD6',
  ink:    '#10151C',
  slate:  '#5A6675',
  muted:  '#A9B2BD',
};

function NavRow({ item, open, status, reason }: {
  item: NavItem;
  open: boolean;
  status: 'allowed' | 'locked';
  reason: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const active = pathname === item.href;
  const locked = status === 'locked';

  const row = (
    <Box
      onClick={locked ? () => router.push('/login') : undefined}
      sx={{
        position: 'relative',
        display: 'flex', alignItems: 'center',
        height: 42, mx: 1, mb: 0.25, borderRadius: 2,
        pl: '12px', overflow: 'hidden', whiteSpace: 'nowrap',
        cursor: 'pointer',
        color: active ? C.blue : locked ? C.muted : C.slate,
        bgcolor: active ? 'rgba(42,63,214,0.08)' : 'transparent',
        transition: `background-color 0.15s, color 0.15s`,
        '&:hover': { bgcolor: active ? 'rgba(42,63,214,0.08)' : 'rgba(42,63,214,0.05)' },
        // Active indicator bar
        '&::before': {
          content: '""', position: 'absolute', left: 0, top: 10, bottom: 10,
          width: 3, borderRadius: 2, bgcolor: C.blue,
          transform: active ? 'scaleY(1)' : 'scaleY(0)',
          transition: `transform 0.2s ${EASE}`,
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, flexShrink: 0 }}>
        {item.icon}
      </Box>
      <Typography sx={{
        ml: 1.5, fontSize: 13.5, fontWeight: active ? 600 : 500, lineHeight: 1,
        opacity: open ? 1 : 0,
        transform: open ? 'translateX(0)' : 'translateX(-8px)',
        transition: `opacity 0.2s ${EASE} ${open ? '0.08s' : '0s'}, transform 0.25s ${EASE}`,
      }}>
        {item.label}
      </Typography>
      {locked && (
        <Box sx={{
          ml: 'auto', mr: 1.25, display: 'flex', alignItems: 'center', color: C.muted,
          opacity: open ? 1 : 0, transition: `opacity 0.2s ${EASE}`,
        }}>
          {LockIcon}
        </Box>
      )}
    </Box>
  );

  const tooltip = !open ? `${item.label}${locked ? ` — ${reason}` : ''}` : locked ? reason : '';

  const wrapped = tooltip
    ? <Tooltip title={tooltip} placement="right" arrow>{row}</Tooltip>
    : row;

  if (locked) return wrapped;
  return (
    <Link href={item.href} style={{ textDecoration: 'none', display: 'block' }}>
      {wrapped}
    </Link>
  );
}

export default function Sidebar() {
  const [open, setOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const { user } = useAuth();
  const wallet = useWallet();

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) setOpen(saved === '1');
    setHydrated(true);
  }, []);

  const toggle = () => {
    setOpen(prev => {
      localStorage.setItem(STORAGE_KEY, prev ? '0' : '1');
      return !prev;
    });
  };

  const acl: AclContext = {
    isAuthenticated: !!user,
    isAdmin: !!user?.isAdmin,
    kycApproved: !!wallet.kycApproved,
  };

  return (
    <Box
      component="nav"
      sx={{
        width: open ? WIDTH_OPEN : WIDTH_CLOSED,
        flexShrink: 0,
        transition: hydrated ? `width 0.28s ${EASE}` : 'none',
        borderRight: `1px solid ${C.border}`,
        bgcolor: '#FFFFFF',
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        position: 'sticky',
        top: 95, // below sticky navbar + price ticker
        height: 'calc(100vh - 95px)',
        alignSelf: 'flex-start',
        overflowX: 'hidden',
        overflowY: 'auto',
        zIndex: 1100,
      }}
    >
      {/* Collapse / expand toggle */}
      <Box sx={{ display: 'flex', justifyContent: open ? 'flex-end' : 'center', px: 1.5, py: 1 }}>
        <IconButton
          size="small"
          onClick={toggle}
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
          sx={{ color: C.slate, '&:hover': { color: C.blue, bgcolor: 'rgba(42,63,214,0.06)' } }}
        >
          <Box component="span" sx={{
            display: 'flex',
            transform: open ? 'rotate(0deg)' : 'rotate(180deg)',
            transition: `transform 0.28s ${EASE}`,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2.5" />
              <path d="M9.5 4v16" />
              <path d="M15.5 10l-2 2 2 2" />
            </svg>
          </Box>
        </IconButton>
      </Box>

      {NAV_SECTIONS.map(section => {
        const rows = section.items
          .map(item => ({ item, status: checkAcl(item.acl, acl) }))
          .filter(({ status }) => status !== 'hidden');
        if (rows.length === 0) return null;
        return (
          <Box key={section.title} sx={{ mb: 1 }}>
            <Box sx={{ height: 26, display: 'flex', alignItems: 'center', px: 2.5, overflow: 'hidden' }}>
              <Typography sx={{
                fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: C.muted, whiteSpace: 'nowrap',
                opacity: open ? 1 : 0,
                transition: `opacity 0.2s ${EASE} ${open ? '0.08s' : '0s'}`,
              }}>
                {section.title}
              </Typography>
              {!open && (
                <Box sx={{ width: '100%', height: '1px', bgcolor: C.border, mx: 0.5 }} />
              )}
            </Box>
            {rows.map(({ item, status }) => (
              <NavRow
                key={item.href}
                item={item}
                open={open}
                status={status as 'allowed' | 'locked'}
                reason={lockReason(item.acl, acl)}
              />
            ))}
          </Box>
        );
      })}
    </Box>
  );
}
