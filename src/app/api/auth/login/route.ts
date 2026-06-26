import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { createToken, setAuthCookie } from '@/lib/auth-jwt';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });

    let user;
    try {
      user = await prisma.user.findUnique({ where: { email } });
    } catch (err) {
      console.error('[login] DB error:', err);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    if (!user?.password) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

    // Raw query: the generated Prisma Client predates the isAdmin column
    // (client regen is blocked by a locked engine binary on this machine).
    const isAdmin = (await prisma.$queryRawUnsafe<{ isAdmin: boolean }[]>(
      'SELECT "isAdmin" FROM "User" WHERE id = $1', user.id
    ))[0]?.isAdmin ?? false;

    const token = await createToken({ id: user.id, email: user.email, name: user.name, isAdmin });
    await setAuthCookie(token);

    return NextResponse.json({ id: user.id, email: user.email, name: user.name, isAdmin });
  } catch (err) {
    console.error('[login] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
