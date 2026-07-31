import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireUser, requireActiveUser } from '@/lib/authz';
import { featureBlocked } from '@/lib/features-server';
import crypto from 'crypto';

export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;
  const user = guard.user;

  const transfers = await prisma.bankTransfer.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({ transfers });
}

export async function POST(req: Request) {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;
  const user = guard.user;

  const blocked = await featureBlocked('action.transfer', { isAdmin: user.isAdmin });
  if (blocked) return blocked;

  const { amountMYR } = await req.json() as { amountMYR: number };
  if (!amountMYR || amountMYR <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  const account = await prisma.bankAccount.findUnique({ where: { userId: user.id } });
  if (!account) {
    return NextResponse.json({ error: 'No bank account registered. Go to Settings to add one.' }, { status: 400 });
  }

  const referenceNo = 'TXF' + crypto.randomBytes(6).toString('hex').toUpperCase();
  const accountLast4 = account.accountNumber.slice(-4);

  const transfer = await prisma.bankTransfer.create({
    data: {
      userId: user.id,
      amountMYR,
      status: 'PENDING',
      referenceNo,
      bankName: account.bankName,
      accountLast4,
    },
  });

  // Simulate processing → completed after delays (fire-and-forget)
  void simulateTransfer(transfer.id);

  return NextResponse.json({ transfer });
}

async function simulateTransfer(transferId: string) {
  // Simulate PROCESSING after 3 seconds
  await delay(3000);
  await prisma.bankTransfer.update({
    where: { id: transferId },
    data: { status: 'PROCESSING' },
  });

  // Simulate COMPLETED after another 7 seconds
  await delay(7000);
  await prisma.bankTransfer.update({
    where: { id: transferId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
