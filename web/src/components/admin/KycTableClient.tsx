'use client';

import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';
import { AdminApproveBtn } from '@/components/AdminApproveBtn';
import { AdminDeleteBtn } from '@/components/AdminDeleteBtn';
import { AdminKycDetail } from '@/components/AdminKycDetail';
import { Badge, C, EmptyState, cellSx, headSx, monoSx } from './ui';

export interface KycRow {
  id: number; userId: string; wallet: string | null;
  fullName: string; docType: string; icNumber: string;
  dob: string; gender: string; nationality: string;
  phone: string; email: string; addr1: string; addr2: string;
  postcode: string; city: string; state: string;
  employment: string; income: string; purpose: string; fundSource: string;
  status: string; submittedAt: string;
  hasFront: boolean; hasBack: boolean; hasSelfie: boolean;
}

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red'> = {
  approved: 'green', pending: 'amber', rejected: 'red',
};
const DOC_LABELS: Record<string, string> = {
  ic: 'MyKad / IC', passport: 'Passport', license: 'License',
};
const fieldSx = { '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: 13.5, bgcolor: '#0D1628' } };

const COLS = [
  'Wallet', 'Full Name', 'Type', 'IC Number', 'DOB', 'Phone',
  'City / State', 'Employment', 'Purpose', 'Status', 'Submitted', 'Actions',
] as const;

export default function KycTableClient({ submissions }: { submissions: KycRow[] }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    let rows = submissions;
    if (statusFilter) rows = rows.filter(r => r.status === statusFilter);
    if (q) {
      const lq = q.toLowerCase();
      rows = rows.filter(r =>
        r.fullName.toLowerCase().includes(lq) ||
        r.icNumber.toLowerCase().includes(lq) ||
        r.email.toLowerCase().includes(lq) ||
        (r.wallet?.toLowerCase().includes(lq) ?? false) ||
        r.userId.toLowerCase().includes(lq)
      );
    }
    return rows;
  }, [submissions, statusFilter, q]);

  const hasFilter = !!(q || statusFilter);

  return (
    <>
      <Card sx={{ p: 2, mb: 2.5, border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#0D1628' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 1.5 }}>
          <TextField
            size="small" placeholder="Search name, IC number, email or wallet…"
            value={q} onChange={e => setQ(e.target.value)} sx={fieldSx}
          />
          <TextField select size="small" label="Status" value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)} sx={fieldSx}>
            <MenuItem value="">All statuses</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="approved">Approved</MenuItem>
            <MenuItem value="rejected">Rejected</MenuItem>
          </TextField>
        </Box>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={hasFilter ? 'search' : 'inbox'}
          title={hasFilter ? 'No submissions match' : 'No KYC submissions yet'}
          hint={hasFilter ? 'Try clearing the search or status filter.' : 'Submissions appear here once users apply.'}
        />
      ) : (
        <Card sx={{ border: `1px solid ${C.border}`, borderRadius: 3, boxShadow: 'none', overflow: 'hidden', bgcolor: '#0D1628' }}>
          <TableContainer data-lenis-prevent sx={{ overflowX: 'auto', maxWidth: '100%' }}>
            <Table size="small" sx={{ minWidth: 1100 }}>
              <TableHead>
                <TableRow>
                  {COLS.map(h => (
                    <TableCell key={h} sx={{
                      ...headSx,
                      ...(h === 'Actions' && {
                        position: 'sticky', right: 0, zIndex: 2,
                        boxShadow: '-4px 0 8px -4px rgba(0,0,0,0.2)',
                      }),
                    }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((s, i) => (
                  <TableRow key={s.id}
                    sx={{ bgcolor: i % 2 === 0 ? '#0D1628' : '#0A1220', '&:hover': { bgcolor: '#0F1730' } }}>
                    <TableCell sx={monoSx}>
                      {s.wallet
                        ? `${s.wallet.slice(0, 8)}…${s.wallet.slice(-4)}`
                        : <span style={{ color: C.muted }}>—</span>}
                    </TableCell>
                    <TableCell sx={{ ...cellSx, color: C.ink, fontWeight: 500, fontSize: 13 }}>
                      {s.fullName}
                    </TableCell>
                    <TableCell sx={cellSx}>{DOC_LABELS[s.docType] ?? s.docType}</TableCell>
                    <TableCell sx={monoSx}>{s.icNumber}</TableCell>
                    <TableCell sx={cellSx}>{s.dob}</TableCell>
                    <TableCell sx={cellSx}>{s.phone}</TableCell>
                    <TableCell sx={cellSx}>{s.city}, {s.state}</TableCell>
                    <TableCell sx={cellSx}>{s.employment}</TableCell>
                    <TableCell sx={cellSx}>{s.purpose}</TableCell>
                    <TableCell sx={cellSx}>
                      <Badge label={s.status} tone={STATUS_TONE[s.status] ?? 'neutral'} />
                    </TableCell>
                    <TableCell sx={cellSx}>
                      {new Date(s.submittedAt).toLocaleString('en-MY')}
                    </TableCell>
                    <TableCell sx={{
                      ...cellSx,
                      position: 'sticky', right: 0, zIndex: 1,
                      bgcolor: i % 2 === 0 ? '#0D1628' : '#0A1220',
                      borderColor: C.border,
                      boxShadow: '-4px 0 8px -4px rgba(0,0,0,0.2)',
                    }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        <AdminKycDetail record={{
                          id: s.id, userId: s.userId, wallet: s.wallet,
                          fullName: s.fullName, docType: s.docType, icNumber: s.icNumber,
                          dob: s.dob, gender: s.gender, nationality: s.nationality,
                          phone: s.phone, email: s.email, addr1: s.addr1, addr2: s.addr2,
                          postcode: s.postcode, city: s.city, state: s.state,
                          employment: s.employment, income: s.income,
                          purpose: s.purpose, fundSource: s.fundSource,
                          hasFront: s.hasFront, hasBack: s.hasBack, hasSelfie: s.hasSelfie,
                          status: s.status, submittedAt: s.submittedAt,
                        }} />
                        <AdminApproveBtn userId={s.userId} initialStatus={s.status} />
                        <AdminDeleteBtn userId={s.userId} />
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ px: 2.5, py: 1.25, borderTop: `1px solid ${C.border}` }}>
            <Typography variant="caption" sx={{ color: C.muted }}>
              {filtered.length === submissions.length
                ? `${submissions.length} submission${submissions.length !== 1 ? 's' : ''}`
                : `${filtered.length} of ${submissions.length} shown`}
            </Typography>
          </Box>
        </Card>
      )}
    </>
  );
}
