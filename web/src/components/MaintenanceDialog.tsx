'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { WrenchIcon } from '@/components/Icons';

/**
 * Site-wide maintenance popup.
 *
 * Sits over the page rather than replacing it: the app stays visible but blurred
 * behind, which reads as "paused for a moment" instead of "gone". The overlay
 * covers the viewport, so everything underneath is unclickable — this is the
 * whole enforcement on the client side, and it is deliberately only a UX gate.
 * Real access control lives in the root layout, proxy.ts and the API routes.
 *
 * There is no dismiss control. Closing it would leave the visitor sitting on a
 * page they cannot use; the way out is one of the offered destinations, all of
 * which are on the maintenance exempt list (see lib/maintenance.ts) so none of
 * them bounce straight back here.
 *
 * Rendered from two places — the root layout on a fresh document, and
 * SiteMaintenanceGate on client-side navigation. Only ever one at a time.
 */
export default function MaintenanceDialog({
  message,
  explorerAvailable = false,
  signedIn = false,
}: {
  message: string;
  explorerAvailable?: boolean;
  signedIn?: boolean;
}) {
  const [checking, setChecking] = useState(false);

  // Stop the page behind from scrolling under the overlay — without this the
  // blurred content still moves on a wheel gesture, which makes the popup look
  // like a decoration rather than a block.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  return (
    <Box
      // Lenis swallows wheel events globally; this lets the card scroll on
      // short viewports.
      data-lenis-prevent
      sx={{
        position: 'fixed', inset: 0, zIndex: 2000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        p: 3, overflowY: 'auto',
        bgcolor: 'rgba(244,246,248,0.72)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
    >
      <Paper sx={{
        maxWidth: 460, width: '100%', p: { xs: 3.5, sm: 5 }, textAlign: 'center',
        border: '1px solid #E2E7EE', borderRadius: 4,
        boxShadow: '0 16px 48px rgba(16,21,28,0.12)',
      }}>
        <Box sx={{
          width: 56, height: 56, mx: 'auto', mb: 2.5, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: 'rgba(42,63,214,0.07)', color: '#2A3FD6',
        }}>
          <WrenchIcon size={26} />
        </Box>

        <Typography variant="h6" sx={{ fontWeight: 700, color: '#10151C', mb: 1.25 }}>
          CryptoLend is under maintenance
        </Typography>
        <Typography variant="body2" sx={{ color: '#5A6675', lineHeight: 1.75 }}>
          {message}
        </Typography>

        {explorerAvailable && (
          <Typography variant="body2" sx={{ color: '#5A6675', lineHeight: 1.75, mt: 1.5 }}>
            You can still browse the public{' '}
            <Box component="span" sx={{ fontWeight: 600, color: '#10151C' }}>Transaction Explorer</Box>
            {' '}while the rest of the app is paused.
          </Typography>
        )}

        <Box sx={{ mt: 3.5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {/* The explorer only serves public chain data, so it stays up unless
              it is switched off in its own right — which makes it the natural
              primary way out. */}
          {explorerAvailable && (
            <Button href="/explorer" variant="contained" disableElevation
              sx={{ textTransform: 'none', borderRadius: 2, py: 1.25 }}>
              Go to Explorer →
            </Button>
          )}

          <Box sx={{ display: 'flex', gap: 1.25, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              variant={explorerAvailable ? 'text' : 'contained'}
              disableElevation
              disabled={checking}
              onClick={() => { setChecking(true); window.location.reload(); }}
              sx={{ textTransform: 'none', borderRadius: 2, px: 3 }}
            >
              {checking ? 'Checking…' : 'Check again'}
            </Button>

            {/* Sign-in stays open during maintenance precisely so an admin can
                get in and lift it. Surfacing it here makes that recoverable
                without someone having to know the URL. */}
            <Button
              href={signedIn ? '/home' : '/login'}
              variant="text"
              sx={{ textTransform: 'none', borderRadius: 2, px: 3, color: '#5A6675' }}
            >
              {signedIn ? 'Back to homepage' : 'Sign in'}
            </Button>
          </Box>
        </Box>

        <Box sx={{ mt: 3.5, pt: 2.5, borderTop: '1px solid #E2E7EE' }}>
          <Typography variant="caption" sx={{ color: '#A9B2BD', lineHeight: 1.7 }}>
            Your funds and positions are unaffected. Loans continue to accrue interest
            as normal while the interface is offline.
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
