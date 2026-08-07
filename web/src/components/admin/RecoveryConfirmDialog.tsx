'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import Typography from '@mui/material/Typography';
import { AlertIcon } from '@/components/Icons';
import { C } from './ui';
import type { RecoveryRow } from './AdminRecovery';

/**
 * Two-stage confirmation for taking someone's collateral.
 *
 * Seizing is irreversible and moves real value out of a borrower's wallet, so
 * a single click — or a browser confirm() that people dismiss on reflex — is
 * not enough. Stage one lays out exactly what the chain will do; stage two
 * states the consequence on its own, with the amount in the button itself, so
 * the second click cannot be muscle memory from the first.
 */

export type RecoveryMode = 'seize' | 'liquidate';

const rm = (n: number, dp = 2) =>
  `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export default function RecoveryConfirmDialog({
  row, mode, open, busy, myrBalance, onCancel, onConfirm,
}: {
  row: RecoveryRow | null;
  mode: RecoveryMode;
  open: boolean;
  busy: boolean;
  /** The admin's own MYR, for the liquidate path's affordability check. */
  myrBalance: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // The caller keys this component on the loan being confirmed, so closing the
  // dialog destroys the instance and every fresh open starts at the review
  // stage — never at the point of no return left over from the last loan.
  const [stage, setStage] = useState<1 | 2>(1);

  if (!row) return null;

  const isSeize   = mode === 'seize';
  const totalOwed = row.debtMYR + row.penaltyMYR;
  // The liquidate path pays out of the admin's pocket and is capped by it.
  const covering  = isSeize ? totalOwed : Math.min(row.debtMYR, myrBalance);
  const short     = !isSeize && myrBalance < row.debtMYR;
  const canAfford = isSeize || myrBalance > 0;

  const rows: [string, string][] = isSeize
    ? [
        ['Borrower',        row.wallet],
        ['Loan',            `#${row.loanId}`],
        ['Debt',            rm(row.debtMYR)],
        ['Late penalty',    row.penaltyMYR > 0 ? rm(row.penaltyMYR) : 'None — recovered on health factor, not lateness'],
        ['Collateral taken', `${row.seizeEth.toFixed(4)} ETH of their ${row.collateralEth.toFixed(4)} ETH`],
        ['Protocol earns',  row.penaltyMYR > 0
          ? `Interest + ${rm(row.penaltyMYR)} penalty → withdrawable fees`
          : 'The interest → withdrawable fees (no penalty on this path)'],
        ['Seized ETH to',   'Owner wallet, as recovered capital'],
        ['Cost to you',     'Nothing — no MYR changes hands'],
      ]
    : [
        ['Borrower',        row.wallet],
        ['Loan',            `#${row.loanId}`],
        ['Debt',            rm(row.debtMYR)],
        ['You pay',         `${rm(covering)} in MYR from your wallet`],
        ['You receive',     `${row.seizeEth.toFixed(4)} ETH incl. the 5% liquidator bonus`],
        ['Your MYR',        rm(myrBalance)],
      ];

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onCancel}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { bgcolor: '#0D1628', backgroundImage: 'none', border: `1px solid ${C.border}`, borderRadius: 3 } } }}
    >
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 0.5 }}>
          <Box sx={{ color: stage === 2 ? C.red : C.amber, display: 'flex' }}><AlertIcon size={18} /></Box>
          <Typography sx={{ fontSize: 17, fontWeight: 800, color: C.ink, letterSpacing: -0.3 }}>
            {stage === 1
              ? (isSeize ? 'Seize collateral to settle this loan' : 'Liquidate this loan')
              : 'Confirm — this cannot be undone'}
          </Typography>
        </Box>

        {stage === 1 ? (
          <>
            <Typography sx={{ fontSize: 12.5, color: C.muted, mb: 2.5, lineHeight: 1.6 }}>
              {isSeize
                ? 'The protocol takes the borrower\'s ETH at the contract\'s oracle price and writes the debt off. No MYR is involved.'
                : 'You pay this loan\'s debt in MYR from your own wallet and receive the equivalent collateral plus a 5% bonus. This is the open-market liquidation path.'}
            </Typography>

            <Box sx={{ border: `1px solid ${C.border}`, borderRadius: 2, overflow: 'hidden', mb: 2 }}>
              {rows.map(([k, v], i) => (
                <Box key={k} sx={{
                  display: 'flex', gap: 2, px: 1.75, py: 1.1,
                  bgcolor: i % 2 ? 'transparent' : 'rgba(255,255,255,0.02)',
                }}>
                  <Typography sx={{ fontSize: 11.5, color: C.muted, minWidth: 132, flexShrink: 0 }}>{k}</Typography>
                  <Typography sx={{
                    fontSize: 12, color: C.ink, fontWeight: 600, wordBreak: 'break-all',
                    fontFamily: k === 'Borrower' ? 'monospace' : undefined,
                  }}>
                    {v}
                  </Typography>
                </Box>
              ))}
            </Box>

            {isSeize && row.shortfall && (
              <Warn>
                Their collateral does not cover the full debt. Everything they have
                will be taken and the loan will stay open for the shortfall — the
                protocol forfeits its penalty rather than growing what they owe.
              </Warn>
            )}
            {!isSeize && short && (
              <Warn>
                You hold {rm(myrBalance)} but the debt is {rm(row.debtMYR)}. This will
                be a partial liquidation: you pay what you have and seize collateral
                in proportion, leaving the loan open for the rest.
              </Warn>
            )}
            {!isSeize && !canAfford && (
              <Warn>
                This wallet holds no MYR. A liquidator has to pay the debt to seize
                collateral — use &ldquo;Seize collateral&rdquo; instead, which needs none.
              </Warn>
            )}
          </>
        ) : (
          <>
            <Typography sx={{ fontSize: 13, color: C.slate, mb: 2, lineHeight: 1.7 }}>
              {isSeize ? (
                <>
                  You are about to permanently remove{' '}
                  <b style={{ color: C.red }}>{row.seizeEth.toFixed(4)} ETH</b> from{' '}
                  <b style={{ color: C.ink }}>{row.wallet.slice(0, 10)}…{row.wallet.slice(-6)}</b>.
                  Their remaining balance will be{' '}
                  <b style={{ color: C.ink }}>{Math.max(0, row.collateralEth - row.seizeEth).toFixed(4)} ETH</b>.
                </>
              ) : (
                <>
                  You are about to spend <b style={{ color: C.amber }}>{rm(covering)}</b> of
                  your own MYR to seize{' '}
                  <b style={{ color: C.red }}>{row.seizeEth.toFixed(4)} ETH</b> from{' '}
                  <b style={{ color: C.ink }}>{row.wallet.slice(0, 10)}…{row.wallet.slice(-6)}</b>.
                </>
              )}
            </Typography>
            <Typography sx={{ fontSize: 12.5, color: C.muted, mb: 2.5, lineHeight: 1.65 }}>
              This sends a real on-chain transaction. There is no undo, and the
              action is written to the audit log against your account.
            </Typography>
          </>
        )}

        <Box sx={{ display: 'flex', gap: 1.25, justifyContent: 'flex-end', mt: 1 }}>
          <Button
            onClick={stage === 2 && !busy ? () => setStage(1) : onCancel}
            disabled={busy}
            sx={{ fontSize: 12.5, color: C.muted, textTransform: 'none', px: 2 }}
          >
            {stage === 2 ? 'Back' : 'Cancel'}
          </Button>
          {stage === 1 ? (
            <Button
              onClick={() => setStage(2)}
              disabled={!canAfford}
              sx={{
                fontSize: 12.5, fontWeight: 700, textTransform: 'none', px: 2.5,
                color: C.amber, border: '1px solid rgba(255,178,36,0.35)', borderRadius: 1.5,
                '&:hover': { bgcolor: 'rgba(255,178,36,0.1)' },
              }}
            >
              Continue
            </Button>
          ) : (
            <Button
              onClick={onConfirm}
              disabled={busy}
              sx={{
                fontSize: 12.5, fontWeight: 700, textTransform: 'none', px: 2.5,
                color: '#fff', bgcolor: C.red, borderRadius: 1.5,
                '&:hover': { bgcolor: '#c93b40' },
                '&.Mui-disabled': { bgcolor: 'rgba(229,72,77,0.4)', color: 'rgba(255,255,255,0.6)' },
              }}
            >
              {busy
                ? 'Sending…'
                : isSeize
                  ? `Yes, seize ${row.seizeEth.toFixed(4)} ETH`
                  : `Yes, pay ${rm(covering, 0)} and liquidate`}
            </Button>
          )}
        </Box>
      </Box>
    </Dialog>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{
      p: 1.5, mb: 1, borderRadius: 2,
      bgcolor: 'rgba(229,72,77,0.07)', border: '1px solid rgba(229,72,77,0.25)',
    }}>
      <Typography sx={{ fontSize: 12, color: C.red, lineHeight: 1.6 }}>{children}</Typography>
    </Box>
  );
}
