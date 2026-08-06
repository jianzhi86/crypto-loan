/**
 * Server-side read-only contract calls.
 * Uses JsonRpcProvider (no wallet, no browser) so this can run in Server Components.
 * Never throws — returns null on any failure so pages degrade gracefully.
 */

import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES, CRYPTO_LOAN_ABI, MOCK_MYR_ABI, HARDHAT_RPC_URL } from './contractConfig';

export type ChainStats = {
  aprBps:            number;
  baseRateBps:       number;
  supplyRateBps:     number;   // 38% of baseRateBps — paid to depositors
  ethPriceMYR:       number;
  totalBorrowedMYR:  number;
  totalCollateralETH:number;
  protocolFeesMYR:   number;
  paused:            boolean;
  /// Actual ETH sitting at the contract's address right now (provider.getBalance,
  /// not the totalCollateral bookkeeping variable) — the audit-grade "does the
  /// contract really hold what it claims to" figure for a treasury view. Should
  /// equal totalCollateralETH; a mismatch would mean stuck/stray ETH or a bug.
  contractEthBalanceETH: number;
  /// MYR total supply — every unit ever minted (borrows + purchases + supply-
  /// interest claims), i.e. the protocol's total outstanding liability in MYR.
  /// MockMYR mints straight to recipients rather than custodying funds, so
  /// this — not a token balanceOf(contract) — is the meaningful "company MYR
  /// balance" figure: what the protocol has issued and could be redeemed against.
  myrTotalSupplyMYR: number;
  /// Contract owner address — the wallet protocol fee withdrawals are sent to.
  ownerAddress: string;
  /// Pool cap in MYR — the ceiling borrow() enforces on protocol-wide debt.
  supplyCapMYR: number;
  /// supplyCap − totalBorrowed: MYR still lendable before borrowing is refused.
  poolAvailableMYR: number;
  /// totalBorrowed ÷ supplyCap in bps (0–10,000). This is what prices the loan
  /// book — not the old borrowed÷collateral ratio, which was never utilization.
  utilizationBps: number;
  /// The utilization slice of aprBps, in bps. Read from the contract rather than
  /// subtracted from baseRateBps here so the two can never drift apart.
  utilPremiumBps: number;
};

// One entry per (contract address, chain instance): the binary search below
// costs ~log2(height) RPC calls, and its answer never changes while the same
// chain is running the same contract.
let birthCache: { key: string; ms: number } | null = null;

/**
 * When the CURRENT CryptoLoan contract came into existence — the timestamp of
 * the block it was deployed in, found by binary-searching for the first block
 * where its address holds code. Any DB row recorded before this moment
 * belongs to a previous deployment: its transactions no longer exist on the
 * chain the app is talking to, and counting them is what used to inflate the
 * admin dashboard with hundreds of millions of "borrowed" MYR from dead test
 * runs. The CONTRACT's birth, not the chain's genesis, is the right epoch —
 * a redeploy mid-chain (FORCE_DEPLOY on a long-running node) starts a new
 * protocol without a new genesis. Null when the node is unreachable or the
 * contract isn't deployed.
 */
export async function readContractBirthMs(): Promise<number | null> {
  try {
    const provider = new ethers.JsonRpcProvider(HARDHAT_RPC_URL);
    const [genesis, latest] = await Promise.all([provider.getBlock(0), provider.getBlockNumber()]);
    const key = `${CONTRACT_ADDRESSES.CryptoLoan}:${genesis?.hash ?? ''}`;
    if (birthCache?.key === key) return birthCache.ms;

    if (await provider.getCode(CONTRACT_ADDRESSES.CryptoLoan, latest) === '0x') return null;
    let lo = 0, hi = latest;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (await provider.getCode(CONTRACT_ADDRESSES.CryptoLoan, mid) === '0x') lo = mid + 1;
      else hi = mid;
    }
    const block = await provider.getBlock(lo);
    if (!block) return null;
    const ms = Number(block.timestamp) * 1000;
    birthCache = { key, ms };
    return ms;
  } catch {
    return null;
  }
}

/** One logical transaction reconstructed from the chain's own event log. */
export interface ChainTx {
  txHash:      string;
  blockNumber: number;
  timestampMs: number;
  wallet:      string;
  type:        'Borrowed' | 'Repaid' | 'CollateralDeposited' | 'CollateralWithdrawn' | 'MYRPurchased' | 'SupplyInterestClaimed';
  /** Event units: MYR 1e6 for the MYR types, wei for the collateral types. */
  amount:      bigint;
}

const ACTIVITY_ABI = [
  'event Borrowed(address indexed user, uint256 myrAmount, uint256 newTotal)',
  'event Repaid(address indexed user, uint256 indexed loanId, uint256 principal, uint256 interest)',
  'event CollateralDeposited(address indexed user, uint256 amount)',
  'event CollateralWithdrawn(address indexed user, uint256 amount)',
  'event MYRPurchased(address indexed buyer, uint256 ethSpent, uint256 myrReceived)',
  'event SupplyInterestClaimed(address indexed user, uint256 amount)',
];

/**
 * The current deployment's complete activity, read from the CONTRACT'S OWN
 * EVENT LOG rather than the DB mirror. This exists because the Supabase DB is
 * shared across every developer's machine while each developer runs their own
 * local chain — the mirror therefore contains other chains' transactions
 * (often under the SAME Hardhat default wallet addresses), and no time- or
 * wallet-based filter can tell them apart. The chain this app is connected to
 * is the only ground truth for what happened on it. A repayMany covering
 * several loans emits several Repaid events in one transaction — they are
 * merged into one logical row (summed principal), matching how the mirror
 * records repays. Null when the node is unreachable.
 */
export async function readChainActivity(): Promise<ChainTx[] | null> {
  try {
    const provider = new ethers.JsonRpcProvider(HARDHAT_RPC_URL);
    const c = new ethers.Contract(CONTRACT_ADDRESSES.CryptoLoan, ACTIVITY_ABI, provider);
    const [borrowed, repaid, deposited, withdrawn, purchased, claimed] = await Promise.all([
      c.queryFilter(c.filters.Borrowed()),
      c.queryFilter(c.filters.Repaid()),
      c.queryFilter(c.filters.CollateralDeposited()),
      c.queryFilter(c.filters.CollateralWithdrawn()),
      c.queryFilter(c.filters.MYRPurchased()),
      c.queryFilter(c.filters.SupplyInterestClaimed()),
    ]);

    const merged = new Map<string, ChainTx>();
    const add = (e: ethers.EventLog, type: ChainTx['type'], wallet: string, amount: bigint) => {
      const key = `${e.transactionHash}:${type}`;
      const prev = merged.get(key);
      if (prev) prev.amount += amount;
      else merged.set(key, { txHash: e.transactionHash, blockNumber: e.blockNumber, timestampMs: 0, wallet, type, amount });
    };
    for (const e of borrowed  as ethers.EventLog[]) add(e, 'Borrowed',              e.args.user  as string, e.args.myrAmount   as bigint);
    for (const e of repaid    as ethers.EventLog[]) add(e, 'Repaid',                e.args.user  as string, e.args.principal   as bigint);
    for (const e of deposited as ethers.EventLog[]) add(e, 'CollateralDeposited',   e.args.user  as string, e.args.amount      as bigint);
    for (const e of withdrawn as ethers.EventLog[]) add(e, 'CollateralWithdrawn',   e.args.user  as string, e.args.amount      as bigint);
    for (const e of purchased as ethers.EventLog[]) add(e, 'MYRPurchased',          e.args.buyer as string, e.args.myrReceived as bigint);
    for (const e of claimed   as ethers.EventLog[]) add(e, 'SupplyInterestClaimed', e.args.user  as string, e.args.amount      as bigint);

    const txs = Array.from(merged.values());
    const blockNums = Array.from(new Set(txs.map(t => t.blockNumber)));
    const stamps = new Map(await Promise.all(blockNums.map(async n => {
      const b = await provider.getBlock(n);
      return [n, Number(b?.timestamp ?? 0) * 1000] as const;
    })));
    for (const t of txs) t.timestampMs = stamps.get(t.blockNumber) ?? 0;
    txs.sort((a, b) => a.blockNumber - b.blockNumber);
    return txs;
  } catch {
    return null;
  }
}

export async function readChainStats(): Promise<ChainStats | null> {
  try {
    const provider = new ethers.JsonRpcProvider(HARDHAT_RPC_URL);
    const loan = new ethers.Contract(CONTRACT_ADDRESSES.CryptoLoan, CRYPTO_LOAN_ABI, provider);
    const myr  = new ethers.Contract(CONTRACT_ADDRESSES.MockMYR, MOCK_MYR_ABI, provider);

    const [aprBps, baseRateBps, ethPrice, stats, paused, supplyRate, contractEthBalance, myrTotalSupply, owner, pool] = await Promise.all([
      loan.currentAprBps()       as Promise<bigint>,
      loan.baseRateBps()         as Promise<bigint>,
      loan.ethPrice()            as Promise<bigint>,
      loan.getProtocolStats()    as Promise<[bigint, bigint, bigint, bigint, bigint]>,
      loan.paused()              as Promise<boolean>,
      loan.supplyInterestRate().catch(() => BigInt(0)) as Promise<bigint>,
      provider.getBalance(CONTRACT_ADDRESSES.CryptoLoan),
      myr.totalSupply()          as Promise<bigint>,
      loan.owner()               as Promise<string>,
      // Tolerated separately (like supplyInterestRate above) so a contract
      // deployed before the pool cap existed degrades to zeroed pool figures
      // instead of nulling the whole stats object and blanking the admin page.
      loan.getPoolStats().catch(() => null) as Promise<[bigint, bigint, bigint, bigint, bigint, bigint] | null>,
    ]);

    return {
      aprBps:             Number(aprBps),
      baseRateBps:        Number(baseRateBps),
      supplyRateBps:      Number(supplyRate),
      ethPriceMYR:        Number(ethPrice),
      totalBorrowedMYR:   Number(stats[0]) / 1e6,
      totalCollateralETH: Number(stats[1]) / 1e18,
      protocolFeesMYR:    Number(stats[2]) / 1e6,
      paused,
      contractEthBalanceETH: Number(ethers.formatEther(contractEthBalance)),
      myrTotalSupplyMYR:  Number(myrTotalSupply) / 1e6,
      ownerAddress:       owner,
      supplyCapMYR:       pool ? Number(pool[0]) / 1e6 : 0,
      poolAvailableMYR:   pool ? Number(pool[2]) / 1e6 : 0,
      utilizationBps:     pool ? Number(pool[3])       : 0,
      utilPremiumBps:     pool ? Number(pool[4])       : 0,
    };
  } catch {
    return null;
  }
}
