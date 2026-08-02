import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getSessionUser, requireActiveUser, requireAdmin, audit } from '@/lib/authz';
import { featureBlocked } from '@/lib/features-server';

/**
 * KYC identity model: verification belongs to the *account*. Submissions are
 * keyed by userId, so a submission can never be inherited by whoever links the
 * wallet next — Hardhat hands everyone the same twenty test accounts, and the
 * old wallet-keyed model let a brand-new sign-up inherit "verified" the moment
 * MetaMask auto-connected a previously approved address.
 *
 * The `wallet` column records which address the verification is anchored to
 * on-chain (the contract's onlyKYC check keys on it). Linking itself happens
 * in POST /api/wallet/link, gated on a personal_sign ownership proof; this
 * route only accepts submissions for the wallet already linked to the account.
 */

// Keep only valid image data URIs; anything else becomes undefined so we don't
// overwrite an existing image with junk.
function cleanDataUri(dataUri: string | undefined): string | undefined {
  return typeof dataUri === 'string' && dataUri.startsWith('data:') ? dataUri : undefined;
}

// POST /api/kyc — save KYC form data + document uploads
export async function POST(req: NextRequest) {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  const blocked = await featureBlocked('page.kyc', { isAdmin: guard.user.isAdmin });
  if (blocked) return blocked;

  try {
    const body = await req.json();
    const {
      wallet, fullName, docType, icNumber, dob, gender, nationality,
      phone, email, addr1, addr2, postcode, city, state,
      employment, income, purpose, fundSource,
      icFront, icBack, selfie,
    } = body;

    const dt = docType === 'passport' || docType === 'license' ? docType : 'ic';

    if (!wallet || !fullName || !icNumber || !dob || !gender || !phone || !email ||
        !addr1 || !postcode || !city || !state || !employment || !income || !purpose || !fundSource) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Store document images in-DB (Supabase Postgres) as data URIs so they are
    // shared across all users, not saved to the local filesystem.
    const walletKey = (wallet as string).toLowerCase();
    const icFrontData = cleanDataUri(icFront);
    const icBackData  = cleanDataUri(icBack);
    const selfieData  = cleanDataUri(selfie);

    // ── Wallet must already be linked ─────────────────────────────────────
    // Linking is its own signature-proved step (POST /api/wallet/link) — KYC
    // no longer links as a side effect, because that let any signed-in user
    // claim an unowned address they merely typed in, with no proof they hold
    // its key. The KYC page performs the link (nonce + personal_sign) right
    // before submitting, so a user never sees these errors in the normal flow.
    const linked = guard.user.walletAddress?.toLowerCase();
    if (!linked) {
      return NextResponse.json({
        error: 'No wallet is linked to your account yet. Connect your wallet and sign the ownership message first.',
      }, { status: 400 });
    }
    if (linked !== walletKey) {
      return NextResponse.json({
        error: `Your account is linked to wallet ${linked.slice(0, 6)}…${linked.slice(-4)}. Connect that wallet to submit KYC.`,
      }, { status: 409 });
    }

    const record = await prisma.kycSubmission.upsert({
      where:  { userId: guard.user.id },
      update: {
        wallet: walletKey,
        fullName, docType: dt, icNumber, dob, gender, nationality, phone, email,
        addr1, addr2: addr2 ?? '', postcode, city, state,
        employment, income, purpose, fundSource,
        ...(icFrontData && { icFrontData }),
        ...(icBackData  && { icBackData }),
        ...(selfieData  && { selfieData }),
        status: 'pending',
      },
      create: {
        userId: guard.user.id,
        wallet: walletKey,
        fullName, docType: dt, icNumber, dob, gender, nationality, phone, email,
        addr1, addr2: addr2 ?? '', postcode, city, state,
        employment, income, purpose, fundSource,
        icFrontData, icBackData, selfieData,
        status: 'pending',
      },
    });

    return NextResponse.json({ success: true, id: record.id, status: record.status });
  } catch (err) {
    console.error('[POST /api/kyc]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// GET /api/kyc — the signed-in account's own KYC status (excludes heavy image
// blobs; use GET /api/kyc/documents to fetch images).
//
// Deliberately takes no wallet parameter. It used to, and that was the leak:
// the client asked "is wallet X verified?" for whatever account MetaMask
// auto-connected, so a fresh sign-up inherited a stranger's verification.
// Status is resolved from the session cookie → the account's own submission,
// which survives wallet unlinking.
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const record = await prisma.kycSubmission.findUnique({
      where: { userId: user.id },
    });
    if (!record) return NextResponse.json({ exists: false }, { status: 200 });
    // Strip the heavy image blobs from the status response — images are fetched
    // separately via GET /api/kyc/documents.
    const rest = { ...record };
    delete (rest as Partial<typeof record>).icFrontData;
    delete (rest as Partial<typeof record>).icBackData;
    delete (rest as Partial<typeof record>).selfieData;
    return NextResponse.json({ exists: true, ...rest });
  } catch (err) {
    console.error('[GET /api/kyc]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// DELETE /api/kyc?wallet=0x... — remove a KYC submission (admin action)
export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ error: 'wallet param required' }, { status: 400 });

  try {
    const walletKey = wallet.toLowerCase();
    const record = await prisma.kycSubmission.findFirst({
      where: { wallet: walletKey },
      select: { id: true },
    });
    if (!record) return NextResponse.json({ error: 'No KYC submission found for this wallet' }, { status: 404 });
    await prisma.kycSubmission.delete({ where: { id: record.id } });
    // Off-chain deletion only. If this wallet was already approved on-chain the
    // contract's KYC flag stays set — the admin surface never revokes on chain.
    await audit(guard.user, 'KYC_DELETE', 'kyc', walletKey);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/kyc]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
