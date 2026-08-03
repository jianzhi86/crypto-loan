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
    <Box sx={{ color: 'text.primary', p: { xs: 2, md: 4 } }}>
      <AdminAutoRefresh />
      <Box sx={{ maxWidth: 1440, mx: 'auto' }}>

        <PageHeader
          title="KYC Submissions"
          subtitle={`${submissions.length} record${submissions.length !== 1 ? 's' : ''} · Supabase Postgres`}
          actions={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              {pending > 0 && (
                <Badge
                  label={`${pending} Pending`}
                  tone="amber"
                  title="Submissions waiting for review"
                />
              )}
              <AdminAutoSync />
            </Box>
          }
        />

        {submissions.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
            {[
              { label: 'Total',    value: submissions.length, color: C.slate },
              { label: 'Pending',  value: pending,  color: pending  ? C.amber : C.muted },
              { label: 'Approved', value: approved, color: approved ? C.green : C.muted },
              { label: 'Rejected', value: rejected, color: rejected ? C.red   : C.muted },
            ].map(s => (
              <Paper key={s.label} sx={{ p: 2, bgcolor: '#111B38', border: `1px solid ${C.border}`, borderRadius: 2, boxShadow: 'none' }}>
                <Typography variant="caption" sx={{ color: C.slate }}>{s.label}</Typography>
                <Typography variant="h4" sx={{ color: s.color, mt: 0.5, fontWeight: 700, fontSize: 28 }}>{s.value}</Typography>
              </Paper>
            ))}
          </Box>
        )}

        <KycTableClient submissions={rows} />
      </Box>
    </Box>
  );
}
