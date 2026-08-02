import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin, audit } from '@/lib/authz';
import { setKycOnChain } from '@/lib/kyc/chain';

/**
 * POST /api/kyc/resync — one button to restore every on-chain KYC flag.
 *
 * A Hardhat restart/redeploy wipes contract state: every wallet loses its
 * on-chain flag while the DB still says approved. Instead of re-syncing rows
 * one by one, this walks every account that should hold the flag — approved
 * KYC submissions with a linked wallet, plus admin accounts (admins bypass
 * KYC) — and re-sets it. Sequential on purpose: the owner key signs every
 * transaction, and parallel sends would race its nonce.
 */
export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const entitled = { OR: [{ kyc: { status: 'approved' } }, { isAdmin: true }] };
    const [targets, skipped] = await Promise.all([
      prisma.user.findMany({
        where: { ...entitled, walletAddress: { not: null } },
        select: { id: true, walletAddress: true },
      }),
      // Entitled accounts with no wallet — nothing to sync for them; counted
      // so the admin sees the whole picture instead of a silent gap.
      prisma.user.count({ where: { ...entitled, walletAddress: null } }),
    ]);

    let synced = 0;
    let failed = 0;
    for (const u of targets) {
      try {
        // Re-validate right before each grant: on-chain calls are slow and
        // unlink is self-service, so a wallet in the snapshot may have been
        // freed (or the KYC reset) while earlier rows were still mining.
        // Granting from the stale snapshot would flag a wallet nobody owns.
        const live = await prisma.user.findUnique({
          where: { id: u.id },
          select: { walletAddress: true, isAdmin: true, kyc: { select: { status: true } } },
        });
        const stillEntitled = !!live && (live.isAdmin || live.kyc?.status === 'approved');
        if (!stillEntitled || live!.walletAddress?.toLowerCase() !== u.walletAddress!.toLowerCase()) {
          continue;
        }
        await setKycOnChain(u.walletAddress!.toLowerCase(), true);
        synced++;
      } catch (err) {
        failed++;
        console.error('[kyc/resync] failed for', u.walletAddress, err);
      }
    }

    await audit(guard.user, 'KYC_RESYNC', 'system', 'kyc-resync', { synced, skipped, failed });

    if (failed > 0 && synced === 0) {
      return NextResponse.json({
        error: 'Re-sync failed — check that the Hardhat node is running and OWNER_PRIVATE_KEY is set.',
        synced, skipped, failed,
      }, { status: 502 });
    }
    return NextResponse.json({ synced, skipped, failed });
  } catch (err) {
    console.error('[POST /api/kyc/resync]', err);
    return NextResponse.json({ error: 'Re-sync failed — please try again.' }, { status: 500 });
  }
}
