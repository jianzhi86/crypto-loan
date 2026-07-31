import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'crypto-lend-jwt-dev-fallback'
);

export interface AuthPayload {
  id: string;
  email?: string | null;
  name?: string | null;
  walletAddress?: string | null;
  isAdmin?: boolean;
  /** Snapshot of User.sessionEpoch when this token was minted. A mismatch
   *  against the DB means the token was revoked (e.g. admin password reset).
   *  Absent on tokens issued before session revocation existed — treated as 0. */
  epoch?: number;
}

export async function createToken(payload: AuthPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as AuthPayload;
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string) {
  (await cookies()).set('auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });
}

export async function clearAuthCookie() {
  (await cookies()).delete('auth-token');
}

export async function getAuthUser(): Promise<AuthPayload | null> {
  const token = (await cookies()).get('auth-token')?.value;
  if (!token) return null;
  return verifyToken(token);
}
