'use client';
import { useState } from 'react';

export function AdminApproveBtn({ wallet, initialStatus }: { wallet: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (status === 'approved') {
    return <span className="text-xs text-green-400 font-medium">✓ Approved</span>;
  }

  const approve = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/kyc/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet }),
      });
      if (res.ok) {
        setStatus('approved');
      } else {
        const d = await res.json();
        setError(d.error ?? 'Failed');
      }
    } catch {
      setError('Network error');
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={approve}
        disabled={loading}
        className="text-xs px-2 py-1 rounded border border-green-700 bg-green-900/20 text-green-400 hover:bg-green-900/40 disabled:opacity-40 whitespace-nowrap transition-colors"
      >
        {loading ? 'Approving…' : 'Approve'}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
