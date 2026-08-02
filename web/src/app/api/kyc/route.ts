import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getSessionUser, requireActiveUser, requireAdmin, audit } from '@/lib/authz';
import { featureBlocked } from '@/lib/features-server';

/**
 * KYC identity model: verification belongs to the *account* and needs no
 * wallet at all. Submissions are keyed by userId, so a submission can never be
 * inherited by whoever links a wallet next — Hardhat hands everyone the same
 * twenty test accounts, and the old wallet-keyed model let a brand-new sign-up
 * inherit "verified" the moment MetaMask auto-connected a previously approved
 * address.
 *
 * The flow: submit KYC (no wallet) → admin approves the account → the user
 * links a wallet in Settings (POST /api/wallet/link, personal_sign ownership
 * proof) → the on-chain flag is granted for that wallet. The `wallet` column
 * records which address the verification is anchored to on-chain and is null
 * until a wallet is linked.
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
      fullName, docType, icNumber, dob, gender, nationality,
      phone, email, addr1, addr2, postcode, city, state,
      employment, income, purpose, fundSource,
      icFront, icBack, selfie,
    } = body;

    const dt = docType === 'passport' || docType === 'license' ? docType : 'ic';

    if (!fullName || !icNumber || !dob || !gender || !phone || !email ||
        !addr1 || !postcode || !city || !state || !employment || !income || !purpose || !fundSource) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Store document images in-DB (Supabase Postgres) as data URIs so they are
    // shared across all users, not saved to the local filesystem.
    const icFrontData = cleanDataUri(icFront);
    const icBackData  = cleanDataUri(icBack);
    const selfieData  = cleanDataUri(selfie);

    // No wallet is required to submit. If the account already linked one, the
    // submission is anchored to it; otherwise the anchor is set later, when
    // POST /api/wallet/link runs (signature-proved ownership).
    const walletKey = guard.user.walletAddress?.toLowerCase() ?? null;

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
    return NextResponse.json({
      error: 'Could not save your KYC application right now. Please try again in a moment — if it keeps failing, contact support.',
    }, { status: 500 });
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
    return NextResponse.json({ error: 'Could not load your KYC status. Please refresh the page.' }, { status: 500 });
  }
}

// DELETE /api/kyc?userId=... — remove a KYC submission (admin action).
// A wallet param is still accepted as a fallback for wallet-anchored rows.
export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const userId = req.nextUrl.searchParams.get('userId');
  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!userId && !wallet) return NextResponse.json({ error: 'userId or wallet param required' }, { status: 400 });

  try {
    const record = userId
      ? await prisma.kycSubmission.findUnique({ where: { userId }, select: { id: true, userId: true } })
      : await prisma.kycSubmission.findFirst({ where: { wallet: wallet!.toLowerCase() }, select: { id: true, userId: true } });
    if (!record) return NextResponse.json({ error: 'No KYC submission found' }, { status: 404 });
    await prisma.kycSubmission.delete({ where: { id: record.id } });
    // Off-chain deletion only. If a wallet was already approved on-chain the
    // contract's KYC flag stays set — the admin surface never revokes on chain.
    await audit(guard.user, 'KYC_DELETE', 'kyc', record.userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/kyc]', err);
    return NextResponse.json({ error: 'Could not delete the KYC submission. Please try again.' }, { status: 500 });
  }
}
