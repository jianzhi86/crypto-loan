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

// Error toasts self-dismiss with a draining countdown bar; hovering pauses
// the clock so a long message can be read in peace.
const ERROR_MS = 3000;
// The toast fades out over the countdown's final stretch.
const FADE_MS  = 1200;

export default function TxToast() {
  const wallet   = useWallet();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRef = useRef(wallet.clearTx);
  const [mounted, setMounted] = useState(false);
  const [remaining, setRemaining] = useState(ERROR_MS);
  const [paused, setPaused] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { clearRef.current = wallet.clearTx; }, [wallet.clearTx]);

  useEffect(() => {
    if (!mounted) return;
    if (wallet.txStatus === 'success') {
      timerRef.current = setTimeout(() => clearRef.current(), 4000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [mounted, wallet.txStatus]);

  // Restart the error countdown whenever a (new) error appears.
  useEffect(() => {
    setRemaining(ERROR_MS);
    setPaused(false);
  }, [wallet.txStatus, wallet.txMessage]);

  // Tick the countdown while an error is showing and the pointer is away.
  useEffect(() => {
    if (!mounted || wallet.txStatus !== 'error' || paused) return;
    const TICK = 50;
    const id = setInterval(() => setRemaining(r => r - TICK), TICK);
    return () => clearInterval(id);
  }, [mounted, wallet.txStatus, paused]);

  useEffect(() => {
    if (wallet.txStatus === 'error' && remaining <= 0) clearRef.current();
  }, [wallet.txStatus, remaining]);

  if (wallet.txStatus === 'idle') return null;
  // A success that produced a receipt is celebrated by the receipt dialog —
  // showing the toast underneath it would be the same news twice.
  if (wallet.txStatus === 'success' && wallet.lastReceipt) return null;

  const isPending = wallet.txStatus === 'pending';
  const isSuccess = wallet.txStatus === 'success';
  const isError   = wallet.txStatus === 'error';

  const accentColor = isPending ? '#7C3AED' : isSuccess ? '#22c55e' : '#ef4444';
  const iconBg      = isPending ? '#1a1535' : isSuccess ? '#052e16'  : '#450a0a';
  // Errors are not always transactions (wallet linking, wrong account
  // selected…), so the error title stays neutral — the message carries the
  // specifics.
  const label       = isPending ? 'Transaction Pending' : isSuccess ? 'Transaction Confirmed' : 'Something went wrong';

  // Fade the error toast out over its final stretch; hovering restores it.
  const errorOpacity = !isError || paused
    ? 1
    : Math.min(1, Math.max(remaining, 0) / FADE_MS);
  const errorPct = (Math.max(remaining, 0) / ERROR_MS) * 100;

  return (
    <Paper
      elevation={8}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      sx={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 1400,
        width: 400,
        maxWidth: 'calc(100vw - 32px)',
        bgcolor: '#12152A',
        border: `1px solid ${accentColor}44`,
        borderRadius: 3,
        overflow: 'hidden',
        opacity: errorOpacity,
        transition: 'opacity 120ms linear',
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
            <Typography variant="caption" sx={{ color: accentColor, display: 'block', mb: 0.5, fontWeight: 700, fontSize: 12.5 }}>
              {label}
            </Typography>
            <Typography variant="body2" sx={{ lineHeight: 1.55, fontSize: 13.5, color: '#F2F5FF' }}>
              {wallet.txMessage}
            </Typography>

            {isPending && <StepDots step={wallet.txStep} total={wallet.txTotalSteps} />}

            {isError && (
              <Box sx={{ mt: 1.25, display: 'flex', alignItems: 'center', gap: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={errorPct}
                  sx={{
                    flex: 1, height: 4, borderRadius: 2, bgcolor: '#ef444426',
                    // Linear so the drain reads as a steady clock, not an
                    // animation easing around.
                    '& .MuiLinearProgress-bar': { bgcolor: '#ef4444', transition: 'transform 50ms linear' },
                  }}
                />
                <Typography variant="caption" sx={{ color: paused ? '#F2F5FF' : '#64748B', minWidth: 46, textAlign: 'right' }}>
                  {paused ? 'Paused' : `${Math.ceil(Math.max(remaining, 0) / 1000)}s`}
                </Typography>
              </Box>
            )}

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
