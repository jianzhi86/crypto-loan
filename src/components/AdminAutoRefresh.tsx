'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Re-runs the admin page's server-side data fetch on an interval, so new KYC
// submissions and status changes (e.g. approved from another session) show up
// without a manual reload.
export function AdminAutoRefresh({ intervalMs = 10000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
