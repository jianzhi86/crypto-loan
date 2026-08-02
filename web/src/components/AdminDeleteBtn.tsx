'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

export function AdminDeleteBtn({ userId }: { userId: string }) {
  const router = useRouter();
  const [confirm, setConfirm]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState('');

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`/api/kyc?userId=${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Failed');
        setDeleting(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Network error');
      setDeleting(false);
    }
  };

  if (confirm) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button size="small" onClick={() => setConfirm(false)} disabled={deleting}
            sx={{ fontSize: 10, py: 0.25, px: 0.75, minWidth: 'auto', whiteSpace: 'nowrap', color: 'rgba(255,255,255,0.65)' }}>
            Cancel
          </Button>
          <Button size="small" variant="contained" onClick={handleDelete} disabled={deleting}
            sx={{
              fontSize: 10, py: 0.25, px: 0.75, minWidth: 'auto', whiteSpace: 'nowrap',
              bgcolor: '#E5484D', '&:hover': { bgcolor: '#C8363B' },
              '&.Mui-disabled': { opacity: 0.5, color: '#fff' },
            }}>
            {deleting ? '…' : 'Confirm'}
          </Button>
        </Box>
        {error && <Typography variant="caption" sx={{ color: '#E5484D', fontSize: 10 }}>{error}</Typography>}
      </Box>
    );
  }

  return (
    <Button size="small" onClick={() => setConfirm(true)} variant="outlined"
      sx={{
        borderColor: 'rgba(229,72,77,0.3)', color: '#E5484D',
        fontSize: 10, py: 0.25, px: 0.75, minWidth: 'auto', whiteSpace: 'nowrap',
        '&:hover': { bgcolor: 'rgba(229,72,77,0.08)', borderColor: '#E5484D' },
      }}>
      Delete
    </Button>
  );
}
