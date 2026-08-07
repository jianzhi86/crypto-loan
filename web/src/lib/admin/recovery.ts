import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES } from '@/lib/contractConfig';

/**
 * Shared chain access for the admin recovery tools (/admin/recovery).
 *
 * "Recovery" is the protocol acting on a loan the borrower has not settled:
 * either the collateral no longer covers the debt (health factor < 1) or the
 * loan ran past its due date plus the 7-day grace period. Both are handled by
 * CryptoLoan.recoverLoan(), which is onlyOwner and settles the debt out of
 * collateral without any MYR changing hands — see the long comment on that
 * function for why the MYR-funded liquidate() path cannot serve here.
 */

const RPC_URL   = process.env.HARDHAT_RPC_URL ?? 'http://127.0.0.1:8545';
const LOAN_ADDR = CONTRACT_ADDRESSES.CryptoLoan as string;
const ZERO      = '0x0000000000000000000000000000000000000000';

export const RECOVERY_ABI = [
  'event Borrowed(address indexed user, uint256 myrAmount, uint256 newTotal)',
  'function ethPrice() view returns (uint256)',
  'function latePenaltyBps() view returns (uint256)',
  'function setLatePenalty(uint256 penaltyBps) external',
  'function collateralOf(address) view returns (uint256)',
  'function liquidators(address) view returns (bool)',
  'function setLiquidator(address liquidator, bool approved) external',
  'function healthFactor(address) view returns (uint256)',
  'function recoverLoan(address borrower, uint256 loanId) external returns (uint256 seized, uint256 debtCovered, uint256 penaltyCharged)',
  'function recoveryQuote(address borrower, uint256 loanId) view returns (bool recoverable, bool unhealthy, bool overdue, uint256 debt, uint256 penalty, uint256 seizeWei)',
  'function getUserLoans(address user) view returns (tuple(uint256 principal, uint256 startTime, uint256 dueDate, uint256 lastRepayTime, uint256 termDays, uint256 aprBps, uint256 baseBps, bool active)[] loansOut, uint256[] interests)',
  'event LoanRecovered(address indexed borrower, uint256 indexed loanId, uint256 collateralSeized, uint256 debtCovered, uint256 penaltyCharged, string reason)',
];

export class RecoveryUnavailable extends Error {
  constructor(message: string, readonly status = 500) {
    super(message);
    this.name = 'RecoveryUnavailable';
  }
}

/** Read-only contract handle. Throws RecoveryUnavailable with a message worth
 *  showing the admin — "node is down" and "not deployed" need different fixes. */
export async function readContract(): Promise<ethers.Contract> {
  if (!LOAN_ADDR || LOAN_ADDR === ZERO) {
    throw new RecoveryUnavailable('Contract not deployed — run: npm run deploy:local');
  }
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  try {
    await provider.getBlockNumber();
  } catch {
    throw new RecoveryUnavailable(`Blockchain node unreachable at ${RPC_URL} — run: npm run chain`, 503);
  }
  // A restarted node has no bytecode at the configured address; calling it
  // returns "0x" and surfaces as an opaque decode error much further down.
  if (await provider.getCode(LOAN_ADDR) === '0x') {
    throw new RecoveryUnavailable('No contract at the configured address — run: npm run deploy:local');
  }
  return new ethers.Contract(LOAN_ADDR, RECOVERY_ABI, provider);
}

/** Owner-signed handle for the two state-changing calls. */
export async function ownerContract(): Promise<ethers.Contract> {
  if (!process.env.OWNER_PRIVATE_KEY) {
    throw new RecoveryUnavailable('OWNER_PRIVATE_KEY not set in .env');
  }
  const read   = await readContract();
  const signer = new ethers.Wallet(process.env.OWNER_PRIVATE_KEY, read.runner as ethers.Provider);
  return read.connect(signer) as ethers.Contract;
}

export interface RecoverableLoan {
  wallet: string;
  loanId: number;
  /** MYR — principal still owed. */
  principalMYR: number;
  /** MYR — principal + accrued interest, the contract's own figure. */
  debtMYR: number;
  /** MYR — late penalty that would be charged (0 unless past grace). */
  penaltyMYR: number;
  /** ETH that recoverLoan() would actually seize right now. */
  seizeEth: number;
  /** ETH the borrower currently has posted, across all their loans. */
  collateralEth: number;
  dueDate: string;
  /** Health factor of the whole account; null when it is infinite (no debt). */
  healthFactor: number | null;
  unhealthy: boolean;
  overdue: boolean;
  /** True when the seizure cannot cover debt + penalty — the loan stays open. */
  shortfall: boolean;
}

/**
 * Every wallet that has ever borrowed on THIS deployment, from the contract's
 * own Borrowed log.
 *
 * The borrowPosition table cannot answer this. It is shared across every
 * developer's machine while each machine runs its own local chain, so it is
 * full of rows belonging to other deployments — and after a redeploy its rows
 * for this wallet are stale in the other direction, still marked REPAID or
 * LIQUIDATED from a chain that no longer exists. Asking it for "who currently
 * owes money" returned an empty list while the chain held a live loan at
 * health factor 0.90, which is exactly the gap that made the Recovery screen
 * show nothing to recover.
 */
export async function findBorrowerWallets(): Promise<string[]> {
  const c = await readContract();
  const events = await c.queryFilter(c.filters.Borrowed());
  const seen = new Set<string>();
  for (const e of events as ethers.EventLog[]) {
    const user = e.args?.user as string | undefined;
    if (user) seen.add(user.toLowerCase());
  }
  return Array.from(seen);
}

/**
 * Every loan of `wallets` that recoverLoan() would accept right now, with the
 * exact figures it would use. Both the eligibility test and the numbers come
 * from the contract's own recoveryQuote() rather than being re-derived here:
 * an admin authorising a seizure must be shown what the chain will actually do,
 * not a second implementation of the same arithmetic that can drift from it.
 */
export async function findRecoverable(wallets: string[]): Promise<RecoverableLoan[]> {
  const c = await readContract();
  const out: RecoverableLoan[] = [];

  for (const wallet of wallets) {
    let loans: readonly { dueDate: bigint; principal: bigint; active: boolean }[];
    try {
      [loans] = await (c.getUserLoans as (w: string) => Promise<[
        { dueDate: bigint; principal: bigint; active: boolean }[], bigint[],
      ]>)(wallet);
    } catch {
      continue; // never borrowed, or an address the chain does not know
    }
    if (loans.length === 0) continue;

    const [potWei, hfRaw] = await Promise.all([
      (c.collateralOf as (w: string) => Promise<bigint>)(wallet),
      (c.healthFactor as (w: string) => Promise<bigint>)(wallet),
    ]);
    const MAX_U = BigInt('0x' + 'f'.repeat(64));

    for (let loanId = 0; loanId < loans.length; loanId++) {
      if (!loans[loanId].active) continue;
      let q: [boolean, boolean, boolean, bigint, bigint, bigint];
      try {
        q = await (c.recoveryQuote as (w: string, id: bigint) => Promise<
          [boolean, boolean, boolean, bigint, bigint, bigint]
        >)(wallet, BigInt(loanId));
      } catch {
        continue;
      }
      const [recoverable, unhealthy, overdue, debt, penalty, seizeWei] = q;
      if (!recoverable) continue;

      const seizeEth  = Number(ethers.formatEther(seizeWei));
      const wantedWei = seizeWei;
      out.push({
        wallet,
        loanId,
        principalMYR: Number(loans[loanId].principal) / 1e6,
        debtMYR:      Number(debt) / 1e6,
        penaltyMYR:   Number(penalty) / 1e6,
        seizeEth,
        collateralEth: Number(ethers.formatEther(potWei)),
        dueDate: new Date(Number(loans[loanId].dueDate) * 1000).toISOString(),
        healthFactor: hfRaw === MAX_U ? null : Number(hfRaw) / 1e18,
        unhealthy,
        overdue,
        // The quote caps at the pot, so hitting the cap means the seizure
        // cannot cover debt + penalty and the loan will survive it.
        shortfall: wantedWei >= potWei && potWei > BigInt(0),
      });
    }
  }
  return out;
}
