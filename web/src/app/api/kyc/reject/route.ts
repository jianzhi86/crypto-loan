import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin, audit } from '@/lib/authz';

/**
 * POST /api/kyc/reject — admin rejects a pending KYC submission.
 * Body: { userId, reason? }
 *
 * Only pending (and previously-rejected) submissions can be rejected here.
 * Approved submissions are handled by the Users tab "Reset KYC" action, which
 * also deals with the on-chain flag.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { userId, reason } = await req.json() as { userId?: string; reason?: string };
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  try {
    const record = await prisma.kycSubmission.findUnique({
      where: { userId },
      select: { id: true, fullName: true, status: true },
    });
    if (!record) return NextResponse.json({ error: 'No KYC submission found' }, { status: 404 });

    if (record.status === 'approved') {
      return NextResponse.json({
        error: 'Cannot reject an already-approved submission. Use "Reset KYC" on the Users tab to revoke approval.',
      }, { status: 409 });
    }

    await prisma.kycSubmission.update({
      where: { id: record.id },
      data:  { status: 'rejected' },
    });

    await audit(guard.user, 'KYC_REJECT', 'kyc', userId, {
      fullName: record.fullName,
      reason:   reason?.trim() || null,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/kyc/reject]', err);
    return NextResponse.json({ error: 'Rejection failed. Please try again.' }, { status: 500 });
  }
}
