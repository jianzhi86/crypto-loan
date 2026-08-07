'use client';

/**
 * Client-side switch for the hidden developer panel — the Android "tap the
 * build number 7 times" trick, applied to the navbar network chip.
 *
 * The unlock is pure UI convenience: it only decides whether the floating
 * panel renders. Every actual capability lives behind /api/dev, which
 * separately refuses production builds, anonymous callers, and any chain
 * that is not local Hardhat — so leaking this flag costs nothing.
 *
 * DELIBERATELY IN MEMORY, not localStorage. The flag lives for exactly one
 * page lifetime: it survives client-side navigation, and any full page load
 * re-runs this module with `unlocked` back at false. That is what makes a hard
 * refresh — and signing out, which clears it explicitly — hide the panel again
 * instead of leaving a developer drawer pinned to the app forever on a machine
 * that once tapped the chip seven times.
 */

/** Legacy persisted key. Removed on load so anyone still carrying the old
 *  flag from a previous build starts locked like everybody else. */
const LEGACY_KEY = 'cryptolend.devmode';
export const DEV_MODE_EVENT = 'cryptolend:devmode';

/** Taps within this window count toward the unlock; a pause resets the count. */
export const TAP_WINDOW_MS = 2000;
export const TAPS_TO_UNLOCK = 7;

let unlocked = false;

if (typeof window !== 'undefined') {
  try { window.localStorage.removeItem(LEGACY_KEY); } catch { /* storage blocked */ }
}

export function isDevModeUnlocked(): boolean {
  return unlocked;
}

export function setDevModeUnlocked(on: boolean): void {
  if (unlocked === on) return;
  unlocked = on;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DEV_MODE_EVENT, { detail: { on } }));
  }
}
