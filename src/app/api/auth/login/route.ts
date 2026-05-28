import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { createToken, setAuthCookie } from '@/lib/auth-jwt';

export async function POST(req: Request) {
  const { email, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.password) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

  const token = await createToken({ id: user.id, email: user.email, name: user.name });
  await setAuthCookie(token);

  return NextResponse.json({ id: user.id, email: user.email, name: user.name });
}
