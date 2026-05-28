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

// POST /api/kyc/documents — update document photos for existing KYC record
export async function POST(req: NextRequest) {
  try {
    const { wallet, icFront, icBack, selfie } = await req.json();
    if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 });

    const walletKey = (wallet as string).toLowerCase();
    const existing = await prisma.kycSubmission.findUnique({ where: { wallet: walletKey } });
    if (!existing) return NextResponse.json({ error: 'No KYC record found for this wallet' }, { status: 404 });

    const walletDir = join(process.cwd(), 'public', 'uploads', 'kyc', walletKey);
    mkdirSync(walletDir, { recursive: true });

    const updates: Record<string, string> = {};
    const front  = saveBase64File(walletDir, 'front',  icFront);
    const back   = saveBase64File(walletDir, 'back',   icBack);
    const selfieF = saveBase64File(walletDir, 'selfie', selfie);
    if (front)   updates.icFrontPath = front;
    if (back)    updates.icBackPath  = back;
    if (selfieF) updates.selfiePath  = selfieF;

    if (Object.keys(updates).length === 0)
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });

    await prisma.kycSubmission.update({ where: { wallet: walletKey }, data: updates });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/kyc/documents]', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
