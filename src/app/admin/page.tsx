import { prisma } from '@/lib/db/prisma';
import type { KycSubmission } from '@prisma/client';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import { AdminApproveBtn } from '@/components/AdminApproveBtn';
import { AdminDeleteBtn } from '@/components/AdminDeleteBtn';
import { AdminSyncPriceBtn } from '@/components/AdminSyncPriceBtn';
import { AdminKycDetail } from '@/components/AdminKycDetail';
import { AdminAutoRefresh } from '@/components/AdminAutoRefresh';

export const dynamic = 'force-dynamic';

const statusColors: Record<string, { bg: string; color: string }> = {
  pending:  { bg: 'rgba(199,119,0,0.1)', color: '#C77700' },
  approved: { bg: 'rgba(14,159,110,0.1)', color: '#0E9F6E' },
  rejected: { bg: 'rgba(229,72,77,0.1)', color: '#E5484D' },
};

const docTypeLabel = (t: string): string =>
  ({ ic: 'MyKad / IC', passport: 'Passport', license: 'Driving License' } as Record<string, string>)[t] ?? 'MyKad / IC';

function StatusBadge({ status }: { status: string }) {
  const c = statusColors[status] ?? statusColors.pending;
  return (
    <Chip
      label={status}
      size="small"
      sx={{ bgcolor: c.bg, color: c.color, fontWeight: 600, height: 20, fontSize: 11 }}
    />
  );
}

export default async function AdminPage() {
  const submissions = await prisma.kycSubmission.findMany({ orderBy: { submittedAt: 'desc' } });
  const pending  = submissions.filter(s => s.status === 'pending').length;
  const approved = submissions.filter(s => s.status === 'approved').length;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F4F6F8', color: 'text.primary', p: 4 }}>
      <AdminAutoRefresh />
      <Box sx={{ maxWidth: 1280, mx: 'auto' }}>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
          <Box>
            <Typography variant="h5" color="text.primary" sx={{ fontWeight: 700 }}>KYC Submissions</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Supabase Postgres · {submissions.length} record{submissions.length !== 1 ? 's' : ''}
              {pending > 0 && <Box component="span" sx={{ color: '#C77700' }}> · {pending} pending review</Box>}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <AdminSyncPriceBtn />
            {pending > 0 && (
              <Chip
                label={`⏳ ${pending} Pending`}
                size="small"
                sx={{ bgcolor: 'rgba(199,119,0,0.1)', color: '#C77700', border: '1px solid rgba(199,119,0,0.2)', fontWeight: 600 }}
              />
            )}
            <Chip
              label="● Database Connected"
              size="small"
              sx={{ bgcolor: 'rgba(14,159,110,0.1)', color: '#0E9F6E', border: '1px solid rgba(14,159,110,0.2)', fontWeight: 600 }}
            />
          </Box>
        </Box>

        {/* Stats */}
        {submissions.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3 }}>
            {[
              { label: 'Total',          value: submissions.length, color: '#5A6675' },
              { label: 'Pending Review', value: pending,            color: '#C77700' },
              { label: 'Approved',       value: approved,           color: '#0E9F6E' },
            ].map(s => (
              <Paper key={s.label} sx={{ p: 2, bgcolor: '#FFFFFF', border: '1px solid #E2E7EE', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                <Typography variant="h4" sx={{ color: s.color, mt: 0.5, fontWeight: 700 }}>{s.value}</Typography>
              </Paper>
            ))}
          </Box>
        )}

        {submissions.length === 0 ? (
          <Paper sx={{ p: 8, textAlign: 'center', bgcolor: '#FFFFFF', border: '1px dashed #E2E7EE', borderRadius: 3 }}>
            <Typography sx={{ fontSize: 32, mb: 1.5 }}>📭</Typography>
            <Typography variant="body1" color="text.primary" gutterBottom sx={{ fontWeight: 500 }}>No KYC submissions yet</Typography>
            <Typography variant="body2" color="text.secondary">Submit a KYC form from the /kyc page to see records here</Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} sx={{ bgcolor: 'transparent', border: '1px solid #E2E7EE', borderRadius: 3, overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 1100 }}>
              <TableHead>
                <TableRow>
                  {['ID','Wallet','Full Name','Type','IC Number','DOB','Phone','City / State','Employment','Purpose','Status','Submitted','Actions','Details'].map(h => (
                    <TableCell key={h} sx={{
                      color: '#5A6675', bgcolor: '#EEF1F5', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                      ...(h === 'Details' && { position: 'sticky', right: 0, zIndex: 2, boxShadow: '-4px 0 8px -4px rgba(16,21,28,0.2)' }),
                    }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {submissions.map((s: KycSubmission, i: number) => (
                  <TableRow key={s.id} sx={{ bgcolor: i % 2 === 0 ? '#FFFFFF' : '#FAFBFC', '&:hover': { bgcolor: '#EEF1F5' } }}>
                    <TableCell sx={{ color: '#5A6675', fontSize: 11, borderColor: '#E2E7EE' }}>{s.id}</TableCell>
                    <TableCell sx={{ color: '#5A6675', fontFamily: 'monospace', fontSize: 11, borderColor: '#E2E7EE' }}>
                      {s.wallet.slice(0, 8)}…{s.wallet.slice(-4)}
                    </TableCell>
                    <TableCell sx={{ color: 'text.primary', fontWeight: 500, whiteSpace: 'nowrap', fontSize: 13, borderColor: '#E2E7EE' }}>{s.fullName}</TableCell>
                    <TableCell sx={{ color: '#5A6675', fontSize: 11, whiteSpace: 'nowrap', borderColor: '#E2E7EE' }}>{docTypeLabel(s.docType)}</TableCell>
                    <TableCell sx={{ color: '#5A6675', fontFamily: 'monospace', fontSize: 11, borderColor: '#E2E7EE' }}>{s.icNumber}</TableCell>
                    <TableCell sx={{ color: '#5A6675', fontSize: 11, borderColor: '#E2E7EE' }}>{s.dob}</TableCell>
                    <TableCell sx={{ color: '#5A6675', fontSize: 11, borderColor: '#E2E7EE' }}>{s.phone}</TableCell>
                    <TableCell sx={{ color: '#5A6675', fontSize: 11, borderColor: '#E2E7EE' }}>{s.city}, {s.state}</TableCell>
                    <TableCell sx={{ color: '#5A6675', fontSize: 11, borderColor: '#E2E7EE' }}>{s.employment}</TableCell>
                    <TableCell sx={{ color: '#5A6675', fontSize: 11, borderColor: '#E2E7EE' }}>{s.purpose}</TableCell>
                    <TableCell sx={{ borderColor: '#E2E7EE' }}><StatusBadge status={s.status} /></TableCell>
                    <TableCell sx={{ color: '#5A6675', fontSize: 11, whiteSpace: 'nowrap', borderColor: '#E2E7EE' }}>
                      {new Date(s.submittedAt).toLocaleString('en-MY')}
                    </TableCell>
                    <TableCell sx={{ borderColor: '#E2E7EE' }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        <AdminApproveBtn wallet={s.wallet} initialStatus={s.status} />
                        <AdminDeleteBtn wallet={s.wallet} />
                      </Box>
                    </TableCell>
                    <TableCell sx={{
                      position: 'sticky', right: 0, zIndex: 1,
                      bgcolor: i % 2 === 0 ? '#FFFFFF' : '#FAFBFC',
                      borderColor: '#E2E7EE',
                      boxShadow: '-4px 0 8px -4px rgba(16,21,28,0.2)',
                    }}>
                      <AdminKycDetail record={{
                        id: s.id, wallet: s.wallet, fullName: s.fullName, docType: s.docType, icNumber: s.icNumber,
                        dob: s.dob, gender: s.gender, nationality: s.nationality,
                        phone: s.phone, email: s.email, addr1: s.addr1, addr2: s.addr2,
                        postcode: s.postcode, city: s.city, state: s.state,
                        employment: s.employment, income: s.income, purpose: s.purpose,
                        fundSource: s.fundSource,
                        hasFront: !!s.icFrontData, hasBack: !!s.icBackData, hasSelfie: !!s.selfieData,
                        status: s.status, submittedAt: s.submittedAt.toISOString(),
                      }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Box>
  );
}
