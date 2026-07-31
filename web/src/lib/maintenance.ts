/**
 * Scope of the site-wide maintenance switch.
 *
 * Maintenance takes the *product* offline, not the whole origin. Some routes
 * must stay reachable no matter what:
 *
 *  - /login, /signup  — otherwise an admin who is not already signed in has no
 *    way to authenticate, and therefore no way to turn maintenance back off.
 *    That is a genuine lockout: the only remaining fix is editing the database
 *    by hand. Sign-in stays open so the switch is always reversible.
 *  - /, /home         — the public landing page. Visitors should still be able
 *    to read about the product while the app itself is paused.
 *  - /explorer        — serves only public chain data, and the maintenance
 *    screen links to it, so it would be contradictory to block it.
 *  - /admin           — the control plane, and the only place the switch can be
 *    turned off. Leaving it behind the takeover meant the kill switch depended
 *    on correctly recognising the viewer as an admin in two separate places
 *    (server layout and client overlay); either one misfiring locked the admin
 *    out of their own off switch. It is not gated on maintenance at all now —
 *    proxy.ts and the admin layout already redirect anyone who is not an admin,
 *    so exempting it costs nothing and removes a whole class of lockout.
 *
 * Everything else (dashboard, portfolio, markets, KYC, settings, ICO) is behind
 * the takeover. Admins bypass all of it — see the root layout.
 */

/** Header used to pass the request path from proxy.ts into server components. */
export const PATHNAME_HEADER = 'x-pathname';

const EXEMPT = ['/login', '/signup', '/home', '/explorer', '/admin'];

export function isMaintenanceExempt(pathname: string): boolean {
  if (pathname === '/') return true;
  return EXEMPT.some(p => pathname === p || pathname.startsWith(p + '/'));
}
