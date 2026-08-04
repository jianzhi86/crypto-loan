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
  action: 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'buy' | 'transfer';
  title: string;
  amountLabel: string;
  lines: { label: string; value: string }[];
  txHash: string;
  timestamp: number;
}

export interface LoanInfo {
  collateral: bigint;
  borrowed: bigint;
  healthFactor: number;
  available: bigint;
  collateralValueMYR: number;
  accruedInterest: bigint;
  startTime: bigint;
  /// Unix seconds of the last repayment (or first borrow) — the moment the
  /// contract's interest clock last reset. Baseline for ledger interest on
  /// debt that predates the itemized borrow ledger.
  lastRepayTime: bigint;
  ltv: number;
  isLiquidatable: boolean;
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
  borrowAprBps: number;
  // Current dynamic rate = base + utilization slope + volatility premium.
  // Use this (not borrowAprBps) for interest projections — it's what the
  // contract's accruedInterest() actually charges.
  currentAprBps: number;
  supplyAprBps: number;
  utilizationRate: number;
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
  borrowAprBps: 300, currentAprBps: 300, supplyAprBps: 0, utilizationRate: 0, pendingYieldMYR: 0,
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
  // keeps signing with its cached higher nonce — ethers surfaces that as
  // "could not coalesce error" / "Nonce too high", which tells the user
  // nothing. Point them at the actual fix.
  const all = [e?.reason, e?.shortMessage, e?.info?.error?.message, e?.data?.message]
    .filter(Boolean).join(' | ');
  if (/nonce too high|could not coalesce/i.test(all)) {
    return 'the local chain was restarted. In MetaMask: Settings → Advanced → "Clear activity tab data", then retry';
  }
  // Strip ethers' "execution reverted: " / "...: reverted: " prefixes.
  const m = raw.match(/reverted(?: with reason string)?:?\s*"?([^"]+)"?/i);
  return (m?.[1] ?? raw).trim();
}

interface WalletCtx extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => void;
  /** Silent restore — no-op unless the account's linked wallet is MetaMask's active account. */
  tryAutoConnect: (linkedWallet?: string | null) => Promise<void>;
  switchToHardhat: () => Promise<void>;
  depositCollateral: (eth: string) => Promise<void>;
  borrow: (myr: string) => Promise<boolean>;
  buyMYR: (myr: string) => Promise<boolean>;
  transferMYR: (myr: string, to: string) => Promise<boolean>;
  repay: (myr: string, opts?: {
    full?: boolean;
    /** Ledger tranches this payment settles — marked REPAID in the DB once
     *  the on-chain repay confirms. `interest` = per-tranche ledger interest
     *  (MYR units, stringified) included in the payment. */
    settle?: { ids: string[]; interest?: Record<string, string> };
  }) => Promise<void>;
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
      const [ethBal, myrBal, info, price, kyc, loanRaw] = await Promise.all([
        provider.getBalance(address),
        c.myr.balanceOf(address),
        c.loan.getLoanInfo(address),
        c.loan.ethPrice(),
        c.loan.kycApproved(address),
        c.loan.loans(address),
      ]);
      const MAX_U = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
      const hfRaw = info[2] as bigint;
      const hf = hfRaw === MAX_U ? Infinity : Number(hfRaw) / 1e18;
      const loanInfo: LoanInfo = {
        collateral:         info[0] as bigint,
        borrowed:           info[1] as bigint,
        healthFactor:       hf,
        available:          info[3] as bigint,
        collateralValueMYR: Number(info[4] as bigint),
        accruedInterest:    info[5] as bigint,
        startTime:          loanRaw[2] as bigint,
        lastRepayTime:      loanRaw[3] as bigint,
        ltv:                Number(info[6] as bigint),
        isLiquidatable:     info[7] as boolean,
      };
      const ethBalance = parseFloat(ethers.formatEther(ethBal)).toFixed(4);
      const myrBalance = (Number(myrBal) / 1e6).toFixed(2);
      const ethPriceMYR = Number(price as bigint);
      // Optional calls — only exist on the current contract version.
      // Promise.allSettled so a missing function never crashes the whole refresh.
      const [aprLiveResult, dynAprResult, protStatsResult, supplyIntResult] = await Promise.allSettled([
        Promise.resolve().then(() => c.loan.baseRateBps()),
        Promise.resolve().then(() => c.loan.currentAprBps()),
        Promise.resolve().then(() => c.loan.getProtocolStats()),
        Promise.resolve().then(() => c.loan.accruedSupplyInterest(address)),
      ]);
      const aprBps    = aprLiveResult.status   === 'fulfilled' ? aprLiveResult.value : BigInt(300);
      const dynApr    = dynAprResult.status    === 'fulfilled' ? dynAprResult.value  : aprBps;
      const protStats = protStatsResult.status === 'fulfilled' ? protStatsResult.value : [BigInt(0), BigInt(0), BigInt(0), BigInt(0), BigInt(0)];
      const borrowAprBps  = Number(aprBps as bigint);
      const currentAprBps = Number(dynApr as bigint);
      const ps = protStats as [bigint, bigint, bigint, bigint, bigint];
      const totalBorrowedMYR   = Number(ps[0]) / 1e6;
      const totalCollateralMYR = (Number(ps[1]) / 1e18) * ethPriceMYR;
      const utilizationRate    = totalCollateralMYR > 0 ? Math.min(totalBorrowedMYR / totalCollateralMYR, 1) : 0;
      const supplyAprBps       = Math.round(borrowAprBps * 38 / 100);
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

  const borrow = useCallback(async (myrAmt: string): Promise<boolean> => {
    if (!guardTx()) return false;
    const c = await getContracts(true);
    const addr = s.address;
    if (!c || !addr) return false;

    const attemptBorrow = async () => {
      setTx('pending', `Borrowing RM ${myrAmt}…`);
      const units = BigInt(Math.floor(parseFloat(myrAmt) * 1e6));
      const tx = await c.loan.borrow(units);
      const receipt = await tx.wait();
      if (receipt) saveTxToDB(addr, 'Borrowed', units.toString(), receipt);
      // The rate this borrow locks: baseRateBps — the market-driven rate the
      // hourly keeper maintains and the SAME number the Borrow tab quotes.
      // Deliberately NOT currentAprBps(): that adds a live utilization premium
      // which jumps with every borrow, so three borrows in a minute would lock
      // three different rates — nothing like the hourly market rate the user
      // was shown. Re-read fresh from the contract (state can be a minute stale).
      let aprBps = s.borrowAprBps;
      try {
        aprBps = Number(await (c.loan.baseRateBps as () => Promise<bigint>)());
      } catch { /* pre-redeploy contract — keep the state value */ }
      if (receipt) {
        // Tranche ledger row — lets the Repay tab itemize borrows and settle
        // them individually. Fire-and-forget like saveTxToDB — a miss only
        // degrades itemization.
        fetch('/api/borrows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: addr, principal: units.toString(), aprBps, txHash: receipt.hash }),
        }).catch(() => {});
      }
      setTx('success', `Borrowed RM ${myrAmt}`);
      if (receipt) {
        setReceipt({
          action: 'borrow',
          title: 'Loan Disbursed',
          amountLabel: `RM ${parseFloat(myrAmt).toFixed(2)}`,
          lines: [
            { label: 'Interest rate', value: `${(aprBps / 100).toFixed(2)}% APR (locked for this borrow)` },
            { label: 'Delivered as', value: 'MYR tokens to your wallet' },
            { label: 'Repay anytime', value: 'No penalties or lock-in' },
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
  }, [getContracts, s.address, s.borrowAprBps, refresh, resyncKyc, guardTx]);

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

  const transferMYR = useCallback(async (myrAmt: string, to: string): Promise<boolean> => {
    if (!guardTx()) return false;
    const c = await getContracts(true);
    if (!c || !s.address) return false;
    setTx('pending', `Transferring RM ${myrAmt} to bank…`);
    try {
      const units = BigInt(Math.floor(parseFloat(myrAmt) * 1e6));
      const tx = await (c.myr.transfer as (to: string, amount: bigint) => Promise<ethers.TransactionResponse>)(to, units);
      const receipt = await tx.wait();
      setTx('success', `RM ${myrAmt} transferred on-chain to bank wallet`);
      if (receipt) {
        setReceipt({
          action: 'transfer',
          title: 'Transfer Sent',
          amountLabel: `RM ${parseFloat(myrAmt).toFixed(2)}`,
          lines: [{ label: 'Recipient', value: `${to.slice(0, 6)}…${to.slice(-4)}` }],
          txHash: receipt.hash,
        });
      }
      await refresh(s.address);
      return true;
    } catch { setTx('error', 'Transfer failed'); return false; }
  }, [getContracts, s.address, refresh, guardTx]);

  const repay = useCallback(async (myrAmt: string, opts?: {
    full?: boolean;
    settle?: { ids: string[]; interest?: Record<string, string> };
  }) => {
    if (!guardTx()) return;
    const c = await getContracts(true);
    if (!c || !s.address) return;
    setTx('pending', 'Approving MYR spend…', 1, 2);
    try {
      let units = BigInt(Math.floor(parseFloat(myrAmt) * 1e6));
      // What the contract will actually pull (before any headroom).
      let due = units;
      if (opts?.full) {
        // Full payoff: quote the real payoff, not the stale view. totalDue()
        // is computed against the LAST MINED block's timestamp — frozen
        // between transactions on a local chain — while the repay tx itself
        // mines a fresh block and charges interest up to real wall-clock time
        // at the live dynamic rate. Project the quote forward to now and take
        // the max, so the approval and balance check cover what the contract
        // will actually pull. Falls back to the caller's amount on old contracts.
        try {
          const [dueView, loanRaw, aprNow] = await Promise.all([
            (c.loan.totalDue as (a: string) => Promise<bigint>)(s.address),
            (c.loan.loans as (a: string) => Promise<bigint[]>)(s.address),
            (c.loan.currentAprBps as () => Promise<bigint>)(),
          ]);
          const principalU = loanRaw[1];
          const lastRepay  = Number(loanRaw[3]);
          const elapsed    = Math.max(0, Math.floor(Date.now() / 1000) - lastRepay);
          const projected  = lastRepay > 0
            ? principalU + (principalU * aprNow * BigInt(elapsed)) / BigInt(10_000 * 31_536_000)
            : dueView;
          due = projected > dueView ? projected : dueView;
        } catch { /* totalDue unavailable: trust the caller's amount */ }
        units = due + due / BigInt(500) + BigInt(1_000_000); // +0.2% + RM 1 headroom
      }
      // Pre-flight balance check: the contract caps what it takes to totalDue,
      // but if the wallet holds less than that the ERC20 transferFrom throws a
      // custom error that surfaced as "Internal JSON-RPC error". Read the
      // balance from the chain — the s.myrBalance state copy is a stale
      // closure capture here (this callback's deps don't track it) and once
      // reported a shortfall against a balance from a previous session.
      const myrBalUnits = (await c.myr.balanceOf(s.address)) as bigint;
      if (due > myrBalUnits) {
        const shortfall = Number(due - myrBalUnits) / 1e6;
        setTx('error', `Insufficient MYR — short by RM ${shortfall.toFixed(2)}. Use Auto top-up or buy MYR first.`);
        return;
      }
      const approveTx = await c.myr.approve(CONTRACT_ADDRESSES.CryptoLoan, units);
      await approveTx.wait();
      setTx('pending', `Repaying RM ${myrAmt}…`, 2, 2);
      const repayTx = await c.loan.repay(units);
      const repayReceipt: ethers.TransactionReceipt | null = await repayTx.wait();
      // The Repaid event carries what was actually charged — principal and
      // interest split — which can differ slightly from the requested amount.
      let principalPaid = 0, interestPaid = 0, colReturnedEth = 0;
      try {
        const parsedLogs = (repayReceipt?.logs ?? [])
          .map(l => { try { return c.loan.interface.parseLog(l); } catch { return null; } });
        const repaidEvt = parsedLogs.find(p => p?.name === 'Repaid');
        if (repaidEvt) {
          principalPaid = Number(repaidEvt.args[1] as bigint) / 1e6;
          interestPaid  = Number(repaidEvt.args[2] as bigint) / 1e6;
        }
        const colEvt = parsedLogs.find(p => p?.name === 'CollateralWithdrawn');
        if (colEvt) {
          colReturnedEth = Number(colEvt.args[1] as bigint) / 1e18;
        }
      } catch { /* event decode is best-effort */ }
      const totalPaid = principalPaid + interestPaid;
      const paidLabel = totalPaid > 0 ? totalPaid.toFixed(2) : parseFloat(myrAmt).toFixed(2);
      if (repayReceipt && s.address) {
        saveTxToDB(s.address, 'Repaid',
          totalPaid > 0 ? BigInt(Math.round(principalPaid * 1e6)).toString() : units.toString(),
          repayReceipt);
        if (colReturnedEth > 0) {
          saveTxToDB(s.address, 'CollateralWithdrawn',
            BigInt(Math.round(colReturnedEth * 1e18)).toString(),
            repayReceipt);
        }
      }
      const colLabel = colReturnedEth > 0 ? ` + ${colReturnedEth.toFixed(4)} ETH returned` : '';
      setTx('success', opts?.full
        ? `Loan fully repaid (RM ${paidLabel})${colLabel}`
        : `Repaid RM ${paidLabel}`, 2, 2);
      if (repayReceipt) {
        setReceipt({
          action: 'repay',
          title: opts?.full ? 'Loan Fully Repaid' : 'Repayment Successful',
          amountLabel: `RM ${paidLabel}`,
          lines: [
            { label: 'Principal repaid', value: `RM ${principalPaid.toFixed(2)}` },
            { label: 'Interest paid',    value: `RM ${interestPaid.toFixed(4)}` },
            ...(opts?.full && colReturnedEth > 0
              ? [{ label: 'Collateral returned', value: `${colReturnedEth.toFixed(4)} ETH` }]
              : opts?.full
              ? [{ label: 'Collateral', value: 'Returned to wallet' }]
              : []),
          ],
          txHash: repayReceipt.hash,
        });
      }
      // Flip the settled ledger tranches to REPAID now that the chain confirmed.
      // Fire-and-forget: a miss leaves the tranche OPEN, which the user can
      // simply settle again — never blocks the repay result.
      if (repayReceipt && opts?.settle?.ids.length) {
        fetch('/api/borrows/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ids: opts.settle.ids,
            interest: opts.settle.interest ?? {},
            repayTxHash: repayReceipt.hash,
          }),
        }).catch(() => {});
      }
      // Optimistically zero out the loan so the repay button disables immediately,
      // before the async refresh() below propagates the on-chain state.
      // Without this there is a brief window where principal > 0 (stale) but
      // the MYR balance is already 0, which shows a false "short by RM X" error
      // on a stray second click.
      if (opts?.full) {
        setS(p => ({
          ...p,
          loanInfo: p.loanInfo
            ? { ...p.loanInfo, borrowed: BigInt(0), accruedInterest: BigInt(0), collateral: BigInt(0) }
            : p.loanInfo,
          pendingYieldMYR: 0,
        }));
      }
      await refresh(s.address);
    } catch (e) {
      const reason = revertReason(e);
      setTx('error', reason ? `Repay failed: ${reason}` : 'Repay failed — check MYR balance or approve amount', 1, 2);
    }
  }, [getContracts, s.address, refresh, guardTx]);

  const withdrawCollateral = useCallback(async (ethAmt: string) => {
    if (!guardTx()) return;
    const c = await getContracts(true);
    if (!c || !s.address) return;
    setTx('pending', `Withdrawing ${ethAmt} ETH…`);
    try {
      const tx = await c.loan.withdrawCollateral(ethers.parseEther(ethAmt));
      const receipt = await tx.wait();
      if (receipt && s.address) saveTxToDB(s.address, 'CollateralWithdrawn', ethers.parseEther(ethAmt).toString(), receipt);
      setTx('success', `Withdrawn ${ethAmt} ETH`);
      if (receipt) {
        setReceipt({
          action: 'withdraw',
          title: 'Collateral Withdrawn',
          amountLabel: `${ethAmt} ETH`,
          lines: [
            { label: 'Sent to', value: `${s.address.slice(0, 6)}…${s.address.slice(-4)}` },
            { label: 'Value (on-chain price)', value: `≈ RM ${(parseFloat(ethAmt) * s.ethPriceMYR).toLocaleString('en-MY', { maximumFractionDigits: 0 })}` },
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
    depositCollateral, borrow, buyMYR, transferMYR, repay, withdrawCollateral, claimSupplyInterest,
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
