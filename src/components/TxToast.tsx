'use client';

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import { useWallet } from '@/lib/WalletContext';

function StepDots({ step, total }: { step: number; total: number }) {
  if (total <= 1) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
      {Array.from({ length: total }).map((_, i) => (
        <Box
          key={i}
          sx={{
            width: i + 1 === step ? 16 : 6,
            height: 6,
            borderRadius: 1.5,
            bgcolor: i + 1 <= step ? '#A78BFA' : '#1E2035',
            transition: 'all 0.3s',
          }}
        />
      ))}
      <Typography variant="caption" sx={{ color: '#64748B', ml: 0.5 }}>
        Step {step} of {total}
      </Typography>
    </Box>
  );
}

export default function TxToast() {
  const wallet   = useWallet();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRef = useRef(wallet.clearTx);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { clearRef.current = wallet.clearTx; }, [wallet.clearTx]);

  useEffect(() => {
    if (!mounted) return;
    if (wallet.txStatus === 'success') {
      timerRef.current = setTimeout(() => clearRef.current(), 4000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [mounted, wallet.txStatus]);

  if (wallet.txStatus === 'idle') return null;

  const isPending = wallet.txStatus === 'pending';
  const isSuccess = wallet.txStatus === 'success';
  const isError   = wallet.txStatus === 'error';

  const accentColor = isPending ? '#7C3AED' : isSuccess ? '#22c55e' : '#ef4444';
  const iconBg      = isPending ? '#1a1535' : isSuccess ? '#052e16'  : '#450a0a';
  const label       = isPending ? 'Transaction Pending' : isSuccess ? 'Transaction Confirmed' : 'Transaction Failed';

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 1400,
        width: 320,
        bgcolor: '#12152A',
        border: `1px solid ${accentColor}44`,
        borderRadius: 3,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ height: 2, bgcolor: accentColor, width: '100%' }} />

      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: 2,
              bgcolor: iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              mt: 0.25,
            }}
          >
            {isPending && <CircularProgress size={18} sx={{ color: '#A78BFA' }} />}
            {isSuccess && <Typography sx={{ color: '#22c55e', fontSize: 16 }}>✓</Typography>}
            {isError   && <Typography sx={{ color: '#ef4444', fontSize: 16 }}>✕</Typography>}
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" sx={{ color: accentColor, display: 'block', mb: 0.25, fontWeight: 600 }}>
              {label}
            </Typography>
            <Typography variant="body2" color="text.primary" sx={{ lineHeight: 1.4 }}>
              {wallet.txMessage}
            </Typography>

            {isPending && <StepDots step={wallet.txStep} total={wallet.txTotalSteps} />}

            {isSuccess && (
              <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={100}
                  sx={{ flex: 1, height: 4, bgcolor: '#22c55e33', '& .MuiLinearProgress-bar': { bgcolor: '#22c55e' } }}
                />
                <Typography variant="caption" color="text.secondary">Dismissing…</Typography>
              </Box>
            )}
          </Box>

          <IconButton
            size="small"
            onClick={wallet.clearTx}
            sx={{ color: '#475569', width: 20, height: 20, flexShrink: 0, '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' } }}
          >
            <Typography sx={{ fontSize: 12, lineHeight: 1 }}>✕</Typography>
          </IconButton>
        </Box>

        {isPending && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, pt: 1.5, borderTop: '1px solid #1E2035' }}>
            Waiting for MetaMask confirmation…
          </Typography>
        )}
      </Box>
    </Paper>
  );
}
