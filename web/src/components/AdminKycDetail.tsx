'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import { DocIcon } from '@/components/Icons';

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
  hasFront: boolean;
  hasBack: boolean;
  hasSelfie: boolean;
  status: string;
  submittedAt: string;
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="caption" sx={{ color: 'text.primary', textAlign: 'right', maxWidth: '60%', fontWeight: 500, fontFamily: mono ? 'monospace' : 'inherit' }}>
        {value || '—'}
      </Typography>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, display: 'block', mb: 1 }}>
        {title}
      </Typography>
      <Box sx={{ bgcolor: '#111B38', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2, px: 2, py: 0.5 }}>
        {children}
      </Box>
    </Box>
  );
}

const statusColors: Record<string, { bg: string; color: string }> = {
  pending:  { bg: 'rgba(255,178,36,0.1)', color: '#FFB224' },
  approved: { bg: 'rgba(43,217,162,0.1)', color: '#2BD9A2' },
  rejected: { bg: 'rgba(229,72,77,0.1)', color: '#E5484D' },
};

export function AdminKycDetail({ record }: { record: KycRecord }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const ref = `KYC-${String(record.id).padStart(6, '0')}`;
  const address = [record.addr1, record.addr2, record.postcode, record.city, record.state]
    .filter(Boolean).join(', ');
  const sc = statusColors[record.status] ?? statusColors.pending;
  const docLabel = ({ ic: 'MyKad / IC', passport: 'Passport', license: 'Driving License' } as Record<string, string>)[record.docType] ?? 'MyKad / IC';

  const handleClose = () => { setOpen(false); setConfirmDelete(false); setDeleteError(''); };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/kyc?wallet=${record.wallet}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        setDeleteError(d.error ?? 'Failed to delete');
        setDeleting(false);
        return;
      }
      handleClose();
      router.refresh();
    } catch {
      setDeleteError('Network error');
      setDeleting(false);
    }
  };

  return (
    <>
      <Button size="small" onClick={() => setOpen(true)}
        sx={{ bgcolor: 'rgba(110,139,255,0.08)', color: '#6E8BFF', border: '1px solid rgba(110,139,255,0.2)',
              fontSize: 11, py: 0.25, px: 1, minWidth: 'auto', '&:hover': { bgcolor: 'rgba(110,139,255,0.15)' } }}>
        View
      </Button>

      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth scroll="paper">
        <DialogTitle sx={{ position: 'sticky', top: 0, zIndex: 10, bgcolor: '#111B38',
              borderBottom: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', p: 2.5 }}>
          <Box>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace', display: 'block' }}>{ref}</Typography>
            <Typography variant="h6" color="text.primary" sx={{ fontWeight: 700 }}>{record.fullName}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Chip label={record.status} size="small" sx={{ bgcolor: sc.bg, color: sc.color, fontWeight: 600, height: 22 }} />
            <IconButton size="small" onClick={handleClose} sx={{ color: 'rgba(255,255,255,0.65)' }}>
              <Typography sx={{ fontSize: 16, lineHeight: 1 }}>✕</Typography>
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ p: 3 }} data-lenis-prevent>
          {/* IC Number highlight */}
          <Box sx={{ p: 2, mb: 2.5, background: 'linear-gradient(135deg, rgba(110,139,255,0.08), rgba(110,139,255,0.02))', border: '1px solid rgba(110,139,255,0.25)', borderRadius: 2 }}>
            <Typography variant="caption" sx={{ color: '#6E8BFF', display: 'block', mb: 0.5 }}>{docLabel} Number</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: 'monospace', letterSpacing: 2, color: 'text.primary' }}>
              {record.icNumber}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              DOB: {record.dob} · {record.gender} · {record.nationality}
            </Typography>
          </Box>

          {/* Documents */}
          <Box sx={{ mb: 2.5 }}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, display: 'block', mb: 1 }}>
              Documents
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
              {[
                { label: 'MyKad Front', type: 'front',  has: record.hasFront  },
                { label: 'MyKad Back',  type: 'back',   has: record.hasBack   },
                { label: 'Selfie',      type: 'selfie', has: record.hasSelfie },
              ].map(d => {
                const src = d.has ? `/api/kyc/documents?wallet=${record.wallet}&type=${d.type}` : null;
                return (
                  <Box key={d.label} sx={{ bgcolor: '#111B38', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' }}>
                    {src ? (
                      <a href={src} target="_blank" rel="noreferrer">
                        <Box component="img" src={src} alt={d.label} sx={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                      </a>
                    ) : (
                      <Box sx={{ aspectRatio: '4/3', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)' }}>
                        <DocIcon size={24} style={{ marginBottom: 4 }} />
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

        <DialogActions sx={{ position: 'sticky', bottom: 0, bgcolor: '#111B38', borderTop: '1px solid rgba(255,255,255,0.12)', p: 2, gap: 1 }}>
          {confirmDelete ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
              <Typography variant="caption" sx={{ color: '#E5484D', fontWeight: 500, flex: 1 }}>
                Delete this submission? This can&apos;t be undone.
              </Typography>
              <Button size="small" onClick={() => setConfirmDelete(false)} disabled={deleting}
                sx={{ color: 'rgba(255,255,255,0.65)' }}>
                Cancel
              </Button>
              <Button size="small" variant="contained" onClick={handleDelete} disabled={deleting}
                sx={{ bgcolor: '#E5484D', '&:hover': { bgcolor: '#C8363B' }, '&.Mui-disabled': { opacity: 0.5, color: '#fff' } }}>
                {deleting ? 'Deleting…' : 'Confirm Delete'}
              </Button>
            </Box>
          ) : (
            <>
              {deleteError && (
                <Typography variant="caption" sx={{ color: '#E5484D', flex: 1 }}>{deleteError}</Typography>
              )}
              <Button size="small" onClick={() => setConfirmDelete(true)}
                sx={{ color: '#E5484D', mr: 'auto', '&:hover': { bgcolor: 'rgba(229,72,77,0.08)' } }}>
                Delete Submission
              </Button>
              <Button size="small" variant="outlined" onClick={handleClose}
                sx={{ borderColor: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.65)', '&:hover': { borderColor: 'rgba(255,255,255,0.3)', bgcolor: '#0F1730' } }}>
                Close
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
