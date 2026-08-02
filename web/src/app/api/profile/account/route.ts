import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { requireUser, requireActiveUser, audit } from '@/lib/authz';
import { createToken, setAuthCookie } from '@/lib/auth-jwt';

/**
 * Self-service account identity: display name, email, and password.
 *
 * This is where a wallet-registered account (created by "Continue with
 * MetaMask", no credentials) adds an email + password — which is also what
 * unlocks unlinking its wallet, since an account must always keep at least
 * one login method. Nothing here can ever REMOVE a login method: email and
 * password can only be set or changed, never cleared.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/profile/account — the signed-in account's identity fields.
// `hasPassword` drives the settings form (change vs. set), the hash itself
// never leaves the server. requireUser, not requireActiveUser: a RESTRICTED
// account is read-only, and this is a read.
export async function GET() {
  const guard = await requireUser();
  if (!guard.ok) return guard.response;

  const row = await prisma.user.findUnique({
    where: { id: guard.user.id },
    select: { name: true, email: true, password: true },
  });
  return NextResponse.json({
    name: row?.name ?? null,
    email: row?.email ?? null,
    hasPassword: !!row?.password,
  });
}

// PATCH /api/profile/account — update name / email / password.
// Body: { name?, email?, currentPassword?, newPassword? }
export async function PATCH(req: NextRequest) {
  const guard = await requireActiveUser();
  if (!guard.ok) return guard.response;

  try {
    const body = await req.json() as {
      name?: string;
      email?: string;
      currentPassword?: string;
      newPassword?: string;
    };

    const row = await prisma.user.findUnique({
      where: { id: guard.user.id },
      select: { name: true, email: true, password: true },
    });
    if (!row) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

    const data: { name?: string | null; email?: string; password?: string } = {};

    if (body.name !== undefined) {
      data.name = body.name.trim() || null;
    }

    if (body.email !== undefined && body.email.trim() !== '') {
      const email = body.email.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) {
        return NextResponse.json({ error: 'That email address doesn’t look valid.' }, { status: 400 });
      }
      if (email !== row.email) {
        const clash = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        if (clash && clash.id !== guard.user.id) {
          return NextResponse.json({ error: 'That email is already used by another account.' }, { status: 409 });
        }
        data.email = email;
      }
    }

    if (body.newPassword !== undefined && body.newPassword !== '') {
      if (body.newPassword.length < 8) {
        return NextResponse.json({ error: 'The new password must be at least 8 characters.' }, { status: 400 });
      }
      if (row.password) {
        // Changing an existing password needs proof it's really the owner —
        // a hijacked browser session must not be enough to take the account.
        if (!body.currentPassword || !(await bcrypt.compare(body.currentPassword, row.password))) {
          return NextResponse.json({ error: 'Your current password is incorrect.' }, { status: 403 });
        }
      }
      data.password = await bcrypt.hash(body.newPassword, 12);
    }

    // Email login = email + password as a pair. Adding an email to an account
    // that has no password (and isn't setting one now) would create a login
    // method that can never actually log in. Checked against the REQUEST, not
    // the stored state: an admin can attach an email to a password-less
    // account (their two-step flow: add email, then reset-password), and that
    // pre-existing state must not block unrelated edits like a name change.
    if (data.email && !(data.password ?? row.password)) {
      return NextResponse.json({
        error: 'Set a password together with your email — you’ll need both to sign in without MetaMask.',
      }, { status: 400 });
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: guard.user.id },
      data: {
        ...data,
        // A password change invalidates every other session (same as the
        // admin reset flow) — someone changing their password after a scare
        // expects intruders to be logged out.
        ...(data.password ? { sessionEpoch: { increment: 1 } } : {}),
      },
      select: {
        id: true, name: true, email: true, password: true,
        walletAddress: true, isAdmin: true, sessionEpoch: true,
      },
    });

    // Re-issue THIS session's cookie with the new epoch so the person who
    // changed the password stays signed in while everyone else drops.
    if (data.password) {
      const token = await createToken({
        id: updated.id, email: updated.email, name: updated.name,
        walletAddress: updated.walletAddress, isAdmin: updated.isAdmin,
        epoch: updated.sessionEpoch,
      });
      await setAuthCookie(token);
    }

    await audit(guard.user, 'USER_UPDATE', 'user', guard.user.id, {
      self: true,
      fields: Object.keys(data),
    });

    return NextResponse.json({
      name: updated.name,
      email: updated.email,
      hasPassword: !!updated.password,
    });
  } catch (err) {
    console.error('[PATCH /api/profile/account]', err);
    return NextResponse.json({ error: 'Could not save your account details. Please try again.' }, { status: 500 });
  }
}
