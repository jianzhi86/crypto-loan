'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { CheckIcon, RefreshIcon } from '@/components/Icons';

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#2BD9A2' }}>
          <CheckIcon size={13} strokeWidth={2.2} />
          <Typography variant="caption" sx={{ color: 'inherit', fontWeight: 500 }}>Approved</Typography>
        </Box>
        <Button
          size="small"
          onClick={approve}
          disabled={loading}
          variant="outlined"
          startIcon={loading ? undefined : <RefreshIcon size={12} />}
          sx={{
            borderColor: 'rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.65)',
            fontSize: 10,
            py: 0.25,
            px: 0.75,
            minWidth: 'auto',
            whiteSpace: 'nowrap',
            '& .MuiButton-startIcon': { mr: 0.5 },
            '&:hover': { borderColor: '#06B6D4', color: '#06B6D4' },
            '&.Mui-disabled': { opacity: 0.4 },
          }}
        >
          {loading ? '…' : 'Re-sync chain'}
        </Button>
        {error && <Typography variant="caption" sx={{ color: '#E5484D' }}>{error}</Typography>}
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
          borderColor: '#2BD9A2',
          color: '#2BD9A2',
          bgcolor: 'rgba(43,217,162,0.08)',
          fontSize: 11,
          py: 0.25,
          px: 1,
          minWidth: 'auto',
          whiteSpace: 'nowrap',
          '&:hover': { bgcolor: 'rgba(43,217,162,0.15)', borderColor: '#2BD9A2' },
          '&.Mui-disabled': { opacity: 0.4 },
        }}
      >
        {loading ? 'Approving…' : 'Approve'}
      </Button>
      {error && (
        <Typography variant="caption" sx={{ color: '#E5484D' }}>{error}</Typography>
      )}
    </Box>
  );
}
