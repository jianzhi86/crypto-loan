'use client';

import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputBase from '@mui/material/InputBase';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { useWallet } from '@/lib/WalletContext';
import { AlertIcon, ClockIcon, TrendDownIcon } from '@/components/Icons';
import { Badge, C, EmptyState } from './ui';
import RecoveryConfirmDialog, { type RecoveryMode } from './RecoveryConfirmDialog';

/**
 * The protocol's collections desk.
 *
 * A loan lands here when the borrower has stopped being able to settle it on
 * their own terms — either it ran past its due date plus the 7-day grace, or
 * the account's health factor fell below 1. The admin's one action is
 * recoverLoan(): seize collateral, write the debt off, and (on the overdue
 * path only) charge the late penalty on top.
 *
 * Everything shown here — eligibility, debt, penalty, ETH to be seized — is
 * quoted by the contract itself via recoveryQuote(). Nothing on this screen
 * re-derives those numbers, because an admin authorising a seizure has to be
 * looking at what the chain will actually do.
 */

export interface RecoveryRow {
  wallet: string;
  email: string | null;
  loanId: number;
  principalMYR: number;
  debtMYR: number;
  penaltyMYR: number;
  seizeEth: number;
  collateralEth: number;
  dueDate: string;
  healthFactor: number | null;
  unhealthy: boolean;
  overdue: boolean;
  shortfall: boolean;
}

interface Payload {
  loans: RecoveryRow[];
  latePenaltyBps: number;
  ethPriceMYR: number;
  overdueCount: number;
  unhealthyCount: number;
  error?: string;
}

const rm = (n: number, dp = 2) =>
  `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

const shortWallet = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;

const daysOverdue = (dueIso: string) =>
  Math.floor((Date.now() - new Date(dueIso).getTime()) / 86_400_000);

export default function AdminRecovery() {
  const wallet = useWallet();
  const [data, setData]       = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [busy, setBusy]       = useState<string | null>(null);
  const [done, setDone]       = useState<string | null>(null);
  const [penaltyInput, setPenaltyInput] = useState('');
  // The loan the confirmation dialog is currently asking about, and which of
  // the two settlement paths it was opened for.
  const [pending, setPending] = useState<{ row: RecoveryRow; mode: RecoveryMode } | null>(null);

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/admin/recovery', { cache: 'no-store' });
      const json = await res.json() as Payload;
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Kicked off from inside an async callback rather than the effect body: the
  // state writes belong to the fetch resolving, not to the render that mounted
  // this component.
  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (alive) await load();
    };
    void run();
    return () => { alive = false; };
  }, [load]);

  // Owner path: the server signs recoverLoan() — no MYR, collateral to the
  // protocol.
  const runSeize = async (row: RecoveryRow) => {
    const res  = await fetch('/api/admin/recovery/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: row.wallet, loanId: row.loanId }),
    });
    const json = await res.json() as {
      error?: string; seizedEth?: number; debtCoveredMYR?: number;
      penaltyChargedMYR?: number; closed?: boolean;
    };
    if (!res.ok) throw new Error(json.error ?? 'Recovery failed');
    setDone(
      `Seized ${(json.seizedEth ?? 0).toFixed(4)} ETH from ${shortWallet(row.wallet)} — `
      + `${rm(json.debtCoveredMYR ?? 0)} of debt cleared`
      + ((json.penaltyChargedMYR ?? 0) > 0 ? `, ${rm(json.penaltyChargedMYR!)} penalty charged` : '')
      + (json.closed ? '. Loan closed.' : '. Loan still open for the shortfall.'),
    );
  };

  // Open-market path: this admin's own wallet pays the debt in MYR and takes
  // the 5% bonus. setLiquidator is onlyOwner, so the roll is granted
  // server-side first; the liquidation itself is signed in MetaMask.
  const runLiquidate = async (row: RecoveryRow) => {
    if (!wallet.address) throw new Error('Connect your wallet first — this path pays the debt from it.');
    const res  = await fetch('/api/admin/recovery/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approveLiquidator: wallet.address }),
    });
    const json = await res.json() as { error?: string };
    if (!res.ok) throw new Error(json.error ?? 'Could not grant the liquidator role');

    const seized = await wallet.liquidate(row.wallet, row.loanId, row.debtMYR.toFixed(2));
    // null means the wallet reported the failure through its own tx toast —
    // repeating it here would double up the message.
    if (seized === null) return;
    setDone(
      `Liquidated loan #${row.loanId} — received ${seized.toFixed(4)} ETH `
      + `(incl. the 5% bonus) for covering ${shortWallet(row.wallet)}'s debt.`,
    );
  };

  const confirmPending = async () => {
    if (!pending) return;
    const { row, mode } = pending;
    setBusy(`${row.wallet}-${row.loanId}`); setError(''); setDone(null);
    try {
      if (mode === 'seize') await runSeize(row);
      else                  await runLiquidate(row);
      setPending(null);
      await load();
    } catch (e) {
      setPending(null);
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const savePenalty = async () => {
    const pct = Number(penaltyInput);
    if (!Number.isFinite(pct) || pct < 0 || pct > 20) {
      setError('Late penalty must be between 0% and 20% (the contract\'s cap).');
      return;
    }
    setBusy('penalty'); setError(''); setDone(null);
    try {
      const res  = await fetch('/api/admin/recovery/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latePenaltyBps: Math.round(pct * 100) }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Update failed');
      setDone(`Late penalty set to ${pct}%.`);
      setPenaltyInput('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={26} sx={{ color: C.blue }} />
      </Box>
    );
  }

  const rows = data?.loans ?? [];
  const totalSeizable = rows.reduce((s, r) => s + r.seizeEth, 0);
  const totalDebt     = rows.reduce((s, r) => s + r.debtMYR, 0);

  return (
    <>
      <RecoveryConfirmDialog
        // Keyed on the pending action so closing tears the instance down and
        // the next open cannot inherit the previous one's confirmation stage.
        key={pending ? `${pending.row.wallet}-${pending.row.loanId}-${pending.mode}` : 'idle'}
        row={pending?.row ?? null}
        mode={pending?.mode ?? 'seize'}
        open={pending !== null}
        busy={busy !== null}
        myrBalance={Number(wallet.myrBalance) || 0}
        onCancel={() => setPending(null)}
        onConfirm={() => { void confirmPending(); }}
      />

      {error && (
        <Box sx={{ p: 1.75, mb: 2, borderRadius: 2, bgcolor: 'rgba(229,72,77,0.08)', border: '1px solid rgba(229,72,77,0.25)' }}>
          <Typography sx={{ fontSize: 12.5, color: C.red }}>{error}</Typography>
        </Box>
      )}
      {done && (
        <Box sx={{ p: 1.75, mb: 2, borderRadius: 2, bgcolor: 'rgba(43,217,162,0.08)', border: '1px solid rgba(43,217,162,0.25)' }}>
          <Typography sx={{ fontSize: 12.5, color: C.green }}>{done}</Typography>
        </Box>
      )}

      {/* Summary tiles */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5, mb: 3 }}>
        {[
          { label: 'Overdue past grace', value: data?.overdueCount ?? 0, color: (data?.overdueCount ?? 0) > 0 ? C.red : C.muted,
            hint: 'Penalty chargeable' },
          { label: 'Underwater (HF < 1)', value: data?.unhealthyCount ?? 0, color: (data?.unhealthyCount ?? 0) > 0 ? C.amber : C.muted,
            hint: 'No penalty — price risk' },
          { label: 'Debt recoverable', value: rm(totalDebt, 0), color: C.ink, hint: 'Across all listed loans' },
          { label: 'Collateral at stake', value: `${totalSeizable.toFixed(3)} ETH`, color: C.ink,
            hint: data?.ethPriceMYR ? `≈ ${rm(totalSeizable * data.ethPriceMYR, 0)} on-chain` : undefined },
        ].map(s => (
          <Paper key={s.label} sx={{
            p: 2.25, bgcolor: '#0D1628', border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${s.color === C.muted ? C.border : s.color}`,
            borderRadius: 2, boxShadow: 'none',
          }}>
            <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.75 }}>
              {s.label}
            </Typography>
            <Typography sx={{ color: s.color, fontWeight: 800, fontSize: 26, lineHeight: 1.1, letterSpacing: -0.5 }}>
              {s.value}
            </Typography>
            {s.hint && <Typography sx={{ fontSize: 10.5, color: C.muted, mt: 0.4 }}>{s.hint}</Typography>}
          </Paper>
        ))}
      </Box>

      {/* Late penalty control */}
      <Paper sx={{
        p: 2.25, mb: 3, bgcolor: '#0D1628', border: `1px solid ${C.border}`,
        borderRadius: 2, boxShadow: 'none',
        display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
      }}>
        <Box sx={{ flex: 1, minWidth: 260 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>
            Late penalty · {((data?.latePenaltyBps ?? 0) / 100).toFixed(2)}%
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: C.muted, mt: 0.3 }}>
            Charged on top of the debt when a loan is recovered for being overdue.
            Never charged on the health-factor path. Contract cap 20%.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <InputBase
            value={penaltyInput}
            // Amounts are never negative: min=0 stops the stepper at zero, the
            // clamp catches a typed minus ('-' alone is NaN → untouched).
            onChange={e => setPenaltyInput(Number(e.target.value) < 0 ? '0' : e.target.value)}
            placeholder="5"
            type="number"
            inputProps={{ min: 0 }}
            sx={{
              width: 90, px: 1.25, py: 0.5, fontSize: 13, color: C.ink,
              bgcolor: 'rgba(255,255,255,0.05)', border: `1px solid ${C.border}`, borderRadius: 1.5,
            }}
          />
          <Typography sx={{ fontSize: 13, color: C.muted }}>%</Typography>
          <Button
            size="small"
            disabled={busy !== null || penaltyInput === ''}
            onClick={() => { void savePenalty(); }}
            sx={{
              fontSize: 12, fontWeight: 600, color: C.blue, textTransform: 'none',
              border: `1px solid rgba(110,139,255,0.3)`, borderRadius: 1.5, px: 1.5,
            }}
          >
            {busy === 'penalty' ? 'Saving…' : 'Update'}
          </Button>
        </Box>
      </Paper>

      {rows.length === 0 ? (
        <EmptyState
          title="Nothing to recover"
          hint="Every open loan is inside its grace period and adequately collateralised. Loans appear here the moment they pass due date + 7 days, or the account's health factor drops below 1."
        />
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {rows.map(r => {
            const key  = `${r.wallet}-${r.loanId}`;
            const late = daysOverdue(r.dueDate);
            return (
              <Paper key={key} sx={{
                p: 2.25, bgcolor: '#0D1628',
                border: `1px solid ${r.overdue ? 'rgba(229,72,77,0.3)' : 'rgba(255,178,36,0.25)'}`,
                borderRadius: 2, boxShadow: 'none',
              }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
                  <Box sx={{ flex: 1, minWidth: 280 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, flexWrap: 'wrap' }}>
                      <Box sx={{ color: r.overdue ? C.red : C.amber, display: 'flex' }}>
                        {r.overdue ? <ClockIcon size={14} /> : <TrendDownIcon size={14} />}
                      </Box>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>
                        Loan #{r.loanId} · {rm(r.debtMYR)} owed
                      </Typography>
                      {r.overdue && <Badge label={`${late}d overdue`} tone="red" title="Past due date + 7-day grace" />}
                      {r.unhealthy && <Badge label={`HF ${r.healthFactor?.toFixed(2) ?? '—'}`} tone="amber" title="Health factor below 1" />}
                      {r.shortfall && <Badge label="Under-collateralised" tone="red" title="Seizing everything still will not clear the debt" />}
                    </Box>

                    <Typography sx={{ fontSize: 11.5, color: C.slate, fontFamily: 'monospace' }}>
                      {r.wallet}
                    </Typography>
                    {r.email && (
                      <Typography sx={{ fontSize: 11.5, color: C.muted, mt: 0.2 }}>{r.email}</Typography>
                    )}

                    <Box sx={{ display: 'flex', gap: 2.5, mt: 1.25, flexWrap: 'wrap' }}>
                      {[
                        { k: 'Principal', v: rm(r.principalMYR) },
                        { k: 'Late penalty', v: r.penaltyMYR > 0 ? rm(r.penaltyMYR) : '—' },
                        { k: 'Due', v: new Date(r.dueDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' }) },
                        { k: 'Their collateral', v: `${r.collateralEth.toFixed(4)} ETH` },
                      ].map(f => (
                        <Box key={f.k}>
                          <Typography sx={{ fontSize: 9.5, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {f.k}
                          </Typography>
                          <Typography sx={{ fontSize: 12.5, color: C.ink, fontWeight: 600 }}>{f.v}</Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>

                  <Box sx={{ textAlign: 'right', minWidth: 170 }}>
                    <Typography sx={{ fontSize: 9.5, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Will seize
                    </Typography>
                    <Typography sx={{ fontSize: 21, fontWeight: 800, color: C.red, lineHeight: 1.2, letterSpacing: -0.4 }}>
                      {r.seizeEth.toFixed(4)} ETH
                    </Typography>
                    {!!data?.ethPriceMYR && (
                      <Typography sx={{ fontSize: 10.5, color: C.muted, mb: 1 }}>
                        ≈ {rm(r.seizeEth * data.ethPriceMYR, 0)} at the on-chain price
                      </Typography>
                    )}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 0.5, alignItems: 'stretch' }}>
                      <Button
                        size="small"
                        disabled={busy !== null}
                        onClick={() => setPending({ row: r, mode: 'seize' })}
                        sx={{
                          fontSize: 12, fontWeight: 700, textTransform: 'none',
                          color: C.red, border: '1px solid rgba(229,72,77,0.35)',
                          borderRadius: 1.5, px: 1.75,
                          '&:hover': { bgcolor: 'rgba(229,72,77,0.1)' },
                        }}
                      >
                        {busy === key ? 'Working…' : 'Seize collateral'}
                      </Button>
                      {/* The open-market alternative: pay the debt yourself and
                          take the 5% bonus. Needs a connected wallet holding
                          MYR, so it stays out of the way when there isn't one. */}
                      <Button
                        size="small"
                        disabled={busy !== null || !wallet.isConnected}
                        title={wallet.isConnected
                          ? 'Pay this debt in MYR from your wallet and receive the collateral plus a 5% bonus'
                          : 'Connect a wallet holding MYR to use the liquidation path'}
                        onClick={() => setPending({ row: r, mode: 'liquidate' })}
                        sx={{
                          fontSize: 11.5, fontWeight: 600, textTransform: 'none',
                          color: C.blue, border: '1px solid rgba(110,139,255,0.3)',
                          borderRadius: 1.5, px: 1.75,
                          '&:hover': { bgcolor: 'rgba(110,139,255,0.1)' },
                        }}
                      >
                        Liquidate (+5% bonus)
                      </Button>
                    </Box>
                  </Box>
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      <Box sx={{
        display: 'flex', gap: 1.5, alignItems: 'flex-start',
        p: 1.75, mt: 3, borderRadius: 2,
        bgcolor: 'rgba(110,139,255,0.04)', border: '1px solid rgba(110,139,255,0.14)',
      }}>
        <Box sx={{ color: C.blue, mt: '1px', flexShrink: 0 }}><AlertIcon size={15} /></Box>
        <Typography sx={{ color: C.slate, fontSize: 12.5, lineHeight: 1.65 }}>
          <b style={{ color: C.ink }}>Seize collateral</b> settles the debt out of the
          borrower&apos;s ETH at the contract&apos;s oracle price — no MYR changes hands. The
          interest, plus the late penalty when the loan is overdue, is booked into
          Protocol Fees where it can be swept; the seized ETH itself goes to the owner
          wallet as recovered capital. Debt is always paid before the penalty, so if the
          collateral falls short the protocol forfeits its penalty rather than leaving
          the borrower owing more.{' '}
          <b style={{ color: C.ink }}>Liquidate</b> is the open-market alternative: you
          pay the debt in MYR from your own wallet and receive the collateral plus the
          contract&apos;s 5% liquidator bonus. Either way, anything left over after the loan
          is square stays the borrower&apos;s and remains withdrawable, and every action is
          written to the audit log with the wallet, loan and amounts.
        </Typography>
      </Box>
    </>
  );
}
