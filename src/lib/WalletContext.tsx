'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
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

interface WalletCtx extends WalletState {
  connect: () => Promise<void>;
  switchToHardhat: () => Promise<void>;
  depositCollateral: (eth: string) => Promise<void>;
  borrow: (myr: string) => Promise<boolean>;
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
        kycApproved: kyc as boolean,
        isDeployed: true,
        isRefreshing: false,
      }));
    } catch (e) { console.error('refresh', e); setS(p => ({ ...p, isRefreshing: false })); }
  }, [getProvider, getContracts]);

  const connect = useCallback(async () => {
    if (!window.ethereum) { alert('MetaMask not found. Install it from metamask.io'); return; }
    setS(p => ({ ...p, isConnecting: true }));
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const provider = getProvider()!;
      const network  = await provider.getNetwork();
      const chainId  = Number(network.chainId);
      const ok = chainId === HARDHAT_CHAIN_ID;
      const cached = readCachedPosition(accounts[0]);
      setS(p => ({
        ...p, address: accounts[0], isConnected: true, isCorrectNetwork: ok, chainId, isConnecting: false,
        ...(cached ? { loanInfo: cached.info, ethBalance: cached.ethBalance, myrBalance: cached.myrBalance, ethPriceMYR: cached.ethPriceMYR } : {}),
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
    } catch { setTx('error', 'Deposit failed'); }
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
    } catch { setTx('error', 'Borrow failed — check LTV or collateral'); return false; }
  }, [getContracts, s.address, refresh]);

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
    } catch { setTx('error', 'Repay failed', 1, 2); }
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
    } catch { setTx('error', 'Withdraw failed — would violate LTV'); }
  }, [getContracts, s.address, refresh]);

  // Prompt MetaMask to import the MockMYR token so the borrowed balance is
  // visible in the wallet (ERC-20s don't show up automatically).
  const addTokenToWallet = useCallback(async () => {
    if (!window.ethereum) { alert('MetaMask not found.'); return; }
    try {
      await window.ethereum.request({
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
    } catch (e) { console.error('watchAsset', e); }
  }, []);

  // Fallback: check DB approval status when wallet connects (covers reset-chain scenarios)
  useEffect(() => {
    if (!s.address) return;
    fetch(`/api/kyc?wallet=${s.address}`)
      .then(r => r.json())
      .then(d => {
        if (d.exists && d.status === 'approved') {
          setS(p => ({ ...p, kycApproved: true }));
        }
      })
      .catch(() => {});
  }, [s.address]);

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
    depositCollateral, borrow, transferMYR, repay, withdrawCollateral,
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
