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
import Card from '@mui/material/Card';
import { AdminApproveBtn } from '@/components/AdminApproveBtn';
import { AdminDeleteBtn } from '@/components/AdminDeleteBtn';
import { AdminSyncPriceBtn } from '@/components/AdminSyncPriceBtn';
import { AdminKycDetail } from '@/components/AdminKycDetail';
import { AdminAutoRefresh } from '@/components/AdminAutoRefresh';
import { ClockIcon } from '@/components/Icons';
import { EmptyState } from '@/components/admin/ui';

export const dynamic = 'force-dynamic';

const statusColors: Record<string, { bg: string; color: string }> = {
  pending: { bg: 'rgba(255,178,36,0.1)', color: '#FFB224' },
  approved: { bg: 'rgba(43,217,162,0.1)', color: '#2BD9A2' },
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
  const pending = submissions.filter(s => s.status === 'pending').length;
  const approved = submissions.filter(s => s.status === 'approved').length;

  return (
    <Box sx={{ color: 'text.primary', p: { xs: 2, md: 4 } }}>
      <AdminAutoRefresh />
      <Box sx={{ maxWidth: 1440, mx: 'auto' }}>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
          <Box>
            <Typography variant="h5" color="text.primary" sx={{ fontWeight: 700 }}>KYC Submissions</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Supabase Postgres · {submissions.length} record{submissions.length !== 1 ? 's' : ''}
              {pending > 0 && <Box component="span" sx={{ color: '#FFB224' }}> · {pending} pending review</Box>}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <AdminSyncPriceBtn />
            {pending > 0 && (
              <Chip
                icon={<Box sx={{ display: 'flex', ml: '9px !important', mr: '-3px !important', color: 'inherit' }}><ClockIcon size={13} /></Box>}
                label={`${pending} Pending`}
                size="small"
                sx={{ bgcolor: 'rgba(255,178,36,0.1)', color: '#FFB224', border: '1px solid rgba(255,178,36,0.2)', fontWeight: 600 }}
              />
            )}
          </Box>
        </Box>

        {/* Stats */}
        {submissions.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3 }}>
            {[
              { label: 'Total', value: submissions.length, color: 'rgba(255,255,255,0.65)' },
              { label: 'Pending Review', value: pending, color: '#FFB224' },
              { label: 'Approved', value: approved, color: '#2BD9A2' },
            ].map(s => (
              <Paper key={s.label} sx={{ p: 2, bgcolor: '#111B38', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                <Typography variant="h4" sx={{ color: s.color, mt: 0.5, fontWeight: 700 }}>{s.value}</Typography>
              </Paper>
            ))}
          </Box>
        )}
        {/* One Card wrapping one TableContainer. This used to be
            Card > Container > Card: MUI's Container applies its own max-width
            and gutters, so the 1100px-wide table overflowed it and ran off the
            side of the page instead of scrolling inside its own box. */}
        {submissions.length === 0 ? (
          <EmptyState icon="inbox" title="No KYC submissions yet" hint="Submit a KYC form from the /kyc page to see records here" />
        ) : (
              <Card sx={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, boxShadow: 'none', overflow: 'hidden' }}>
                {/* Lenis swallows wheel events page-wide, which stops horizontal
                    trackpad scrolling inside this table. */}
                <TableContainer data-lenis-prevent sx={{ overflowX: 'auto', maxWidth: '100%' }}>
                  <Table size="small" sx={{ minWidth: 1100 }}>
                    <TableHead>
                      <TableRow>
                        {['ID', 'Wallet', 'Full Name', 'Type', 'IC Number', 'DOB', 'Phone', 'City / State', 'Employment', 'Purpose', 'Status', 'Submitted', 'Actions', 'Details'].map(h => (
                          <TableCell key={h} sx={{
                            color: 'rgba(255,255,255,0.65)', bgcolor: '#0F1730', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                            ...(h === 'Details' && { position: 'sticky', right: 0, zIndex: 2, boxShadow: '-4px 0 8px -4px rgba(0,0,0,0.2)' }),
                          }}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {submissions.map((s: KycSubmission, i: number) => (
                        <TableRow key={s.id} sx={{ bgcolor: i % 2 === 0 ? '#111B38' : '#0F1A3D', '&:hover': { bgcolor: '#0F1730' } }}>
                          <TableCell sx={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, borderColor: 'rgba(255,255,255,0.12)' }}>{s.id}</TableCell>
                          <TableCell sx={{ color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace', fontSize: 11, borderColor: 'rgba(255,255,255,0.12)' }}>
                            {s.wallet.slice(0, 8)}…{s.wallet.slice(-4)}
                          </TableCell>
                          <TableCell sx={{ color: 'text.primary', fontWeight: 500, whiteSpace: 'nowrap', fontSize: 13, borderColor: 'rgba(255,255,255,0.12)' }}>{s.fullName}</TableCell>
                          <TableCell sx={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, whiteSpace: 'nowrap', borderColor: 'rgba(255,255,255,0.12)' }}>{docTypeLabel(s.docType)}</TableCell>
                          <TableCell sx={{ color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace', fontSize: 11, borderColor: 'rgba(255,255,255,0.12)' }}>{s.icNumber}</TableCell>
                          <TableCell sx={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, borderColor: 'rgba(255,255,255,0.12)' }}>{s.dob}</TableCell>
                          <TableCell sx={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, borderColor: 'rgba(255,255,255,0.12)' }}>{s.phone}</TableCell>
                          <TableCell sx={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, borderColor: 'rgba(255,255,255,0.12)' }}>{s.city}, {s.state}</TableCell>
                          <TableCell sx={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, borderColor: 'rgba(255,255,255,0.12)' }}>{s.employment}</TableCell>
                          <TableCell sx={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, borderColor: 'rgba(255,255,255,0.12)' }}>{s.purpose}</TableCell>
                          <TableCell sx={{ borderColor: 'rgba(255,255,255,0.12)' }}><StatusBadge status={s.status} /></TableCell>
                          <TableCell sx={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, whiteSpace: 'nowrap', borderColor: 'rgba(255,255,255,0.12)' }}>
                            {new Date(s.submittedAt).toLocaleString('en-MY')}
                          </TableCell>
                          <TableCell sx={{ borderColor: 'rgba(255,255,255,0.12)' }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                              <AdminApproveBtn wallet={s.wallet} initialStatus={s.status} />
                              <AdminDeleteBtn wallet={s.wallet} />
                            </Box>
                          </TableCell>
                          <TableCell sx={{
                            position: 'sticky', right: 0, zIndex: 1,
                            bgcolor: i % 2 === 0 ? '#111B38' : '#0F1A3D',
                            borderColor: 'rgba(255,255,255,0.12)',
                            boxShadow: '-4px 0 8px -4px rgba(0,0,0,0.2)',
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
              </Card>
        )}

      </Box>
    </Box>
  );
}
