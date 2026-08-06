'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface AuthUser {
  id: string;
  email?: string | null;
  name?: string | null;
  walletAddress?: string | null;
  isAdmin?: boolean;
  /**
   * 'ACTIVE' | 'RESTRICTED' — read live from the DB, not from the JWT.
   * 'SUSPENDED' never reaches here: getSessionUser() returns null for it, so a
   * suspended account resolves to no user at all rather than a flagged one.
   */
  status?: string;
  statusReason?: string | null;
}

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  /** True when the last lookup failed for a reason other than "not signed in". */
  unavailable: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

/**
 * One session lookup, shared by the whole tree.
 *
 * Every component that needed the session used to call the hook directly, and
 * each call fetched /api/auth/me on its own — five requests per page load, five
 * independent answers. When the database got slow, some of those resolved and
 * others failed, so the navbar could show a signed-in user while the sidebar
 * simultaneously concluded nobody was signed in and locked every link. One
 * provider means one answer, and one round-trip instead of five.
 */
export function AuthProvider({
  initialUser,
  children,
}: {
  /** The server's answer for this document, so the first paint is already
   *  correct instead of "signed out, still loading". `null` is a real value
   *  here (nobody is signed in); omit the prop entirely when the server could
   *  not resolve it, which keeps the old load-then-fetch behaviour. */
  initialUser?: AuthUser | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<AuthUser | null>(initialUser ?? null);
  const [loading, setLoading] = useState(initialUser === undefined);
  const [unavailable, setUnavailable] = useState(false);

  // Held in refs so `refresh` can stay dependency-free: it is the mount
  // effect's dependency, and rebuilding it on every render would refetch in a
  // loop. Neither value changes for the life of the document.
  const serverUser = useRef<AuthUser | null | undefined>(initialUser);
  // The one transition to signed-out we can be certain about.
  const loggedOut = useRef(false);

  const refresh = useCallback(async () => {
    try {
      // Explicitly uncached. A stale 200 or 401 sitting in the browser's HTTP
      // cache would be indistinguishable from a real answer here.
      const res = await fetch('/api/auth/me', { cache: 'no-store' });

      if (res.status === 401) {
        // Normally a definite answer: there is no session. But when the server
        // rendered *this document* for a signed-in user, a 401 from the browser
        // contradicts something already established — the usual cause is the
        // request not carrying the auth cookie (a stray cookie scoped to a
        // narrower path is enough), not a session that ended in the intervening
        // milliseconds. Believing it logged people out of a page the server had
        // just authenticated: the navbar dropped its Logout button and an admin
        // lost their own navigation.
        //
        // So the server's answer stands until an explicit logout. The cost is
        // that a session revoked in another tab is not noticed until this one
        // reloads, which is the same trade already made for a failed lookup
        // below, and far less disruptive than logging out a valid session.
        if (serverUser.current && !loggedOut.current) {
          setUnavailable(false);
          return;
        }
        setUser(null);
        setUnavailable(false);
        return;
      }

      if (!res.ok) {
        // A server error is not evidence of being signed out. Keep whatever we
        // last knew rather than downgrading the viewer to anonymous — that is
        // what previously made an admin look like a stranger mid-session.
        setUnavailable(true);
        return;
      }

      const data = await res.json();
      setUser(data.user ?? null);
      setUnavailable(false);
    } catch {
      // Network failure — same reasoning as above, hold the last known state.
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Kick the first lookup off the synchronous effect body: the state updates
  // all happen inside refresh()'s promise continuations, and scheduling it in a
  // microtask keeps that obvious to both readers and the lint rule.
  useEffect(() => {
    const id = setTimeout(() => { void refresh(); }, 0);
    return () => clearTimeout(id);
  }, [refresh]);

  // Recover on its own once the backend is healthy again.
  useEffect(() => {
    if (!unavailable) return;
    const id = setTimeout(() => { void refresh(); }, 5_000);
    return () => clearTimeout(id);
  }, [unavailable, refresh]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    // Latch it: the server-rendered identity is no longer valid, and without
    // this the 401 branch above would keep resurrecting it until a full reload.
    loggedOut.current = true;
    setUser(null);
    setUnavailable(false);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, unavailable, refresh, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuthContext(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Rendered outside the provider — report "still loading" rather than
    // "signed out", so nothing draws a locked or blocked UI off a guess.
    return { user: null, loading: true, unavailable: false, refresh: async () => {}, logout: async () => {} };
  }
  return ctx;
}
