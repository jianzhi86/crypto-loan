'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  defaultFlagMap, flagMessage, isHidden, isMaintenance, isOn,
  type FlagMap,
} from '@/lib/features';

interface FeatureCtx {
  flags: FlagMap;
  loading: boolean;
  /** Fully enabled. */
  on: (key: string) => boolean;
  /** Visible but blocked. */
  maintenance: (key: string) => boolean;
  /** Should not appear in navigation at all. */
  hidden: (key: string) => boolean;
  /** User-facing explanation for a blocked feature. */
  message: (key: string) => string;
  refresh: () => void;
}

const Ctx = createContext<FeatureCtx | null>(null);

/**
 * How often clients re-check flags, so a toggle reaches open tabs on its own.
 * Kept fairly short because this is what decides how long a user can keep using
 * a feature after an admin has paused it — the request is a small JSON read.
 */
const POLL_MS = 15_000;

export function FeatureProvider({
  initialFlags,
  children,
}: {
  /** Server-rendered snapshot, so the first paint already respects the flags
   *  and nothing flashes into view before being hidden. */
  initialFlags?: FlagMap;
  children: React.ReactNode;
}) {
  const [flags, setFlags]     = useState<FlagMap>(initialFlags ?? defaultFlagMap());
  const [loading, setLoading] = useState(!initialFlags);

  const refresh = useCallback(() => {
    fetch('/api/features', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.flags) setFlags(d.flags); })
      .catch(() => { /* keep the last known map; failing open beats a blank UI */ })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Skip the immediate fetch when the server already handed us a snapshot.
    if (!initialFlags) refresh();
    const id = setInterval(refresh, POLL_MS);
    // Catch up straight away when a backgrounded tab is focused again.
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [refresh, initialFlags]);

  const value: FeatureCtx = {
    flags,
    loading,
    on:          key => isOn(flags, key),
    maintenance: key => isMaintenance(flags, key),
    hidden:      key => isHidden(flags, key),
    message:     key => flagMessage(flags, key),
    refresh,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFeatures(): FeatureCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Fail open rather than throwing: a component rendered outside the provider
    // should still work, just without any toggles applied.
    const flags = defaultFlagMap();
    return {
      flags, loading: false,
      on: () => true, maintenance: () => false, hidden: () => false,
      message: key => flagMessage(flags, key),
      refresh: () => {},
    };
  }
  return ctx;
}

/** Convenience for a single key. */
export function useFeature(key: string) {
  const f = useFeatures();
  return {
    on: f.on(key),
    maintenance: f.maintenance(key),
    hidden: f.hidden(key),
    message: f.message(key),
  };
}
