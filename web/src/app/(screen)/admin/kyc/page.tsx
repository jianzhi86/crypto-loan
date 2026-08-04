import { prisma } from '@/lib/db/prisma';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { AdminAutoSync } from '@/components/AdminAutoSync';
import { AdminAutoRefresh } from '@/components/AdminAutoRefresh';
import { Badge, C, PageHeader } from '@/components/admin/ui';
import KycTableClient, { type KycRow } from '@/components/admin/KycTableClient';

export const dynamic = 'force-dynamic';

export default async function AdminKycPage() {
  const submissions = await prisma.kycSubmission.findMany({ orderBy: { submittedAt: 'desc' } });

  const pending  = submissions.filter(s => s.status === 'pending').length;
  const approved = submissions.filter(s => s.status === 'approved').length;
  const rejected = submissions.filter(s => s.status === 'rejected').length;

  // Serialize for the client component — strip multi-MB image blobs.
  const rows: KycRow[] = submissions.map(s => ({
    id: s.id, userId: s.userId, wallet: s.wallet,
    fullName: s.fullName, docType: s.docType, icNumber: s.icNumber,
    dob: s.dob, gender: s.gender, nationality: s.nationality,
    phone: s.phone, email: s.email, addr1: s.addr1, addr2: s.addr2 ?? '',
    postcode: s.postcode, city: s.city, state: s.state,
    employment: s.employment, income: s.income, purpose: s.purpose, fundSource: s.fundSource,
    status: s.status, submittedAt: s.submittedAt.toISOString(),
    hasFront: !!s.icFrontData, hasBack: !!s.icBackData, hasSelfie: !!s.selfieData,
  }));

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: '#080E1F', minHeight: '100vh' }}>
      <AdminAutoRefresh />
      <Box sx={{ maxWidth: 1440, mx: 'auto' }}>

        <PageHeader
          title="KYC Submissions"
          subtitle={`${submissions.length} record${submissions.length !== 1 ? 's' : ''} · Supabase Postgres`}
          actions={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              {pending > 0 && (
                <Badge label={`${pending} Pending`} tone="amber" title="Submissions waiting for review" />
              )}
              <AdminAutoSync />
            </Box>
          }
        />

        {submissions.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.5, mb: 3 }}>
            {[
              { label: 'Total Submissions', value: submissions.length, color: C.ink,  accent: C.border },
              { label: 'Pending Review',    value: pending,  color: pending  ? C.amber : C.muted, accent: pending  ? C.amber : C.border },
              { label: 'Approved',          value: approved, color: approved ? C.green : C.muted, accent: approved ? C.green : C.border },
              { label: 'Rejected',          value: rejected, color: rejected ? C.red   : C.muted, accent: rejected ? C.red   : C.border },
            ].map(s => (
              <Paper key={s.label} sx={{
                p: 2.25, bgcolor: '#0D1628',
                border: `1px solid ${C.border}`,
                borderLeft: `3px solid ${s.accent}`,
                borderRadius: 2, boxShadow: 'none',
              }}>
                <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.75 }}>
                  {s.label}
                </Typography>
                <Typography sx={{ color: s.color, fontWeight: 800, fontSize: 30, lineHeight: 1.1, letterSpacing: -0.5 }}>
                  {s.value}
                </Typography>
              </Paper>
            ))}
          </Box>
        )}

        <KycTableClient submissions={rows} />
      </Box>
    </Box>
  );
}
