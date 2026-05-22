'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ethers } from 'ethers';
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
  txStatus: 'idle', txMessage: '',
  txStep: 1, txTotalSteps: 1,
};

const HN_PARAMS = {
  chainId: '0x7A69',
  chainName: 'Hardhat Local',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: [HARDHAT_RPC_URL],
};

interface WalletCtx extends WalletState {
  connect: () => Promise<void>;
  switchToHardhat: () => Promise<void>;
  depositCollateral: (eth: string) => Promise<void>;
  borrow: (myr: string) => Promise<void>;
  repay: (myr: string) => Promise<void>;
  withdrawCollateral: (eth: string) => Promise<void>;
  submitKYC: () => Promise<void>;
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

  const refresh = useCallback(async (address: string) => {
    const provider = getProvider();
    if (!provider || !address || LOAN_ADDR === ZERO_ADDR) return;
    setS(p => ({ ...p, isRefreshing: true }));
    try {
      const c = await getContracts(false);
      if (!c) { setS(p => ({ ...p, isRefreshing: false })); return; }
      const [ethBal, myrBal, info, price, kyc] = await Promise.all([
        provider.getBalance(address),
        c.myr.balanceOf(address),
        c.loan.getLoanInfo(address),
        c.loan.ethPrice(),
        c.loan.kycApproved(address),
      ]);
      const MAX_U = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
      const hfRaw = info[2] as bigint;
      const hf = hfRaw === MAX_U ? Infinity : Number(hfRaw) / 1e18;
      setS(p => ({
        ...p,
        ethBalance: parseFloat(ethers.formatEther(ethBal)).toFixed(4),
        myrBalance: (Number(myrBal) / 1e6).toFixed(2),
        loanInfo: {
          collateral: info[0] as bigint,
          borrowed:   info[1] as bigint,
          healthFactor: hf,
          available:    info[3] as bigint,
          collateralValueMYR: Number(info[4] as bigint),
        },
        ethPriceMYR: Number(price as bigint),
        kycApproved: kyc as boolean,
        isRefreshing: false,
      }));
    } catch (e) { console.error('refresh', e); setS(p => ({ ...p, isRefreshing: false })); }
  }, [getProvider, getContracts]);

  const connect = useCallback(async () => {
    if (!window.ethereum) { alert('MetaMask not found. Install it from metamask.io'); return; }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[];
      const provider = getProvider()!;
      const network  = await provider.getNetwork();
      const chainId  = Number(network.chainId);
      const ok = chainId === HARDHAT_CHAIN_ID;
      setS(p => ({ ...p, address: accounts[0], isConnected: true, isCorrectNetwork: ok, chainId }));
      if (ok) await refresh(accounts[0]);
    } catch (e) { console.error('connect', e); }
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
      await tx.wait();
      setTx('success', `Deposited ${ethAmt} ETH as collateral`);
      await refresh(s.address);
    } catch { setTx('error', 'Deposit failed'); }
  }, [getContracts, s.address, refresh]);

  const borrow = useCallback(async (myrAmt: string) => {
    const c = await getContracts(true);
    if (!c || !s.address) return;
    setTx('pending', `Borrowing RM ${myrAmt}…`);
    try {
      const units = BigInt(Math.floor(parseFloat(myrAmt) * 1e6));
      const tx = await c.loan.borrow(units);
      await tx.wait();
      setTx('success', `Borrowed RM ${myrAmt}`);
      await refresh(s.address);
    } catch { setTx('error', 'Borrow failed — check LTV or collateral'); }
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
      await repayTx.wait();
      setTx('success', `Repaid RM ${myrAmt}`, 2, 2);
      await refresh(s.address);
    } catch { setTx('error', 'Repay failed', 1, 2); }
  }, [getContracts, s.address, refresh]);

  const submitKYC = useCallback(async () => {
    const c = await getContracts(true);
    if (!c || !s.address) return;
    setTx('pending', 'Submitting KYC verification…');
    try {
      const tx = await c.loan.submitKYC();
      await tx.wait();
      setTx('success', 'KYC verified successfully!');
      await refresh(s.address);
    } catch { setTx('error', 'KYC submission failed'); }
  }, [getContracts, s.address, refresh]);

  const withdrawCollateral = useCallback(async (ethAmt: string) => {
    const c = await getContracts(true);
    if (!c || !s.address) return;
    setTx('pending', `Withdrawing ${ethAmt} ETH…`);
    try {
      const tx = await c.loan.withdrawCollateral(ethers.parseEther(ethAmt));
      await tx.wait();
      setTx('success', `Withdrawn ${ethAmt} ETH`);
      await refresh(s.address);
    } catch { setTx('error', 'Withdraw failed — would violate LTV'); }
  }, [getContracts, s.address, refresh]);

  // Listen for MetaMask events
  useEffect(() => {
    if (!window.ethereum) return;
    const onAccounts = (a: unknown) => {
      const list = a as string[];
      if (list.length === 0) setS(INIT);
      else { setS(p => ({ ...p, address: list[0] })); refresh(list[0]); }
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
        setS(p => ({ ...p, address: accounts[0], isConnected: true, isCorrectNetwork: ok, chainId }));
        if (ok) await refresh(accounts[0]);
      } catch { /* not connected */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: WalletCtx = {
    ...s,
    connect, switchToHardhat,
    depositCollateral, borrow, repay, withdrawCollateral, submitKYC,
    refresh: () => s.address ? refresh(s.address) : Promise.resolve(),
    clearTx: () => setS(p => ({ ...p, txStatus: 'idle', txMessage: '' })),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWallet must be inside <WalletProvider>');
  return ctx;
}
