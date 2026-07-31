import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/authz';

export async function GET() {
  // Reads the live user row rather than trusting the 7-day JWT, so a
  // suspension or a revoked session is reflected on the very next poll.
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user });
}
