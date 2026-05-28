'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

export function AdminApproveBtn({ wallet, initialStatus }: { wallet: string; initialStatus: string }) {
  const [status, setStatus]   = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

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

  if (status === 'approved') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography variant="caption" sx={{ color: '#22c55e', fontWeight: 500 }}>✓ Approved</Typography>
        <Button
          size="small"
          onClick={approve}
          disabled={loading}
          variant="outlined"
          sx={{
            borderColor: '#1E2035',
            color: '#64748B',
            fontSize: 10,
            py: 0.25,
            px: 0.75,
            minWidth: 'auto',
            whiteSpace: 'nowrap',
            '&:hover': { borderColor: '#06B6D4', color: '#06B6D4' },
            '&.Mui-disabled': { opacity: 0.4 },
          }}
        >
          {loading ? '…' : '🔄 Re-sync chain'}
        </Button>
        {error && <Typography variant="caption" sx={{ color: '#ef4444' }}>{error}</Typography>}
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Button
        size="small"
        onClick={approve}
        disabled={loading}
        variant="outlined"
        sx={{
          borderColor: '#16a34a',
          color: '#22c55e',
          bgcolor: 'rgba(34,197,94,0.08)',
          fontSize: 11,
          py: 0.25,
          px: 1,
          minWidth: 'auto',
          whiteSpace: 'nowrap',
          '&:hover': { bgcolor: 'rgba(34,197,94,0.15)', borderColor: '#22c55e' },
          '&.Mui-disabled': { opacity: 0.4 },
        }}
      >
        {loading ? 'Approving…' : 'Approve'}
      </Button>
      {error && (
        <Typography variant="caption" sx={{ color: '#ef4444' }}>{error}</Typography>
      )}
    </Box>
  );
}
