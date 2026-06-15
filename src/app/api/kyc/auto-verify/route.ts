import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { join } from 'path';
import { createWorker } from 'tesseract.js';
import { prisma } from '@/lib/db/prisma';
import { setKycOnChain } from '@/lib/kyc/chain';
import { matchKyc, type DocType } from '@/lib/kyc/match';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // OCR can take a few seconds per image

// Run OCR over each existing document image and return the recognised text.
async function ocrImages(paths: string[]): Promise<string[]> {
  const worker = await createWorker('eng');
  try {
    const texts: string[] = [];
    for (const p of paths) {
      const { data } = await worker.recognize(p);
      texts.push(data.text ?? '');
    }
    return texts;
  } finally {
    await worker.terminate();
  }
}

// POST /api/kyc/auto-verify — OCR the uploaded ID document(s), compare the
// extracted name / IC / address against the submitted form, then auto-approve
// on a match or reject on a mismatch.
export async function POST(req: NextRequest) {
  const { wallet, docType } = await req.json();
  if (!wallet) return NextResponse.json({ error: 'wallet required' }, { status: 400 });

  const walletKey = (wallet as string).toLowerCase();
  const dt: DocType = docType === 'passport' || docType === 'license' ? docType : 'ic';

  try {
    const record = await prisma.kycSubmission.findUnique({ where: { wallet: walletKey } });
    if (!record) return NextResponse.json({ error: 'No KYC record found' }, { status: 404 });

    // The stored docType is the source of truth; fall back to the request body.
    const effectiveDocType = (['ic', 'passport', 'license'].includes(record.docType)
      ? record.docType
      : dt) as DocType;

    // Resolve the saved document images (front carries name + IC, back the address).
    const dir = join(process.cwd(), 'public', 'uploads', 'kyc', walletKey);
    const imagePaths = [record.icFrontPath, record.icBackPath]
      .filter(Boolean)
      .map(name => join(dir, name))
      .filter(existsSync);

    // Nothing to read → leave it for manual review rather than rejecting.
    if (imagePaths.length === 0) {
      return NextResponse.json({
        status: 'pending',
        reason: 'No document uploaded — awaiting manual review.',
      });
    }

    const texts = await ocrImages(imagePaths);
    const result = matchKyc(
      {
        fullName: record.fullName, icNumber: record.icNumber,
        addr1: record.addr1, addr2: record.addr2,
        postcode: record.postcode, city: record.city, state: record.state,
        docType: effectiveDocType,
      },
      ...texts,
    );

    if (!result.matched) {
      await prisma.kycSubmission.update({ where: { wallet: walletKey }, data: { status: 'rejected' } });
      return NextResponse.json({ status: 'rejected', reason: result.reason, checks: result.checks });
    }

    // Matched → approve on-chain. If the chain call fails (e.g. node down),
    // keep the record pending so an admin can finalize manually.
    try {
      await setKycOnChain(walletKey, true);
    } catch (chainErr) {
      console.error('[POST /api/kyc/auto-verify] on-chain approval failed', chainErr);
      return NextResponse.json({
        status: 'pending',
        reason: 'Documents verified, but on-chain approval failed — an admin will finalize shortly.',
        checks: result.checks,
      });
    }

    await prisma.kycSubmission.update({ where: { wallet: walletKey }, data: { status: 'approved' } });
    return NextResponse.json({ status: 'approved', checks: result.checks });
  } catch (err) {
    console.error('[POST /api/kyc/auto-verify]', err);
    return NextResponse.json({ error: 'Auto-verification failed' }, { status: 500 });
  }
}
