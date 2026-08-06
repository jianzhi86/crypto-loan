import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/authz';
import AppShell from '@/components/sidebar/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts only checks that the JWT parses — it runs at the edge with no DB
  // access. A suspension (and the sessionEpoch bump that comes with it) kills
  // the session in the database while that cookie is still cryptographically
  // valid, so re-check here, where the live row is reachable.
  //
  // Gated on "cookie present but resolves to nobody" rather than "no user":
  // /explorer sits under this segment and is public to anonymous visitors, who
  // carry no cookie at all and must not be bounced to the sign-in page.
  const hasCookie = (await cookies()).has('auth-token');
  if (hasCookie && !(await getSessionUser())) redirect('/login?suspended=1');

  return <AppShell>{children}</AppShell>;
}
