'use client';
import { useState } from 'react';

export function AdminSyncPriceBtn() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ price?: number; error?: string } | null>(null);

  const sync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/sync-price', { method: 'POST' });
      const data = await res.json() as { newPrice?: number; error?: string };
      if (res.ok) {
        setResult({ price: data.newPrice });
      } else {
        setResult({ error: data.error ?? 'Sync failed' });
      }
    } catch {
      setResult({ error: 'Network error' });
    }
    setLoading(false);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={sync}
        disabled={loading}
        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40 transition-colors"
        style={{ backgroundColor: '#0D1520', color: '#06B6D4', border: '1px solid #06B6D440' }}>
        {loading ? '⟳ Syncing…' : '⟳ Sync ETH Price'}
      </button>
      {result?.price && (
        <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>
          ✓ RM {result.price.toLocaleString()} on-chain
        </span>
      )}
      {result?.error && (
        <span className="text-xs" style={{ color: '#ef4444' }}>{result.error}</span>
      )}
    </div>
  );
}
