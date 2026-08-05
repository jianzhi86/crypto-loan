'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { useWallet } from '@/lib/WalletContext';

// Dark-navy tokens, matching the signed-in app (dashboard C.*).
const T = {
  card:   '#111B38',
  inner:  '#0F1730',
  border: 'rgba(255,255,255,0.12)',
  teal:   '#2BD9A2',
  tp:     '#F2F5FF',
  ts:     'rgba(255,255,255,0.65)',
};

/**
 * Post-transaction receipt. Every completed action (deposit / borrow / repay /
 * withdraw / buy) ends here with a thank-you, the exact amounts,
 * a reference (the tx hash), and a jump to the full history — so the user
 * always has confirmation and something to quote later.
 */
export default function TxReceiptDialog() {
  const wallet = useWallet();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const r = wallet.lastReceipt;
  if (!r) return null;

  const shortHash = `${r.txHash.slice(0, 10)}…${r.txHash.slice(-8)}`;
  const when = new Date(r.timestamp).toLocaleString('en-MY', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const copyHash = () => {
    navigator.clipboard?.writeText(r.txHash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const close = () => { setCopied(false); wallet.clearReceipt(); };

  return (
    <Dialog open onClose={close} maxWidth="xs" fullWidth
      slotProps={{ paper: { sx: { borderRadius: 3, bgcolor: T.card, border: `1px solid ${T.border}`, backgroundImage: 'none' } } }}>
      <DialogContent sx={{ p: 3.5, textAlign: 'center' }}>
        {/* Success mark */}
        <Box sx={{
          width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 2,
          bgcolor: `${T.teal}15`, border: `1px solid ${T.teal}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={T.teal} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </Box>

        <Typography variant="h6" sx={{ color: T.tp, fontWeight: 800, mb: 0.5 }}>{r.title}</Typography>
        <Typography variant="body2" sx={{ color: T.ts, mb: 2 }}>
          Thank you — your transaction is confirmed on-chain.
        </Typography>

        <Typography variant="h4" sx={{ color: T.teal, fontWeight: 800, mb: 2.5 }}>{r.amountLabel}</Typography>

        {/* Details */}
        <Box sx={{ p: 2, mb: 2, bgcolor: T.inner, border: `1px solid ${T.border}`, borderRadius: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {r.lines.map(line => (
            <Box key={line.label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
              <Typography variant="caption" sx={{ color: T.ts }}>{line.label}</Typography>
              <Typography variant="caption" sx={{ color: T.tp, fontWeight: 600, textAlign: 'right' }}>{line.value}</Typography>
            </Box>
          ))}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, pt: 1, borderTop: `1px solid ${T.border}` }}>
            <Typography variant="caption" sx={{ color: T.ts }}>Date &amp; time</Typography>
            <Typography variant="caption" sx={{ color: T.tp, fontWeight: 600 }}>{when}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
            <Typography variant="caption" sx={{ color: T.ts, flexShrink: 0 }}>Reference</Typography>
            <Box onClick={copyHash} title="Copy full transaction hash"
              sx={{ display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'pointer', minWidth: 0, '&:hover': { opacity: 0.8 } }}>
              <Typography variant="caption" sx={{ color: T.tp, fontWeight: 600, fontFamily: 'var(--font-geist-mono), monospace', fontSize: 11 }}>
                {copied ? 'Copied ✓' : shortHash}
              </Typography>
              {!copied && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.ts} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button fullWidth variant="outlined" onClick={() => { close(); router.push('/portfolio'); }}
            sx={{ borderColor: T.border, color: T.ts, borderRadius: 2, fontSize: 13, '&:hover': { borderColor: T.teal, color: T.teal } }}>
            View History
          </Button>
          <Button fullWidth variant="contained" onClick={close}
            sx={{ borderRadius: 2, fontSize: 13, background: `linear-gradient(135deg, ${T.teal}, #0B8B5E)` }}>
            Done
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
