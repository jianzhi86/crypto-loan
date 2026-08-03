import Link from 'next/link';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

import { prisma } from '@/lib/db/prisma';
import { getFlags } from '@/lib/features-server';
import { FLAGS, ON } from '@/lib/features';
import { AdminAutoSync } from '@/components/AdminAutoSync';
import { ShieldIcon } from '@/components/Icons';
import { Badge, C, type Tone } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

const ACTION_TONE: Record<string, Tone> = {
  USER_RESTRICT:        'red',
  USER_CLEAR_BANK:      'red',
  KYC_DELETE:           'red',
  KYC_REJECT:           'red',
  USER_RESET_PASSWORD:  'amber',
  USER_RESET_KYC:       'amber',
  USER_UNLINK_WALLET:   'amber',
  USER_UNRESTRICT:      'green',
  KYC_APPROVE:          'green',
  FLAG_UPDATE:          'blue',
  USER_SET_ADMIN:       'blue',
  PRICE_SYNC:           'neutral',
};

export default async function AdminOverviewPage() {
  const [users, restricted, admins, kycPending, kycApproved, kycRejected, loanTxs, transfers, flags, recent] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'RESTRICTED' } }),
      prisma.user.count({ where: { isAdmin: true } }),
      prisma.kycSubmission.count({ where: { status: 'pending' } }),
      prisma.kycSubmission.count({ where: { status: 'approved' } }),
      prisma.kycSubmission.count({ where: { status: 'rejected' } }),
      prisma.loanTransaction.count(),
      prisma.bankTransfer.count(),
      getFlags(),
      prisma.adminAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 6 }),
    ]);

  const paused = FLAGS.filter(f => (flags[f.key]?.state ?? ON) !== ON);

  const stats = [
    { label: 'Users',            value: users,       color: C.ink,                              href: '/admin/users',        hint: `${admins} admin${admins === 1 ? '' : 's'}` },
    { label: 'Restricted',       value: restricted,  color: restricted ? C.red   : C.muted,     href: '/admin/users',        hint: 'read-only accounts' },
    { label: 'KYC pending',      value: kycPending,  color: kycPending ? C.amber : C.muted,     href: '/admin/kyc',          hint: `${kycApproved} approved` },
    { label: 'KYC rejected',     value: kycRejected, color: kycRejected ? C.red  : C.muted,     href: '/admin/kyc',          hint: 'need attention' },
    { label: 'On-chain records', value: loanTxs,     color: C.slate,                            href: '/admin/transactions', hint: 'read-only mirror' },
    { label: 'Bank transfers',   value: transfers,   color: C.slate,                            href: '/admin/transactions', hint: 'off-chain' },
  ];

  return (
    <Box sx={{ p: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1440, mx: 'auto' }}>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 3 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: C.ink }}>Overview</Typography>
            <Typography variant="body2" sx={{ color: C.slate, mt: 0.5 }}>
              Supabase Postgres · off-chain administration
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <AdminAutoSync />
          </Box>
        </Box>

        {/* Attention callout when KYC items need review */}
        {(kycPending > 0 || kycRejected > 0) && (
          <Link href="/admin/kyc" style={{ textDecoration: 'none' }}>
            <Box sx={{
              mb: 3, p: 2, borderRadius: 2, cursor: 'pointer',
              bgcolor: 'rgba(255,178,36,0.05)', border: '1px solid rgba(255,178,36,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1,
              transition: 'border-color .15s',
              '&:hover': { borderColor: 'rgba(255,178,36,0.45)' },
            }}>
              <Box>
                <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: C.amber }}>
                  {kycPending > 0
                    ? `${kycPending} KYC submission${kycPending !== 1 ? 's' : ''} waiting for review`
                    : `${kycRejected} KYC submission${kycRejected !== 1 ? 's' : ''} rejected`}
                </Typography>
                <Typography variant="caption" sx={{ color: C.muted }}>
                  Open the KYC tab to approve or remove →
                </Typography>
              </Box>
              {kycPending > 0 && (
                <Badge label={`${kycPending} pending`} tone="amber" />
              )}
            </Box>
          </Link>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' }, gap: 2, mb: 3 }}>
          {stats.map(s => (
            <Link key={s.label} href={s.href} style={{ textDecoration: 'none' }}>
              <Paper sx={{
                p: 2, border: `1px solid ${C.border}`, borderRadius: 2, boxShadow: 'none', height: '100%',
                transition: 'border-color .15s, transform .15s',
                '&:hover': { borderColor: C.blue, transform: 'translateY(-1px)' },
              }}>
                <Typography variant="caption" sx={{ color: C.slate }}>{s.label}</Typography>
                <Typography variant="h4" sx={{ color: s.color, mt: 0.5, fontWeight: 700, fontSize: 28 }}>{s.value}</Typography>
                <Typography variant="caption" sx={{ color: C.muted }}>{s.hint}</Typography>
              </Paper>
            </Link>
          ))}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>

          {/* Anything currently switched off, so a forgotten toggle is obvious. */}
          <Card sx={{ p: 2.5, border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none' }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14, color: C.ink, mb: 1.5 }}>
              Feature status
            </Typography>
            {paused.length === 0 ? (
              <Typography variant="body2" sx={{ color: C.slate }}>
                Everything is switched on. <Link href="/admin/features" style={{ color: C.blue }}>Manage features →</Link>
              </Typography>
            ) : (
              <>
                {paused.map(f => (
                  <Box key={f.key} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.6 }}>
                    <Badge
                      label={flags[f.key]?.state === 'HIDDEN' ? 'hidden' : 'maintenance'}
                      tone={flags[f.key]?.state === 'HIDDEN' ? 'neutral' : 'amber'}
                    />
                    <Typography variant="body2" sx={{ fontSize: 13, color: C.ink }}>{f.label}</Typography>
                  </Box>
                ))}
                <Typography variant="body2" sx={{ mt: 1.5 }}>
                  <Link href="/admin/features" style={{ color: C.blue, fontSize: 13 }}>Manage features →</Link>
                </Typography>
              </>
            )}
          </Card>

          <Card sx={{ p: 2.5, border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none' }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14, color: C.ink, mb: 1.5 }}>
              Recent admin activity
            </Typography>
            {recent.length === 0 ? (
              <Typography variant="body2" sx={{ color: C.slate }}>No admin actions recorded yet.</Typography>
            ) : (
              <>
                {recent.map(e => (
                  <Box key={e.id} sx={{ display: 'flex', gap: 1, py: 0.6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ color: C.muted, minWidth: 96, fontSize: 11 }}>
                      {new Date(e.createdAt).toLocaleString('en-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                    <Badge
                      label={e.action.replace(/_/g, ' ').toLowerCase()}
                      tone={ACTION_TONE[e.action] ?? 'neutral'}
                    />
                    <Typography variant="caption" sx={{ color: C.muted, fontFamily: 'monospace', fontSize: 10.5 }}>
                      {e.actorEmail ?? e.actorId.slice(0, 20)}
                    </Typography>
                  </Box>
                ))}
                <Typography variant="body2" sx={{ mt: 1.5 }}>
                  <Link href="/admin/audit" style={{ color: C.blue, fontSize: 13 }}>Full audit log →</Link>
                </Typography>
              </>
            )}
          </Card>
        </Box>

        <Card sx={{ mt: 2.5, p: 2.5, border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', bgcolor: 'rgba(110,139,255,0.03)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75, color: C.blue }}>
            <ShieldIcon size={16} />
            <Typography sx={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>
              What this panel can and cannot change
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: C.slate, fontSize: 12.5, lineHeight: 1.75 }}>
            Admin edits are limited to off-chain data in Supabase: accounts, KYC review status,
            bank details and feature toggles. Collateral, debt, interest and the on-chain KYC flag
            live in the CryptoLoan contract and are shown here strictly read-only. The one action
            that reaches the chain is KYC approval, which calls <code>setKYC</code> with the owner
            key — it is recorded in the audit log every time.
          </Typography>
        </Card>

      </Box>
    </Box>
  );
}
