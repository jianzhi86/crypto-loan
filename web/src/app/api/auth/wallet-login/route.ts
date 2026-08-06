import { NextResponse } from 'next/server';
import { verifyMessage } from 'ethers';
import { prisma } from '@/lib/db/prisma';
import { createToken, setAuthCookie } from '@/lib/auth-jwt';
import { consumeNonce } from '@/lib/nonce-store';
import { featureBlocked } from '@/lib/features-server';
import { STATUS_SUSPENDED, suspendedMessage } from '@/lib/authz';

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

  // Wallets are stored lowercase everywhere (wallet/link does the same).
  // MetaMask hands out checksummed addresses, and an exact-match lookup on the
  // checksummed form used to miss the lowercase row — creating a second
  // account for the same wallet as a case variant.
  const walletKey = (address as string).toLowerCase();

  let user;
  try {
    user = await prisma.user.findUnique({ where: { walletAddress: walletKey } });
    if (!user) {
      // First sight of this wallet — that is a registration, so it obeys the
      // sign-up switch rather than the sign-in one.
      const closed = await featureBlocked('auth.signup');
      if (closed) return closed;

      user = await prisma.user.create({
        data: {
          walletAddress: walletKey,
          name: `${address.slice(0, 6)}…${address.slice(-4)}`,
        },
      });
    }
  } catch (err) {
    console.error('[wallet-login] DB error:', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  // No enumeration concern on this path — the signature already proved control
  // of the wallet, so telling them why they are refused costs nothing.
  if (user.status === STATUS_SUSPENDED) {
    return NextResponse.json(
      { error: suspendedMessage(user.statusReason), code: 'ACCOUNT_SUSPENDED' },
      { status: 403 },
    );
  }

  if (!user.isAdmin) {
    const blocked = await featureBlocked('auth.login');
    if (blocked) return blocked;
  }

  try {
    // isAdmin was previously omitted here, so an admin signing in by wallet
    // silently lost their admin rights until they used the email form.
    const token = await createToken({
      id: user.id, email: user.email, name: user.name, walletAddress: walletKey,
      isAdmin: user.isAdmin, epoch: user.sessionEpoch,
    });
    await setAuthCookie(token);
  } catch (err) {
    console.error('[wallet-login] Token error:', err);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }

  return NextResponse.json({
    id: user.id, name: user.name, walletAddress: walletKey,
    isAdmin: user.isAdmin, status: user.status,
  });
}
