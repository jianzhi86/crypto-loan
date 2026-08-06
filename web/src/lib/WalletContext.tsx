'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { ethers } from 'ethers';
import { useAuthContext } from '@/lib/AuthContext';
import Backdrop from '@mui/material/Backdrop';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import {
  CONTRACT_ADDRESSES,
  CRYPTO_LOAN_ABI,
  MOCK_MYR_ABI,
  HARDHAT_CHAIN_ID,
  HARDHAT_RPC_URL,
} from './contractConfig';

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

export type TxStatus = 'idle' | 'pending' | 'success' | 'error';

// A completed action's receipt — everything the user needs to reference the
// transaction later: what happened, the exact amounts, and the on-chain hash.
export interface TxReceipt {
  action: 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'buy';
  title: string;
  amountLabel: string;
  lines: { label: string; value: string }[];
  txHash: string;
  timestamp: number;
}

/// One on-chain loan (array index on the contract = loanId). Every borrow is
/// its own fixed-term loan with its own locked APR, due date and interest
/// clock — this mirrors CryptoLoan's Loan struct plus its live interest.
export interface ChainLoan {
  loanId: number;
  principal: bigint;      // MYR units still owed
  startTime: bigint;      // unix seconds
  dueDate: bigint;        // unix seconds — startTime + term
  lastRepayTime: bigint;  // THIS loan's interest clock
  termDays: number;       // 30 / 90 / 180 / 365
  aprBps: number;         // locked at borrow — fixed for the loan's life
  active: boolean;
  interest: bigint;       // contract's accrued figure (stale between blocks on Hardhat)
}

export interface LoanInfo {
  collateral: bigint;
  borrowed: bigint;
  healthFactor: number;
  available: bigint;
  collateralValueMYR: number;
  accruedInterest: bigint;
  startTime: bigint;
  /// Unix seconds of the most recent repayment across active loans — kept for
  /// aggregate displays; per-loan clocks live on each ChainLoan.
  lastRepayTime: bigint;
  ltv: number;
  isLiquidatable: boolean;
  /// The full per-loan book (index-aligned with on-chain loanIds, inactive
  /// loans included). Everything per-plan in the UI reads THIS, never the
  /// aggregates above.
  loans: ChainLoan[];
}

export interface WalletState {
  address: string | null;
  isConnected: boolean;
  isCorrectNetwork: boolean;
  isDeployed: boolean;
  chainId: number | null;
  ethBalance: string;
  myrBalance: string;
  loanInfo: LoanInfo | null;
  ethPriceMYR: number;
  // Effective verification of the signed-in ACCOUNT (mirrors kycApprovedDb).
  // Deliberately not derived from the connected wallet or the on-chain flag:
  // Hardhat reuses the same test accounts, so keying off the wallet let a
  // brand-new sign-up inherit a stranger's verification the moment MetaMask
  // auto-connected a previously approved address.
  kycApproved: boolean;
  // Account-side KYC approval (GET /api/kyc, resolved from the session cookie).
  kycApprovedDb: boolean;
  // Raw on-chain KYC flag for the CONNECTED wallet (loan.kycApproved). Only
  // used to detect a DB↔chain mismatch after a redeploy so it can be resynced;
  // never shown to the user as "verified".
  kycApprovedChain: boolean;
  // Granular account status: 'none' = no submission, 'pending' = awaiting admin review, 'approved' = verified.
  kycStatus: 'none' | 'pending' | 'approved';
  // The wallet the account's KYC is anchored to (lowercase), once known.
  // Borrowing only works when this wallet is the connected one.
  kycWallet: string | null;
  // True once the first /api/kyc check for this session has resolved.
  // Guards the KYC dialog so it never fires before we know the real status.
  kycDbChecked: boolean;
  // Whether the current MockMYR token has already been imported into MetaMask
  // for this account (remembered locally). Lets the UI hide the "Add MYR" button.
  myrTokenAdded: boolean;
  isRefreshing: boolean;
  // Epoch ms when the last position refresh STARTED, whatever triggered it
  // (keep-fresh poll, Repay-tab open, post-transaction). The poll schedules
  // the next auto-refresh 60 s after this, so every refresh source shares one
  // cadence and UI countdowns derived from it stay in phase with the actual
  // chain read.
  lastRefreshAt: number;
  isConnecting: boolean;
  txStatus: TxStatus;
  txMessage: string;
  txStep: number;
  txTotalSteps: number;
  lastReceipt: TxReceipt | null;
  // Yield system (requires redeployed contract)
  /**
   * The contract's baseRateBps. Display it *labelled* "base rate" and nothing
   * else — never compute money from it. See currentAprBps.
   */
  borrowAprBps: number;
  /**
   * THE rate: currentAprBps() = base + utilization premium, clamped. Every
   * interest projection, ledger accrual and payoff quote must come from this,
   * because it is exactly what accruedInterest() charges. Quoting anything else
   * is what used to leave sen of principal behind on a "full" repayment.
   */
  currentAprBps: number;
  supplyAprBps: number;
  /**
   * totalBorrowed ÷ supplyCap, 0–1 — read from the contract's utilizationBps().
   * Formerly borrowed ÷ collateral, which is a collateralisation ratio and had
   * no bearing on the rate.
   */
  utilizationRate: number;
  /** Pool ceiling in MYR (contract supplyCap). */
  supplyCapMYR: number;
  /** MYR still lendable before borrow() refuses. */
  poolAvailableMYR: number;
  /** Protocol-wide outstanding debt in MYR. */
  protocolBorrowedMYR: number;
  /** Protocol-wide collateral in ETH. */
  protocolCollateralETH: number;
  pendingYieldMYR: number;
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const LOAN_ADDR = CONTRACT_ADDRESSES.CryptoLoan as string;

// Mirrors LINK_MESSAGE in app/api/wallet/link/route.ts — keep in sync.
const LINK_MESSAGE = (nonce: string) => `Link this wallet to CryptoLend\nNonce: ${nonce}`;

const INIT: WalletState = {
  address: null, isConnected: false, isCorrectNetwork: false,
  isDeployed: LOAN_ADDR !== ZERO_ADDR,
  chainId: null, ethBalance: '0', myrBalance: '0',
  loanInfo: null, ethPriceMYR: 18000,
  kycApproved: false,
  kycApprovedDb: false,
  kycApprovedChain: false,
  kycStatus: 'none',
  kycWallet: null,
  kycDbChecked: false,
  myrTokenAdded: false,
  isRefreshing: false,
  lastRefreshAt: 0,
  isConnecting: false,
  txStatus: 'idle', txMessage: '',
  txStep: 1, txTotalSteps: 1,
  lastReceipt: null,
  borrowAprBps: 300, currentAprBps: 300, supplyAprBps: 0, utilizationRate: 0,
  supplyCapMYR: 0, poolAvailableMYR: 0, protocolBorrowedMYR: 0, protocolCollateralETH: 0,
  pendingYieldMYR: 0,
};

const HN_PARAMS = {
  chainId: '0x7A69',
  chainName: 'Hardhat Local',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: [HARDHAT_RPC_URL],
};

// ── Last-known position cache ────────────────────────────────────────────────
// The position is authoritative on-chain, but caching it per-address lets the UI
// remember a user's collateral/borrowed across a disconnect or reload and show it
// instantly on reconnect (the chain read then refreshes it). Keyed by address so
// switching accounts never mixes positions.
const LS_KEY = (addr: string) => `cryptolend:loan:${addr.toLowerCase()}`;

interface CachedPosition {
  info: LoanInfo;
  ethBalance: string;
  myrBalance: string;
  ethPriceMYR: number;
  savedAt: number;
}

function cachePosition(addr: string, p: Omit<CachedPosition, 'savedAt'>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY(addr), JSON.stringify({
      info: {
        collateral:         p.info.collateral.toString(),
        borrowed:           p.info.borrowed.toString(),
        available:          p.info.available.toString(),
        accruedInterest:    p.info.accruedInterest.toString(),
        startTime:          p.info.startTime.toString(),
        lastRepayTime:      p.info.lastRepayTime.toString(),
        healthFactor:       p.info.healthFactor === Infinity ? 'Infinity' : p.info.healthFactor,
        collateralValueMYR: p.info.collateralValueMYR,
        ltv:                p.info.ltv,
        isLiquidatable:     p.info.isLiquidatable,
        loans: p.info.loans.map(l => ({
          loanId:        l.loanId,
          principal:     l.principal.toString(),
          startTime:     l.startTime.toString(),
          dueDate:       l.dueDate.toString(),
          lastRepayTime: l.lastRepayTime.toString(),
          termDays:      l.termDays,
          aprBps:        l.aprBps,
          active:        l.active,
          interest:      l.interest.toString(),
        })),
      },
      ethBalance: p.ethBalance,
      myrBalance: p.myrBalance,
      ethPriceMYR: p.ethPriceMYR,
      savedAt: Date.now(),
    }));
  } catch { /* storage full / unavailable */ }
}

function readCachedPosition(addr: string): CachedPosition | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_KEY(addr));
    if (!raw) return null;
    const d = JSON.parse(raw);
    interface CachedLoan {
      loanId: number; principal: string; startTime: string; dueDate: string;
      lastRepayTime: string; termDays: number; aprBps: number; active: boolean; interest: string;
    }
    return {
      info: {
        collateral:         BigInt(d.info.collateral),
        borrowed:           BigInt(d.info.borrowed),
        available:          BigInt(d.info.available),
        accruedInterest:    BigInt(d.info.accruedInterest),
        startTime:          BigInt(d.info.startTime),
        // Falls back to startTime for cache entries written before this field.
        lastRepayTime:      BigInt(d.info.lastRepayTime ?? d.info.startTime ?? 0),
        healthFactor:       d.info.healthFactor === 'Infinity' ? Infinity : Number(d.info.healthFactor),
        collateralValueMYR: Number(d.info.collateralValueMYR),
        ltv:                Number(d.info.ltv),
        isLiquidatable:     Boolean(d.info.isLiquidatable),
        loans: Array.isArray(d.info.loans)
          ? (d.info.loans as CachedLoan[]).map(l => ({
              loanId:        Number(l.loanId),
              principal:     BigInt(l.principal),
              startTime:     BigInt(l.startTime),
              dueDate:       BigInt(l.dueDate),
              lastRepayTime: BigInt(l.lastRepayTime),
              termDays:      Number(l.termDays),
              aprBps:        Number(l.aprBps),
              active:        Boolean(l.active),
              interest:      BigInt(l.interest),
            }))
          : [],
      },
      ethBalance: d.ethBalance ?? '0',
      myrBalance: d.myrBalance ?? '0',
      ethPriceMYR: Number(d.ethPriceMYR) || 18000,
      savedAt: Number(d.savedAt) || 0,
    };
  } catch { return null; }
}

// ── "MYR token imported" memory ──────────────────────────────────────────────
// MetaMask offers no way to query which tokens an account has imported, so we
// remember locally that we've added MYR for a given (account, token-address)
// pair. Keying on the token address means a redeploy to a new MockMYR address
// correctly resets it — the new token genuinely needs importing.
const MYR_ADDED_KEY = (addr: string) =>
  `cryptolend:myradded:${addr.toLowerCase()}:${CONTRACT_ADDRESSES.MockMYR.toLowerCase()}`;

function readMyrAdded(addr: string): boolean {
  if (typeof window === 'undefined' || !addr) return false;
  try { return localStorage.getItem(MYR_ADDED_KEY(addr)) === '1'; } catch { return false; }
}

function writeMyrAdded(addr: string) {
  if (typeof window === 'undefined' || !addr) return;
  try { localStorage.setItem(MYR_ADDED_KEY(addr), '1'); } catch { /* unavailable */ }
}

// Depth-first collection of every string-valued message/reason/data field in
// an ethers/MetaMask error, however deeply it's nested — different provider
// versions wrap the underlying node rejection at different depths (top-level
// .reason, .info.error.message, .info.error.data.message, .error.error.message,
// .cause.message…), and a shallow fixed-path read misses whichever one a given
// version actually used.
function collectErrorStrings(v: unknown, depth = 0, out: string[] = []): string[] {
  if (v == null || depth > 6) return out;
  if (typeof v === 'string') { out.push(v); return out; }
  if (typeof v === 'object') {
    for (const key of ['reason', 'shortMessage', 'message', 'data', 'error', 'info', 'cause']) {
      const child: unknown = (v as Record<string, unknown>)[key];
      if (child !== undefined && child !== v) collectErrorStrings(child, depth + 1, out);
    }
  }
  return out;
}

// Pull a human-readable revert reason out of an ethers v6 error so the UI can
// show *why* a transaction failed (e.g. "KYC required") instead of a guess.
function revertReason(err: unknown): string | null {
  const e = err as {
    reason?: string; shortMessage?: string;
    info?: { error?: { message?: string } };
    data?: { message?: string };
  };
  const raw = e?.reason || e?.info?.error?.message || e?.shortMessage || e?.data?.message;
  if (!raw) return null;
  // A restarted Hardhat node resets every account's nonce to 0, but MetaMask
  // keeps signing with its cached higher nonce — the rejection this causes
  // gets buried at different nesting depths depending on the provider version,
  // and its actual wording ranges from "Nonce too high" / "could not coalesce
  // error" to MetaMask's own generic "Internal JSON-RPC error". Search the
  // whole error tree for the specific nonce wording rather than trusting one
  // fixed-depth field, so the fix only shows when we've actually found that
  // signal — not merely because the top-level message happened to be vague.
  const all = collectErrorStrings(e).join(' | ');
  // "Too HIGH" and "too LOW" are opposite faults with opposite remedies, and
  // collapsing them into one message sent people down the wrong path.
  //
  //   too HIGH → MetaMask is AHEAD of the node: the chain was restarted and
  //              reset every nonce, but MetaMask kept its cached counter.
  //   too LOW  → MetaMask is BEHIND the node: something else already sent a
  //              transaction from this same account. On this project that
  //              "something else" is the server keeper, which signs
  //              setEthPrice/setKYC/withdrawProtocolFees with OWNER_PRIVATE_KEY
  //              — Hardhat account #0. If you imported that same account into
  //              MetaMask, the server silently advances the nonce underneath
  //              you and clearing the cache only helps until the next keeper
  //              tick. The durable fix is to use a different account.
  if (/nonce too low/i.test(all)) {
    return 'MetaMask is behind this account\'s on-chain nonce — another signer already sent a transaction from it. '
      + 'The server keeper signs with Hardhat account #0 (OWNER_PRIVATE_KEY), so if that is the account you imported, '
      + 'switch MetaMask to a different account (#1 or later). To recover now: Settings → Advanced → "Clear activity tab data"';
  }
  if (/nonce too high|could not coalesce/i.test(all)) {
    return 'the local chain was restarted. In MetaMask: Settings → Advanced → "Clear activity tab data", then retry';
  }
  // Strip ethers' "execution reverted: " / "...: reverted: " prefixes.
  const m = raw.match(/reverted(?: with reason string)?:?\s*"?([^"]+)"?/i);
  const reason = (m?.[1] ?? raw).trim();
  // A bare, undecoded "Internal JSON-RPC error" says nothing on its own — but
  // on this local dev chain (restarted often during testing) a stale MetaMask
  // nonce cache is by far the most common cause even when its wording didn't
  // match the specific patterns above. Hedge rather than assert: name the
  // likely fix but don't claim it as fact, and keep the raw text for anyone
  // who wants to check the console themselves.
  if (/^internal json-rpc error\.?$/i.test(reason)) {
    return `${reason} — if this just started happening after restarting the local chain, try MetaMask: Settings → Advanced → "Clear activity tab data", then retry`;
  }
  return reason;
}

/** One loan's share of a repayment — what the dashboard hands to repay(). */
export interface RepayItem {
  /** On-chain loan index. */
  loanId: number;
  /** MYR to apply to this loan (decimal string, e.g. "1234.56"). */
  amount: string;
  /** DB ledger row backing this loan, if one exists — settled after confirm. */
  rowId?: string;
}

interface WalletCtx extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Silent restore — no-op unless the account's linked wallet is MetaMask's active account. */
  tryAutoConnect: (linkedWallet?: string | null) => Promise<void>;
  switchToHardhat: () => Promise<void>;
  depositCollateral: (eth: string) => Promise<void>;
  borrow: (myr: string, opts?: { termMonths?: number }) => Promise<boolean>;
  buyMYR: (myr: string) => Promise<boolean>;
  /**
   * Repay one or more loans in a single approve + repayMany transaction.
   * Each item is scoped to ITS loan: that loan's interest is paid first, then
   * its principal — other loans are never touched. With `settleFull`, every
   * listed loan is meant to be cleared entirely, so each amount is re-quoted
   * from the contract (with day-boundary headroom) at confirm time; the
   * contract caps per-loan at the real due, so over-quoting never overcharges.
   */
  repay: (items: RepayItem[], opts?: { settleFull?: boolean }) => Promise<void>;
  withdrawCollateral: (eth: string) => Promise<void>;
  claimSupplyInterest: () => Promise<void>;
  addTokenToWallet: () => Promise<void>;
  refresh: () => Promise<void>;
  clearTx: () => void;
  clearReceipt: () => void;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<WalletState>(INIT);
  // The signed-in account, for gating silent wallet restore to its linked
  // wallet. WalletProvider sits inside AuthProvider (see the root layout).
  const { user: authUser, loading: authLoading, refresh: refreshAuth } = useAuthContext();

  // Admins operate the platform — every feature is open to them without a KYC
  // submission. Kept in a ref so refresh() (whose deps don't include the
  // session) always sees the current value.
  const isAdminRef = useRef(false);
  useEffect(() => { isAdminRef.current = !!authUser?.isAdmin; }, [authUser?.isAdmin]);

  const getProvider = useCallback(() => {
    if (typeof window === 'undefined' || !window.ethereum) return null;
    return new ethers.BrowserProvider(window.ethereum);
  }, []);

  const getContracts = useCallback(async (signed: boolean) => {
    if (LOAN_ADDR === ZERO_ADDR) return null;
    const provider = getProvider();
    if (!provider) return null;
    const runner = signed ? await provider.getSigner() : provider;
    return {
      loan: new ethers.Contract(CONTRACT_ADDRESSES.CryptoLoan, CRYPTO_LOAN_ABI, runner),
      myr:  new ethers.Contract(CONTRACT_ADDRESSES.MockMYR,    MOCK_MYR_ABI,    runner),
    };
  }, [getProvider]);

  const setTx = (status: TxStatus, msg: string, step = 1, totalSteps = 1) =>
    setS(p => ({ ...p, txStatus: status, txMessage: msg, txStep: step, txTotalSteps: totalSteps }));

  const setReceipt = (r: Omit<TxReceipt, 'timestamp'>) =>
    setS(p => ({ ...p, lastReceipt: { ...r, timestamp: Date.now() } }));

  // Every state-changing operation runs through the account's LINKED wallet.
  // The "connected" MetaMask session is an internal detail the user never
  // manages — this check surfaces it only at the moment they attempt an
  // operation, with the one action that fixes it.
  const guardTx = useCallback((): boolean => {
    const linked = authUser?.walletAddress?.toLowerCase() ?? null;
    if (!linked) {
      setTx('error', 'No wallet is linked to your account. Link your MetaMask wallet in Settings first.');
      return false;
    }
    if (!s.address) {
      setTx('error', 'MetaMask is not connected. Open MetaMask, connect your linked wallet, then try again.');
      return false;
    }
    if (s.address.toLowerCase() !== linked) {
      setTx('error', `Wrong MetaMask account selected. Switch to your linked wallet ${linked.slice(0, 6)}…${linked.slice(-4)} and try again.`);
      return false;
    }
    return true;
  }, [authUser?.walletAddress, s.address]);

  const saveTxToDB = (wallet: string, type: string, amount: string, receipt: ethers.TransactionReceipt) => {
    fetch('/api/loan-tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet, type, amount, txHash: receipt.hash, blockNumber: receipt.blockNumber }),
    }).catch(() => {});
  };

  const refresh = useCallback(async (address: string) => {
    const provider = getProvider();
    if (!provider || !address || LOAN_ADDR === ZERO_ADDR) return;
    setS(p => ({ ...p, isRefreshing: true, lastRefreshAt: Date.now() }));
    try {
      const c = await getContracts(false);
      if (!c) { setS(p => ({ ...p, isRefreshing: false })); return; }
      // Verify a contract is actually deployed at the configured address on this
      // network — a fresh/restarted Hardhat node has no bytecode there, and calling
      // it would return "0x" and throw a BAD_DATA decode error.
      const code = await provider.getCode(LOAN_ADDR);
      if (code === '0x') {
        setS(p => ({ ...p, isDeployed: false, isRefreshing: false }));
        return;
      }
      const [ethBal, myrBal, info, price, kyc, userLoansRaw] = await Promise.all([
        provider.getBalance(address),
        c.myr.balanceOf(address),
        c.loan.getLoanInfo(address),
        c.loan.ethPrice(),
        c.loan.kycApproved(address),
        c.loan.getUserLoans(address),
      ]);
      const MAX_U = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
      const hfRaw = info[2] as bigint;
      const hf = hfRaw === MAX_U ? Infinity : Number(hfRaw) / 1e18;
      // getUserLoans returns (Loan[] loansOut, uint256[] interests), index = loanId.
      const [loansRaw, interestsRaw] = userLoansRaw as unknown as [
        { principal: bigint; startTime: bigint; dueDate: bigint; lastRepayTime: bigint; termDays: bigint; aprBps: bigint; active: boolean }[],
        bigint[],
      ];
      const loans: ChainLoan[] = loansRaw.map((l, i) => ({
        loanId:        i,
        principal:     l.principal,
        startTime:     l.startTime,
        dueDate:       l.dueDate,
        lastRepayTime: l.lastRepayTime,
        termDays:      Number(l.termDays),
        aprBps:        Number(l.aprBps),
        active:        l.active,
        interest:      interestsRaw[i] ?? BigInt(0),
      }));
      const activeLoans = loans.filter(l => l.active);
      const loanInfo: LoanInfo = {
        collateral:         info[0] as bigint,
        borrowed:           info[1] as bigint,
        healthFactor:       hf,
        available:          info[3] as bigint,
        collateralValueMYR: Number(info[4] as bigint),
        accruedInterest:    info[5] as bigint,
        startTime:          activeLoans.length ? activeLoans.reduce((m, l) => l.startTime < m ? l.startTime : m, activeLoans[0].startTime) : BigInt(0),
        lastRepayTime:      activeLoans.length ? activeLoans.reduce((m, l) => l.lastRepayTime > m ? l.lastRepayTime : m, BigInt(0)) : BigInt(0),
        ltv:                Number(info[6] as bigint),
        isLiquidatable:     info[7] as boolean,
        loans,
      };
      const ethBalance = parseFloat(ethers.formatEther(ethBal)).toFixed(4);
      const myrBalance = (Number(myrBal) / 1e6).toFixed(2);
      const ethPriceMYR = Number(price as bigint);
      // Optional calls — only exist on the current contract version.
      // Promise.allSettled so a missing function never crashes the whole refresh.
      const [aprLiveResult, dynAprResult, protStatsResult, supplyIntResult, poolResult] = await Promise.allSettled([
        Promise.resolve().then(() => c.loan.baseRateBps()),
        Promise.resolve().then(() => c.loan.currentAprBps()),
        Promise.resolve().then(() => c.loan.getProtocolStats()),
        Promise.resolve().then(() => c.loan.accruedSupplyInterest(address)),
        Promise.resolve().then(() => c.loan.getPoolStats()),
      ]);
      const aprBps    = aprLiveResult.status   === 'fulfilled' ? aprLiveResult.value : BigInt(300);
      const dynApr    = dynAprResult.status    === 'fulfilled' ? dynAprResult.value  : aprBps;
      const protStats = protStatsResult.status === 'fulfilled' ? protStatsResult.value : [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)];
      const borrowAprBps  = Number(aprBps as bigint);
      const currentAprBps = Number(dynApr as bigint);
      const ps = protStats as [bigint, bigint, bigint, bigint, bigint];
      // Utilization is borrowed ÷ POOL CAP — the same quantity currentAprBps()
      // prices off. It used to be borrowed ÷ collateral value, which is a
      // collateralisation ratio and never moved the rate at all.
      const pool = poolResult.status === 'fulfilled'
        ? poolResult.value as [bigint, bigint, bigint, bigint, bigint, bigint]
        : null;
      const supplyCapMYR          = pool ? Number(pool[0]) / 1e6   : 0;
      const poolAvailableMYR      = pool ? Number(pool[2]) / 1e6   : 0;
      const utilizationRate       = pool ? Number(pool[3]) / 10000 : 0;
      const protocolBorrowedMYR   = Number(ps[0]) / 1e6;
      const protocolCollateralETH = Number(ps[1]) / 1e18;
      // Mirrors the contract's supplyInterestRate() = currentAprBps() * 38 / 100
      // — off the EFFECTIVE rate (base + utilization premium), so depositor
      // yield tracks the same market conditions borrowers are paying for.
      const supplyAprBps       = Math.round(currentAprBps * 38 / 100);
      const pendingYieldMYR    = supplyIntResult.status === 'fulfilled' ? Number(supplyIntResult.value as bigint) / 1e6 : 0;
      // Remember this position so it survives a disconnect / reload.
      cachePosition(address, { info: loanInfo, ethBalance, myrBalance, ethPriceMYR });
      setS(p => ({
        ...p,
        ethBalance,
        myrBalance,
        loanInfo,
        ethPriceMYR,
        borrowAprBps,
        currentAprBps,
        supplyAprBps,
        utilizationRate,
        supplyCapMYR,
        poolAvailableMYR,
        protocolBorrowedMYR,
        protocolCollateralETH,
        pendingYieldMYR,
        // Verification stays account-based: the on-chain flag is recorded for
        // resync detection but never upgrades the badge. The connected wallet
        // being chain-approved proves nothing about the signed-in account —
        // on shared Hardhat test accounts it is usually someone else's.
        // Admins bypass KYC entirely.
        kycApproved: p.kycApprovedDb || isAdminRef.current,
        kycApprovedChain: kyc as boolean,
        isDeployed: true,
        isRefreshing: false,
      }));
    } catch (e) {
      const msg = String((e as { message?: string }).message ?? '');
      if (msg.includes('Failed to fetch') || msg.includes('ECONNREFUSED') || msg.includes('could not coalesce')) {
        // Hardhat node not running — quietly mark as not deployed so the UI shows the warning banner.
        setS(p => ({ ...p, isDeployed: false, isRefreshing: false }));
      } else {
        console.error('refresh', e);
        setS(p => ({ ...p, isRefreshing: false }));
      }
    }
  }, [getProvider, getContracts]);

  // Guards against re-attempting an on-chain KYC re-sync in a loop for the same
  // wallet (one in-flight attempt per address).
  const resyncingKyc = useRef<string | null>(null);

  // DB says approved but the contract doesn't (e.g. after a redeploy that wiped
  // on-chain state). Ask the server — which holds the owner key — to re-set the
  // on-chain flag, then refresh so borrow/repay unlock.
  const resyncKyc = useCallback(async (address: string) => {
    if (resyncingKyc.current === address.toLowerCase()) return;
    resyncingKyc.current = address.toLowerCase();
    try {
      // Self-service: the server checks the caller's own DB approval and sets
      // the on-chain flag for their linked wallet — no admin auth needed.
      const r = await fetch('/api/kyc/self-resync', { method: 'POST' });
      if (r.ok) await refresh(address);
    } catch (e) {
      console.error('resyncKyc', e);
    } finally {
      resyncingKyc.current = null;
    }
  }, [refresh]);

  /**
   * Connect = claim. There is no user-facing "connected but not linked"
   * state: pressing Connect opens MetaMask's account picker, and the chosen
   * wallet is immediately checked and — if free — linked to the signed-in
   * account with a one-time ownership signature (the server grants on-chain
   * KYC for approved accounts and admins in the same call). A wallet that
   * belongs to another account is rejected on the spot with a clear message.
   * If the account already has its wallet, Connect only accepts that wallet
   * and tells the user to switch when MetaMask has a different one selected.
   */
  const connect = useCallback(async () => {
    if (!window.ethereum) { alert('MetaMask not found. Install it from metamask.io'); return; }
    setS(p => ({ ...p, isConnecting: true }));
    try {
      // Always surface MetaMask's account picker. eth_requestAccounts alone
      // resolves silently once the site holds a permission grant, which made
      // clicking "Connect Wallet" feel like nothing asked for consent — and
      // gave no chance to pick a different account. Requesting permissions
      // forces the chooser every time; cancelling it (code 4001) is a normal
      // "no", not an error.
      try {
        await window.ethereum.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
      } catch (permErr) {
        if ((permErr as { code?: number }).code === 4001) {
          setS(p => ({ ...p, isConnecting: false }));
          return;
        }
        // Wallet doesn't support the permissions API — fall through to the
        // plain request below.
      }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const addr = accounts[0];
      if (!addr) { setS(p => ({ ...p, isConnecting: false })); return; }

      const linked = authUser?.walletAddress?.toLowerCase() ?? null;
      if (authUser && linked && addr.toLowerCase() !== linked) {
        // The account already owns a wallet — someone else's selection in
        // MetaMask must not silently become "your" session wallet.
        setS(p => ({ ...p, isConnecting: false }));
        setTx('error', `That MetaMask account is not your wallet. Your account uses ${linked.slice(0, 6)}…${linked.slice(-4)} — switch to it in MetaMask, or unlink it in Settings first.`);
        return;
      }

      if (authUser && !linked) {
        // First wallet for this account: verify availability and claim it in
        // the same click. The server rejects a wallet that belongs to another
        // account, so the user hears it now — not later at KYC or borrow time.
        try {
          const { nonce } = await fetch(`/api/auth/wallet-nonce?address=${addr}`).then(r => r.json());
          const signature = await window.ethereum.request({
            method: 'personal_sign',
            params: [LINK_MESSAGE(nonce), addr],
          }) as string;
          const res = await fetch('/api/wallet/link', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: addr, signature, nonce }),
          });
          const d = await res.json().catch(() => null);
          if (!res.ok) {
            setS(p => ({ ...p, isConnecting: false }));
            setTx('error', d?.error ?? 'Could not link this wallet to your account.');
            return;
          }
          // Pull the fresh session so the whole app sees the linked wallet.
          void refreshAuth();
        } catch (e) {
          setS(p => ({ ...p, isConnecting: false }));
          // 4001 = user closed the MetaMask prompt — a normal "no".
          if ((e as { code?: number }).code !== 4001) {
            setTx('error', 'Wallet signature failed. Please try again.');
          }
          return;
        }
      }

      const provider = getProvider()!;
      const network  = await provider.getNetwork();
      const chainId  = Number(network.chainId);
      const ok = chainId === HARDHAT_CHAIN_ID;
      const cached = ok ? readCachedPosition(addr) : null;
      setS(p => ({
        ...p, address: addr, isConnected: true, isCorrectNetwork: ok, chainId, isConnecting: false,
        ...(cached
          ? { loanInfo: cached.info, ethBalance: cached.ethBalance, myrBalance: cached.myrBalance, ethPriceMYR: cached.ethPriceMYR }
          : { loanInfo: null, ethBalance: '0', myrBalance: '0' }),
      }));
      if (ok) await refresh(addr);
    } catch (e) { console.error('connect', e); setS(p => ({ ...p, isConnecting: false })); }
  }, [getProvider, refresh, authUser, refreshAuth]);

  const switchToHardhat = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x7A69' }] });
    } catch (err: unknown) {
      if ((err as { code: number }).code === 4902) {
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [HN_PARAMS] });
      }
    }
  }, []);

  const depositCollateral = useCallback(async (ethAmt: string) => {
    if (!guardTx()) return;
    const c = await getContracts(true);
    if (!c || !s.address) return;
    setTx('pending', `Depositing ${ethAmt} ETH…`);
    try {
      const tx = await c.loan.depositCollateral({ value: ethers.parseEther(ethAmt) });
      const receipt = await tx.wait();
      if (receipt && s.address) saveTxToDB(s.address, 'CollateralDeposited', ethers.parseEther(ethAmt).toString(), receipt);
      setTx('success', `Deposited ${ethAmt} ETH as collateral`);
      if (receipt) {
        setReceipt({
          action: 'deposit',
          title: 'Collateral Deposited',
          amountLabel: `${ethAmt} ETH`,
          lines: [
            { label: 'Value (on-chain price)', value: `≈ RM ${(parseFloat(ethAmt) * s.ethPriceMYR).toLocaleString('en-MY', { maximumFractionDigits: 0 })}` },
            { label: 'New credit line (70% LTV)', value: `up to RM ${(parseFloat(ethAmt) * s.ethPriceMYR * 0.7).toLocaleString('en-MY', { maximumFractionDigits: 0 })} more` },
          ],
          txHash: receipt.hash,
        });
      }
      await refresh(s.address);
    } catch (e) {
      const reason = revertReason(e);
      setTx('error', reason ? `Deposit failed: ${reason}` : 'Deposit failed');
    }
  }, [getContracts, s.address, s.ethPriceMYR, refresh, guardTx]);

  const borrow = useCallback(async (myrAmt: string, opts?: { termMonths?: number }): Promise<boolean> => {
    if (!guardTx()) return false;
    const c = await getContracts(true);
    const addr = s.address;
    if (!c || !addr) return false;

    const attemptBorrow = async () => {
      setTx('pending', `Borrowing RM ${myrAmt}…`);
      const units = BigInt(Math.floor(parseFloat(myrAmt) * 1e6));
      // The contract takes the term in DAYS (30/90/180/365) and stamps the
      // loan's dueDate from it — the term is real on-chain state now, not a
      // display convention.
      const TERM_DAYS: Record<number, number> = { 1: 30, 3: 90, 6: 180, 12: 365 };
      const termDays = TERM_DAYS[opts?.termMonths ?? 1] ?? 30;
      const tx = await c.loan.borrow(units, BigInt(termDays));
      const receipt = await tx.wait();
      if (receipt) saveTxToDB(addr, 'Borrowed', units.toString(), receipt);
      // LoanCreated carries the on-chain loanId and dueDate for this borrow —
      // the ledger row stores both so repayments can settle by loanId and the
      // admin view can query due dates without an RPC call.
      let loanId: number | null = null;
      let dueDateIso: string | null = null;
      try {
        const createdEvt = ((receipt?.logs ?? []) as ethers.Log[])
          .map(l => { try { return c.loan.interface.parseLog(l); } catch { return null; } })
          .find(p => p?.name === 'LoanCreated');
        if (createdEvt) {
          loanId     = Number(createdEvt.args[1] as bigint);
          dueDateIso = new Date(Number(createdEvt.args[3] as bigint) * 1000).toISOString();
        }
      } catch { /* event decode is best-effort */ }
      // The rate this borrow is recorded at: currentAprBps() — the SAME call
      // accruedInterest() charges against, and the same number the Borrow tab
      // quotes. Recording baseRateBps here was the divergence: the ledger then
      // accrued at base while the contract charged base + utilization premium,
      // so a "full" repayment computed from the ledger always came up short and
      // left a residual sen of principal behind. Three borrows in a minute can
      // now record three different rates — that is honest, and it changes
      // nothing about the charge, which is uniform across the whole position.
      // Re-read fresh from the contract (state can be a minute stale).
      let aprBps = s.currentAprBps;
      try {
        aprBps = Number(await (c.loan.currentAprBps as () => Promise<bigint>)());
      } catch { /* pre-redeploy contract — keep the state value */ }
      // Base rate at the same moment — a separate read purely for the "base +
      // premium = rate" breakdown shown on this row later; never used for any
      // money math, only aprBps (the effective rate) is.
      let baseAprBps = s.borrowAprBps;
      try {
        baseAprBps = Number(await (c.loan.baseRateBps as () => Promise<bigint>)());
      } catch { /* pre-redeploy contract — keep the state value */ }
      if (receipt) {
        // Tranche ledger row — lets the Repay tab itemize borrows, settle them
        // individually, and (via termMonths) run the installment-bill math.
        // Awaited — not truly fire-and-forget — because refresh() below
        // triggers the dashboard's ledger re-fetch; letting this race that
        // re-fetch showed the borrow's collateral/principal on-chain while the
        // new "Your Borrows" row itself was still missing. Failures still
        // never fail the borrow result, same as before.
        await fetch('/api/borrows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: addr, principal: units.toString(), aprBps, baseAprBps,
            termMonths: opts?.termMonths ?? 1, txHash: receipt.hash,
            loanId, dueDate: dueDateIso,
          }),
        }).then(res => {
          // A non-OK response silently loses the tranche's term/APR itemization
          // (the debt itself is safe on-chain) — warn so it's diagnosable.
          if (!res.ok) console.warn(`[borrow] ledger row not recorded (HTTP ${res.status}) for tx ${receipt.hash}`);
        }).catch(err => console.warn('[borrow] ledger row not recorded:', err));
      }
      setTx('success', `Borrowed RM ${myrAmt}`);
      if (receipt) {
        setReceipt({
          action: 'borrow',
          title: 'Loan Disbursed',
          amountLabel: `RM ${parseFloat(myrAmt).toFixed(2)}`,
          lines: [
            { label: 'Interest rate', value: `${(aprBps / 100).toFixed(2)}% APR (locked for this loan)` },
            { label: 'Loan term', value: `${termDays} days` },
            ...(dueDateIso
              ? [{ label: 'Due date', value: `${new Date(dueDateIso).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })} (+7-day grace period)` }]
              : []),
            { label: 'Delivered as', value: 'MYR tokens to your wallet' },
            { label: 'Repay early anytime', value: 'No penalties or lock-in' },
          ],
          txHash: receipt.hash,
        });
      }
      await refresh(addr);
    };

    try {
      await attemptBorrow();
      return true;
    } catch (e) {
      const reason = revertReason(e);
      if (reason === 'KYC required') {
        // On-chain KYC lost (e.g. contract redeploy) — re-sync silently and retry once.
        setTx('pending', 'Re-syncing KYC…');
        await resyncKyc(addr);
        try {
          await attemptBorrow();
          return true;
        } catch (e2) {
          const r2 = revertReason(e2);
          setTx('error', r2 ? `Borrow failed: ${r2}` : 'Borrow failed — check LTV or collateral');
          return false;
        }
      }
      setTx('error', reason ? `Borrow failed: ${reason}` : 'Borrow failed — check LTV or collateral');
      return false;
    }
  }, [getContracts, s.address, s.currentAprBps, refresh, resyncKyc, guardTx]);

  const buyMYR = useCallback(async (myrAmt: string): Promise<boolean> => {
    if (!guardTx()) return false;
    const c = await getContracts(true);
    if (!c || !s.address) return false;
    setTx('pending', `Buying RM ${myrAmt} of MYR…`);
    try {
      const units    = BigInt(Math.floor(parseFloat(myrAmt) * 1e6));
      // ethNeeded = (units * 1e18) / (ethPrice * 1e6)
      const ethPrice = BigInt(s.ethPriceMYR);
      const ethNeeded = (units * BigInt(1e18)) / (ethPrice * BigInt(1e6));
      // Add 0.1% buffer for rounding
      const ethWithBuffer = ethNeeded + ethNeeded / BigInt(1000);
      const tx = await (c.loan.buyMYR as (myrAmount: bigint, opts: { value: bigint }) => Promise<ethers.TransactionResponse>)(units, { value: ethWithBuffer });
      const receipt = await tx.wait();
      if (receipt && s.address) saveTxToDB(s.address, 'MYRPurchased', units.toString(), receipt);
      setTx('success', `Bought RM ${myrAmt} MYR`);
      if (receipt) {
        setReceipt({
          action: 'buy',
          title: 'MYR Purchased',
          amountLabel: `RM ${parseFloat(myrAmt).toFixed(2)}`,
          lines: [
            { label: 'Paid with', value: `≈ ${ethers.formatEther(ethNeeded)} ETH` },
            { label: 'Rate (on-chain)', value: `RM ${s.ethPriceMYR.toLocaleString()}/ETH` },
          ],
          txHash: receipt.hash,
        });
      }
      await refresh(s.address);
      return true;
    } catch (e) {
      const reason = revertReason(e);
      setTx('error', reason ? `Buy failed: ${reason}` : 'Buy MYR failed — check ETH balance');
      return false;
    }
  }, [getContracts, s.address, s.ethPriceMYR, refresh, guardTx]);

  const repay = useCallback(async (items: RepayItem[], opts?: { settleFull?: boolean }) => {
    if (!guardTx()) return;
    const c = await getContracts(true);
    if (!c || !s.address) return;
    if (!items.length) { setTx('error', 'Nothing selected to repay.'); return; }
    setTx('pending', 'Approving MYR spend…', 1, 2);
    try {
      // Per-loan amounts in 1e6 units. Round each UP — the amounts arrive as
      // .toFixed(2) strings, so flooring could under-fund a payment by a
      // fraction of a sen and leave residual principal; the contract caps each
      // loan at its own due anyway, so rounding up can never overcharge.
      const loanIds = items.map(i => BigInt(i.loanId));
      let amounts   = items.map(i => BigInt(Math.ceil(parseFloat(i.amount) * 1e6)));
      // What the balance check runs on — the actual current debt, never the
      // padded approval amount, so a wallet holding exactly enough isn't
      // rejected over interest that hasn't accrued yet.
      let realDue = amounts.reduce((a, b) => a + b, BigInt(0));
      if (opts?.settleFull) {
        // Full settlement of every listed loan: quote each loan's REAL payoff
        // fresh from the contract, then project one accrual day forward — the
        // repay tx mines seconds from now and may cross a Malaysia-midnight
        // day boundary, ticking interest up a step after we quoted. The
        // contract caps per-loan at the true due, so over-quoting the
        // APPROVAL costs nothing; under-quoting is exactly what used to leave
        // sen of principal behind.
        try {
          const dues = await Promise.all(items.map(i =>
            (c.loan.loanDue as (a: string, id: bigint) => Promise<bigint>)(s.address!, BigInt(i.loanId))));
          realDue = dues.reduce((a, b) => a + b, BigInt(0));
          const STEP = BigInt(86_400);           // mirrors ACCRUAL_STEP (1 day)
          const YEAR = BigInt(31_536_000);       // mirrors Solidity's `365 days`
          const book = s.loanInfo?.loans ?? [];
          amounts = items.map((it, idx) => {
            const chain = book.find(l => l.loanId === it.loanId);
            const oneDay = chain ? (chain.principal * BigInt(chain.aprBps) * STEP) / (BigInt(10_000) * YEAR) : BigInt(0);
            const padded = dues[idx] + oneDay;
            return padded + padded / BigInt(500) + BigInt(1_000_000); // +0.2% + RM 1 headroom
          });
        } catch { /* loanDue unavailable: trust the caller's amounts */ }
      }
      const approveUnits = amounts.reduce((a, b) => a + b, BigInt(0));
      // Pre-flight balance check: the contract caps what it takes per loan,
      // but if the wallet holds less than the real debt the ERC20
      // transferFrom throws a custom error that surfaced as "Internal
      // JSON-RPC error". Read the balance from the chain — the s.myrBalance
      // state copy is a stale closure capture here.
      const myrBalUnits = (await c.myr.balanceOf(s.address)) as bigint;
      if (realDue > myrBalUnits) {
        const shortfall = Number(realDue - myrBalUnits) / 1e6;
        const fix = opts?.settleFull
          ? 'Use Auto top-up or buy MYR first.'
          : 'Buy MYR first, or switch to FULL repay to use Auto top-up.';
        setTx('error', `Insufficient MYR — short by RM ${shortfall.toFixed(2)}. ${fix}`);
        return;
      }
      const approveTx = await c.myr.approve(CONTRACT_ADDRESSES.CryptoLoan, approveUnits);
      await approveTx.wait();
      const intentMYR = items.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
      setTx('pending', `Repaying RM ${intentMYR.toFixed(2)}…`, 2, 2);
      // One transaction, however many loans — each amount applies to ITS loan
      // only (interest first, then principal), so paying one plan never
      // touches another plan's balance or interest.
      const repayTx = loanIds.length === 1
        ? await c.loan.repay(loanIds[0], amounts[0])
        : await c.loan.repayMany(loanIds, amounts);
      const repayReceipt: ethers.TransactionReceipt | null = await repayTx.wait();
      // The per-loan Repaid events carry what was actually charged — the
      // authoritative principal/interest split for each loan. Collateral is
      // never auto-returned by repay() — it stays deposited so the same
      // collateral can back a new borrow; withdraw it separately anytime.
      const paidByLoan = new Map<number, { principal: bigint; interest: bigint }>();
      try {
        for (const l of repayReceipt?.logs ?? []) {
          let parsed = null;
          try { parsed = c.loan.interface.parseLog(l); } catch { /* other contract's log */ }
          if (parsed?.name === 'Repaid') {
            const loanId = Number(parsed.args[1] as bigint);
            paidByLoan.set(loanId, {
              principal: parsed.args[2] as bigint,
              interest:  parsed.args[3] as bigint,
            });
          }
        }
      } catch { /* event decode is best-effort */ }
      const principalUnits = Array.from(paidByLoan.values()).reduce((a, v) => a + v.principal, BigInt(0));
      const interestUnits  = Array.from(paidByLoan.values()).reduce((a, v) => a + v.interest,  BigInt(0));
      const evtDecoded     = paidByLoan.size > 0;
      // Floats are for the receipt lines only, never for the settle payload.
      const principalPaid = Number(principalUnits) / 1e6;
      const interestPaid  = Number(interestUnits)  / 1e6;
      const totalPaid = principalPaid + interestPaid;
      const paidLabel = totalPaid > 0 ? totalPaid.toFixed(2) : intentMYR.toFixed(2);
      if (repayReceipt && s.address) {
        saveTxToDB(s.address, 'Repaid',
          totalPaid > 0 ? principalUnits.toString() : approveUnits.toString(),
          repayReceipt);
      }
      const clearedCount = Array.from(paidByLoan.keys()).length;
      setTx('success', opts?.settleFull
        ? `Repaid in full (RM ${paidLabel}, ${clearedCount} plan${clearedCount === 1 ? '' : 's'})`
        : `Repaid RM ${paidLabel}`, 2, 2);
      if (repayReceipt) {
        setReceipt({
          action: 'repay',
          title: opts?.settleFull ? 'Plan(s) Fully Repaid' : 'Repayment Successful',
          amountLabel: `RM ${paidLabel}`,
          lines: [
            { label: 'Plans covered',     value: `${items.length}` },
            { label: 'Principal repaid', value: `RM ${principalPaid.toFixed(2)}` },
            { label: 'Interest paid',    value: `RM ${interestPaid.toFixed(4)}` },
            ...(opts?.settleFull
              ? [{ label: 'Collateral', value: 'Still deposited — withdraw anytime, or borrow again against it' }]
              : []),
          ],
          txHash: repayReceipt.hash,
        });
      }
      // Apply the confirmed payment to the DB ledger rows, keyed by loanId —
      // each row gets exactly the principal ITS loan's Repaid event reported,
      // so the ledger can no longer drift from the chain. Awaited (though
      // errors never fail the repay) because refresh() below triggers the
      // dashboard's ledger re-fetch, which must see this write.
      const settleRows = items.filter(i => i.rowId);
      if (repayReceipt && settleRows.length > 0) {
        const allocations = settleRows.map(i => ({
          id: i.rowId as string,
          principal: (paidByLoan.get(i.loanId)?.principal
            ?? (evtDecoded ? BigInt(0) : BigInt(Math.ceil(parseFloat(i.amount) * 1e6)))).toString(),
        })).filter(a => BigInt(a.principal) > BigInt(0));
        const paidTotal = allocations.reduce((sum, a) => sum + BigInt(a.principal), BigInt(0));
        if (paidTotal > BigInt(0)) {
          await fetch('/api/borrows/settle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ids: allocations.map(a => a.id),
              principalPaid: paidTotal.toString(),
              repayTxHash: repayReceipt.hash,
              allocations,
            }),
          }).catch(() => {});
        }
      }
      // Optimistically flip the covered loans locally so the repay button
      // disables immediately, before the async refresh() propagates the
      // on-chain state. Collateral is untouched by repay() and must NOT be
      // zeroed here.
      if (opts?.settleFull) {
        const coveredIds = new Set(items.map(i => i.loanId));
        setS(p => {
          if (!p.loanInfo) return p;
          const loans = p.loanInfo.loans.map(l =>
            coveredIds.has(l.loanId) ? { ...l, principal: BigInt(0), interest: BigInt(0), active: false } : l);
          const stillBorrowed = loans.filter(l => l.active).reduce((a, l) => a + l.principal, BigInt(0));
          return {
            ...p,
            loanInfo: { ...p.loanInfo, loans, borrowed: stillBorrowed,
              accruedInterest: stillBorrowed === BigInt(0) ? BigInt(0) : p.loanInfo.accruedInterest },
          };
        });
      }
      await refresh(s.address);
      // Belt and braces for a whole-account payoff: if the chain now says the
      // position is clear, close every remaining OPEN ledger row. The route
      // re-reads the chain server-side and ignores this claim unless it
      // agrees, so a client can't wipe a ledger that still has debt behind it.
      if (opts?.settleFull && repayReceipt) {
        await fetch('/api/borrows/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            closeAll: true,
            wallet: s.address,
            repayTxHash: repayReceipt.hash,
          }),
        }).catch(() => {});
      }
    } catch (e) {
      const reason = revertReason(e);
      setTx('error', reason ? `Repay failed: ${reason}` : 'Repay failed — check MYR balance or approve amount', 1, 2);
    }
  }, [getContracts, s.address, s.loanInfo, refresh, guardTx]);

  const withdrawCollateral = useCallback(async (ethAmt: string) => {
    if (!guardTx()) return;
    const c = await getContracts(true);
    if (!c || !s.address) return;
    setTx('pending', `Withdrawing ${ethAmt} ETH…`);
    try {
      const tx = await c.loan.withdrawCollateral(ethers.parseEther(ethAmt));
      const receipt = await tx.wait();
      if (receipt && s.address) saveTxToDB(s.address, 'CollateralWithdrawn', ethers.parseEther(ethAmt).toString(), receipt);
      // Withdrawing ALL collateral auto-claims any accrued supply interest in
      // the same transaction (see CryptoLoan.sol) — surface it if it fired.
      let interestClaimed = 0;
      try {
        const claimEvt = ((receipt?.logs ?? []) as ethers.Log[])
          .map(l => { try { return c.loan.interface.parseLog(l); } catch { return null; } })
          .find((p: ethers.LogDescription | null) => p?.name === 'SupplyInterestClaimed');
        if (claimEvt) interestClaimed = Number(claimEvt.args[1] as bigint) / 1e6;
      } catch { /* event decode is best-effort */ }
      setTx('success', interestClaimed > 0
        ? `Withdrawn ${ethAmt} ETH + RM ${interestClaimed.toFixed(4)} interest claimed`
        : `Withdrawn ${ethAmt} ETH`);
      if (receipt) {
        setReceipt({
          action: 'withdraw',
          title: 'Collateral Withdrawn',
          amountLabel: `${ethAmt} ETH`,
          lines: [
            { label: 'Sent to', value: `${s.address.slice(0, 6)}…${s.address.slice(-4)}` },
            { label: 'Value (on-chain price)', value: `≈ RM ${(parseFloat(ethAmt) * s.ethPriceMYR).toLocaleString('en-MY', { maximumFractionDigits: 0 })}` },
            ...(interestClaimed > 0
              ? [{ label: 'Supply interest claimed', value: `RM ${interestClaimed.toFixed(4)}` }]
              : []),
          ],
          txHash: receipt.hash,
        });
      }
      await refresh(s.address);
    } catch (e) {
      const reason = revertReason(e);
      setTx('error', reason ? `Withdraw failed: ${reason}` : 'Withdraw failed — would violate LTV');
    }
  }, [getContracts, s.address, s.ethPriceMYR, refresh, guardTx]);

  const claimSupplyInterest = useCallback(async () => {
    if (!guardTx()) return;
    const c = await getContracts(true);
    if (!c || !s.address) return;
    setTx('pending', 'Claiming supply interest…');
    try {
      const tx = await c.loan.claimSupplyInterest();
      const receipt = await tx.wait();
      const claimedMYR6 = Math.round(s.pendingYieldMYR * 1e6);
      setTx('success', 'Supply interest claimed');
      if (receipt && s.address) {
        saveTxToDB(s.address, 'SupplyInterestClaimed', String(claimedMYR6), receipt);
        setReceipt({
          action: 'buy',
          title: 'Supply Interest Claimed',
          amountLabel: `RM ${s.pendingYieldMYR.toFixed(4)} MYR`,
          lines: [
            { label: 'Sent to wallet', value: `${s.address.slice(0, 6)}…${s.address.slice(-4)}` },
          ],
          txHash: receipt.hash,
        });
      }
      await refresh(s.address);
    } catch (e) {
      const reason = revertReason(e);
      setTx('error', reason ? `Claim failed: ${reason}` : 'Claim failed');
    }
  }, [getContracts, s.address, s.pendingYieldMYR, refresh, guardTx]);

  // Prompt MetaMask to import the MockMYR token so the borrowed balance is
  // visible in the wallet (ERC-20s don't show up automatically).
  const addTokenToWallet = useCallback(async () => {
    if (!window.ethereum) { alert('MetaMask not found.'); return; }
    // Already imported for this account — nothing to do.
    if (s.address && readMyrAdded(s.address)) {
      setS(p => ({ ...p, myrTokenAdded: true }));
      return;
    }
    try {
      const added = await window.ethereum.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: CONTRACT_ADDRESSES.MockMYR,
            symbol: 'MYR',
            decimals: 6,
          },
        },
      } as unknown as { method: string; params?: unknown[] });
      // MetaMask returns true once the token is tracked (added now, or already
      // present). Remember it so we don't prompt again.
      if (added && s.address) {
        writeMyrAdded(s.address);
        setS(p => ({ ...p, myrTokenAdded: true }));
      }
    } catch (e) {
      // Dismissing the MetaMask prompt rejects with EIP-1193 code 4001. That is
      // the user answering "no", not a failure — logging it as an error made a
      // normal cancel look like a crash in the console. Anything else is worth
      // surfacing, but the raw object serialises to "{}" (its fields are on the
      // prototype), so pull the useful parts out by hand.
      const err = e as { code?: number; message?: string };
      if (err?.code === 4001) return;
      console.warn('[wallet] could not add the MYR token:', err?.message ?? err, err?.code ? `(code ${err.code})` : '');
    }
  }, [s.address]);

  // Check the ACCOUNT's approval status (session cookie, no wallet parameter)
  // and keep polling so an admin approval made in another session/tab is picked
  // up without a reload. Runs independently of the wallet — verification is a
  // property of who is signed in, and asking by connected address is exactly
  // what let a new sign-up inherit a previously approved test wallet's status.
  useEffect(() => {
    const admin = !!authUser?.isAdmin;
    const checkDbKyc = () => {
      fetch('/api/kyc', { cache: 'no-store' })
        .then(r => (r.status === 401 ? { exists: false } : r.json()))
        .then(d => {
          const approved = !!(d.exists && d.status === 'approved');
          const kycStatus: 'none' | 'pending' | 'approved' =
            !d.exists ? 'none' : d.status === 'approved' ? 'approved' : 'pending';
          setS(p => ({
            ...p,
            kycApprovedDb: approved,
            // Admins bypass KYC — the platform's operators use every feature
            // without a verification submission.
            kycApproved: approved || admin,
            kycStatus,
            kycWallet: d.exists && d.wallet ? String(d.wallet).toLowerCase() : null,
            kycDbChecked: true,
          }));
        })
        .catch(() => {});
    };
    checkDbKyc();
    const id = setInterval(checkDbKyc, 10000);
    return () => clearInterval(id);
  }, [authUser?.isAdmin]);

  // Reflect whether the current account has already imported the MYR token, so
  // the "Add MYR" button only appears when it's actually needed.
  useEffect(() => {
    setS(p => ({ ...p, myrTokenAdded: s.address ? readMyrAdded(s.address) : false }));
  }, [s.address]);

  // Auto-heal a DB↔chain KYC mismatch: if the account is entitled (approved,
  // or an admin — admins bypass KYC) but the contract doesn't show it
  // (typically after a redeploy), ask the server to re-set it on-chain so
  // borrowing works without re-submitting KYC. Only when the connected wallet
  // IS the account's own wallet — re-approving whatever wallet happens to be
  // plugged in would hand out on-chain KYC to strangers. (The endpoint is
  // admin-gated regardless; this is not an approval, it re-pushes an
  // entitlement that already exists.) Runs once the on-chain read completed.
  useEffect(() => {
    const admin = !!authUser?.isAdmin;
    const anchor = s.kycWallet ?? (admin ? authUser?.walletAddress?.toLowerCase() ?? null : null);
    if (s.address && s.isCorrectNetwork && s.isDeployed &&
        (s.kycApprovedDb || admin) && !s.kycApprovedChain && s.loanInfo &&
        anchor && s.address.toLowerCase() === anchor) {
      void resyncKyc(s.address);
    }
  }, [s.address, s.isCorrectNetwork, s.isDeployed, s.kycApprovedDb, s.kycApprovedChain, s.loanInfo, s.kycWallet, resyncKyc, authUser?.isAdmin, authUser?.walletAddress]);

  // Keep-fresh poll — keeps balances, loan state, and the on-chain KYC flag
  // current. Scheduled 60 s after the LAST refresh started (not on a fixed
  // interval): any refresh — tab open, post-transaction, price sync — pushes
  // the next auto-refresh a full cycle out. A fixed setInterval here ran on
  // its own phase and double-refreshed mid-countdown on the Repay tab. The
  // KYC auto-sync effect above reacts to kycApprovedChain going false, so any
  // redeploy is healed within one cycle.
  useEffect(() => {
    const addr = s.address;
    if (!addr || !s.isCorrectNetwork || !s.isDeployed) return;
    const delay = Math.max(0, s.lastRefreshAt + 60_000 - Date.now());
    const id = setTimeout(() => { void refresh(addr); }, delay);
    return () => clearTimeout(id);
  }, [s.address, s.isCorrectNetwork, s.isDeployed, s.lastRefreshAt, refresh]);

  // Listen for MetaMask events
  useEffect(() => {
    if (!window.ethereum) return;
    const onAccounts = (a: unknown) => {
      // Only meaningful while connected. MetaMask fires this for any account
      // switch on an authorized site; reacting while disconnected would
      // silently re-connect a wallet the user never asked this session for.
      if (!s.isConnected) return;
      const list = a as string[];
      if (list.length === 0) {
        // Wallet revoked/locked — drop the connection but keep the ACCOUNT's
        // KYC status; verification belongs to the session, not the wallet.
        setS(p => ({
          ...INIT,
          kycApproved: p.kycApproved, kycApprovedDb: p.kycApprovedDb,
          kycStatus: p.kycStatus, kycWallet: p.kycWallet, kycDbChecked: p.kycDbChecked,
        }));
      } else {
        const cached = readCachedPosition(list[0]);
        setS(p => ({
          ...p, address: list[0],
          loanInfo: cached?.info ?? null,
          ethBalance: cached?.ethBalance ?? '0',
          myrBalance: cached?.myrBalance ?? '0',
          // Only the per-wallet chain flag resets on a wallet switch. The
          // account's verification (kycApprovedDb / kycStatus) belongs to the
          // session, not the wallet, and survives unchanged.
          kycApprovedChain: false,
        }));
        refresh(list[0]);
      }
    };
    const onChain = (hex: unknown) => {
      const id = parseInt(hex as string, 16);
      const ok = id === HARDHAT_CHAIN_ID;
      setS(p => ({ ...p, chainId: id, isCorrectNetwork: ok }));
      if (ok && s.address) refresh(s.address);
    };
    window.ethereum.on('accountsChanged', onAccounts);
    window.ethereum.on('chainChanged', onChain);
    return () => {
      window.ethereum?.removeListener('accountsChanged', onAccounts);
      window.ethereum?.removeListener('chainChanged', onChain);
    };
  }, [s.address, s.isConnected, refresh]);

  // Silently restore the wallet connection — but only for the wallet the
  // signed-in account is actually linked to.
  //
  // MetaMask's site permission belongs to the BROWSER, not to an app account:
  // once any visitor has connected here, eth_accounts hands the wallet back to
  // whoever is signed in next. Restoring it unconditionally meant a brand-new
  // sign-up landed with the previous person's wallet already "connected".
  // Restore is a convenience for returning to *your own* wallet, so it now
  // requires the account's linked wallet to be MetaMask's active account; in
  // every other case the user stays disconnected until they click Connect —
  // an explicit act, with whatever account they chose in MetaMask.
  const tryAutoConnect = useCallback(async (linkedWallet?: string | null) => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    if (!linkedWallet) return;
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' }) as string[];
      if (!accounts.length) return;
      if (accounts[0].toLowerCase() !== linkedWallet.toLowerCase()) return;
      const provider = getProvider()!;
      const network  = await provider.getNetwork();
      const chainId  = Number(network.chainId);
      const ok = chainId === HARDHAT_CHAIN_ID;
      const cached = readCachedPosition(accounts[0]);
      setS(p => ({
        ...p, address: accounts[0], isConnected: true, isCorrectNetwork: ok, chainId,
        ...(cached ? { loanInfo: cached.info, ethBalance: cached.ethBalance, myrBalance: cached.myrBalance, ethPriceMYR: cached.ethPriceMYR } : {}),
      }));
      if (ok) await refresh(accounts[0]);
    } catch { /* not connected */ }
  }, [getProvider, refresh]);

  // Auto-restore once the session has resolved to an account with a linked
  // wallet. Anonymous visitors and fresh accounts get no silent connection.
  // Kicked off a tick later so the state updates happen inside the promise
  // continuations, not the synchronous effect body (same pattern as
  // AuthContext's first refresh).
  const linkedWallet = authUser?.walletAddress;
  useEffect(() => {
    if (authLoading) return;
    const id = setTimeout(() => { void tryAutoConnect(linkedWallet); }, 0);
    return () => clearTimeout(id);
  }, [authLoading, linkedWallet, tryAutoConnect]);

  const disconnect = useCallback(() => {
    // Drops the wallet, not the identity: the account's KYC status survives —
    // it was never a property of the connected wallet.
    setS(p => ({
      ...INIT,
      kycApproved: p.kycApproved, kycApprovedDb: p.kycApprovedDb,
      kycStatus: p.kycStatus, kycWallet: p.kycWallet, kycDbChecked: p.kycDbChecked,
    }));
  }, []);

  const value: WalletCtx = {
    ...s,
    connect, disconnect, tryAutoConnect, switchToHardhat,
    depositCollateral, borrow, buyMYR, repay, withdrawCollateral, claimSupplyInterest,
    addTokenToWallet,
    refresh: () => s.address ? refresh(s.address) : Promise.resolve(),
    clearTx: () => setS(p => ({ ...p, txStatus: 'idle', txMessage: '' })),
    clearReceipt: () => setS(p => ({ ...p, lastReceipt: null })),
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <Backdrop open={s.isConnecting} sx={{ zIndex: 1500, bgcolor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <CircularProgress sx={{ color: 'white' }} size={56} thickness={2.5} />
          <Typography variant="h6" sx={{ color: 'white', fontWeight: 600 }}>Connecting wallet…</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>Approve the request in MetaMask</Typography>
        </Box>
      </Backdrop>
    </Ctx.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWallet must be inside <WalletProvider>');
  return ctx;
}
