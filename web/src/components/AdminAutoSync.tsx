'use client';
import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { LiveDot } from '@/components/Icons';

const INTERVAL_MS = 60_000;

/**
 * Fully automatic chain keeper — no buttons, no toggle. While an admin page
 * that renders it is open, it immediately re-pushes on-chain KYC flags
 * (POST /api/kyc/resync) and the ETH price (POST /api/admin/sync-price),
 * then repeats every minute. Only a small status line is shown so the admin
 * can see it is alive and when it last ran.
 */
export function AdminAutoSync() {
  const [status, setStatus] = useState('Auto-sync starting…');
  const [ok, setOk]         = useState(true);
  const running = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (running.current) return;
      running.current = true;
      try {
        const [kycRes, priceRes] = await Promise.all([
          fetch('/api/kyc/resync', { method: 'POST' }),
          fetch('/api/admin/sync-price', { method: 'POST' }),
        ]);
        const kyc   = await kycRes.json().catch(() => ({})) as { synced?: number; error?: string };
        const price = await priceRes.json().catch(() => ({})) as { newPrice?: number; error?: string };
        const at = new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (!kycRes.ok && !priceRes.ok) {
          setOk(false);
          setStatus(`Auto-sync failed ${at} — ${kyc.error ?? price.error ?? 'unknown error'}`);
        } else {
          const parts = [`${kyc.synced ?? 0} wallet${(kyc.synced ?? 0) === 1 ? '' : 's'}`];
          if (price.newPrice) parts.push(`ETH RM ${price.newPrice.toLocaleString()}`);
          setOk(true);
          setStatus(`Auto-synced ${at} · ${parts.join(' · ')} · every 1 min`);
        }
      } catch {
        setOk(false);
        setStatus('Auto-sync failed — network error');
      }
      running.current = false;
    };
    // First run immediately (a tick later so the effect body stays clean),
    // then once a minute for as long as the page is open.
    const first = setTimeout(run, 0);
    const id = setInterval(run, INTERVAL_MS);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
      <LiveDot color={ok ? '#2BD9A2' : '#E5484D'} />
      <Typography variant="caption" sx={{ color: ok ? 'rgba(255,255,255,0.55)' : '#E5484D', whiteSpace: 'nowrap' }}>
        {status}
      </Typography>
    </Box>
  );
}
