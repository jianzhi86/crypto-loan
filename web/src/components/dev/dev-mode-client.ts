'use client';

/**
 * Client-side switch for the hidden developer panel — the Android "tap the
 * build number 7 times" trick, applied to the navbar network chip.
 *
 * The unlock is pure UI convenience: it only decides whether the floating
 * panel renders. Every actual capability lives behind /api/dev, which
 * separately refuses production builds, anonymous callers, and any chain
 * that is not local Hardhat — so leaking this flag costs nothing.
 */

const KEY = 'cryptolend.devmode';
export const DEV_MODE_EVENT = 'cryptolend:devmode';

/** Taps within this window count toward the unlock; a pause resets the count. */
export const TAP_WINDOW_MS = 2000;
export const TAPS_TO_UNLOCK = 7;

export function isDevModeUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setDevModeUnlocked(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch { /* storage blocked — the event still shows the panel this session */ }
  window.dispatchEvent(new CustomEvent(DEV_MODE_EVENT, { detail: { on } }));
}
