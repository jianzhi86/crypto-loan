import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { createToken, setAuthCookie } from '@/lib/auth-jwt';
import { featureBlocked } from '@/lib/features-server';
import { STATUS_SUSPENDED, suspendedMessage } from '@/lib/authz';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });

    const normalEmail = (email as string).toLowerCase().trim();
    let user;
    try {
      user = await prisma.user.findUnique({ where: { email: normalEmail } });
    } catch (err) {
      console.error('[login] DB error:', err);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!user?.password) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

    // Placed after the password check for the same reason as the feature gate
    // below: an unauthenticated prober must not be able to discover which
    // emails exist by reading a distinct status code. Admins are NOT exempt —
    // unlike a paused login, a suspension is aimed at a specific account.
    if (user.status === STATUS_SUSPENDED) {
      return NextResponse.json(
        { error: suspendedMessage(user.statusReason), code: 'ACCOUNT_SUSPENDED' },
        { status: 403 },
      );
    }

    // Sign-in can be paused from the admin feature panel — but only after the
    // password is verified, and never for admins. Checking it here rather than
    // at the top means a paused login cannot be used to probe which emails
    // exist, and guarantees an admin can always get back in to un-pause it.
    if (!user.isAdmin) {
      const blocked = await featureBlocked('auth.login');
      if (blocked) return blocked;
    }

    const token = await createToken({
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
      epoch: user.sessionEpoch,
    });
    await setAuthCookie(token);

    return NextResponse.json({
      id: user.id, email: user.email, name: user.name,
      isAdmin: user.isAdmin, status: user.status,
    });
  } catch (err) {
    console.error('[login] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
