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
import { AdminSyncPriceBtn } from '@/components/AdminSyncPriceBtn';
import { AdminKycDetail } from '@/components/AdminKycDetail';

export const dynamic = 'force-dynamic';

const statusColors: Record<string, { bg: string; color: string }> = {
  pending:  { bg: '#1E1B3A', color: '#A78BFA' },
  approved: { bg: '#052e16', color: '#22c55e' },
  rejected: { bg: '#450a0a', color: '#ef4444' },
};

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
    <Box sx={{ minHeight: '100vh', bgcolor: '#0D0F1A', color: 'text.primary', p: 4 }}>
      <Box sx={{ maxWidth: 1280, mx: 'auto' }}>

        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4 }}>
          <Box>
            <Typography variant="h5" color="text.primary" sx={{ fontWeight: 700 }}>KYC Submissions</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Local SQLite database · {submissions.length} record{submissions.length !== 1 ? 's' : ''}
              {pending > 0 && <Box component="span" sx={{ color: '#A78BFA' }}> · {pending} pending review</Box>}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <AdminSyncPriceBtn />
            {pending > 0 && (
              <Chip
                label={`⏳ ${pending} Pending`}
                size="small"
                sx={{ bgcolor: '#1E1B3A', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.2)', fontWeight: 600 }}
              />
            )}
            <Chip
              label="● Database Connected"
              size="small"
              sx={{ bgcolor: '#052e16', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)', fontWeight: 600 }}
            />
          </Box>
        </Box>

        {/* Stats */}
        {submissions.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3 }}>
            {[
              { label: 'Total',          value: submissions.length, color: '#94A3B8' },
              { label: 'Pending Review', value: pending,            color: '#A78BFA' },
              { label: 'Approved',       value: approved,           color: '#22c55e' },
            ].map(s => (
              <Paper key={s.label} sx={{ p: 2, bgcolor: '#131629', border: '1px solid #1E2035', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                <Typography variant="h4" sx={{ color: s.color, mt: 0.5, fontWeight: 700 }}>{s.value}</Typography>
              </Paper>
            ))}
          </Box>
        )}

        {submissions.length === 0 ? (
          <Paper sx={{ p: 8, textAlign: 'center', bgcolor: '#131629', border: '1px dashed #1E2035', borderRadius: 3 }}>
            <Typography sx={{ fontSize: 32, mb: 1.5 }}>📭</Typography>
            <Typography variant="body1" color="text.primary" gutterBottom sx={{ fontWeight: 500 }}>No KYC submissions yet</Typography>
            <Typography variant="body2" color="text.secondary">Submit a KYC form from the /kyc page to see records here</Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} sx={{ bgcolor: 'transparent', border: '1px solid #1E2035', borderRadius: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['ID','Wallet','Full Name','IC Number','DOB','Phone','City / State','Employment','Purpose','Status','Submitted','Actions','Details'].map(h => (
                    <TableCell key={h} sx={{ color: '#64748B', bgcolor: '#131629', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {submissions.map((s: KycSubmission, i: number) => (
                  <TableRow key={s.id} sx={{ bgcolor: i % 2 === 0 ? '#0D0F1A' : '#0F111D' }}>
                    <TableCell sx={{ color: '#64748B', fontSize: 11 }}>{s.id}</TableCell>
                    <TableCell sx={{ color: '#94A3B8', fontFamily: 'monospace', fontSize: 11 }}>
                      {s.wallet.slice(0, 8)}…{s.wallet.slice(-4)}
                    </TableCell>
                    <TableCell sx={{ color: 'text.primary', fontWeight: 500, whiteSpace: 'nowrap', fontSize: 13 }}>{s.fullName}</TableCell>
                    <TableCell sx={{ color: '#94A3B8', fontFamily: 'monospace', fontSize: 11 }}>{s.icNumber}</TableCell>
                    <TableCell sx={{ color: '#94A3B8', fontSize: 11 }}>{s.dob}</TableCell>
                    <TableCell sx={{ color: '#94A3B8', fontSize: 11 }}>{s.phone}</TableCell>
                    <TableCell sx={{ color: '#94A3B8', fontSize: 11 }}>{s.city}, {s.state}</TableCell>
                    <TableCell sx={{ color: '#94A3B8', fontSize: 11 }}>{s.employment}</TableCell>
                    <TableCell sx={{ color: '#94A3B8', fontSize: 11 }}>{s.purpose}</TableCell>
                    <TableCell><StatusBadge status={s.status} /></TableCell>
                    <TableCell sx={{ color: '#64748B', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {new Date(s.submittedAt).toLocaleString('en-MY')}
                    </TableCell>
                    <TableCell>
                      <AdminApproveBtn wallet={s.wallet} initialStatus={s.status} />
                    </TableCell>
                    <TableCell>
                      <AdminKycDetail record={{
                        id: s.id, wallet: s.wallet, fullName: s.fullName, icNumber: s.icNumber,
                        dob: s.dob, gender: s.gender, nationality: s.nationality,
                        phone: s.phone, email: s.email, addr1: s.addr1, addr2: s.addr2,
                        postcode: s.postcode, city: s.city, state: s.state,
                        employment: s.employment, income: s.income, purpose: s.purpose,
                        fundSource: s.fundSource, icFrontPath: s.icFrontPath,
                        icBackPath: s.icBackPath, selfiePath: s.selfiePath,
                        status: s.status, submittedAt: s.submittedAt.toISOString(),
                      }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Schema info */}
        <Paper sx={{ mt: 3, p: 2.5, bgcolor: '#131629', border: '1px solid #1E2035', borderRadius: 2 }}>
          <Typography variant="body2" color="text.primary" gutterBottom sx={{ fontWeight: 600 }}>Database Schema</Typography>
          <Box component="pre" sx={{ fontSize: 11, color: '#64748B', overflowX: 'auto', m: 0 }}>{`Table: KycSubmission (SQLite · Prisma)
  id          INTEGER   PRIMARY KEY AUTOINCREMENT
  wallet      TEXT      UNIQUE  — linked to MetaMask address
  fullName    TEXT
  icNumber    TEXT
  dob         TEXT
  gender      TEXT
  nationality TEXT
  phone       TEXT
  email       TEXT
  addr1       TEXT
  addr2       TEXT
  postcode    TEXT
  city        TEXT
  state       TEXT
  employment  TEXT
  income      TEXT
  purpose     TEXT
  fundSource  TEXT
  icFrontPath TEXT      DEFAULT ''
  icBackPath  TEXT      DEFAULT ''
  selfiePath  TEXT      DEFAULT ''
  status      TEXT      DEFAULT 'pending'
  submittedAt DATETIME  DEFAULT now()
  updatedAt   DATETIME`}</Box>
        </Paper>
      </Box>
    </Box>
  );
}
