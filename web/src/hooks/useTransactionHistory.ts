'use client';
import { useEffect, useState, type ComponentType } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES, CRYPTO_LOAN_ABI } from '@/lib/contractConfig';
import { CashIcon, CheckCircleIcon, TrayDownIcon, TrayUpIcon, CartIcon, CoinIcon } from '@/components/Icons';

export type TxType = 'Borrowed' | 'Repaid' | 'CollateralDeposited' | 'CollateralWithdrawn' | 'MYRPurchased' | 'SupplyInterestClaimed';

export interface TxEvent {
  type: TxType;
  amount: bigint;
  blockNumber: number;
  txHash: string;
}

// Stroked SVGs, not emoji — same reasoning as components/Icons.tsx: emoji
// render differently on every OS and can't take the row's accent colour.
// EVERY type saveTxToDB() can write must have an entry in all three maps —
// the DB fallback below surfaces whatever was recorded, and a missing entry
// renders an `undefined` component, which crashes the whole page.
const ICONS: Record<TxType, ComponentType<{ size?: number; color?: string }>> = {
  Borrowed:              CashIcon,
  Repaid:                CheckCircleIcon,
  CollateralDeposited:   TrayDownIcon,
  CollateralWithdrawn:   TrayUpIcon,
  MYRPurchased:          CartIcon,
  SupplyInterestClaimed: CoinIcon,
};
const LABELS: Record<TxType, string> = {
  Borrowed:              'Borrowed MYR',
  Repaid:                'Repaid MYR',
  CollateralDeposited:   'Deposited ETH',
  CollateralWithdrawn:   'Withdrew ETH',
  MYRPurchased:          'Bought MYR',
  SupplyInterestClaimed: 'Claimed Supply Interest',
};
const COLORS: Record<TxType, string> = {
  Borrowed:              '#A78BFA',
  Repaid:                '#22c55e',
  CollateralDeposited:   '#06B6D4',
  CollateralWithdrawn:   '#eab308',
  MYRPurchased:          '#0E9F6E',
  SupplyInterestClaimed: '#2BD9A2',
};

export { ICONS, LABELS, COLORS };

export function useTransactionHistory(address: string | undefined) {
  const [events, setEvents]   = useState<TxEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;

    const fetchHistory = async () => {
      setLoading(true);
      let onChainEvents: TxEvent[] = [];

      // Try reading on-chain events first
      if (typeof window !== 'undefined' && window.ethereum) {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum as ethers.Eip1193Provider);
          const contract = new ethers.Contract(CONTRACT_ADDRESSES.CryptoLoan, CRYPTO_LOAN_ABI, provider);

          // Borrowed(address user, uint256 myrAmount, uint256 newTotal)
          // Repaid(address user, uint256 principal, uint256 interest)
          // CollateralDeposited(address user, uint256 amount)
          // CollateralWithdrawn(address user, uint256 amount)
          // MYRPurchased(address buyer, uint256 ethSpent, uint256 myrReceived)
          const [borrowed, repaid, deposited, withdrawn, purchased, claimed] = await Promise.all([
            contract.queryFilter(contract.filters.Borrowed(address)),
            contract.queryFilter(contract.filters.Repaid(address)),
            contract.queryFilter(contract.filters.CollateralDeposited(address)),
            contract.queryFilter(contract.filters.CollateralWithdrawn(address)),
            contract.queryFilter(contract.filters.MYRPurchased(address)),
            contract.queryFilter(contract.filters.SupplyInterestClaimed(address)),
          ]);

          onChainEvents = [
            ...borrowed.map(e => {
              const ev = e as ethers.EventLog;
              return { type: 'Borrowed' as TxType, amount: ev.args.myrAmount as bigint, blockNumber: e.blockNumber, txHash: e.transactionHash };
            }),
            ...repaid.map(e => {
              const ev = e as ethers.EventLog;
              // Repaid event: (address user, uint256 principal, uint256 interest)
              return { type: 'Repaid' as TxType, amount: ev.args.principal as bigint, blockNumber: e.blockNumber, txHash: e.transactionHash };
            }),
            ...deposited.map(e => {
              const ev = e as ethers.EventLog;
              return { type: 'CollateralDeposited' as TxType, amount: ev.args.amount as bigint, blockNumber: e.blockNumber, txHash: e.transactionHash };
            }),
            ...withdrawn.map(e => {
              const ev = e as ethers.EventLog;
              return { type: 'CollateralWithdrawn' as TxType, amount: ev.args.amount as bigint, blockNumber: e.blockNumber, txHash: e.transactionHash };
            }),
            ...purchased.map(e => {
              const ev = e as ethers.EventLog;
              // MYRPurchased event: (address buyer, uint256 ethSpent, uint256 myrReceived)
              return { type: 'MYRPurchased' as TxType, amount: ev.args.myrReceived as bigint, blockNumber: e.blockNumber, txHash: e.transactionHash };
            }),
            ...claimed.map(e => {
              const ev = e as ethers.EventLog;
              // SupplyInterestClaimed event: (address user, uint256 amount) — MYR units
              return { type: 'SupplyInterestClaimed' as TxType, amount: ev.args.amount as bigint, blockNumber: e.blockNumber, txHash: e.transactionHash };
            }),
          ];
        } catch {
          // chain unavailable — will fall back to DB
        }
      }

      // Fall back to DB history if chain returned nothing (e.g. node restarted)
      if (onChainEvents.length === 0) {
        try {
          const res = await fetch(`/api/loan-tx?wallet=${address}`);
          if (res.ok) {
            const { txs } = await res.json() as { txs: { type: string; amount: string; txHash: string; blockNumber: number }[] };
            onChainEvents = txs
              // The DB can hold types this UI has never heard of (older
              // builds, future additions) — drop them rather than rendering
              // an entry with no icon/label/colour, which crashes the page.
              .filter(t => t.type in ICONS)
              .map(t => ({
                type: t.type as TxType,
                amount: BigInt(t.amount),
                blockNumber: t.blockNumber,
                txHash: t.txHash,
              }));
          }
        } catch {
          // DB also unavailable
        }
      }

      setEvents(onChainEvents.sort((a, b) => b.blockNumber - a.blockNumber));
      setLoading(false);
    };

    fetchHistory();
  }, [address]);

  return { events, loading, refetch: () => setEvents([]) };
}
