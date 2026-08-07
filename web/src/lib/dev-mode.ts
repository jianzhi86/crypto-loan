import fs from 'fs';
import path from 'path';

/**
 * Server-side state for the hidden developer panel (unlocked by tapping the
 * navbar network chip 7 times — see Navbar.tsx / components/dev/DevPanel.tsx).
 *
 * DELIBERATE CARVE-OUT from the "on-chain data is read-only in this app" rule
 * (see authz.ts): the panel exists precisely to poke the local Hardhat chain —
 * time travel, mock ETH price, base rate — without running scripts by hand.
 * Every consumer must gate on devPanelAllowed(), which is false in production
 * builds, and the API route additionally refuses any chain that is not 31337.
 *
 * State lives in a JSON file, not module memory: in dev each route bundle gets
 * its own module instance (the same reason price-sync.ts re-reads the chain
 * price every step), so an in-memory flag set by /api/dev would be invisible
 * to /api/sync-price. The file is tiny and read per-request — fine for a
 * dev-only tool.
 */

const STATE_PATH = path.join(process.cwd(), '.dev-mode.json');

export interface DevModeState {
  /** While true, syncEthPriceToMarket() no-ops so manual price/APR overrides
   *  survive the 60-second AdminAutoSync keeper instead of being clobbered. */
  keeperPaused: boolean;
  /** Hardhat evm_snapshot id — the "restore point" for time travel. */
  snapshotId: string | null;
  /** Wall-clock ms when the snapshot was taken (display only). */
  snapshotAt: number | null;
  /** block.timestamp (seconds) at the snapshot (display only). */
  snapshotChainTime: number | null;
}

const DEFAULTS: DevModeState = {
  keeperPaused: false,
  snapshotId: null,
  snapshotAt: null,
  snapshotChainTime: null,
};

/** The panel and its API exist only in dev builds, full stop. */
export function devPanelAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function readDevState(): DevModeState {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as Partial<DevModeState>;
    return { ...DEFAULTS, ...raw };
  } catch {
    // Missing or corrupt file both mean "no overrides active".
    return { ...DEFAULTS };
  }
}

export function writeDevState(patch: Partial<DevModeState>): DevModeState {
  const next = { ...readDevState(), ...patch };
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2));
  } catch (err) {
    console.error('[dev-mode] could not persist state', err);
  }
  return next;
}

/** Checked by the price keeper before every sync run. */
export function isKeeperPaused(): boolean {
  return devPanelAllowed() && readDevState().keeperPaused;
}
