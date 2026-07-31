import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireActiveUser, requireAdmin, audit } from '@/lib/authz';
import { featureBlocked } from '@/lib/features-server';

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

    const record = await prisma.kycSubmission.upsert({
      where:  { wallet: walletKey },
      update: {
        fullName, docType: dt, icNumber, dob, gender, nationality, phone, email,
        addr1, addr2: addr2 ?? '', postcode, city, state,
        employment, income, purpose, fundSource,
        ...(icFrontData && { icFrontData }),
        ...(icBackData  && { icBackData }),
        ...(selfieData  && { selfieData }),
        status: 'pending',
      },
      create: {
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

// GET /api/kyc?wallet=0x... — fetch KYC record by wallet (excludes heavy image
// blobs; use GET /api/kyc/documents to fetch images).
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ error: 'wallet param required' }, { status: 400 });

  try {
    const record = await prisma.kycSubmission.findUnique({
      where: { wallet: wallet.toLowerCase() },
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
    await prisma.kycSubmission.delete({ where: { wallet: walletKey } });
    // Off-chain deletion only. If this wallet was already approved on-chain the
    // contract's KYC flag stays set — the admin surface never revokes on chain.
    await audit(guard.user, 'KYC_DELETE', 'kyc', walletKey);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/kyc]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
