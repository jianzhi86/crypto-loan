'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';

export interface KycRecord {
  id: number;
  wallet: string;
  fullName: string;
  docType: string;
  icNumber: string;
  dob: string;
  gender: string;
  nationality: string;
  phone: string;
  email: string;
  addr1: string;
  addr2: string;
  postcode: string;
  city: string;
  state: string;
  employment: string;
  income: string;
  purpose: string;
  fundSource: string;
  icFrontPath: string;
  icBackPath: string;
  selfiePath: string;
  status: string;
  submittedAt: string;
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #1E2035' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="caption" sx={{ color: '#F1F5F9', textAlign: 'right', maxWidth: '60%', fontWeight: 500, fontFamily: mono ? 'monospace' : 'inherit' }}>
        {value || '—'}
      </Typography>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="caption" sx={{ color: '#475569', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, display: 'block', mb: 1 }}>
        {title}
      </Typography>
      <Box sx={{ bgcolor: '#131629', border: '1px solid #1E2035', borderRadius: 2, px: 2, py: 0.5 }}>
        {children}
      </Box>
    </Box>
  );
}

const statusColors: Record<string, { bg: string; color: string }> = {
  pending:  { bg: '#1E1B3A', color: '#A78BFA' },
  approved: { bg: '#052e16', color: '#22c55e' },
  rejected: { bg: '#450a0a', color: '#ef4444' },
};

export function AdminKycDetail({ record }: { record: KycRecord }) {
  const [open, setOpen] = useState(false);
  const ref = `KYC-${String(record.id).padStart(6, '0')}`;
  const address = [record.addr1, record.addr2, record.postcode, record.city, record.state]
    .filter(Boolean).join(', ');
  const sc = statusColors[record.status] ?? statusColors.pending;
  const docLabel = ({ ic: 'MyKad / IC', passport: 'Passport', license: 'Driving License' } as Record<string, string>)[record.docType] ?? 'MyKad / IC';

  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}
        sx={{ bgcolor: '#1E1B3A', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.2)',
              fontSize: 11, py: 0.25, px: 1, minWidth: 'auto', '&:hover': { bgcolor: '#2a2550' } }}>
        View
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth scroll="paper">
        <DialogTitle sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: '#0D0F1A',
              borderBottom: '1px solid #1E2035', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', p: 2.5 }}>
          <Box>
            <Typography variant="caption" sx={{ color: '#475569', fontFamily: 'monospace', display: 'block' }}>{ref}</Typography>
            <Typography variant="h6" color="text.primary" sx={{ fontWeight: 700 }}>{record.fullName}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Chip label={record.status} size="small" sx={{ bgcolor: sc.bg, color: sc.color, fontWeight: 600, height: 22 }} />
            <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: '#64748B' }}>
              <Typography sx={{ fontSize: 16, lineHeight: 1 }}>✕</Typography>
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ p: 3 }}>
          {/* IC Number highlight */}
          <Box sx={{ p: 2, mb: 2.5, background: 'linear-gradient(135deg, #1E1B3A, #0D1020)', border: '1px solid rgba(124,58,237,0.33)', borderRadius: 2 }}>
            <Typography variant="caption" sx={{ color: '#A78BFA', display: 'block', mb: 0.5 }}>{docLabel} Number</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: 'monospace', letterSpacing: 2, color: 'text.primary' }}>
              {record.icNumber}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              DOB: {record.dob} · {record.gender} · {record.nationality}
            </Typography>
          </Box>

          {/* Documents */}
          <Box sx={{ mb: 2.5 }}>
            <Typography variant="caption" sx={{ color: '#475569', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, display: 'block', mb: 1 }}>
              Documents
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
              {[
                { label: 'MyKad Front', path: record.icFrontPath },
                { label: 'MyKad Back',  path: record.icBackPath  },
                { label: 'Selfie',      path: record.selfiePath  },
              ].map(d => {
                const src = d.path ? `/uploads/kyc/${record.wallet}/${d.path}` : null;
                return (
                  <Box key={d.label} sx={{ bgcolor: '#131629', border: '1px solid #1E2035', borderRadius: 2, overflow: 'hidden' }}>
                    {src ? (
                      <a href={src} target="_blank" rel="noreferrer">
                        <Box component="img" src={src} alt={d.label} sx={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                      </a>
                    ) : (
                      <Box sx={{ aspectRatio: '4/3', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography sx={{ fontSize: 24, mb: 0.5 }}>📄</Typography>
                        <Typography variant="caption" color="text.secondary">Not uploaded</Typography>
                      </Box>
                    )}
                    <Typography variant="caption" color="text.primary" sx={{ display: 'block', textAlign: 'center', py: 0.75, fontWeight: 500 }}>
                      {d.label}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>

          <Section title="Personal Information">
            <InfoRow label="Full Name"   value={record.fullName} />
            <InfoRow label="Phone"       value={record.phone} />
            <InfoRow label="Email"       value={record.email} />
            <InfoRow label="Gender"      value={record.gender} />
            <InfoRow label="Nationality" value={record.nationality} />
          </Section>
          <Section title="Residential Address">
            <InfoRow label="Address" value={address} />
          </Section>
          <Section title="Financial Declaration">
            <InfoRow label="Employment"     value={record.employment} />
            <InfoRow label="Monthly Income" value={record.income} />
            <InfoRow label="Loan Purpose"   value={record.purpose} />
            <InfoRow label="Fund Source"    value={record.fundSource} />
          </Section>
          <Section title="Submission Details">
            <InfoRow label="Reference" value={ref} />
            <InfoRow label="Wallet"    value={record.wallet} mono />
            <InfoRow label="Submitted" value={new Date(record.submittedAt).toLocaleString('en-MY')} />
          </Section>
        </DialogContent>
      </Dialog>
    </>
  );
}
