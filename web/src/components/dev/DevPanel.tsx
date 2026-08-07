'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import { useWallet } from '@/lib/WalletContext';
import { DEV_MODE_EVENT, isDevModeUnlocked, setDevModeUnlocked } from './dev-mode-client';

/**
 * Hidden developer panel for the local Hardhat demo chain: time travel with a
 * restore point, mock ETH price, base borrow rate — the levers that otherwise
 * mean running blockchain/scripts/*.ts by hand or re-logging as another role.
 *
 * Unlocked by tapping the navbar network chip 7 times (see Navbar.tsx); every
 * action goes through /api/dev, which enforces the real gates server-side.
 * The whole component compiles away to nothing in production bundles.
 */

interface DevStatus {
  chainTime: number;
  wallTime: number;
  ethPrice: number | null;
  baseRateBps: number | null;
  currentAprBps: number | null;
  keeperPaused: boolean;
  snapshot: { id: string; at: number | null; chainTime: number | null } | null;
}

const fmtTs = (sec: number | null | undefined) =>
  sec ? new Date(sec * 1000).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

function fmtOffset(chainTime: number, wallTime: number): string {
  const d = chainTime - wallTime;
  if (Math.abs(d) < 90) return 'in sync with real time';
  const days = Math.floor(Math.abs(d) / 86_400);
  const hours = Math.floor((Math.abs(d) % 86_400) / 3600);
  const parts = [days ? `${days}d` : '', hours ? `${hours}h` : ''].filter(Boolean).join(' ') || '<1h';
  return d > 0 ? `${parts} ahead of real time` : `${parts} behind real time`;
}

const S = {
  panelBg: '#0D1424',
  cardBg: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  text: 'rgba(255,255,255,0.92)',
  dim: 'rgba(255,255,255,0.55)',
  accent: '#6E8BFF',
  green: '#2BD9A2',
  amber: '#FFB224',
  red: '#FF7A7E',
};

const sectionTitle = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' as const,
  color: S.dim, mb: 1,
};

const smallBtn = {
  fontSize: 11.5, px: 1.25, py: 0.5, minWidth: 0, borderRadius: 1.5, fontWeight: 600,
  color: S.text, bgcolor: 'rgba(255,255,255,0.06)', border: S.border,
  '&:hover': { bgcolor: 'rgba(110,139,255,0.15)', borderColor: 'rgba(110,139,255,0.4)' },
};

/// Amount fields never mean a negative number: min=0 stops the stepper
/// arrows at zero, and this clamp catches a typed or pasted minus.
/// (Number('-') is NaN, so a half-typed value passes through untouched.)
const nonNeg = (v: string) => (Number(v) < 0 ? '0' : v);
const nonNegInput = { htmlInput: { min: 0 } };

const fieldSx = {
  '& .MuiInputBase-root': { bgcolor: 'rgba(255,255,255,0.05)', color: S.text, fontSize: 13, borderRadius: 1.5 },
  // The theme styles .MuiInputBase-input with its own (dark) text color, which
  // beats the color inherited from the root — restate it on the input itself.
  '& .MuiInputBase-input': { color: S.text },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.15)' },
  '& .MuiInputBase-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(110,139,255,0.4)' },
  '& .MuiInputLabel-root': { color: S.dim, fontSize: 12 },
};

// The unlock flag is external state (an in-memory module flag plus the window
// event fired when it changes) — useSyncExternalStore subscribes without an
// effect. No 'storage' listener: the flag is per-document by design, so it
// never crosses tabs and nothing writes it to storage to listen for.
function subscribeUnlock(cb: () => void) {
  window.addEventListener(DEV_MODE_EVENT, cb);
  return () => window.removeEventListener(DEV_MODE_EVENT, cb);
}

export default function DevPanel() {
  const unlocked = useSyncExternalStore(subscribeUnlock, isDevModeUnlocked, () => false);
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState<DevStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [customDays, setCustomDays] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [aprInput, setAprInput] = useState('');
  const wallet = useWallet();
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/dev', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      setSt(data as DevStatus);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Status is (re)fetched when the drawer is opened — event-driven, no effect.
  const openPanel = useCallback(() => {
    setOpen(true);
    void refresh();
  }, [refresh]);

  const act = useCallback(async (label: string, payload: Record<string, unknown>, doneMsg: string) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      setSt(data as DevStatus);
      setNotice(doneMsg);
      // Pull the app along: on-chain reads in WalletContext plus any RSC data.
      void wallet.refresh();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [wallet, router]);

  // Dev-only feature, and the server refuses production anyway — let the
  // bundler drop the whole tree from production builds.
  if (process.env.NODE_ENV === 'production') return null;
  if (!unlocked) return null;

  const disabled = busy !== null;

  return (
    <>
      {/* Floating launcher — sits above TxToast's bottom-right stack */}
      <Tooltip title="Developer panel" placement="left">
        <Box
          onClick={openPanel}
          sx={{
            position: 'fixed', bottom: 88, right: 24, zIndex: 1900,
            width: 44, height: 44, borderRadius: '50%', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: '#151F38', border: '1px solid rgba(110,139,255,0.45)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
            transition: 'all 0.15s',
            '&:hover': { bgcolor: '#1B2747', transform: 'scale(1.06)' },
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke={S.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        </Box>
      </Tooltip>

      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        slotProps={{ paper: { sx: { width: { xs: '100%', sm: 400 }, bgcolor: S.panelBg, backgroundImage: 'none' } } }}
        sx={{ zIndex: 2000 }}
      >
        <Box sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>

          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 800, color: S.text, flex: 1 }}>
              Developer Panel
            </Typography>
            <Chip label="Hardhat 31337" size="small" sx={{
              height: 20, fontSize: 10, fontWeight: 700, color: S.accent,
              bgcolor: 'rgba(110,139,255,0.12)', border: '1px solid rgba(110,139,255,0.3)',
            }} />
            <Button size="small" onClick={() => setOpen(false)}
              sx={{ minWidth: 0, px: 1, color: S.dim, fontSize: 16 }}>✕</Button>
          </Box>
          <Typography sx={{ fontSize: 11.5, color: S.dim, mt: -1.5 }}>
            Local test chain only — every action is refused in production and on
            any network that is not Hardhat 31337.
          </Typography>

          {error && (
            <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'rgba(229,72,77,0.1)', border: '1px solid rgba(229,72,77,0.3)' }}>
              <Typography sx={{ fontSize: 12, color: S.red }}>{error}</Typography>
            </Box>
          )}
          {notice && !error && (
            <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: 'rgba(43,217,162,0.08)', border: '1px solid rgba(43,217,162,0.25)' }}>
              <Typography sx={{ fontSize: 12, color: S.green }}>{notice}</Typography>
            </Box>
          )}

          {/* ── Chain clock ─────────────────────────────────────────────── */}
          <Box sx={{ p: 1.75, borderRadius: 2, bgcolor: S.cardBg, border: S.border }}>
            <Typography sx={sectionTitle}>Chain clock</Typography>
            <Typography sx={{ fontSize: 13.5, color: S.text, fontWeight: 600 }}>
              {fmtTs(st?.chainTime)}
            </Typography>
            <Typography sx={{ fontSize: 11.5, color: st && st.chainTime - st.wallTime > 90 ? S.amber : S.dim, mb: 1.5 }}>
              {st ? fmtOffset(st.chainTime, st.wallTime) : 'Loading…'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.25 }}>
              {[1, 7, 30, 98].map(d => (
                <Button key={d} size="small" disabled={disabled} sx={smallBtn}
                  onClick={() => act('time', { action: 'advance-time', days: d }, `Chain clock advanced by ${d} day${d > 1 ? 's' : ''}.`)}>
                  +{d}d
                </Button>
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField size="small" label="Custom days" type="number" value={customDays}
                slotProps={nonNegInput}
                onChange={e => setCustomDays(nonNeg(e.target.value))} sx={{ ...fieldSx, flex: 1 }} />
              <Button size="small" disabled={disabled || !(Number(customDays) > 0)} sx={smallBtn}
                onClick={() => act('time', { action: 'advance-time', days: Number(customDays) }, `Chain clock advanced by ${customDays} day(s).`)}>
                {busy === 'time' ? '…' : 'Jump'}
              </Button>
            </Box>
            <Typography sx={{ fontSize: 10.5, color: S.dim, mt: 1 }}>
              +98d = 90-day term + 7-day grace + 1 — makes a fresh 90-day loan
              liquidatable. Time only moves forward; use the restore point to go back.
            </Typography>
          </Box>

          {/* ── Restore point ───────────────────────────────────────────── */}
          <Box sx={{ p: 1.75, borderRadius: 2, bgcolor: S.cardBg, border: S.border }}>
            <Typography sx={sectionTitle}>Restore point</Typography>
            {st?.snapshot ? (
              <>
                <Typography sx={{ fontSize: 12.5, color: S.text }}>
                  Saved {st.snapshot.at ? new Date(st.snapshot.at).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: S.dim, mb: 1.25 }}>
                  Chain clock then: {fmtTs(st.snapshot.chainTime)}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75 }}>
                  <Button size="small" disabled={disabled}
                    sx={{ ...smallBtn, color: S.amber, borderColor: 'rgba(255,178,36,0.35)' }}
                    onClick={() => act('restore', { action: 'restore' }, 'Chain restored — time, price and every transaction since the restore point are rolled back.')}>
                    {busy === 'restore' ? 'Restoring…' : 'Restore chain to this point'}
                  </Button>
                  <Button size="small" disabled={disabled} sx={smallBtn}
                    onClick={() => act('snapshot', { action: 'snapshot' }, 'Restore point replaced with the current chain state.')}>
                    Replace
                  </Button>
                </Box>
              </>
            ) : (
              <>
                <Typography sx={{ fontSize: 12, color: S.dim, mb: 1.25 }}>
                  None saved. One is created automatically before your first time
                  jump, or save one now.
                </Typography>
                <Button size="small" disabled={disabled} sx={smallBtn}
                  onClick={() => act('snapshot', { action: 'snapshot' }, 'Restore point saved.')}>
                  {busy === 'snapshot' ? '…' : 'Save restore point'}
                </Button>
              </>
            )}
            <Typography sx={{ fontSize: 10.5, color: S.dim, mt: 1 }}>
              Restoring rewinds the whole chain — loans, balances and price
              changes made after the point disappear. If MetaMask then rejects
              transactions, clear its activity data (Settings → Advanced).
            </Typography>
          </Box>

          {/* ── ETH price ───────────────────────────────────────────────── */}
          <Box sx={{ p: 1.75, borderRadius: 2, bgcolor: S.cardBg, border: S.border }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Typography sx={{ ...sectionTitle, mb: 0, flex: 1 }}>ETH price (on-chain)</Typography>
              {st?.keeperPaused && (
                <Chip label="auto-sync paused" size="small" sx={{
                  height: 18, fontSize: 9.5, fontWeight: 700, color: S.amber,
                  bgcolor: 'rgba(255,178,36,0.1)', border: '1px solid rgba(255,178,36,0.3)',
                }} />
              )}
            </Box>
            <Typography sx={{ fontSize: 16, fontWeight: 700, color: S.text, mb: 1.25 }}>
              {st?.ethPrice != null ? `RM ${st.ethPrice.toLocaleString()}` : '—'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.25 }}>
              {[-30, -15, 15, 30].map(pct => (
                <Button key={pct} size="small" disabled={disabled || st?.ethPrice == null} sx={smallBtn}
                  onClick={() => {
                    const target = Math.round((st!.ethPrice!) * (1 + pct / 100));
                    void act('price', { action: 'set-price', price: target }, `ETH price set to RM ${target.toLocaleString()}. Auto-sync paused so it sticks.`);
                  }}>
                  {pct > 0 ? `+${pct}%` : `${pct}%`}
                </Button>
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <TextField size="small" label="RM per ETH" type="number" value={priceInput}
                slotProps={nonNegInput}
                onChange={e => setPriceInput(nonNeg(e.target.value))} sx={{ ...fieldSx, flex: 1 }} />
              <Button size="small" disabled={disabled || !(Number(priceInput) > 0)} sx={smallBtn}
                onClick={() => act('price', { action: 'set-price', price: Number(priceInput) }, `ETH price set to RM ${Number(priceInput).toLocaleString()}. Auto-sync paused so it sticks.`)}>
                {busy === 'price' ? '…' : 'Set'}
              </Button>
            </Box>
            <Button size="small" disabled={disabled} sx={{ ...smallBtn, width: '100%' }}
              onClick={() => act('sync', { action: 'sync-market' }, 'Price re-synced to the live market; auto-sync resumed.')}>
              {busy === 'sync' ? 'Syncing…' : 'Back to live market price'}
            </Button>
            <Typography sx={{ fontSize: 10.5, color: S.dim, mt: 1 }}>
              The contract caps each move at 20%, so big jumps are walked in
              steps automatically. A −30% drop is a quick way to make positions
              liquidatable by price.
            </Typography>
          </Box>

          {/* ── Borrow rate ─────────────────────────────────────────────── */}
          <Box sx={{ p: 1.75, borderRadius: 2, bgcolor: S.cardBg, border: S.border }}>
            <Typography sx={sectionTitle}>Borrow rate</Typography>
            <Typography sx={{ fontSize: 12.5, color: S.text, mb: 1.25 }}>
              Base {st?.baseRateBps != null ? (st.baseRateBps / 100).toFixed(2) : '—'}%
              <Box component="span" sx={{ color: S.dim }}>
                {' '}· live APR {st?.currentAprBps != null ? (st.currentAprBps / 100).toFixed(2) : '—'}%
                (base + utilisation premium)
              </Box>
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.25 }}>
              {[100, 300, 800, 1500].map(bps => (
                <Button key={bps} size="small" disabled={disabled} sx={smallBtn}
                  onClick={() => act('apr', { action: 'set-apr', baseRateBps: bps }, `Base rate set to ${(bps / 100).toFixed(2)}%. Auto-sync paused so it sticks.`)}>
                  {(bps / 100).toFixed(bps % 100 ? 2 : 0)}%
                </Button>
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField size="small" label="Base rate %" type="number" value={aprInput}
                slotProps={nonNegInput}
                onChange={e => setAprInput(nonNeg(e.target.value))} sx={{ ...fieldSx, flex: 1 }} />
              <Button size="small"
                disabled={disabled || aprInput === '' || Number(aprInput) < 0 || Number(aprInput) > 15}
                sx={smallBtn}
                onClick={() => act('apr', { action: 'set-apr', baseRateBps: Math.round(Number(aprInput) * 100) }, `Base rate set to ${Number(aprInput)}%. Auto-sync paused so it sticks.`)}>
                {busy === 'apr' ? '…' : 'Set'}
              </Button>
            </Box>
            <Typography sx={{ fontSize: 10.5, color: S.dim, mt: 1 }}>
              0–15% (contract cap). New rates apply to NEW loans only — existing
              loans keep the APR they were born with.
            </Typography>
          </Box>

          {/* ── Liquidation ─────────────────────────────────────────────── */}
          <Box sx={{ p: 1.75, borderRadius: 2, bgcolor: S.cardBg, border: S.border }}>
            <Typography sx={sectionTitle}>Liquidation</Typography>
            <Typography sx={{ fontSize: 11.5, color: S.dim }}>
              Moved to the admin panel — <Box component="span" sx={{ color: S.text, fontWeight: 600 }}>Admin → Recovery</Box>,
              which lists every loan the protocol may seize collateral on and
              badges the tab when one appears. Use the levers above to create a
              case for it: crash the ETH price to push a position underwater, or
              jump the clock past due date + 7 days to make it overdue.
            </Typography>
          </Box>

          {/* ── Keeper ──────────────────────────────────────────────────── */}
          <Box sx={{ p: 1.75, borderRadius: 2, bgcolor: S.cardBg, border: S.border, display: 'flex', alignItems: 'center' }}>
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ ...sectionTitle, mb: 0.25 }}>Price auto-sync keeper</Typography>
              <Typography sx={{ fontSize: 11, color: S.dim }}>
                Re-syncs price &amp; base rate to CoinGecko every minute. Paused
                automatically when you set either manually.
              </Typography>
            </Box>
            <Switch
              checked={st ? !st.keeperPaused : true}
              disabled={disabled || !st}
              onChange={(_, on) => act('keeper', { action: 'keeper', paused: !on }, on ? 'Auto-sync resumed.' : 'Auto-sync paused.')}
            />
          </Box>

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
          <Button size="small" onClick={() => { setOpen(false); setDevModeUnlocked(false); }}
            sx={{ color: S.dim, fontSize: 11.5, alignSelf: 'center', '&:hover': { color: S.red } }}>
            Hide developer panel (tap the network chip 7× to bring it back)
          </Button>
        </Box>
      </Drawer>
    </>
  );
}
