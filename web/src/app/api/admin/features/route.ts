import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireAdmin, audit } from '@/lib/authz';
import { getFlags, invalidateFlagCache } from '@/lib/features-server';
import { FLAGS, FLAG_BY_KEY, type FlagState } from '@/lib/features';

/** GET /api/admin/features — registry definitions plus current state. */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const flags = await getFlags();
  return NextResponse.json({
    flags: FLAGS.map(def => ({ ...def, ...flags[def.key] })),
  });
}

/** PUT /api/admin/features — { key, state, message } */
export async function PUT(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { key, state, message } = await req.json() as {
    key?: string; state?: string; message?: string;
  };

  const def = key ? FLAG_BY_KEY[key] : undefined;
  if (!def) return NextResponse.json({ error: `Unknown feature key: ${key}` }, { status: 400 });
  if (!state || !def.states.includes(state as FlagState)) {
    return NextResponse.json(
      { error: `Invalid state "${state}" for ${def.key}. Allowed: ${def.states.join(', ')}` },
      { status: 400 },
    );
  }

  const before = (await getFlags())[def.key];
  const msg = (message ?? '').slice(0, 500);

  await prisma.featureFlag.upsert({
    where:  { key: def.key },
    update: { state, message: msg, updatedBy: guard.user.email ?? guard.user.id },
    create: { key: def.key, state, message: msg, updatedBy: guard.user.email ?? guard.user.id },
  });

  // Drop the read cache immediately so the admin sees their own change take
  // effect on the very next request rather than up to a TTL later.
  invalidateFlagCache();

  await audit(guard.user, 'FLAG_UPDATE', 'flag', def.key, {
    before, after: { state, message: msg },
  });

  return NextResponse.json({ ok: true, key: def.key, state, message: msg });
}
