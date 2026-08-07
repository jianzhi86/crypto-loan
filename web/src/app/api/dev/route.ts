import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { requireUser } from '@/lib/authz';
import { CONTRACT_ADDRESSES, HARDHAT_CHAIN_ID } from '@/lib/contractConfig';
import { devPanelAllowed, readDevState, writeDevState } from '@/lib/dev-mode';
import { syncEthPriceDeduped } from '@/lib/price-sync';

/**
 * Backend for the hidden developer panel (7 taps on the navbar network chip).
 *
 * GET  → chain clock, on-chain price/rates, keeper + restore-point state.
 * POST → { action: 'advance-time' | 'set-price' | 'set-apr' | 'snapshot'
 *        | 'restore' | 'keeper' | 'sync-market', ... }
 *
 * Three locks, all server-side:
 *  1. devPanelAllowed() — production builds answer 404, the route may as well
 *     not exist there.
 *  2. requireUser() — any signed-in account (normal or admin; the whole point
 *     is testing either role without re-logging), but never anonymous.
 *  3. The RPC endpoint must identify as chain 31337 — evm_* time travel and
 *     mock prices are meaningless (and dangerous) anywhere but local Hardhat.
 */

const RPC_URL   = process.env.HARDHAT_RPC_URL ?? 'http://127.0.0.1:8545';
const LOAN_ADDR = CONTRACT_ADDRESSES.CryptoLoan as string;
const ZERO      = '0x0000000000000000000000000000000000000000';
const MAX_STEP  = 0.20; // mirror of the contract's MAX_PRICE_CHANGE guard

const ABI = [
  'function ethPrice() view returns (uint256)',
  'function setEthPrice(uint256 _price) external',
  'function baseRateBps() view returns (uint256)',
  'function setBaseRate(uint256 rateBps) external',
  'function currentAprBps() view returns (uint256)',
];

type Ctx = { provider: ethers.JsonRpcProvider };

async function guard(): Promise<Ctx | NextResponse> {
  if (!devPanelAllowed()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  // cacheTimeout -1: ethers v6 caches "latest"-block-derived reads for ~250ms,
  // which on an automining chain is long enough to hand back a pre-jump
  // timestamp or a pre-transaction nonce. A dev tool wants truth, not speed.
  const provider = new ethers.JsonRpcProvider(RPC_URL, undefined, { cacheTimeout: -1 });
  let chainId: bigint;
  try {
    chainId = (await provider.getNetwork()).chainId;
  } catch {
    return NextResponse.json(
      { error: `Hardhat node unreachable at ${RPC_URL} — run: npm run chain` },
      { status: 503 },
    );
  }
  if (chainId !== BigInt(HARDHAT_CHAIN_ID)) {
    return NextResponse.json(
      { error: `Developer actions are limited to the local Hardhat chain (31337); RPC reports ${chainId}` },
      { status: 403 },
    );
  }
  return { provider };
}

function ownerContract(provider: ethers.JsonRpcProvider): ethers.Contract | NextResponse {
  if (!process.env.OWNER_PRIVATE_KEY) {
    return NextResponse.json({ error: 'OWNER_PRIVATE_KEY not set in .env' }, { status: 500 });
  }
  if (!LOAN_ADDR || LOAN_ADDR === ZERO) {
    return NextResponse.json({ error: 'Contract not deployed — run: npm run deploy:local' }, { status: 500 });
  }
  // NonceManager tracks the nonce locally across the price walk's
  // back-to-back transactions instead of re-asking the node each time.
  const signer = new ethers.NonceManager(new ethers.Wallet(process.env.OWNER_PRIVATE_KEY, provider));
  return new ethers.Contract(LOAN_ADDR, ABI, signer);
}

/** Raw RPC on purpose — immune to any provider-level block caching. */
async function chainNow(provider: ethers.JsonRpcProvider): Promise<number> {
  const block = await provider.send('eth_getBlockByNumber', ['latest', false]) as { timestamp: string };
  return parseInt(block.timestamp, 16);
}

async function status(provider: ethers.JsonRpcProvider) {
  const state = readDevState();
  const chainTime = await chainNow(provider);

  // Contract reads are best-effort — the clock and keeper state must render
  // even between a chain restart and the next deploy.
  let ethPrice: number | null = null;
  let baseRateBps: number | null = null;
  let currentAprBps: number | null = null;
  if (LOAN_ADDR && LOAN_ADDR !== ZERO) {
    const c = new ethers.Contract(LOAN_ADDR, ABI, provider);
    const [p, b, a] = await Promise.allSettled([
      (c.ethPrice as () => Promise<bigint>)(),
      (c.baseRateBps as () => Promise<bigint>)(),
      (c.currentAprBps as () => Promise<bigint>)(),
    ]);
    if (p.status === 'fulfilled') ethPrice = Number(p.value);
    if (b.status === 'fulfilled') baseRateBps = Number(b.value);
    if (a.status === 'fulfilled') currentAprBps = Number(a.value);
  }

  return {
    chainTime,
    wallTime: Math.floor(Date.now() / 1000),
    ethPrice,
    baseRateBps,
    currentAprBps,
    keeperPaused: state.keeperPaused,
    snapshot: state.snapshotId
      ? { id: state.snapshotId, at: state.snapshotAt, chainTime: state.snapshotChainTime }
      : null,
  };
}

export async function GET() {
  const ctx = await guard();
  if (ctx instanceof NextResponse) return ctx;
  try {
    return NextResponse.json(await status(ctx.provider));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/dev] status', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** evm_snapshot — the restore point for "put everything back afterwards". */
async function takeSnapshot(provider: ethers.JsonRpcProvider) {
  const id = await provider.send('evm_snapshot', []) as string;
  writeDevState({
    snapshotId: id,
    snapshotAt: Date.now(),
    snapshotChainTime: await chainNow(provider),
  });
  return id;
}

/**
 * Walk the on-chain price to an arbitrary target in ≤19% steps, same
 * re-read-before-every-step approach as price-sync.ts (concurrent runs
 * converge instead of fighting).
 */
async function walkPriceTo(contract: ethers.Contract, target: number): Promise<number[]> {
  const path: number[] = [];
  let retries = 0;
  for (let i = 0; i < 60; i++) {
    const current = Number(await (contract.ethPrice as () => Promise<bigint>)());
    if (current === target) return path;
    const diff = Math.abs(target - current) / current;
    const next = diff <= MAX_STEP
      ? target
      : target < current
        ? Math.round(current * 0.81)
        : Math.round(current * 1.19);
    try {
      const tx = await (contract.setEthPrice as (p: bigint) => Promise<ethers.TransactionResponse>)(BigInt(next));
      await tx.wait();
      path.push(next);
    } catch (e) {
      // Same recoverable set as price-sync.ts: a lost nonce race or a price
      // moved under us — pause and let the fresh re-read decide what is left.
      const code = (e as { code?: string }).code;
      const msg = String((e as Error).message ?? '');
      const recoverable = code === 'NONCE_EXPIRED' || code === 'REPLACEMENT_UNDERPRICED'
        || msg.includes('Nonce too low') || msg.includes('Price move too large');
      if (!recoverable || retries >= 6) throw e;
      retries++;
      await new Promise(r => setTimeout(r, 400));
    }
  }
  throw new Error('Price walk did not converge — is the auto-sync keeper still running?');
}

interface DevAction {
  action?: string;
  days?: number;
  price?: number;
  baseRateBps?: number;
  paused?: boolean;
}

export async function POST(req: NextRequest) {
  const ctx = await guard();
  if (ctx instanceof NextResponse) return ctx;
  const { provider } = ctx;

  let body: DevAction;
  try {
    body = await req.json() as DevAction;
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
  }

  try {
    switch (body.action) {

      case 'advance-time': {
        const days = Number(body.days);
        if (!Number.isFinite(days) || days <= 0 || days > 3650) {
          return NextResponse.json({ error: 'days must be a positive number (max 3650)' }, { status: 400 });
        }
        // First jump auto-creates the restore point, so "back to original"
        // always has an original to go back to.
        let snapshotCreated = false;
        if (!readDevState().snapshotId) {
          await takeSnapshot(provider);
          snapshotCreated = true;
        }
        await provider.send('evm_increaseTime', [Math.round(days * 24 * 3600)]);
        await provider.send('evm_mine', []);
        console.log(`[api/dev] chain clock advanced by ${days} day(s)`);
        return NextResponse.json({ ok: true, snapshotCreated, ...await status(provider) });
      }

      case 'snapshot': {
        const id = await takeSnapshot(provider);
        console.log(`[api/dev] restore point taken (${id})`);
        return NextResponse.json({ ok: true, ...await status(provider) });
      }

      case 'restore': {
        const { snapshotId } = readDevState();
        if (!snapshotId) {
          return NextResponse.json({ error: 'No restore point saved' }, { status: 400 });
        }
        const ok = await provider.send('evm_revert', [snapshotId]) as boolean;
        // A snapshot is single-use and dies with the node — either way it is
        // spent now, so forget it.
        writeDevState({ snapshotId: null, snapshotAt: null, snapshotChainTime: null });
        if (!ok) {
          return NextResponse.json(
            { error: 'Restore point no longer exists (Hardhat node restarted since it was taken?)' },
            { status: 410 },
          );
        }
        console.log('[api/dev] chain reverted to restore point');
        return NextResponse.json({ ok: true, ...await status(provider) });
      }

      case 'set-price': {
        const price = Math.round(Number(body.price));
        if (!Number.isFinite(price) || price <= 0 || price > 1_000_000_000) {
          return NextResponse.json({ error: 'price must be a positive whole RM amount' }, { status: 400 });
        }
        const contract = ownerContract(provider);
        if (contract instanceof NextResponse) return contract;
        // Pause the keeper FIRST — otherwise the next AdminAutoSync tick
        // (≤60s away) walks the price straight back to CoinGecko.
        writeDevState({ keeperPaused: true });
        const path = await walkPriceTo(contract, price);
        console.log(`[api/dev] ETH price set to RM ${price} in ${path.length} step(s); auto-sync paused`);
        return NextResponse.json({ ok: true, steps: path.length, ...await status(provider) });
      }

      case 'set-apr': {
        const bps = Math.round(Number(body.baseRateBps));
        if (!Number.isFinite(bps) || bps < 0 || bps > 1500) {
          return NextResponse.json({ error: 'baseRateBps must be between 0 and 1500 (contract cap 15%)' }, { status: 400 });
        }
        const contract = ownerContract(provider);
        if (contract instanceof NextResponse) return contract;
        // Same clobber hazard as price: the keeper rewrites the base rate
        // after every successful price sync.
        writeDevState({ keeperPaused: true });
        const tx = await (contract.setBaseRate as (r: bigint) => Promise<ethers.TransactionResponse>)(BigInt(bps));
        await tx.wait();
        console.log(`[api/dev] base rate set to ${bps} bps; auto-sync paused`);
        return NextResponse.json({ ok: true, ...await status(provider) });
      }

      case 'keeper': {
        writeDevState({ keeperPaused: !!body.paused });
        return NextResponse.json({ ok: true, ...await status(provider) });
      }

      case 'sync-market': {
        // "Back to live price": resume the keeper, then run one sync now.
        writeDevState({ keeperPaused: false });
        const result = await syncEthPriceDeduped();
        if (!result.ok) {
          return NextResponse.json({ error: result.error }, { status: result.status });
        }
        console.log(`[api/dev] price re-synced to market (RM ${result.newPrice})`);
        return NextResponse.json({ ok: true, ...await status(provider) });
      }

      default:
        return NextResponse.json({ error: `Unknown action "${body.action ?? ''}"` }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/dev]', body.action, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
