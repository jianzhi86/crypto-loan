'use client';

import { useEffect, useState } from 'react';

export type Sparklines = Record<string, number[]>;

/**
 * Trailing-24h hourly price series per coin, keyed like the Prices map
 * (bitcoin, ethereum, …). Refreshes every 5 minutes — the data itself is
 * hourly, so anything faster is wasted requests.
 */
export function useSparklines() {
  const [sparklines, setSparklines] = useState<Sparklines>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/sparklines');
        if (!res.ok) return;
        const data = await res.json() as { ok: boolean; sparklines?: Sparklines };
        if (!cancelled && data.ok && data.sparklines) setSparklines(data.sparklines);
      } catch { /* chart column simply stays empty */ }
    };
    void load();
    const id = setInterval(load, 5 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return sparklines;
}
