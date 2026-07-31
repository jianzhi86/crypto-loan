import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES } from '@/lib/contractConfig';
import { requireAdmin, audit } from '@/lib/authz';

const RPC_URL   = process.env.HARDHAT_RPC_URL ?? 'http://127.0.0.1:8545';
const LOAN_ADDR = CONTRACT_ADDRESSES.CryptoLoan as string;
const ZERO      = '0x0000000000000000000000000000000000000000';
const MAX_STEP  = 0.20; // matches MAX_PRICE_CHANGE in contract

const ABI = [
  'function setEthPrice(uint256 _price) external',
  'function ethPrice() view returns (uint256)',
];

// POST /api/admin/sync-price
// Fetches live ETH/MYR and walks the on-chain price toward it in ≤20% steps.
export async function POST() {
  // Signs with the contract owner key — admin only.
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  // ── Pre-flight checks ───────────────────────────────────────────────
  if (!process.env.OWNER_PRIVATE_KEY) {
    return NextResponse.json({ error: 'OWNER_PRIVATE_KEY not set in .env' }, { status: 500 });
  }
  if (!LOAN_ADDR || LOAN_ADDR === ZERO) {
    return NextResponse.json(
      { error: 'Contract not deployed — run: npm run deploy:local' },
      { status: 500 },
    );
  }

  try {
    // ── 1. Fetch live price ────────────────────────────────────────────
    const cgRes = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=myr',
      { cache: 'no-store' },
    );
    if (!cgRes.ok) throw new Error(`CoinGecko returned ${cgRes.status} — try again shortly`);
    const cgData = await cgRes.json() as { ethereum?: { myr?: number } };
    const target = Math.round(cgData.ethereum?.myr ?? 0);
    if (!target || target <= 0) throw new Error('CoinGecko returned an invalid price');

    // ── 2. Connect to Hardhat ──────────────────────────────────────────
    const provider = new ethers.JsonRpcProvider(RPC_URL);

    // Verify the node is reachable
    try {
      await provider.getBlockNumber();
    } catch {
      throw new Error(`Hardhat node unreachable at ${RPC_URL} — run: npm run chain`);
    }

    // Verify the contract is deployed
    const code = await provider.getCode(LOAN_ADDR);
    if (code === '0x') {
      throw new Error(`No contract at ${LOAN_ADDR} — run: npm run deploy:local`);
    }

    const signer   = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(LOAN_ADDR, ABI, signer);

    // ── 3. Read current on-chain price ─────────────────────────────────
    const currentRaw = await (contract.ethPrice as () => Promise<bigint>)();
    let current = Number(currentRaw);

    if (current === target) {
      return NextResponse.json({ success: true, newPrice: target, steps: 0, message: 'Already in sync' });
    }

    // ── 4. Step toward target in ≤20% increments ──────────────────────
    // Each step moves 19% so we stay comfortably inside the 20% contract guard.
    const steps: number[] = [];
    while (true) {
      const diff = Math.abs(target - current) / current;
      if (diff <= MAX_STEP) {
        steps.push(target);  // final step can hit target exactly
        break;
      }
      const next = target < current
        ? Math.round(current * 0.81)   // step down 19%
        : Math.round(current * 1.19);  // step up   19%
      steps.push(next);
      current = next;
    }

    // ── 5. Execute each step on-chain ──────────────────────────────────
    for (const price of steps) {
      const tx = await (
        contract.setEthPrice as (p: bigint) => Promise<ethers.TransactionResponse>
      )(BigInt(price));
      await tx.wait();
    }

    await audit(guard.user, 'PRICE_SYNC', 'system', 'CryptoLoan.ethPrice', { newPrice: target, steps: steps.length });

    return NextResponse.json({
      success:  true,
      newPrice: target,
      steps:    steps.length,
      path:     steps,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/admin/sync-price]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
