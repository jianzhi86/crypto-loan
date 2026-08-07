import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin, audit } from '@/lib/authz';
import { ownerContract, readContract, RecoveryUnavailable } from '@/lib/admin/recovery';

// POST /api/admin/recovery/execute — seize collateral to settle one loan.
//
// { wallet, loanId }               → run recoverLoan()
// { latePenaltyBps }               → adjust the late penalty (contract cap 20%)
//
// recoverLoan() is onlyOwner and is signed here with OWNER_PRIVATE_KEY. Every
// eligibility rule lives in the contract, not here: the route re-quotes before
// sending purely so a refusal comes back as a sentence instead of a revert
// string, and so the audit entry records what the admin was shown.
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: { wallet?: string; loanId?: number; latePenaltyBps?: number; approveLiquidator?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
  }

  try {
    // ── Liquidator whitelist ────────────────────────────────────────────
    // liquidate() is onlyLiquidator, and setLiquidator is onlyOwner, so an
    // admin who wants to run the MYR-funded path has to be put on the roll by
    // the owner key first. Idempotent: already-approved costs no transaction.
    if (body.approveLiquidator !== undefined) {
      const addr = String(body.approveLiquidator);
      if (!ethers.isAddress(addr)) {
        return NextResponse.json({ error: 'approveLiquidator must be a valid address' }, { status: 400 });
      }
      const read    = await readContract();
      const already = await (read.liquidators as (a: string) => Promise<boolean>)(addr);
      if (already) return NextResponse.json({ success: true, changed: false });

      const c  = await ownerContract();
      const tx = await (c.setLiquidator as (a: string, ok: boolean) => Promise<ethers.TransactionResponse>)(addr, true);
      const receipt = await tx.wait();
      await audit(guard.user, 'LOAN_RECOVERED', 'system', 'CryptoLoan.liquidators', {
        approvedLiquidator: addr.toLowerCase(), txHash: receipt?.hash,
      });
      return NextResponse.json({ success: true, changed: true, txHash: receipt?.hash });
    }

    // ── Penalty rate ────────────────────────────────────────────────────
    if (body.latePenaltyBps !== undefined) {
      const bps = Math.round(Number(body.latePenaltyBps));
      if (!Number.isFinite(bps) || bps < 0 || bps > 2000) {
        return NextResponse.json(
          { error: 'latePenaltyBps must be between 0 and 2000 (contract cap 20%)' },
          { status: 400 },
        );
      }
      const c  = await ownerContract();
      const tx = await (c.setLatePenalty as (b: bigint) => Promise<ethers.TransactionResponse>)(BigInt(bps));
      const receipt = await tx.wait();
      await audit(guard.user, 'LATE_PENALTY_UPDATED', 'system', 'CryptoLoan.latePenaltyBps', {
        latePenaltyBps: bps, txHash: receipt?.hash,
      });
      return NextResponse.json({ success: true, latePenaltyBps: bps, txHash: receipt?.hash });
    }

    // ── Recovery ────────────────────────────────────────────────────────
    const wallet = String(body.wallet ?? '');
    const loanId = Number(body.loanId);
    if (!ethers.isAddress(wallet)) {
      return NextResponse.json({ error: 'wallet must be a valid address' }, { status: 400 });
    }
    if (!Number.isInteger(loanId) || loanId < 0) {
      return NextResponse.json({ error: 'loanId must be a non-negative integer' }, { status: 400 });
    }

    const read = await readContract();
    const [recoverable, unhealthy, overdue, debt, penalty, seizeWei] =
      await (read.recoveryQuote as (w: string, id: bigint) => Promise<
        [boolean, boolean, boolean, bigint, bigint, bigint]
      >)(wallet, BigInt(loanId));

    if (!recoverable) {
      return NextResponse.json({
        error: 'This loan is not recoverable — it is neither past its grace period nor underwater.',
      }, { status: 409 });
    }
    if (seizeWei === BigInt(0)) {
      return NextResponse.json({
        error: 'The borrower has no collateral left to seize.',
      }, { status: 409 });
    }

    const c  = await ownerContract();
    const tx = await (c.recoverLoan as (w: string, id: bigint) => Promise<ethers.TransactionResponse>)(
      wallet, BigInt(loanId),
    );
    const receipt = await tx.wait();

    // The event is authoritative: the contract caps the seizure at the pot and
    // settles debt before penalty, so what it actually took can be less than
    // the quote above promised.
    let seizedEth = Number(ethers.formatEther(seizeWei));
    let debtCoveredMYR = Number(debt) / 1e6;
    let penaltyChargedMYR = Number(penalty) / 1e6;
    let reason = overdue ? 'overdue past grace' : 'collateral unsafe';
    try {
      const evt = (receipt?.logs ?? [])
        .map(l => { try { return read.interface.parseLog(l); } catch { return null; } })
        .find(p => p?.name === 'LoanRecovered');
      if (evt) {
        seizedEth         = Number(ethers.formatEther(evt.args[2] as bigint));
        debtCoveredMYR    = Number(evt.args[3] as bigint) / 1e6;
        penaltyChargedMYR = Number(evt.args[4] as bigint) / 1e6;
        reason            = String(evt.args[5]);
      }
    } catch { /* event decode is best-effort — the tx already succeeded */ }

    // Mirror it into the ledger. Only rows for THIS loan are touched, and only
    // when the chain says the loan actually closed: a partial recovery leaves
    // real debt behind, and marking it settled would hide that.
    const closed = await (read.recoveryQuote as (w: string, id: bigint) => Promise<
      [boolean, boolean, boolean, bigint, bigint, bigint]
    >)(wallet, BigInt(loanId)).then(q => q[3] === BigInt(0)).catch(() => false);
    if (closed) {
      await prisma.borrowPosition.updateMany({
        where: { wallet: wallet.toLowerCase(), loanId, status: 'OPEN' },
        data: { status: 'LIQUIDATED', repaidAt: new Date(), repayTxHash: receipt?.hash ?? null },
      }).catch(err => console.error('[admin/recovery/execute] ledger update', err));
    }

    await audit(guard.user, 'LOAN_RECOVERED', 'user', wallet.toLowerCase(), {
      loanId, seizedEth, debtCoveredMYR, penaltyChargedMYR, reason,
      unhealthy, overdue, closed, txHash: receipt?.hash,
    });

    return NextResponse.json({
      success: true, seizedEth, debtCoveredMYR, penaltyChargedMYR, reason, closed,
      txHash: receipt?.hash,
    });
  } catch (err) {
    if (err instanceof RecoveryUnavailable) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin/recovery/execute]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
