import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { createToken, setAuthCookie } from '@/lib/auth-jwt';
import { featureBlocked } from '@/lib/features-server';

export async function POST(req: Request) {
  // Registration can be closed from the admin feature panel.
  const blocked = await featureBlocked('auth.signup');
  if (blocked) return blocked;

  const { name, email, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });

  const normalEmail = (email as string).toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normalEmail } });
  if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });

  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { name: name?.trim() || null, email: normalEmail, password: hash } });

  const token = await createToken({
    id: user.id, email: user.email, name: user.name, epoch: user.sessionEpoch,
  });
  await setAuthCookie(token);

  return NextResponse.json({ id: user.id, email: user.email, name: user.name }, { status: 201 });
}
