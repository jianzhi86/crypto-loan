'use client';

import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import InputBase from '@mui/material/InputBase';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import CircularProgress from '@mui/material/CircularProgress';
import Navbar from '@/components/Navbar';
import { useWallet } from '@/lib/WalletContext';
import { ICO_ADDRESSES, ICO_ETH_MYR, ICO_ABI, RINGGIT_TOKEN_ABI } from '@/lib/icoConfig';

const ZERO = '0x0000000000000000000000000000000000000000';
const C = { bg: '#F4F6F8', card: '#FFFFFF', inner: '#EEF1F5', border: '#E2E7EE', teal: '#0E9F6E', tp: '#10151C', ts: '#5A6675', red: '#E5484D' };

export default function ICOPage() {
  const wallet = useWallet();
  const [ethAmount, setEthAmount] = useState('0.01');
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [myrBalance, setMyrBalance] = useState('0');
  const [sold, setSold] = useState('0');
  const [rate, setRate] = useState(ICO_ETH_MYR); // live RM per ETH (1 MYR = RM 1)
  const [toast, setToast] = useState<{ msg: string; sev: 'success' | 'error' | 'info' } | null>(null);

  const deployed = (ICO_ADDRESSES.ICO as string) !== ZERO && (ICO_ADDRESSES.RinggitToken as string) !== ZERO;
  const ethNum = parseFloat(ethAmount || '0');
  const myrToReceive = ethNum * rate; // 1 MYR = RM 1, rate = MYR per ETH

  // Read the buyer's MYR balance, total sold, and live on-chain price.
  const refresh = useCallback(async () => {
    if (!deployed || !wallet.address || typeof window === 'undefined' || !window.ethereum) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const token = new ethers.Contract(ICO_ADDRESSES.RinggitToken, RINGGIT_TOKEN_ABI, provider);
      const ico = new ethers.Contract(ICO_ADDRESSES.ICO, ICO_ABI, provider);
      const [bal, totalSold, priceWei] = await Promise.all([
        token.balanceOf(wallet.address) as Promise<bigint>,
        ico.totalTokensSold() as Promise<bigint>,
        ico.price() as Promise<bigint>,
      ]);
      setMyrBalance(parseFloat(ethers.formatUnits(bal, 18)).toFixed(2));
      setSold(parseFloat(ethers.formatUnits(totalSold, 18)).toFixed(2));
      if (priceWei > BigInt(0)) setRate(Math.round(1e18 / Number(priceWei))); // RM per ETH
    } catch { /* contract not reachable */ }
  }, [deployed, wallet.address]);

  const syncRate = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/sync-ico-price', { method: 'POST' });
      const data = await res.json() as { rate?: number; error?: string };
      if (res.ok) {
        setToast({ msg: `Re-pegged: 1 ETH = RM ${data.rate?.toLocaleString()}`, sev: 'success' });
        await refresh();
      } else {
        setToast({ msg: data.error ?? 'Sync failed', sev: 'error' });
      }
    } catch {
      setToast({ msg: 'Network error', sev: 'error' });
    } finally {
      setSyncing(false);
    }
  };

  // refresh() only setState's after an await (async chain RPC reads), so this is
  // data-loading, not a synchronous cascading render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh(); }, [refresh]);

  const buy = async () => {
    if (!window.ethereum) { setToast({ msg: 'MetaMask not found', sev: 'error' }); return; }
    if (!ethNum || ethNum <= 0) { setToast({ msg: 'Enter an ETH amount', sev: 'error' }); return; }
    setBusy(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const ico = new ethers.Contract(ICO_ADDRESSES.ICO, ICO_ABI, signer);
      const tx = await ico.buyToken({ value: ethers.parseEther(ethAmount) });
      await tx.wait();
      setToast({ msg: `Bought ${myrToReceive.toFixed(2)} MYRC`, sev: 'success' });
      setEthAmount('0.01');
      await refresh();
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'Transaction failed';
      setToast({ msg: reason.includes('insufficient') ? 'Insufficient ETH balance' : 'Purchase failed', sev: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: C.bg }}>
      <Navbar />
      <Box component="main" sx={{ maxWidth: 520, mx: 'auto', px: 2, py: 6 }}>
        <Typography variant="h5" sx={{ color: C.tp, fontWeight: 800, mb: 0.5 }}>Buy MYRC Token</Typography>
        <Typography variant="body2" sx={{ color: C.ts, mb: 3 }}>
          Purchase Ringgit Malaysia ICO (MYRC) with ETH. 1 MYRC = RM 1 (priced at the live ETH/MYR rate).
        </Typography>

        {!deployed && (
          <Alert severity="info" sx={{ mb: 3, bgcolor: 'rgba(0,200,160,0.06)', color: C.teal, border: `1px solid ${C.teal}25`, '& .MuiAlert-icon': { color: C.teal } }}>
            ICO not deployed yet. Run{' '}
            <Box component="code" sx={{ fontFamily: 'monospace', bgcolor: 'rgba(0,0,0,0.3)', px: 0.75, borderRadius: 0.5 }}>npm run deploy:ico</Box>{' '}
            (with the Hardhat node running), then refresh.
          </Alert>
        )}

        <Paper sx={{ p: 3, bgcolor: C.card, border: `1px solid ${C.border}`, borderRadius: 3 }}>
          {/* Price + stats */}
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            {[
              { label: 'Rate', value: `1 ETH = RM ${rate.toLocaleString()}` },
              { label: 'Your MYRC', value: `${myrBalance}` },
              { label: 'Total Sold', value: `${sold}` },
            ].map(s => (
              <Box key={s.label} sx={{ flex: 1, p: 1.5, bgcolor: C.inner, border: `1px solid ${C.border}`, borderRadius: 2 }}>
                <Typography variant="caption" sx={{ color: C.ts, display: 'block', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</Typography>
                <Typography variant="body2" sx={{ color: C.tp, fontWeight: 700, mt: 0.5 }}>{s.value}</Typography>
              </Box>
            ))}
          </Box>

          {/* Owner-only on-chain: re-peg price to the live ETH/MYR rate */}
          <Button size="small" onClick={syncRate} disabled={!deployed || syncing}
            sx={{ mb: 3, color: C.teal, border: `1px solid ${C.teal}25`, bgcolor: C.inner, fontSize: 11,
                  '&:hover': { bgcolor: `${C.teal}10`, borderColor: C.teal }, '&.Mui-disabled': { opacity: 0.4 } }}>
            {syncing ? '⟳ Syncing…' : '⟳ Sync rate to live market'}
          </Button>

          {!wallet.isConnected ? (
            <Box sx={{ p: 3, textAlign: 'center', bgcolor: C.inner, border: `2px dashed ${C.border}`, borderRadius: 2.5 }}>
              <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 2 }}>Connect MetaMask to buy MYR.</Typography>
              <Button variant="contained" onClick={wallet.connect}>Connect Wallet</Button>
            </Box>
          ) : (
            <>
              <Typography variant="caption" sx={{ color: C.ts, display: 'block', mb: 1, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.75 }}>
                ETH to Spend
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, bgcolor: C.inner, border: `1px solid ${C.border}`, borderRadius: 2, mb: 1 }}>
                <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#627EEA' }}>Ξ</Typography>
                <InputBase type="number" value={ethAmount} onChange={e => setEthAmount(e.target.value)}
                  placeholder="0.00" sx={{ flex: 1, color: C.tp, fontSize: 20, fontWeight: 600, '& input': { p: 0 } }} />
                <Typography variant="caption" sx={{ color: C.ts, fontWeight: 700 }}>ETH</Typography>
              </Box>
              <Typography variant="caption" sx={{ color: C.teal, display: 'block', mb: 3 }}>
                ≈ {myrToReceive.toFixed(2)} MYRC (RM {myrToReceive.toFixed(2)})
              </Typography>

              <Button fullWidth variant="contained" onClick={buy}
                disabled={!deployed || busy || !wallet.isCorrectNetwork || ethNum <= 0}
                sx={{ py: 1.5, fontSize: 14, borderRadius: 2.5 }}>
                {busy ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : `Buy ${myrToReceive > 0 ? myrToReceive.toFixed(2) : ''} MYRC`}
              </Button>

              {wallet.isConnected && !wallet.isCorrectNetwork && (
                <Typography variant="caption" sx={{ color: C.red, display: 'block', mt: 1.5, textAlign: 'center' }}>
                  Switch to the Hardhat Local network to buy.
                </Typography>
              )}
            </>
          )}
        </Paper>

        <Typography variant="caption" sx={{ color: C.ts, display: 'block', mt: 2, lineHeight: 1.7 }}>
          After buying, import the MYRC token in MetaMask using address{' '}
          <Box component="code" sx={{ fontFamily: 'monospace', color: C.tp, wordBreak: 'break-all' }}>{ICO_ADDRESSES.RinggitToken}</Box>{' '}
          to see your balance.
        </Typography>
      </Box>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        {toast ? <Alert severity={toast.sev} onClose={() => setToast(null)} variant="filled">{toast.msg}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
