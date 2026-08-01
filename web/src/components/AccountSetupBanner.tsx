'use client';

import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import { useAuth } from '@/hooks/useAuth';
import { useViewer } from '@/lib/ViewerContext';
import { useWallet } from '@/lib/WalletContext';
import { LiveDot } from '@/components/Icons';

// The brand's dark-background treatment (see the landing page's Vision &
// Mission band): deep navy, soft indigo glows, glass surfaces, blue gradient
// accents. One design for both states — only the copy and the active step
// change, so the banner reads as one calm system, not a mood swing.
const NAVY = '#0B1226';
const G1 = '#2A3FD6';
const G2 = '#4A7DFF';
const TEAL = '#2BD9A2'; // teal tuned for dark ground

function StepDot({ state, n }: { state: 'done' | 'current' | 'todo'; n: number }) {
  if (state === 'done') {
    return (
      <Box sx={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        bgcolor: 'rgba(43,217,162,0.14)', border: `1.5px solid ${TEAL}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </Box>
    );
  }
  if (state === 'current') {
    return (
      <Box sx={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        background: `linear-gradient(135deg, ${G1}, ${G2})`,
        boxShadow: `0 0 0 4px rgba(74,125,255,0.18), 0 3px 12px rgba(42,63,214,0.5)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{n}</Typography>
      </Box>
    );
  }
  return (
    <Box sx={{
      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
      border: '1.5px solid rgba(255,255,255,0.18)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: 'rgba(255,255,255,0.35)', lineHeight: 1 }}>{n}</Typography>
    </Box>
  );
}

/**
 * Nexo-style onboarding rail: the first thing on the dashboard until the
 * account is verified. Reflects the ACCOUNT's KYC status, never the connected
 * wallet's, and disappears once an admin approves — approval is manual and
 * admin-only, there is no automated pass.
 */
export default function AccountSetupBanner() {
  const router = useRouter();
  const { user } = useAuth();
  const viewer = useViewer();
  const wallet = useWallet();

  const signedIn = viewer.isAuthenticated || !!user;
  const isAdmin = viewer.isAdmin || !!user?.isAdmin;

  if (!signedIn || isAdmin) return null;
  if (!wallet.kycDbChecked) return null;
  if (wallet.kycStatus === 'approved') return null;

  const submitted = wallet.kycStatus === 'pending';

  const steps: { label: string; state: 'done' | 'current' | 'todo' }[] = [
    { label: 'Create account',       state: 'done' },
    { label: 'Personal information', state: submitted ? 'done' : 'current' },
    { label: 'Account verification', state: submitted ? 'current' : 'todo' },
  ];

  return (
    <Paper sx={{
      position: 'relative', overflow: 'hidden',
      p: { xs: 2.5, sm: 3.25 }, mb: 4,
      bgcolor: NAVY,
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 3.5,
      boxShadow: '0 12px 40px rgba(11,18,38,0.35)',
    }}>
      {/* Soft indigo glows, same recipe as the landing page's navy band */}
      <Box sx={{ position: 'absolute', top: -110, left: '-6%', width: 320, height: 320, borderRadius: '50%', pointerEvents: 'none',
                 background: 'radial-gradient(circle, rgba(42,63,214,0.4) 0%, transparent 70%)' }} />
      <Box sx={{ position: 'absolute', bottom: -130, right: '-4%', width: 340, height: 340, borderRadius: '50%', pointerEvents: 'none',
                 background: 'radial-gradient(circle, rgba(74,125,255,0.25) 0%, transparent 70%)' }} />

      <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box sx={{
            width: 52, height: 52, borderRadius: 3, flexShrink: 0, color: '#fff',
            background: `linear-gradient(135deg, ${G1}, ${G2})`,
            boxShadow: '0 6px 20px rgba(42,63,214,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="3" width="16" height="18" rx="2.5" />
              <circle cx="12" cy="9.5" r="2.5" />
              <path d="M8 16.5c.7-2 2.2-3 4-3s3.3 1 4 3" />
            </svg>
          </Box>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
              <Typography sx={{ fontWeight: 800, fontSize: 18.5, color: '#FFFFFF', lineHeight: 1.25, letterSpacing: '-0.2px' }}>
                Finalise account setup
              </Typography>
              <Chip
                icon={<Box component="span" sx={{ display: 'flex', ml: 1, mr: -0.5 }}>
                        <LiveDot color={submitted ? G2 : '#FFB224'} size={7} />
                      </Box>}
                label={submitted ? 'Under review' : 'Action required'}
                size="small"
                sx={{
                  height: 22, fontSize: 11, fontWeight: 700, letterSpacing: '0.03em',
                  bgcolor: 'rgba(255,255,255,0.07)',
                  color: 'rgba(255,255,255,0.85)',
                  border: '1px solid rgba(255,255,255,0.14)',
                }}
              />
            </Box>
            <Typography sx={{ fontSize: 13.5, color: 'rgba(255,255,255,0.6)', mt: 0.5, lineHeight: 1.55 }}>
              {submitted
                ? 'Your identity documents are being reviewed by our compliance team.'
                : <>Next step: add your personal information to unlock{' '}
                   <Box component="span" sx={{ fontWeight: 700, color: '#FFFFFF' }}>deposits</Box>,{' '}
                   <Box component="span" sx={{ fontWeight: 700, color: '#FFFFFF' }}>borrowing</Box> and{' '}
                   <Box component="span" sx={{ fontWeight: 700, color: '#FFFFFF' }}>MYR purchases</Box>.</>}
            </Typography>
          </Box>
        </Box>

        {submitted ? (
          <Button
            variant="outlined"
            onClick={() => router.push('/kyc')}
            sx={{
              textTransform: 'none', borderRadius: 2.5, px: 3, py: 1,
              fontWeight: 700, fontSize: 13.5,
              color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.25)',
              '&:hover': { borderColor: G2, bgcolor: 'rgba(74,125,255,0.1)' },
            }}
          >
            View status
          </Button>
        ) : (
          <Button
            variant="contained" disableElevation
            onClick={() => router.push('/kyc')}
            sx={{
              textTransform: 'none', borderRadius: 2.5, px: 3.5, py: 1.1,
              fontWeight: 800, fontSize: 14, letterSpacing: '0.01em',
              background: `linear-gradient(135deg, ${G1} 0%, ${G2} 100%)`,
              boxShadow: '0 6px 22px rgba(42,63,214,0.55)',
              transition: 'transform 0.15s, box-shadow 0.15s',
              '&:hover': {
                background: 'linear-gradient(135deg, #2333B8 0%, #3B6BF0 100%)',
                transform: 'translateY(-1px)',
                boxShadow: '0 10px 28px rgba(42,63,214,0.65)',
              },
            }}
          >
            Add personal information →
          </Button>
        )}
      </Box>

      {/* Step rail */}
      <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', mt: 3, gap: 1.25, overflowX: 'auto' }}>
        {steps.map((step, i) => {
          const next = steps[i + 1];
          const connector =
            step.state === 'done' && next?.state === 'done'    ? TEAL :
            step.state === 'done' && next?.state === 'current' ? `linear-gradient(90deg, ${TEAL}, ${G2})` :
            'rgba(255,255,255,0.12)';
          return (
            <Box key={step.label} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: i < steps.length - 1 ? 1 : 'none', minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <StepDot state={step.state} n={i + 1} />
                <Typography sx={{
                  fontSize: 13, whiteSpace: 'nowrap',
                  fontWeight: step.state === 'current' ? 800 : 600,
                  color: step.state === 'done' ? TEAL : step.state === 'current' ? '#FFFFFF' : 'rgba(255,255,255,0.35)',
                }}>
                  {step.label}
                </Typography>
              </Box>
              {i < steps.length - 1 && (
                <Box sx={{ flex: 1, height: '3px', borderRadius: 2, minWidth: 24, background: connector }} />
              )}
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}
