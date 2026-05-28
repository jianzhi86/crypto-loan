'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

export function AdminSyncPriceBtn() {
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<{ price?: number; error?: string } | null>(null);

  const sync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res  = await fetch('/api/admin/sync-price', { method: 'POST' });
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
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Button
        size="small"
        onClick={sync}
        disabled={loading}
        variant="outlined"
        sx={{
          borderColor: 'rgba(6,182,212,0.25)',
          color: '#06B6D4',
          bgcolor: '#0D1520',
          fontSize: 11,
          gap: 0.5,
          '&:hover': { bgcolor: 'rgba(6,182,212,0.08)', borderColor: '#06B6D4' },
          '&.Mui-disabled': { opacity: 0.4 },
        }}
      >
        {loading ? '⟳ Syncing…' : '⟳ Sync ETH Price'}
      </Button>
      {result?.price && (
        <Typography variant="caption" sx={{ fontWeight: 600, color: '#22c55e' }}>
          ✓ RM {result.price.toLocaleString()} on-chain
        </Typography>
      )}
      {result?.error && (
        <Typography variant="caption" sx={{ color: '#ef4444' }}>{result.error}</Typography>
      )}
    </Box>
  );
}
