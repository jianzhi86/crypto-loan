import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'crypto-lend-jwt-dev-fallback'
);

interface TokenPayload {
  isAdmin?: boolean;
}

async function decodeToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as TokenPayload;
  } catch {
    return null;
  }
}

// Paths reachable without authentication.
const PUBLIC_PATHS = ['/', '/login', '/signup', '/home'];
// Auth-only paths that an already-authenticated user should be redirected away from.
const AUTH_PATHS = ['/login', '/signup'];
// Paths only accessible to admin users (isAdmin: true in JWT).
const ADMIN_PATHS = ['/admin'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('auth-token')?.value;
  const payload = token ? await decodeToken(token) : null;
  const authenticated = payload !== null;

  const isPublic = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
  const isAuthPath = AUTH_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
  const isAdminPath = ADMIN_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));

  if (!authenticated && !isPublic) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated but not an admin trying to reach an admin path → back to dashboard.
  if (authenticated && isAdminPath && !payload?.isAdmin) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (authenticated && isAuthPath) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.png$|.*\\.svg$|.*\\.ico$).*)'],
};
