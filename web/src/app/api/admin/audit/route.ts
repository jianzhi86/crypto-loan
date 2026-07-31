import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin } from '@/lib/authz';
import type { Prisma } from '@prisma/client';

/**
 * GET /api/admin/audit — the admin action trail.
 *
 * Read-only on purpose: there is no POST, PATCH or DELETE here. An audit log an
 * admin can edit is not an audit log.
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const sp       = req.nextUrl.searchParams;
  const q        = sp.get('q')?.trim();
  const action   = sp.get('action')?.trim();
  const page     = Math.max(1, Number(sp.get('page') ?? 1) || 1);
  const pageSize = 50;

  const where: Prisma.AdminAuditLogWhereInput = {};
  if (action) where.action = action;
  if (q) {
    where.OR = [
      { actorEmail: { contains: q, mode: 'insensitive' } },
      { targetId:   { contains: q, mode: 'insensitive' } },
      { detail:     { contains: q, mode: 'insensitive' } },
    ];
  }

  try {
    const [total, entries] = await Promise.all([
      prisma.adminAuditLog.count({ where }),
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      entries, total, page, pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.error('[GET /api/admin/audit]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
