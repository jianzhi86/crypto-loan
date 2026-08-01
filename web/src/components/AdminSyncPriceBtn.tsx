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
          borderColor: 'rgba(6,182,212,0.3)',
          color: '#06B6D4',
          bgcolor: 'rgba(6,182,212,0.06)',
          fontSize: 11,
          gap: 0.5,
          '&:hover': { bgcolor: 'rgba(6,182,212,0.12)', borderColor: '#06B6D4' },
          '&.Mui-disabled': { opacity: 0.4 },
        }}
      >
        {loading ? '⟳ Syncing…' : '⟳ Sync ETH Price'}
      </Button>
      {result?.price && (
        <Typography variant="caption" sx={{ fontWeight: 600, color: '#2BD9A2' }}>
          RM {result.price.toLocaleString()} on-chain
        </Typography>
      )}
      {result?.error && (
        <Typography variant="caption" sx={{ color: '#E5484D' }}>{result.error}</Typography>
      )}
    </Box>
  );
}
