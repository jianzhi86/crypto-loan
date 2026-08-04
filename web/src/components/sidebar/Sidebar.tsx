'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/lib/WalletContext';
import { useFeatures } from '@/lib/FeatureContext';
import { useViewer } from '@/lib/ViewerContext';
import { ON } from '@/lib/features';
import { isMaintenanceExempt } from '@/lib/maintenance';
import { WrenchIcon } from '@/components/Icons';
import { NAV_SECTIONS, LockIcon, type NavItem } from './navItems';
import { checkAcl, lockKind, lockReason, type AclContext } from './acl';

const WIDTH_OPEN = 232;
const WIDTH_CLOSED = 64;
const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const STORAGE_KEY = 'sidebar-open';

// Navy chrome palette — the sidebar shares the navbar's dark ground (see
// lib/theme.ts MuiAppBar), framing the light content surfaces.
const C = {
  bg:     '#0B1226',
  border: 'rgba(255,255,255,0.08)',
  blue:   '#6E8BFF',                  // active accent, brightened for dark ground
  ink:    '#F2F5FF',
  slate:  'rgba(255,255,255,0.65)',
  muted:  'rgba(255,255,255,0.35)',
};

function NavRow({ item, open, status, reason, kind, onMaintenance }: {
  item: NavItem;
  open: boolean;
  status: 'allowed' | 'locked';
  reason: string;
  kind: ReturnType<typeof lockKind>;
  onMaintenance: (item: NavItem, message: string) => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const active = item.href.includes('?')
    ? pathname === item.href.split('?')[0] &&
      searchParams.get('tab') === new URLSearchParams(item.href.split('?')[1]).get('tab')
    : pathname === item.href;
  const locked = status === 'locked';

  // A locked row is not a link, so clicking it has to do something sensible.
  // Which "something" depends on why it is locked — previously every lock sent
  // the user to /login, which for a signed-in user bounced them to the home
  // page with no explanation of why the feature was unavailable.
  const handleLockedClick = () => {
    if (kind === 'maintenance') { onMaintenance(item, reason); return; }
    if (kind === 'kyc')         { router.push('/kyc'); return; }
    router.push('/login');
  };

  const row = (
    <Box
      onClick={locked ? handleLockedClick : undefined}
      sx={{
        position: 'relative',
        display: 'flex', alignItems: 'center',
        height: 42, mx: 1, mb: 0.25, borderRadius: 2,
        pl: '12px', overflow: 'hidden', whiteSpace: 'nowrap',
        cursor: 'pointer',
        color: active ? C.blue : locked ? C.muted : C.slate,
        bgcolor: active ? 'rgba(110,139,255,0.14)' : 'transparent',
        transition: `background-color 0.15s, color 0.15s`,
        '&:hover': { bgcolor: active ? 'rgba(110,139,255,0.14)' : 'rgba(255,255,255,0.05)' },
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
  const [paused, setPaused] = useState<{ label: string; message: string } | null>(null);
  const { user, loading: authLoading, unavailable: authUnavailable } = useAuth();
  const wallet = useWallet();
  const { flags, message } = useFeatures();
  const viewer = useViewer();

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
    // A connected wallet counts as authenticated for sidebar access.
    // Wallet state is client-only — suppress it until after hydration so the
    // server and client render the same initial HTML (avoids hydration mismatch
    // where server sees kycApproved:false but client sees true after wallet connects).
    isAuthenticated: viewer.isAuthenticated || !!user || (hydrated && wallet.isConnected),
    // The server's answer wins, and the client's can only add to it. An admin
    // whose /api/auth/me call fails or answers without the cookie still gets
    // their Administration link and an unrestricted nav — losing it was how an
    // admin ended up staring at a sidebar containing nothing but Explorer.
    isAdmin: viewer.isAdmin || !!user?.isAdmin,
    kycApproved: hydrated && !!wallet.kycApproved,
    flags,
  };

  // During site-wide maintenance the exempt pages (explorer, landing) stay open,
  // so the sidebar is still on screen — and every app link in it led straight to
  // the maintenance popup. Keep the whole nav visible but locked: the layout
  // stays familiar and clicking a locked row explains the pause in place,
  // instead of the sidebar collapsing to a single item as if the rest of the
  // product had vanished.
  //
  // Only hidden once someone has *positively* answered "not an admin". The
  // server's per-document verdict settles it when it resolved; when it did not
  // (session lookup threw in the root layout), fall back to waiting for the
  // client's answer. Acting on an unknown would strip an admin's own
  // navigation, and an admin is precisely who needs to reach the switch.
  // Access itself is enforced server-side, so waiting costs nothing.
  const sessionKnown = viewer.resolved || (!authLoading && !authUnavailable);
  const siteDown = sessionKnown && !acl.isAdmin && (flags['site.maintenance']?.state ?? ON) !== ON;

  const resolve = (item: NavItem) => {
    const blockedBySite = siteDown && !isMaintenanceExempt(item.href.split('?')[0]);
    if (blockedBySite) {
      return {
        item,
        status: 'locked' as const,
        kind: 'maintenance' as const,
        reason: message('site.maintenance'),
        // Named for the whole product, since it is not this one page that is down.
        title: 'CryptoLend',
      };
    }
    return {
      item,
      status: checkAcl(item.acl, acl),
      kind: lockKind(item.acl, acl),
      reason: lockReason(item.acl, acl),
      title: item.label,
    };
  };

  return (
    <>
    <Box
      component="nav"
      // Lenis intercepts every wheel event on the page, which left this column
      // unscrollable — items past the fold were simply unreachable. This
      // attribute tells Lenis to leave wheel events over the sidebar alone so
      // its own overflow scrolling works.
      data-lenis-prevent
      sx={{
        width: open ? WIDTH_OPEN : WIDTH_CLOSED,
        flexShrink: 0,
        transition: hydrated ? `width 0.28s ${EASE}` : 'none',
        borderRight: `1px solid ${C.border}`,
        bgcolor: C.bg,
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        position: 'sticky',
        top: 95, // below sticky navbar + price ticker
        height: 'calc(100vh - 95px)',
        alignSelf: 'flex-start',
        overflowX: 'hidden',
        overflowY: 'auto',
        // Clears the browser/dev-tools badge that sits in the bottom-left
        // corner and used to cover the last nav item once scrolled to the end.
        pb: 7,
        zIndex: 1100,
        // Slim scrollbar so it does not crowd a 232px column.
        scrollbarWidth: 'thin',
        '&::-webkit-scrollbar': { width: 6 },
        '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.15)', borderRadius: 3 },
        '&::-webkit-scrollbar-thumb:hover': { bgcolor: C.muted },
      }}
    >
      {/* Collapse / expand toggle */}
      <Box sx={{ display: 'flex', justifyContent: open ? 'flex-end' : 'center', px: 1.5, py: 1 }}>
        <IconButton
          size="small"
          onClick={toggle}
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
          sx={{ color: C.slate, '&:hover': { color: C.blue, bgcolor: 'rgba(110,139,255,0.1)' } }}
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
        const rows = section.items.map(resolve).filter(({ status }) => status !== 'hidden');
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
            {rows.map(({ item, status, kind, reason, title }) => (
              <NavRow
                key={item.href}
                item={item}
                open={open}
                status={status as 'allowed' | 'locked'}
                reason={reason}
                kind={kind}
                onMaintenance={() => setPaused({ label: title, message: reason })}
              />
            ))}
          </Box>
        );
      })}
    </Box>

    {/* Explains a paused feature in place. Clicking one of these used to call
        router.push('/login'), which for a signed-in user redirected to the home
        page and looked like the app had simply thrown them out. */}
    <Dialog
      open={!!paused}
      onClose={() => setPaused(null)}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 3 } } }}
    >
      {/* The dialog sits on light paper, not the navy rail — it keeps the
          light-surface ink/slate colours rather than the sidebar's tokens. */}
      <DialogContent sx={{ textAlign: 'center', pt: 4, px: 4 }}>
        <Box sx={{
          width: 52, height: 52, mx: 'auto', mb: 2.25, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: 'rgba(110,139,255,0.07)', color: '#6E8BFF',
        }}>
          <WrenchIcon size={24} />
        </Box>
        <Typography sx={{ fontWeight: 700, fontSize: 17, color: '#F2F5FF', mb: 1 }}>
          {paused?.label} is under maintenance
        </Typography>
        <Typography sx={{ fontSize: 13.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>
          {paused?.message}
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', mt: 2.5, lineHeight: 1.6 }}>
          Sorry for the interruption — your funds and positions are unaffected, and
          this feature will come back automatically once it is switched on.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, justifyContent: 'center' }}>
        <Button
          variant="contained" disableElevation onClick={() => setPaused(null)}
          sx={{ textTransform: 'none', borderRadius: 2, px: 4 }}
        >
          Got it
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
}
