import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { requireAdmin, audit } from '@/lib/authz';
import { CONTRACT_ADDRESSES } from '@/lib/contractConfig';

const RPC_URL   = process.env.HARDHAT_RPC_URL ?? 'http://127.0.0.1:8545';
const LOAN_ADDR = CONTRACT_ADDRESSES.CryptoLoan as string;
const ZERO      = '0x0000000000000000000000000000000000000000';

const ABI = [
  'function withdrawProtocolFees(address to) external',
  'function protocolFees() view returns (uint256)',
  'function owner() view returns (address)',
];

// POST /api/admin/withdraw-fees — sweep accumulated protocol fees (interest
// revenue) as MYR tokens. Body may carry `{ to: "0x…" }` to direct the sweep
// to any wallet the admin chooses (e.g. a treasury account separate from the
// owner key, since on a local chain the owner account doubles as the server
// keeper and is awkward to also use in MetaMask); it defaults to the contract
// owner when omitted. The transaction is still SIGNED by the owner key — the
// contract's onlyOwner check is untouched — and the chosen destination is
// recorded in the audit log with the caller's identity.
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let requestedTo: string | null = null;
  try {
    const body = await req.json() as { to?: string };
    if (typeof body?.to === 'string' && body.to.trim() !== '') {
      if (!ethers.isAddress(body.to.trim())) {
        return NextResponse.json({ error: 'Invalid recipient address' }, { status: 400 });
      }
      requestedTo = ethers.getAddress(body.to.trim());
    }
  } catch { /* empty body — default to the owner below */ }

  if (!process.env.OWNER_PRIVATE_KEY) {
    return NextResponse.json({ error: 'OWNER_PRIVATE_KEY not set in .env' }, { status: 500 });
  }
  if (!LOAN_ADDR || LOAN_ADDR === ZERO) {
    return NextResponse.json({ error: 'Contract not deployed — run: npm run deploy:local' }, { status: 500 });
  }

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    try {
      await provider.getBlockNumber();
    } catch {
      return NextResponse.json({ error: `Hardhat node unreachable at ${RPC_URL} — run: npm run chain` }, { status: 500 });
    }

    const signer   = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(LOAN_ADDR, ABI, signer);

    const fees = Number(await (contract.protocolFees as () => Promise<bigint>)()) / 1e6;
    if (fees <= 0) {
      return NextResponse.json({ error: 'No fees to withdraw' }, { status: 400 });
    }

    const owner = await (contract.owner as () => Promise<string>)();
    const to    = requestedTo ?? owner;
    const tx = await (contract.withdrawProtocolFees as (to: string) => Promise<ethers.TransactionResponse>)(to);
    const receipt = await tx.wait();

    await audit(guard.user, 'PROTOCOL_FEES_WITHDRAWN', 'system', 'CryptoLoan.protocolFees', {
      amountMYR: fees, to, txHash: receipt?.hash,
    });

    return NextResponse.json({ success: true, amountMYR: fees, to, txHash: receipt?.hash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin/withdraw-fees]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
