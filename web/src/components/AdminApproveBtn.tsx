'use client';
import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { CheckIcon } from '@/components/Icons';

export function AdminApproveBtn({ userId, initialStatus }: { userId: string; initialStatus: string }) {
  const [status, setStatus]       = useState(initialStatus);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [note, setNote]           = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason]       = useState('');
  const [rejecting, setRejecting] = useState(false);

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

  const submitReject = async () => {
    setRejecting(true);
    setError('');
    try {
      const res = await fetch('/api/kyc/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, reason: reason.trim() || undefined }),
      });
      const d = await res.json();
      if (res.ok) {
        setStatus('rejected');
        setRejectOpen(false);
        setReason('');
      } else {
        setError(d.error ?? 'Failed');
      }
    } catch {
      setError('Network error');
    }
    setRejecting(false);
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

  if (status === 'rejected') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography variant="caption" sx={{ color: '#E5484D', fontWeight: 500 }}>✕ Rejected</Typography>
        <Button
          size="small"
          onClick={approve}
          disabled={loading}
          variant="outlined"
          sx={{
            borderColor: '#2BD9A2', color: '#2BD9A2', bgcolor: 'rgba(43,217,162,0.08)',
            fontSize: 10, py: 0.2, px: 0.75, minWidth: 'auto', whiteSpace: 'nowrap',
            '&:hover': { bgcolor: 'rgba(43,217,162,0.15)', borderColor: '#2BD9A2' },
            '&.Mui-disabled': { opacity: 0.4 },
          }}
        >
          {loading ? 'Approving…' : 'Approve anyway'}
        </Button>
        {error && <Typography variant="caption" sx={{ color: '#E5484D' }}>{error}</Typography>}
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Button
            size="small"
            onClick={approve}
            disabled={loading || rejecting}
            variant="outlined"
            sx={{
              borderColor: '#2BD9A2', color: '#2BD9A2', bgcolor: 'rgba(43,217,162,0.08)',
              fontSize: 11, py: 0.25, px: 1, minWidth: 'auto', whiteSpace: 'nowrap',
              '&:hover': { bgcolor: 'rgba(43,217,162,0.15)', borderColor: '#2BD9A2' },
              '&.Mui-disabled': { opacity: 0.4 },
            }}
          >
            {loading ? 'Approving…' : 'Approve'}
          </Button>
          <Button
            size="small"
            onClick={() => setRejectOpen(true)}
            disabled={loading || rejecting}
            variant="outlined"
            sx={{
              borderColor: '#E5484D', color: '#E5484D', bgcolor: 'rgba(229,72,77,0.08)',
              fontSize: 11, py: 0.25, px: 1, minWidth: 'auto', whiteSpace: 'nowrap',
              '&:hover': { bgcolor: 'rgba(229,72,77,0.15)', borderColor: '#E5484D' },
              '&.Mui-disabled': { opacity: 0.4 },
            }}
          >
            Reject
          </Button>
        </Box>
        {error && (
          <Typography variant="caption" sx={{ color: '#E5484D' }}>{error}</Typography>
        )}
        {note && (
          <Typography variant="caption" sx={{ color: '#FFB224' }}>{note}</Typography>
        )}
      </Box>

      <Dialog
        open={rejectOpen}
        onClose={() => { setRejectOpen(false); setReason(''); setError(''); }}
        slotProps={{ paper: { sx: { bgcolor: '#111B38', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, minWidth: 380 } } }}
      >
        <DialogTitle sx={{ color: '#F2F5FF', fontSize: 16, fontWeight: 600, pb: 1 }}>
          Reject KYC submission?
        </DialogTitle>
        <DialogContent sx={{ pb: 1 }}>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', mb: 2 }}>
            The user will see a rejection notice when they visit the KYC page and can resubmit.
          </Typography>
          <TextField
            fullWidth multiline rows={3} size="small"
            label="Reason (optional — logged in audit trail)"
            placeholder="e.g. IC image is blurry, name mismatch, etc."
            value={reason}
            onChange={e => setReason(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#0B1226', borderRadius: 1.5, fontSize: 13 } }}
          />
          {error && (
            <Typography variant="caption" sx={{ color: '#E5484D', mt: 1, display: 'block' }}>{error}</Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button
            variant="outlined" size="small"
            onClick={() => { setRejectOpen(false); setReason(''); setError(''); }}
            sx={{ borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.65)',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' } }}
          >
            Cancel
          </Button>
          <Button
            variant="contained" size="small"
            onClick={submitReject}
            disabled={rejecting}
            sx={{ bgcolor: '#E5484D', '&:hover': { bgcolor: '#FF6166' }, '&.Mui-disabled': { opacity: 0.5 } }}
          >
            {rejecting ? 'Rejecting…' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
