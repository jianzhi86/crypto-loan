'use client';

import { createContext, useContext } from 'react';

/**
 * The server's verdict on who is viewing this document.
 *
 * Resolved once in the root layout by the same `getSessionUser()` that the
 * admin layout and every API route trust, then handed to the client as a plain
 * value. It does not change for the life of the document.
 *
 * This exists because the client used to re-derive "is this an admin?" from its
 * own /api/auth/me call, and the two answers could disagree — a request that
 * arrived without the auth cookie, a cached response, a slow database. When
 * they disagreed the loser was always the admin: the server rendered the admin
 * page while the client walled it behind a maintenance popup and stripped their
 * navigation, i.e. exactly the person who needs to reach the off switch was the
 * one locked out of it.
 *
 * There is no second source to disagree with now. AuthContext still owns the
 * *live* session (it has to — logging out has to take effect without a reload);
 * this is only the per-document baseline, and for maintenance the two are OR'd
 * so a client-side hiccup can never demote an admin.
 */
export interface Viewer {
  /** True when the server resolved this request to an admin account. */
  isAdmin: boolean;
  /** True when the server resolved this request to any signed-in account. */
  isAuthenticated: boolean;
  /**
   * False when the server could not answer at all — the session lookup threw
   * (a pooler with no free connections is enough). Consumers must treat that
   * as "unknown", not "signed out": the difference is an admin keeping or
   * losing their navigation over an unrelated DB blip. When this is false the
   * other two fields are placeholders, not answers.
   */
  resolved: boolean;
}

const Ctx = createContext<Viewer>({ isAdmin: false, isAuthenticated: false, resolved: false });

export function ViewerProvider({ value, children }: { value: Viewer; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useViewer(): Viewer {
  return useContext(Ctx);
}
