'use client';
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { CheckIcon } from '@/components/Icons';

export function AdminApproveBtn({ userId, initialStatus }: { userId: string; initialStatus: string }) {
  const [status, setStatus]   = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [note, setNote]       = useState('');

  // AdminAutoRefresh re-renders the server page every 10s; without this, the
  // row would stay frozen on whatever status it had at first mount (e.g. an
  // approve or reset-kyc made in another tab would never show here).
  useEffect(() => { setStatus(initialStatus); }, [initialStatus]);

  const approve = async () => {
    setLoading(true);
    setError('');
    setNote('');
    try {
      const res = await fetch('/api/kyc/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const d = await res.json();
      if (res.ok) {
        setStatus('approved');
        // Approval can be DB-only when no wallet is linked yet — say so, or
        // the admin assumes borrowing is already enabled.
        if (!d.onChain) setNote('No wallet linked yet — on-chain access is granted when the user links one.');
      } else {
        setError(d.error ?? 'Failed');
      }
    } catch {
      setError('Network error');
    }
    setLoading(false);
  };

  // Approved rows are display-only: on-chain recovery after a node restart is
  // handled in one shot by the page-level "Re-sync all on-chain" button.
  if (status === 'approved') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: '#2BD9A2' }}>
          <CheckIcon size={13} strokeWidth={2.2} />
          <Typography variant="caption" sx={{ color: 'inherit', fontWeight: 500 }}>Approved</Typography>
        </Box>
        {note && <Typography variant="caption" sx={{ color: '#FFB224' }}>{note}</Typography>}
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
      {note && (
        <Typography variant="caption" sx={{ color: '#FFB224' }}>{note}</Typography>
      )}
    </Box>
  );
}
