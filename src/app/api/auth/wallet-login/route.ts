import { NextResponse } from 'next/server';
import { verifyMessage } from 'ethers';
import { prisma } from '@/lib/db/prisma';
import { createToken, setAuthCookie } from '@/lib/auth-jwt';
import { consumeNonce } from '@/lib/nonce-store';

export async function POST(req: Request) {
  const { address, signature, nonce } = await req.json();
  if (!address || !signature || !nonce) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const stored = consumeNonce(address);
  if (!stored || stored !== nonce) return NextResponse.json({ error: 'Invalid or expired nonce' }, { status: 401 });

  try {
    const message = `Sign in to CryptoLend\nNonce: ${nonce}`;
    const recovered = verifyMessage(message, signature);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
  }

  let user = await prisma.user.findUnique({ where: { walletAddress: address } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        walletAddress: address,
        name: `${address.slice(0, 6)}…${address.slice(-4)}`,
      },
    });
  }

  const token = await createToken({ id: user.id, email: user.email, name: user.name, walletAddress: address });
  await setAuthCookie(token);

  return NextResponse.json({ id: user.id, name: user.name, walletAddress: address });
}
