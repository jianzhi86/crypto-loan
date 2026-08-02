import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { setKycOnChain } from '@/lib/kyc/chain';
import { requireAdmin, audit } from '@/lib/authz';

/**
 * POST /api/kyc/approve — admin approves an ACCOUNT's KYC submission.
 * Body: { userId } (preferred) or { wallet } (resolves via the linked wallet —
 * kept for the client's on-chain resync path after a contract redeploy).
 *
 * Approval is account-level and works with no wallet linked. The on-chain flag
 * is granted here only when the account currently has a linked wallet;
 * otherwise it is granted later, by POST /api/wallet/link, the moment an
 * approved account links one.
 */
export async function POST(req: NextRequest) {
  // This route can hand out on-chain KYC via the contract owner key, so it is
  // the single most privileged endpoint in the app. Admin check comes first.
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { userId, wallet } = await req.json() as { userId?: string; wallet?: string };
  if (!userId && !wallet) return NextResponse.json({ error: 'userId or wallet required' }, { status: 400 });

  try {
    // Resolve the target account. When called by wallet, the wallet must be
    // linked to some account — a bare address with no owner gets nothing.
    let targetId = userId ?? null;
    if (!targetId && wallet) {
      const holder = await prisma.user.findFirst({
        where: { walletAddress: { equals: wallet.toLowerCase(), mode: 'insensitive' } },
        select: { id: true },
      });
      if (!holder) return NextResponse.json({ error: 'No account is linked to this wallet' }, { status: 404 });
      targetId = holder.id;
    }

    // Ensure a KYC record exists before approving anything. This prevents a
    // direct API call from verifying an account that never submitted. The one
    // exception: admins bypass KYC, so a submission-less admin with a linked
    // wallet is still entitled to the on-chain flag — this is their recovery
    // path after a node restart wipes contract state.
    const record = await prisma.kycSubmission.findUnique({
      where: { userId: targetId! },
      select: { id: true, fullName: true },
    });
    if (!record) {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetId! },
        select: { isAdmin: true, walletAddress: true },
      });
      if (targetUser?.isAdmin && targetUser.walletAddress) {
        const w = targetUser.walletAddress.toLowerCase();
        await setKycOnChain(w, true);
        await audit(guard.user, 'KYC_APPROVE', 'kyc', targetId!, { adminBypass: true, wallet: w, onChain: true });
        return NextResponse.json({ success: true, onChain: true, adminBypass: true });
      }
      return NextResponse.json({ error: 'No KYC submission found for this account' }, { status: 404 });
    }

    // Update DB first so if the chain call fails we don't have a phantom approval.
    await prisma.kycSubmission.update({
      where: { id: record.id },
      data:  { status: 'approved' },
    });

    // Grant on-chain permission for the account's linked wallet, if any. With
    // no wallet linked this is a DB-only approval — the grant happens when the
    // user links one. The linked wallet is authoritative here, not whatever
    // wallet string the caller sent.
    const target = await prisma.user.findUnique({
      where: { id: targetId! },
      select: { walletAddress: true },
    });
    const linked = target?.walletAddress?.toLowerCase() ?? null;
    let onChain = false;
    if (linked) {
      await setKycOnChain(linked, true);
      onChain = true;
      // Keep the submission's on-chain anchor in step with the linked wallet.
      await prisma.kycSubmission.update({ where: { id: record.id }, data: { wallet: linked } });
    }

    await audit(guard.user, 'KYC_APPROVE', 'kyc', targetId!, {
      fullName: record.fullName, wallet: linked, onChain,
    });

    return NextResponse.json({
      success: true,
      onChain,
      ...(onChain ? {} : { note: 'Account approved. No wallet is linked yet — on-chain permission will be granted when the user links one.' }),
    });
  } catch (err) {
    console.error('[POST /api/kyc/approve]', err);
    return NextResponse.json({ error: 'Approval failed — check Hardhat node and OWNER_PRIVATE_KEY' }, { status: 500 });
  }
}
