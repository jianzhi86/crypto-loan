import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES } from '@/lib/contractConfig';

const RPC_URL   = process.env.HARDHAT_RPC_URL ?? 'http://127.0.0.1:8545';
const LOAN_ADDR = CONTRACT_ADDRESSES.CryptoLoan as string;
const ZERO      = '0x0000000000000000000000000000000000000000';
const MAX_STEP  = 0.20; // matches MAX_PRICE_CHANGE in contract

const ABI = [
  'function setEthPrice(uint256 _price) external',
  'function ethPrice() view returns (uint256)',
  'function setBaseRate(uint256 rateBps) external',
  'function baseRateBps() view returns (uint256)',
];

/**
 * Derive a market-driven base rate (in BPS) from the ETH 24h price change.
 *
 * Rising ETH price signals bullish sentiment and higher borrowing demand,
 * pushing rates up. Falling price lowers demand. Formula:
 *   base = 300 bps + clamp(change%, -10, +15) * 20 bps/percent
 *
 * Examples:
 *   ETH -10% or more →  100 bps (1.0%)
 *   ETH flat (0%)    →  300 bps (3.0%)
 *   ETH +5%          →  400 bps (4.0%)
 *   ETH +15%         →  600 bps (6.0%)  ← cap
 */
function marketBaseRateBps(change24h: number): number {
  const clamped = Math.max(-10, Math.min(15, change24h));
  return Math.round(300 + clamped * 20);
}

export type SyncResult =
  | { ok: true; newPrice: number; steps: number; path: number[]; message?: string }
  | { ok: false; error: string; status: number };

/**
 * Walk the on-chain ETH price toward the live CoinGecko price in ≤20% steps
 * (the contract rejects larger single moves).
 *
 * This is a keeper operation, not a privileged decision: the target price
 * comes from CoinGecko on the server, never from the caller, so *who* triggers
 * it cannot influence *what* it does. That is what makes it safe to expose to
 * every signed-in user (see /api/sync-price) and to run automatically when the
 * dashboard notices a drift — previously only an admin could click the button,
 * so normal users just stared at a warning they were forbidden to fix.
 */
export async function syncEthPriceToMarket(): Promise<SyncResult> {
  if (!process.env.OWNER_PRIVATE_KEY) {
    return { ok: false, error: 'OWNER_PRIVATE_KEY not set in .env', status: 500 };
  }
  if (!LOAN_ADDR || LOAN_ADDR === ZERO) {
    return { ok: false, error: 'Contract not deployed — run: npm run deploy:local', status: 500 };
  }

  try {
    // ── 1. Fetch live price + 24h change ──────────────────────────────
    const cgRes = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=myr&include_24hr_change=true',
      { cache: 'no-store' },
    );
    if (!cgRes.ok) throw new Error(`CoinGecko returned ${cgRes.status} — try again shortly`);
    const cgData = await cgRes.json() as { ethereum?: { myr?: number; myr_24h_change?: number } };
    const target = Math.round(cgData.ethereum?.myr ?? 0);
    if (!target || target <= 0) throw new Error('CoinGecko returned an invalid price');
    const change24h = cgData.ethereum?.myr_24h_change ?? 0;

    // ── 2. Connect to Hardhat ──────────────────────────────────────────
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    try {
      await provider.getBlockNumber();
    } catch {
      throw new Error(`Hardhat node unreachable at ${RPC_URL} — run: npm run chain`);
    }
    const code = await provider.getCode(LOAN_ADDR);
    if (code === '0x') {
      throw new Error(`No contract at ${LOAN_ADDR} — run: npm run deploy:local`);
    }

    const signer   = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(LOAN_ADDR, ABI, signer);

    // ── 3. Walk toward the target in ≤20% steps ────────────────────────
    // The current price is re-read from the chain before EVERY step rather
    // than precomputing a path: several dashboards can trigger this at once
    // (auto-sync + a manual click, or two users), and in dev each route
    // bundle gets its own module instance, so an in-memory lock cannot fully
    // serialise them. Re-reading makes concurrent runs converge — whoever
    // runs second sees the other's progress and just finishes the remainder.
    // Each step moves 19% to stay comfortably inside the 20% contract guard.
    const path: number[] = [];
    let nonceRetries = 0;
    let converged = false;
    for (let guard = 0; guard < 40; guard++) {
      const current = Number(await (contract.ethPrice as () => Promise<bigint>)());
      if (current === target) { converged = true; break; }
      const diff = Math.abs(target - current) / current;
      const next = diff <= MAX_STEP
        ? target                                // final step can hit target exactly
        : target < current
          ? Math.round(current * 0.81)          // step down 19%
          : Math.round(current * 1.19);         // step up   19%
      try {
        const tx = await (
          contract.setEthPrice as (p: bigint) => Promise<ethers.TransactionResponse>
        )(BigInt(next));
        await tx.wait();
        path.push(next);
      } catch (e) {
        // A concurrent sync grabbed our nonce or moved the price under us.
        // Both are recoverable: pause, then loop — the fresh price read
        // decides whether anything is left to do.
        const code = (e as { code?: string }).code;
        const recoverable = code === 'NONCE_EXPIRED' || code === 'REPLACEMENT_UNDERPRICED'
          || String((e as Error).message ?? '').includes('Nonce too low')
          || String((e as Error).message ?? '').includes('Price move too large');
        if (recoverable && nonceRetries < 6) {
          nonceRetries++;
          await new Promise(r => setTimeout(r, 400));
          continue;
        }
        throw e;
      }
    }
    if (!converged) throw new Error('Sync did not converge — is another process fighting over the price?');

    // ── 4. Update market-driven base rate ─────────────────────────────
    // Runs after every price convergence so the borrow APR tracks real market
    // conditions automatically. Best-effort — failure must not abort a
    // successful price sync.
    try {
      const newRate = BigInt(marketBaseRateBps(change24h));
      const onChainRate = Number(await (contract.baseRateBps as () => Promise<bigint>)());
      if (Number(newRate) !== onChainRate) {
        const tx = await (contract.setBaseRate as (r: bigint) => Promise<ethers.TransactionResponse>)(newRate);
        await tx.wait();
      }
    } catch {
      console.warn('[price-sync] base rate update failed (non-fatal)');
    }

    return path.length === 0
      ? { ok: true, newPrice: target, steps: 0, path, message: 'Already in sync' }
      : { ok: true, newPrice: target, steps: path.length, path };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[price-sync]', msg);
    return { ok: false, error: msg, status: 500 };
  }
}

// One sync at a time. Several dashboards noticing the same drift at once (or
// auto + manual together) would race the owner nonce and interleave identical
// step sequences; instead every concurrent caller awaits the run already in
// flight and shares its result.
let inFlight: Promise<SyncResult> | null = null;

export function syncEthPriceDeduped(): Promise<SyncResult> {
  if (!inFlight) {
    inFlight = syncEthPriceToMarket().finally(() => { inFlight = null; });
  }
  return inFlight;
}
