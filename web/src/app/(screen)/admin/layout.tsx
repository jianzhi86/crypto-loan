import { redirect } from 'next/navigation';
import Box from '@mui/material/Box';
import AdminTabs from '@/components/admin/AdminTabs';
import { getSessionUser } from '@/lib/authz';

/**
 * Server-side admin gate for every /admin route.
 *
 * proxy.ts already redirects non-admins, but that check reads the JWT, which is
 * a seven-day-old snapshot. This one reads the live user row, so revoking
 * someone's admin rights takes effect on their next navigation rather than
 * whenever their token happens to expire. Defence in depth, not duplication.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/admin');
  if (!user.isAdmin) redirect('/dashboard');

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F4F6F8' }}>
      <AdminTabs />
      {children}
    </Box>
  );
}
