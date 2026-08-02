import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin, STATUS_ACTIVE, STATUS_RESTRICTED } from '@/lib/authz';
import type { Prisma } from '@prisma/client';

const PAGE_SIZE = 25;

/**
 * GET /api/admin/users — paginated, filterable user directory.
 *
 * Query: q, status (ACTIVE|RESTRICTED), role (admin|user), kyc (approved|pending|rejected|none), page
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const sp     = req.nextUrl.searchParams;
  const q      = sp.get('q')?.trim() ?? '';
  const status = sp.get('status') ?? '';
  const role   = sp.get('role') ?? '';
  const kyc    = sp.get('kyc') ?? '';
  const page   = Math.max(1, Number(sp.get('page') ?? 1) || 1);

  const where: Prisma.UserWhereInput = {};
  if (q) {
    where.OR = [
      { email:         { contains: q, mode: 'insensitive' } },
      { name:          { contains: q, mode: 'insensitive' } },
      { walletAddress: { contains: q, mode: 'insensitive' } },
      { id:            q },
    ];
  }
  if (status === STATUS_ACTIVE || status === STATUS_RESTRICTED) where.status = status;
  if (role === 'admin') where.isAdmin = true;
  if (role === 'user')  where.isAdmin = false;

  try {
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true, name: true, email: true, walletAddress: true, isAdmin: true,
          status: true, statusReason: true, statusChangedAt: true,
          createdAt: true, updatedAt: true,
          // Never select `password` — it must not leave the server, even to an admin.
          bankAccount: { select: { id: true, bankName: true, accountNumber: true, accountHolder: true, recipientAddress: true } },
          kyc: { select: { status: true, fullName: true, submittedAt: true } },
          _count: { select: { transfers: true } },
        },
      }),
    ]);

    const shaped = users.map(u => ({
      ...u,
      accountNumber: undefined,
      bankAccount: u.bankAccount
        ? { ...u.bankAccount, accountNumber: `••••${u.bankAccount.accountNumber.slice(-4)}` }
        : null,
      kyc: u.kyc ?? null,
      transferCount: u._count.transfers,
    }));

    // KYC is filtered after stitching; the row count reflects the page, so the
    // pager is hidden client-side when this filter is active.
    const filtered = kyc
      ? shaped.filter(u => (kyc === 'none' ? !u.kyc : u.kyc?.status === kyc))
      : shaped;

    return NextResponse.json({
      users: filtered,
      total,
      page,
      pageSize: PAGE_SIZE,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      kycFilterApplied: !!kyc,
    });
  } catch (err) {
    console.error('[GET /api/admin/users]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
