import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

type DocField = 'icFrontData' | 'icBackData' | 'selfieData';

const TYPE_TO_FIELD: Record<string, DocField> = {
  front:  'icFrontData',
  back:   'icBackData',
  selfie: 'selfieData',
};

function cleanDataUri(dataUri: string | undefined): string | undefined {
  return typeof dataUri === 'string' && dataUri.startsWith('data:') ? dataUri : undefined;
}

// POST /api/kyc/documents — update document photos for an existing KYC record.
// Images are stored in-DB as data URIs (shared via Supabase), not on disk.
export async function POST(req: NextRequest) {
  try {
    const { wallet, icFront, icBack, selfie } = await req.json();
    if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 });

    const walletKey = (wallet as string).toLowerCase();
    const existing = await prisma.kycSubmission.findUnique({ where: { wallet: walletKey } });
    if (!existing) return NextResponse.json({ error: 'No KYC record found for this wallet' }, { status: 404 });

    const updates: Partial<Record<DocField, string>> = {};
    const front  = cleanDataUri(icFront);
    const back   = cleanDataUri(icBack);
    const selfieF = cleanDataUri(selfie);
    if (front)   updates.icFrontData = front;
    if (back)    updates.icBackData  = back;
    if (selfieF) updates.selfieData  = selfieF;

    if (Object.keys(updates).length === 0)
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });

    await prisma.kycSubmission.update({ where: { wallet: walletKey }, data: updates });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/kyc/documents]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

// GET /api/kyc/documents?wallet=0x...&type=front|back|selfie — serve a stored
// document image. Decodes the data URI back into raw bytes with the right
// content-type so it can be used directly as an <img src>.
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');
  const type   = req.nextUrl.searchParams.get('type') ?? 'front';
  const field  = TYPE_TO_FIELD[type];
  if (!wallet || !field) return NextResponse.json({ error: 'wallet and valid type required' }, { status: 400 });

  try {
    const record = await prisma.kycSubmission.findUnique({
      where: { wallet: wallet.toLowerCase() },
      select: { icFrontData: true, icBackData: true, selfieData: true },
    });
    const dataUri = record?.[field];
    if (!dataUri) return new NextResponse('Not found', { status: 404 });

    const [header, data] = dataUri.split(',');
    const mime = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
    const buffer = Buffer.from(data, 'base64');

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (err) {
    console.error('[GET /api/kyc/documents]', err);
    return new NextResponse('Error', { status: 500 });
  }
}
