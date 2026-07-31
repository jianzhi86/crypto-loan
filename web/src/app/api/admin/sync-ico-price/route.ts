import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { ICO_ADDRESSES } from '@/lib/icoConfig';
import { requireAdmin, audit } from '@/lib/authz';

const RPC_URL  = process.env.HARDHAT_RPC_URL ?? 'http://127.0.0.1:8545';
const ICO_ADDR = ICO_ADDRESSES.ICO as string;
const ZERO     = '0x0000000000000000000000000000000000000000';

const ABI = [
  'function setPrice(uint256 _price) external',
  'function price() view returns (uint256)',
];

// POST /api/admin/sync-ico-price
// Fetches live ETH/MYR and re-pegs the ICO so 1 MYR = RM 1 (price = 1e18 / rate).
export async function POST() {
  // Signs with the contract owner key — admin only.
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  if (!process.env.OWNER_PRIVATE_KEY) {
    return NextResponse.json({ error: 'OWNER_PRIVATE_KEY not set in .env' }, { status: 500 });
  }
  if (!ICO_ADDR || ICO_ADDR === ZERO) {
    return NextResponse.json({ error: 'ICO not deployed — run: npm run deploy:ico' }, { status: 500 });
  }

  try {
    // 1. Live ETH/MYR rate
    const cgRes = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=myr',
      { cache: 'no-store' },
    );
    if (!cgRes.ok) throw new Error(`CoinGecko returned ${cgRes.status} — try again shortly`);
    const cgData = await cgRes.json() as { ethereum?: { myr?: number } };
    const rate = Math.round(cgData.ethereum?.myr ?? 0);
    if (!rate || rate <= 0) throw new Error('CoinGecko returned an invalid price');

    // 2. Connect + verify node/contract
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    try { await provider.getBlockNumber(); }
    catch { throw new Error(`Hardhat node unreachable at ${RPC_URL} — run: npm run chain`); }
    if (await provider.getCode(ICO_ADDR) === '0x') {
      throw new Error(`No contract at ${ICO_ADDR} — run: npm run deploy:ico`);
    }

    // 3. Re-peg: 1 MYR = RM 1 => priceWei = 1e18 / rate
    const priceWei = ethers.parseEther('1') / BigInt(rate);
    const signer   = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(ICO_ADDR, ABI, signer);
    const tx = await (contract.setPrice as (p: bigint) => Promise<ethers.TransactionResponse>)(priceWei);
    await tx.wait();

    await audit(guard.user, 'PRICE_SYNC', 'system', 'ICO.price', { rate, priceWei: priceWei.toString() });

    return NextResponse.json({ success: true, rate, priceWei: priceWei.toString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[POST /api/admin/sync-ico-price]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
