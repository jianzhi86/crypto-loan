import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { requireUser, requireActiveUser } from '@/lib/authz';
import { featureBlocked } from '@/lib/features-server';

export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const account = await prisma.bankAccount.findUnique({ where: { userId: guard.user.id } });
  return NextResponse.json({ account });
}

export async function PUT(req: Request) {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;
  const user = guard.user;

  const blocked = await featureBlocked('page.settings', { isAdmin: user.isAdmin });
  if (blocked) return blocked;

  const { bankName, accountNumber, accountHolder, recipientAddress } = await req.json() as {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
    recipientAddress?: string;
  };

  if (!bankName || !accountNumber || !accountHolder) {
    return NextResponse.json({ error: 'All fields required' }, { status: 400 });
  }
  if (!/^\d{6,20}$/.test(accountNumber)) {
    return NextResponse.json({ error: 'Account number must be 6–20 digits' }, { status: 400 });
  }

  const addr = recipientAddress?.trim() ?? '';
  if (addr && !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
    return NextResponse.json({ error: 'Recipient address must be a valid 0x Ethereum address' }, { status: 400 });
  }

  const account = await prisma.bankAccount.upsert({
    where:  { userId: user.id },
    update: { bankName, accountNumber, accountHolder, recipientAddress: addr },
    create: { userId: user.id, bankName, accountNumber, accountHolder, recipientAddress: addr },
  });

  return NextResponse.json({ account });
}
