'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { ethers } from 'ethers';
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

export interface LoanInfo {
  collateral: bigint;
  borrowed: bigint;
  healthFactor: number;
  available: bigint;
  collateralValueMYR: number;
  accruedInterest: bigint;
  startTime: bigint;
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
  kycApproved: boolean;
  // DB-side KYC approval (from /api/kyc). Tracked separately so an on-chain
  // refresh — which reads `false` after a chain redeploy/reset — can't clobber
  // an approval that still stands in the database. Effective approval is
  // (on-chain || db).
  kycApprovedDb: boolean;
  // Raw on-chain KYC flag (loan.kycApproved). Used to detect a DB↔chain mismatch
  // after a redeploy so it can be auto-resynced.
  kycApprovedChain: boolean;
  // Granular KYC status from the DB: 'none' = no submission, 'pending' = awaiting review, 'approved' = verified.
  kycStatus: 'none' | 'pending' | 'approved';
  // Whether the current MockMYR token has already been imported into MetaMask
  // for this account (remembered locally). Lets the UI hide the "Add MYR" button.
  myrTokenAdded: boolean;
  isRefreshing: boolean;
  isConnecting: boolean;
  txStatus: TxStatus;
  txMessage: string;
  txStep: number;
  txTotalSteps: number;
}

const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const LOAN_ADDR = CONTRACT_ADDRESSES.CryptoLoan as string;

const INIT: WalletState = {
  address: null, isConnected: false, isCorrectNetwork: false,
  isDeployed: LOAN_ADDR !== ZERO_ADDR,
  chainId: null, ethBalance: '0', myrBalance: '0',
  loanInfo: null, ethPriceMYR: 18000,
  kycApproved: false,
  kycApprovedDb: false,
  kycApprovedChain: false,
  kycStatus: 'none',
  myrTokenAdded: false,
  isRefreshing: false,
  isConnecting: false,
  txStatus: 'idle', txMessage: '',
  txStep: 1, txTotalSteps: 1,
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
  // Strip ethers' "execution reverted: " / "...: reverted: " prefixes.
  const m = raw.match(/reverted(?: with reason string)?:?\s*"?([^"]+)"?/i);
  return (m?.[1] ?? raw).trim();
}

interface WalletCtx extends WalletState {
  connect: () => Promise<void>;
  switchToHardhat: () => Promise<void>;
  depositCollateral: (eth: string) => Promise<void>;
  borrow: (myr: string) => Promise<boolean>;
  buyMYR: (myr: string) => Promise<void>;
  transferMYR: (myr: string, to: string) => Promise<boolean>;
  repay: (myr: string) => Promise<void>;
  withdrawCollateral: (eth: string) => Promise<void>;
  addTokenToWallet: () => Promise<void>;
  refresh: () => Promise<void>;
  clearTx: () => void;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<WalletState>(INIT);

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
    setS(p => ({ ...p, isRefreshing: true }));
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
        ltv:                Number(info[6] as bigint),
        isLiquidatable:     info[7] as boolean,
      };
      const ethBalance = parseFloat(ethers.formatEther(ethBal)).toFixed(4);
      const myrBalance = (Number(myrBal) / 1e6).toFixed(2);
      const ethPriceMYR = Number(price as bigint);
      // Remember this position so it survives a disconnect / reload.
      cachePosition(address, { info: loanInfo, ethBalance, myrBalance, ethPriceMYR });
      setS(p => ({
        ...p,
        ethBalance,
        myrBalance,
        loanInfo,
        ethPriceMYR,
        // On-chain approval OR a standing DB approval. Never downgrade a
        // DB-approved wallet just because the chain was redeployed.
        kycApproved: (kyc as boolean) || p.kycApprovedDb,
        kycApprovedChain: kyc as boolean,
        isDeployed: true,
        isRefreshing: false,
      }));
    } catch (e) { console.error('refresh', e); setS(p => ({ ...p, isRefreshing: false })); }
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
      const r = await fetch('/api/kyc/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address }),
      });
      if (r.ok) await refresh(address);
    } catch (e) {
      console.error('resyncKyc', e);
    } finally {
      resyncingKyc.current = null;
    }
  }, [refresh]);

  const connect = useCallback(async () => {
    if (!window.ethereum) { alert('MetaMask not found. Install it from metamask.io'); return; }
    setS(p => ({ ...p, isConnecting: true }));
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const provider = getProvider()!;
      const network  = await provider.getNetwork();
      const chainId  = Number(network.chainId);
      const ok = chainId === HARDHAT_CHAIN_ID;
      const cached = ok ? readCachedPosition(accounts[0]) : null;
      setS(p => ({
        ...p, address: accounts[0], isConnected: true, isCorrectNetwork: ok, chainId, isConnecting: false,
        ...(cached
          ? { loanInfo: cached.info, ethBalance: cached.ethBalance, myrBalance: cached.myrBalance, ethPriceMYR: cached.ethPriceMYR }
          : { loanInfo: null, ethBalance: '0', myrBalance: '0' }),
      }));
      if (ok) await refresh(accounts[0]);
    } catch (e) { console.error('connect', e); setS(p => ({ ...p, isConnecting: false })); }
  }, [getProvider, refresh]);

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
    const c = await getContracts(true);
    if (!c || !s.address) return;
    setTx('pending', `Depositing ${ethAmt} ETH…`);
    try {
      const tx = await c.loan.depositCollateral({ value: ethers.parseEther(ethAmt) });
      const receipt = await tx.wait();
      if (receipt && s.address) saveTxToDB(s.address, 'CollateralDeposited', ethers.parseEther(ethAmt).toString(), receipt);
      setTx('success', `Deposited ${ethAmt} ETH as collateral`);
      await refresh(s.address);
    } catch (e) {
      const reason = revertReason(e);
      setTx('error', reason ? `Deposit failed: ${reason}` : 'Deposit failed');
    }
  }, [getContracts, s.address, refresh]);

  const borrow = useCallback(async (myrAmt: string): Promise<boolean> => {
    const c = await getContracts(true);
    if (!c || !s.address) return false;
    setTx('pending', `Borrowing RM ${myrAmt}…`);
    try {
      const units = BigInt(Math.floor(parseFloat(myrAmt) * 1e6));
      const tx = await c.loan.borrow(units);
      const receipt = await tx.wait();
      if (receipt && s.address) saveTxToDB(s.address, 'Borrowed', units.toString(), receipt);
      setTx('success', `Borrowed RM ${myrAmt}`);
      await refresh(s.address);
      return true;
    } catch (e) {
      const reason = revertReason(e);
      // "KYC required" means on-chain KYC was lost (e.g. contract redeploy) even
      // though the DB shows approved — point the user at re-verifying on-chain.
      const msg = reason === 'KYC required'
        ? 'On-chain KYC is out of sync — re-syncing. Try again in a moment.'
        : reason
          ? `Borrow failed: ${reason}`
          : 'Borrow failed — check LTV or collateral';
      setTx('error', msg);
      if (reason === 'KYC required' && s.address) void resyncKyc(s.address);
      return false;
    }
  }, [getContracts, s.address, refresh, resyncKyc]);

  const buyMYR = useCallback(async (myrAmt: string) => {
    const c = await getContracts(true);
    if (!c || !s.address) return;
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
      await refresh(s.address);
    } catch (e) {
      const reason = revertReason(e);
      setTx('error', reason ? `Buy failed: ${reason}` : 'Buy MYR failed — check ETH balance');
    }
  }, [getContracts, s.address, s.ethPriceMYR, refresh]);

  const transferMYR = useCallback(async (myrAmt: string, to: string): Promise<boolean> => {
    const c = await getContracts(true);
    if (!c || !s.address) return false;
    setTx('pending', `Transferring RM ${myrAmt} to bank…`);
    try {
      const units = BigInt(Math.floor(parseFloat(myrAmt) * 1e6));
      const tx = await (c.myr.transfer as (to: string, amount: bigint) => Promise<ethers.TransactionResponse>)(to, units);
      await tx.wait();
      setTx('success', `RM ${myrAmt} transferred on-chain to bank wallet`);
      await refresh(s.address);
      return true;
    } catch { setTx('error', 'Transfer failed'); return false; }
  }, [getContracts, s.address, refresh]);

  const repay = useCallback(async (myrAmt: string) => {
    const c = await getContracts(true);
    if (!c || !s.address) return;
    setTx('pending', 'Approving MYR spend…', 1, 2);
    try {
      const units = BigInt(Math.floor(parseFloat(myrAmt) * 1e6));
      const approveTx = await c.myr.approve(CONTRACT_ADDRESSES.CryptoLoan, units);
      await approveTx.wait();
      setTx('pending', `Repaying RM ${myrAmt}…`, 2, 2);
      const repayTx = await c.loan.repay(units);
      const repayReceipt = await repayTx.wait();
      if (repayReceipt && s.address) saveTxToDB(s.address, 'Repaid', units.toString(), repayReceipt);
      setTx('success', `Repaid RM ${myrAmt}`, 2, 2);
      await refresh(s.address);
    } catch (e) {
      const reason = revertReason(e);
      setTx('error', reason ? `Repay failed: ${reason}` : 'Repay failed — check MYR balance or approve amount', 1, 2);
    }
  }, [getContracts, s.address, refresh]);

  const withdrawCollateral = useCallback(async (ethAmt: string) => {
    const c = await getContracts(true);
    if (!c || !s.address) return;
    setTx('pending', `Withdrawing ${ethAmt} ETH…`);
    try {
      const tx = await c.loan.withdrawCollateral(ethers.parseEther(ethAmt));
      const receipt = await tx.wait();
      if (receipt && s.address) saveTxToDB(s.address, 'CollateralWithdrawn', ethers.parseEther(ethAmt).toString(), receipt);
      setTx('success', `Withdrawn ${ethAmt} ETH`);
      await refresh(s.address);
    } catch (e) {
      const reason = revertReason(e);
      setTx('error', reason ? `Withdraw failed: ${reason}` : 'Withdraw failed — would violate LTV');
    }
  }, [getContracts, s.address, refresh]);

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
    } catch (e) { console.error('watchAsset', e); }
  }, [s.address]);

  // Check DB approval status when the wallet connects, then keep polling so an
  // admin approval made in another session/tab is picked up without the user
  // having to reconnect or reload (covers reset-chain scenarios too).
  useEffect(() => {
    if (!s.address) return;
    const wallet = s.address;
    const checkDbKyc = () => {
      fetch(`/api/kyc?wallet=${wallet}`)
        .then(r => r.json())
        .then(d => {
          const approved = !!(d.exists && d.status === 'approved');
          const kycStatus: 'none' | 'pending' | 'approved' =
            !d.exists ? 'none' : d.status === 'approved' ? 'approved' : 'pending';
          // Ignore a stale response if the user switched accounts mid-flight.
          setS(p => (p.address !== wallet ? p : {
            ...p,
            kycApprovedDb: approved,
            kycApproved: p.kycApproved || approved,
            kycStatus,
          }));
        })
        .catch(() => {});
    };
    checkDbKyc();
    const id = setInterval(checkDbKyc, 10000);
    return () => clearInterval(id);
  }, [s.address]);

  // Reflect whether the current account has already imported the MYR token, so
  // the "Add MYR" button only appears when it's actually needed.
  useEffect(() => {
    setS(p => ({ ...p, myrTokenAdded: s.address ? readMyrAdded(s.address) : false }));
  }, [s.address]);

  // Auto-heal a DB↔chain KYC mismatch: if the database has the wallet approved
  // but the contract doesn't (typically after a redeploy), re-set it on-chain so
  // borrowing works without the user having to re-submit KYC. Runs once the
  // on-chain read has completed (loanInfo present) to avoid a premature attempt.
  useEffect(() => {
    if (s.address && s.isCorrectNetwork && s.isDeployed &&
        s.kycApprovedDb && !s.kycApprovedChain && s.loanInfo) {
      void resyncKyc(s.address);
    }
  }, [s.address, s.isCorrectNetwork, s.isDeployed, s.kycApprovedDb, s.kycApprovedChain, s.loanInfo, resyncKyc]);

  // Listen for MetaMask events
  useEffect(() => {
    if (!window.ethereum) return;
    const onAccounts = (a: unknown) => {
      const list = a as string[];
      if (list.length === 0) setS(INIT);
      else {
        const cached = readCachedPosition(list[0]);
        setS(p => ({
          ...p, address: list[0],
          loanInfo: cached?.info ?? null,
          ethBalance: cached?.ethBalance ?? '0',
          myrBalance: cached?.myrBalance ?? '0',
          // New account — clear the prior wallet's KYC until re-checked.
          kycApproved: false,
          kycApprovedDb: false,
          kycApprovedChain: false,
          kycStatus: 'none',
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
  }, [s.address, refresh]);

  // Auto-restore if already connected
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;
    (async () => {
      try {
        const accounts = await window.ethereum!.request({ method: 'eth_accounts' }) as string[];
        if (!accounts.length) return;
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
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: WalletCtx = {
    ...s,
    connect, switchToHardhat,
    depositCollateral, borrow, buyMYR, transferMYR, repay, withdrawCollateral,
    addTokenToWallet,
    refresh: () => s.address ? refresh(s.address) : Promise.resolve(),
    clearTx: () => setS(p => ({ ...p, txStatus: 'idle', txMessage: '' })),
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
