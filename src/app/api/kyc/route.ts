import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { prisma } from '@/lib/db/prisma';

function saveBase64File(walletDir: string, name: string, dataUri: string | undefined): string {
  if (!dataUri || !dataUri.startsWith('data:')) return '';
  const [header, data] = dataUri.split(',');
  const ext = header.includes('png') ? 'png' : header.includes('pdf') ? 'pdf' : 'jpg';
  const filename = `${name}.${ext}`;
  writeFileSync(join(walletDir, filename), Buffer.from(data, 'base64'));
  return filename;
}

// POST /api/kyc — save KYC form data + document uploads
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      wallet, fullName, icNumber, dob, gender, nationality,
      phone, email, addr1, addr2, postcode, city, state,
      employment, income, purpose, fundSource,
      icFront, icBack, selfie,
    } = body;

    if (!wallet || !fullName || !icNumber || !dob || !gender || !phone || !email ||
        !addr1 || !postcode || !city || !state || !employment || !income || !purpose || !fundSource) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Save uploaded documents to public/uploads/kyc/{wallet}/
    const walletKey = (wallet as string).toLowerCase();
    const walletDir = join(process.cwd(), 'public', 'uploads', 'kyc', walletKey);
    mkdirSync(walletDir, { recursive: true });

    const icFrontPath = saveBase64File(walletDir, 'front',  icFront);
    const icBackPath  = saveBase64File(walletDir, 'back',   icBack);
    const selfiePath  = saveBase64File(walletDir, 'selfie', selfie);

    const record = await prisma.kycSubmission.upsert({
      where:  { wallet: walletKey },
      update: {
        fullName, icNumber, dob, gender, nationality, phone, email,
        addr1, addr2: addr2 ?? '', postcode, city, state,
        employment, income, purpose, fundSource,
        ...(icFrontPath && { icFrontPath }),
        ...(icBackPath  && { icBackPath }),
        ...(selfiePath  && { selfiePath }),
        status: 'pending',
      },
      create: {
        wallet: walletKey,
        fullName, icNumber, dob, gender, nationality, phone, email,
        addr1, addr2: addr2 ?? '', postcode, city, state,
        employment, income, purpose, fundSource,
        icFrontPath, icBackPath, selfiePath,
        status: 'pending',
      },
    });

    return NextResponse.json({ success: true, id: record.id, status: record.status });
  } catch (err) {
    console.error('[POST /api/kyc]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

// GET /api/kyc?wallet=0x... — fetch KYC record by wallet
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');
  if (!wallet) return NextResponse.json({ error: 'wallet param required' }, { status: 400 });

  try {
    const record = await prisma.kycSubmission.findUnique({
      where: { wallet: wallet.toLowerCase() },
    });
    if (!record) return NextResponse.json({ exists: false }, { status: 200 });
    return NextResponse.json({ exists: true, ...record });
  } catch (err) {
    console.error('[GET /api/kyc]', err);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
