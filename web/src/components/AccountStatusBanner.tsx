'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useAuth } from '@/hooks/useAuth';
import { AlertIcon } from '@/components/Icons';

/**
 * Persistent notice for a restricted account.
 *
 * Without this a restricted user would just watch every button fail with no
 * explanation, which reads as a broken app rather than a deliberate hold.
 */
export default function AccountStatusBanner() {
  const { user } = useAuth();
  if (user?.status !== 'RESTRICTED') return null;

  return (
    <Box sx={{
      bgcolor: 'rgba(229,72,77,0.08)',
      borderBottom: '1px solid rgba(229,72,77,0.25)',
      px: { xs: 2, md: 4 }, py: 1.25,
    }}>
      <Box sx={{ maxWidth: 1440, mx: 'auto', display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
        <Box sx={{ color: '#B4232A', mt: '2px' }}><AlertIcon size={16} /></Box>
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#B4232A' }}>
            Your account is restricted — read-only
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: '#8A3034', lineHeight: 1.6 }}>
            You can still view your dashboard and history, but borrowing, repaying, transfers and
            profile changes are on hold.
            {user.statusReason ? <> Reason: {user.statusReason}</> : null}
            {' '}Contact support if you think this is a mistake.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
