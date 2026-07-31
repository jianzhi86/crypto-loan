// Server-only. Imported by route handlers and server components; never pull
// this into a Client Component — it reaches the database directly.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  FLAG_BY_KEY, defaultFlagMap, flagMessage, isOn,
  type FlagMap, type FlagState, ON,
} from '@/lib/features';

/**
 * Server-side flag reads.
 *
 * Flags are consulted on nearly every request, so they are cached in-process
 * for a few seconds. The TTL is short on purpose: an admin flipping a switch
 * should see it take effect almost immediately, and the cost of being a few
 * seconds stale is only that a feature stays up marginally longer.
 */
const TTL_MS = 5_000;

let cache: { map: FlagMap; at: number } | null = null;

/** Drop the cache so the next read hits the DB — called after an admin write. */
export function invalidateFlagCache(): void {
  cache = null;
}

export async function getFlags(): Promise<FlagMap> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.map;

  const map = defaultFlagMap();
  try {
    const rows = await prisma.featureFlag.findMany();
    for (const row of rows) {
      // Ignore rows whose key is no longer in the registry, and states the flag
      // does not declare — a stale row must never brick a live feature.
      const def = FLAG_BY_KEY[row.key];
      if (!def) continue;
      if (!def.states.includes(row.state as FlagState)) continue;
      map[row.key] = { state: row.state as FlagState, message: row.message ?? '' };
    }
    cache = { map, at: now };
  } catch (err) {
    // Fail open. A database blip should degrade to "everything works" rather
    // than locking every user out of the product.
    console.error('[features] read failed, defaulting all flags on', err);
  }
  return map;
}

/**
 * Guard for mutating API routes. Returns a 503 response when the feature is not
 * fully ON, or null when the call may proceed.
 *
 * Admins bypass this so they can verify a feature while it is still paused.
 */
export async function featureBlocked(key: string, opts: { isAdmin?: boolean } = {}): Promise<NextResponse | null> {
  if (opts.isAdmin) return null;
  const flags = await getFlags();
  if (isOn(flags, key)) return null;
  return NextResponse.json(
    { error: flagMessage(flags, key), code: 'FEATURE_UNAVAILABLE', feature: key },
    { status: 503 },
  );
}

/** True when the site-wide maintenance switch is engaged. */
export async function siteInMaintenance(): Promise<boolean> {
  const flags = await getFlags();
  return (flags['site.maintenance']?.state ?? ON) !== ON;
}
