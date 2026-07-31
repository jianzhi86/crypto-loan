'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import MaintenanceDialog from '@/components/MaintenanceDialog';
import { useFeatures } from '@/lib/FeatureContext';
import { useAuth } from '@/hooks/useAuth';
import { useViewer } from '@/lib/ViewerContext';
import { isMaintenanceExempt } from '@/lib/maintenance';
import { ON } from '@/lib/features';

/**
 * Client-side half of the site-wide maintenance gate.
 *
 * The authoritative check lives in the root layout, but a Server Component
 * layout only runs on a full document request — Next preserves layouts across
 * client-side navigation. So a user already inside the app could keep clicking
 * around indefinitely after maintenance was switched on, and would only see the
 * popup once they hard-reloaded. This closes that window: flags are polled,
 * re-checked on every route change, and the popup is drawn over the app the
 * moment it engages.
 *
 * The server gate still matters — it decides the first paint with no flash and
 * no JavaScript. The root layout renders one or the other, never both.
 */
export default function SiteMaintenanceGate() {
  const { flags, message, refresh } = useFeatures();
  const { user, loading } = useAuth();
  const viewer = useViewer();
  const pathname = usePathname();

  // Re-check on navigation, so moving between pages picks up a switch that was
  // flipped while the user sat on one screen.
  useEffect(() => { refresh(); }, [pathname, refresh]);

  const paused = (flags['site.maintenance']?.state ?? ON) !== ON;

  if (!paused) return null;
  if (isMaintenanceExempt(pathname)) return null;

  // Admins are never covered. The server's verdict wins, and the client can
  // only *upgrade* to admin (signing in mid-document) — /api/auth/me answering
  // late, failing, or arriving without the auth cookie must never demote the
  // one person who can lift the switch.
  if (viewer.isAdmin || user?.isAdmin) return null;

  // The server settled who this is when it built the document, so a resolved
  // non-admin is covered immediately. The old fail-safe waited for the client
  // session too, which meant a broken /api/auth/me left a non-admin browsing
  // a paused app with no popup anywhere — enforcement resting on the least
  // reliable answer available.
  if (!viewer.resolved) {
    // Server verdict missing (session lookup threw). Fall back to the client,
    // and only cover the screen on a positive "signed-in non-admin".
    if (loading) return null;
    if (!user) return null;
  }

  return (
    <MaintenanceDialog
      message={message('site.maintenance')}
      explorerAvailable={(flags['page.explorer']?.state ?? ON) === ON}
      signedIn={viewer.isAuthenticated || !!user}
    />
  );
}
