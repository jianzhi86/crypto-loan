import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getSessionUser, requireActiveUser } from '@/lib/authz';

type DocField = 'icFrontData' | 'icBackData' | 'selfieData';

const TYPE_TO_FIELD: Record<string, DocField> = {
  front:  'icFrontData',
  back:   'icBackData',
  selfie: 'selfieData',
};

function cleanDataUri(dataUri: string | undefined): string | undefined {
  return typeof dataUri === 'string' && dataUri.startsWith('data:') ? dataUri : undefined;
}

// POST /api/kyc/documents — update document photos on the signed-in account's
// own KYC record. Images are stored in-DB as data URIs (shared via Supabase),
// not on disk. These routes used to be unauthenticated and keyed by wallet
// address alone — anyone could read or overwrite anyone's identity documents.
export async function POST(req: NextRequest) {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  try {
    const { icFront, icBack, selfie } = await req.json();

    const existing = await prisma.kycSubmission.findUnique({
      where: { userId: guard.user.id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'No KYC record found for your account' }, { status: 404 });

    const updates: Partial<Record<DocField, string>> = {};
    const front   = cleanDataUri(icFront);
    const back    = cleanDataUri(icBack);
    const selfieF = cleanDataUri(selfie);
    if (front)   updates.icFrontData = front;
    if (back)    updates.icBackData  = back;
    if (selfieF) updates.selfieData  = selfieF;

    if (Object.keys(updates).length === 0)
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });

    await prisma.kycSubmission.update({ where: { id: existing.id }, data: updates });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/kyc/documents]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

// GET /api/kyc/documents?userId=...&type=front|back|selfie — serve a stored
// document image. Decodes the data URI back into raw bytes with the right
// content-type so it can be used directly as an <img src>. A wallet param is
// accepted as a fallback for wallet-anchored rows.
//
// Admins may fetch any account's documents (the review panel needs to); a
// regular user only ever gets their own submission, whatever they ask for.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  const wallet = req.nextUrl.searchParams.get('wallet');
  const type   = req.nextUrl.searchParams.get('type') ?? 'front';
  const field  = TYPE_TO_FIELD[type];
  if ((!userId && !wallet) || !field) {
    return NextResponse.json({ error: 'userId (or wallet) and valid type required' }, { status: 400 });
  }

  try {
    const user = await getSessionUser();
    if (!user) return new NextResponse('Unauthorized', { status: 401 });

    const select = { icFrontData: true, icBackData: true, selfieData: true } as const;
    const record = !user.isAdmin
      ? await prisma.kycSubmission.findUnique({ where: { userId: user.id }, select })
      : userId
        ? await prisma.kycSubmission.findUnique({ where: { userId }, select })
        : await prisma.kycSubmission.findFirst({ where: { wallet: wallet!.toLowerCase() }, select });
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
