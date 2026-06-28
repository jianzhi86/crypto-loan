import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { setNonce } from '@/lib/nonce-store';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address');
  if (!address) return NextResponse.json({ error: 'Address required' }, { status: 400 });
  const nonce = crypto.randomBytes(16).toString('hex');
  setNonce(address, nonce);
  return NextResponse.json({ nonce });
}
