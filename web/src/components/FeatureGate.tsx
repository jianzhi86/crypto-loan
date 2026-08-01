import { notFound } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { getFlags } from '@/lib/features-server';
import { getSessionUser } from '@/lib/authz';
import { flagMessage, isHidden, isMaintenance } from '@/lib/features';
import { FLAG_BY_KEY } from '@/lib/features';
import { WrenchIcon } from '@/components/Icons';

/**
 * Server-side page guard.
 *
 * Used as a per-segment `layout.tsx` so the enforcement is real rather than
 * cosmetic: hiding a link in the sidebar does nothing for someone who types the
 * URL, and every gated page here is a Client Component that cannot check flags
 * before it renders. Wrapping the segment keeps the check on the server without
 * rewriting those pages.
 *
 *  HIDDEN      → 404, as if the route never existed.
 *  MAINTENANCE → the page is replaced by a notice, inside the normal app shell.
 *
 * Admins pass straight through both, so a paused page stays verifiable.
 */
export default async function FeatureGate({
  feature,
  children,
}: {
  feature: string;
  children: React.ReactNode;
}) {
  const flags = await getFlags();

  const hidden = isHidden(flags, feature);
  const paused = isMaintenance(flags, feature);
  if (!hidden && !paused) return <>{children}</>;

  const viewer = await getSessionUser();
  if (viewer?.isAdmin) return <>{children}</>;

  if (hidden) notFound();

  return (
    <MaintenancePanel
      title={FLAG_BY_KEY[feature]?.label ?? 'This page'}
      message={flagMessage(flags, feature)}
    />
  );
}

function MaintenancePanel({ title, message }: { title: string; message: string }) {
  return (
    <Box sx={{ minHeight: 'calc(100vh - 95px)', bgcolor: '#0B1226', p: { xs: 2, md: 4 }, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
      <Paper sx={{
        maxWidth: 520, width: '100%', mt: { xs: 4, md: 10 }, p: { xs: 3, sm: 5 },
        textAlign: 'center', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 4,
      }}>
        <Box sx={{
          width: 52, height: 52, mx: 'auto', mb: 2.25, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: 'rgba(110,139,255,0.07)', color: '#6E8BFF',
        }}>
          <WrenchIcon size={24} />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#F2F5FF', mb: 1 }}>
          {title} is under maintenance
        </Typography>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, mb: 3 }}>
          {message}
        </Typography>
        {/* Plain href rather than `component={Link}`: this is a Server
            Component, and passing the Link component itself as a prop to a
            Client Component (MUI Button) is not serialisable across the
            boundary. A full navigation is fine on a maintenance page. */}
        <Button href="/dashboard" variant="contained" disableElevation
          sx={{ textTransform: 'none', borderRadius: 2, px: 3 }}>
          Back to dashboard
        </Button>
      </Paper>
    </Box>
  );
}
