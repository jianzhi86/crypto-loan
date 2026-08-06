'use client';

import { useEffect, useState } from 'react';
import type { ChainStats } from '@/lib/contract-read';

export interface ProtocolStats {
  /** null when the local node is unreachable — render "—", never a placeholder. */
  chain: ChainStats | null;
  /** OPEN BorrowPosition rows across every wallet. */
  openBorrows: number;
  /** Distinct wallets holding at least one OPEN row. */
  borrowers: number;
}

/**
 * Protocol-wide figures for the dashboard/markets banners.
 *
 * Polled on the same 60s cadence as the wallet refresh, so these numbers and
 * the ones in the position cards step together instead of drifting apart
 * mid-minute. Raw fetch + setInterval to match useSparklines — this repo has
 * no react-query or SWR.
 *
 * Unlike useWallet(), this works with no wallet connected. That gap is what the
 * invented "RM 892M TVL" placeholders used to paper over.
 */
export function useProtocolStats() {
  const [stats, setStats]     = useState<ProtocolStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/protocol-stats');
        if (!res.ok) return;
        const next = await res.json() as ProtocolStats;
        // Keep the last good reading on a bad poll rather than flashing "—".
        // The very first failure leaves stats null, which is the honest state.
        if (!cancelled) setStats(next);
      } catch { /* banner tiles fall back to "—" */ }
      finally { if (!cancelled) setLoading(false); }
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return { stats, loading };
}
