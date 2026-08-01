import { NextResponse } from 'next/server';
import { verifyMessage } from 'ethers';
import { prisma } from '@/lib/db/prisma';
import { requireActiveUser, audit } from '@/lib/authz';
import { consumeNonce } from '@/lib/nonce-store';

/**
 * POST /api/wallet/link — bind a wallet to the signed-in account, Web3-style.
 *
 * Three proofs, in order:
 *  1. Session   — the caller is a signed-in, non-restricted account.
 *  2. Ownership — a fresh personal_sign over a one-time nonce proves the
 *     caller controls the wallet's private key. Without this, linking was a
 *     side-effect of KYC submission and any signed-in user could claim any
 *     unowned ADDRESS they merely typed in.
 *  3. Exclusivity — one wallet ↔ one account, both directions. The DB unique
 *     constraint on walletAddress is the backstop; the checks here exist to
 *     return honest error messages instead of constraint violations.
 *
 * The signed message is deliberately different from wallet-login's, so a
 * captured login signature can never be replayed to link (or vice versa).
 * (Route files may only export HTTP handlers, so the client mirrors this
 * template in kyc/page.tsx — keep the two in sync.)
 */
const LINK_MESSAGE = (nonce: string) => `Link this wallet to CryptoLend\nNonce: ${nonce}`;

export async function POST(req: Request) {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const { address, signature, nonce } = await req.json();
  if (!address || !signature || !nonce) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const stored = consumeNonce(address);
  if (!stored || stored !== nonce) {
    return NextResponse.json({ error: 'Invalid or expired nonce — try again' }, { status: 401 });
  }

  try {
    const recovered = verifyMessage(LINK_MESSAGE(nonce), signature);
    if (recovered.toLowerCase() !== (address as string).toLowerCase()) {
      return NextResponse.json({ error: 'Signature does not match this wallet' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
  }

  const walletKey = (address as string).toLowerCase();

  try {
    // One account → one wallet. Already linked to this very wallet is a no-op
    // success (idempotent retry); linked to a different one must be undone
    // deliberately via unlink first.
    const linked = guard.user.walletAddress?.toLowerCase();
    if (linked === walletKey) {
      return NextResponse.json({ success: true, wallet: walletKey, alreadyLinked: true });
    }
    if (linked) {
      return NextResponse.json({
        error: `Your account is already linked to wallet ${linked.slice(0, 6)}…${linked.slice(-4)}. Unlink it in Settings before linking another.`,
      }, { status: 409 });
    }

    // One wallet → one account.
    const owner = await prisma.user.findFirst({
      where: { walletAddress: { equals: walletKey, mode: 'insensitive' } },
      select: { id: true, email: true, password: true },
    });
    if (owner && owner.id !== guard.user.id) {
      // A wallet-stub is created automatically when someone clicks "Continue
      // with MetaMask" on the login page for the first time. It has no email
      // and no password — it holds no real credentials. When an email-registered
      // user links that same wallet, silently de-link the stub so the wallet can
      // move to the real account without requiring the user to hunt down and
      // delete the orphan account themselves.
      if (!owner.email && !owner.password) {
        await prisma.user.update({ where: { id: owner.id }, data: { walletAddress: null } });
        // Fall through to the link below.
      } else {
        return NextResponse.json({
          error: 'This wallet is already linked to another account. Please use another wallet or log in to the existing account.',
        }, { status: 409 });
      }
    }

    await prisma.user.update({
      where: { id: guard.user.id },
      data: { walletAddress: walletKey },
    });

    await audit(guard.user, 'USER_LINK_WALLET', 'user', guard.user.id, {
      wallet: walletKey, self: true, proof: 'personal_sign',
    });

    return NextResponse.json({ success: true, wallet: walletKey });
  } catch (err) {
    console.error('[POST /api/wallet/link]', err);
    return NextResponse.json({ error: 'Failed to link wallet' }, { status: 500 });
  }
}
