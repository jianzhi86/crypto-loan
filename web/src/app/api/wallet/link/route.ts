import { NextResponse } from 'next/server';
import { verifyMessage } from 'ethers';
import { prisma } from '@/lib/db/prisma';
import { requireActiveUser, audit } from '@/lib/authz';
import { consumeNonce } from '@/lib/nonce-store';
import { setKycOnChain, isKycOnChain } from '@/lib/kyc/chain';

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
 * template in lib/WalletContext.tsx — keep the two in sync.)
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
      // A wallet linked to ANY other account — even an empty stub created by
      // a first "Continue with MetaMask" click — is never moved here. (An
      // earlier version silently absorbed credential-less stubs, which read as
      // "someone else took my wallet" to the stub's owner.) The way into that
      // account is to log in with MetaMask; it can then add an email +
      // password in Settings and unlink if it truly wants to free the wallet.
      return NextResponse.json({
        error: 'This wallet is already linked to another CryptoLend account. Please use a different wallet, or log in with MetaMask to access that account.',
        code: 'WALLET_ALREADY_LINKED',
      }, { status: 409 });
    }

    await prisma.user.update({
      where: { id: guard.user.id },
      data: { walletAddress: walletKey },
    });

    // Re-anchor the account's KYC submission (if any) to the wallet it now
    // holds, and — when the account is already KYC-approved, or is an admin
    // (admins bypass KYC) — grant the on-chain flag for it. Approval is a
    // property of the account; the wallet just carries it on-chain, and
    // ownership was proved by the signature above. Best-effort: a dead
    // Hardhat node must not block the link — the admin "Re-sync all" button
    // restores flags once the node is reachable.
    const kyc = await prisma.kycSubmission.findUnique({
      where: { userId: guard.user.id },
      select: { id: true, status: true },
    });
    if (kyc) {
      await prisma.kycSubmission.update({ where: { id: kyc.id }, data: { wallet: walletKey } });
    }
    let chainGranted = false;
    if (kyc?.status === 'approved' || guard.user.isAdmin) {
      try {
        await setKycOnChain(walletKey, true);
        chainGranted = true;
      } catch (err) {
        console.warn('[wallet/link] on-chain KYC grant failed (continuing):', err);
      }
    } else {
      // This account is NOT entitled to on-chain KYC. If the wallet still
      // carries a flag from a previous owner (their unlink-time revoke can
      // fail while the node is down), clear it now — claim time is the last
      // safe moment before this account could exercise someone else's
      // approval on the contract.
      try {
        if (await isKycOnChain(walletKey)) {
          await setKycOnChain(walletKey, false);
        }
      } catch (err) {
        console.warn('[wallet/link] stale on-chain flag cleanup failed (continuing):', err);
      }
    }

    await audit(guard.user, 'USER_LINK_WALLET', 'user', guard.user.id, {
      wallet: walletKey, self: true, proof: 'personal_sign', chainGranted,
    });

    return NextResponse.json({ success: true, wallet: walletKey, chainGranted });
  } catch (err) {
    console.error('[POST /api/wallet/link]', err);
    return NextResponse.json({
      error: 'Something went wrong while linking the wallet. Please try again in a moment — if it keeps failing, contact support.',
    }, { status: 500 });
  }
}
