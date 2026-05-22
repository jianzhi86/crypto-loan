import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

// POST /api/kyc — save KYC form data (admin approves separately via /api/kyc/approve)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      wallet, fullName, icNumber, dob, gender, nationality,
      phone, email, addr1, addr2, postcode, city, state,
      employment, income, purpose, fundSource,
    } = body;

    if (!wallet || !fullName || !icNumber || !dob || !gender || !phone || !email ||
        !addr1 || !postcode || !city || !state || !employment || !income || !purpose || !fundSource) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const record = await prisma.kycSubmission.upsert({
      where:  { wallet: wallet.toLowerCase() },
      update: {
        fullName, icNumber, dob, gender, nationality, phone, email,
        addr1, addr2: addr2 ?? '', postcode, city, state,
        employment, income, purpose, fundSource,
        status: 'pending',
      },
      create: {
        wallet: wallet.toLowerCase(),
        fullName, icNumber, dob, gender, nationality, phone, email,
        addr1, addr2: addr2 ?? '', postcode, city, state,
        employment, income, purpose, fundSource,
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
