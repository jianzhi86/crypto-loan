'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Navbar from '@/components/Navbar';
import { useWallet } from '@/lib/WalletContext';

const MY_STATES = [
  'Johor','Kedah','Kelantan','Melaka','Negeri Sembilan','Pahang',
  'Perak','Perlis','Pulau Pinang','Sabah','Sarawak','Selangor',
  'Terengganu','W.P. Kuala Lumpur','W.P. Labuan','W.P. Putrajaya',
];

const EMPLOYMENT_TYPES = [
  'Employed (Private Sector)','Employed (Government)',
  'Self-Employed / Business Owner','Freelancer / Gig Worker',
  'Student','Retired','Unemployed',
];

const INCOME_BRACKETS = [
  'Below RM 2,000','RM 2,000 – RM 4,999','RM 5,000 – RM 9,999',
  'RM 10,000 – RM 19,999','RM 20,000 and above',
];

const LOAN_PURPOSES = [
  'Personal Use','Business Capital','Investment','Property Purchase',
  'Vehicle Purchase','Education','Emergency','Other',
];

const FUND_SOURCES = [
  'Employment Income','Business Revenue','Investment Returns',
  'Savings','Family / Gift','Other',
];

type Step = 1 | 2 | 3 | 4 | 5;
type DocType = 'ic' | 'passport' | 'license';

const DOC_TYPES: { value: DocType; label: string; numberLabel: string; placeholder: string }[] = [
  { value: 'ic',       label: 'MyKad / IC',      numberLabel: 'MyKad / IC Number', placeholder: 'e.g. 901231-14-5678' },
  { value: 'passport', label: 'Passport',         numberLabel: 'Passport Number',   placeholder: 'e.g. A12345678' },
  { value: 'license',  label: 'Driving License',  numberLabel: 'License Number',    placeholder: 'e.g. 901231145678' },
];

interface FormData {
  docType: DocType;
  fullName: string; icNumber: string; dob: string; gender: string;
  nationality: string; phone: string; email: string;
  addr1: string; addr2: string; postcode: string; city: string; state: string;
  employment: string; income: string; purpose: string; fundSource: string;
  agreeTerms: boolean; agreeDeclaration: boolean;
}

const EMPTY: FormData = {
  docType:'ic',
  fullName:'', icNumber:'', dob:'', gender:'', nationality:'Malaysian',
  phone:'', email:'', addr1:'', addr2:'', postcode:'', city:'', state:'',
  employment:'', income:'', purpose:'', fundSource:'',
  agreeTerms: false, agreeDeclaration: false,
};

const STEP_LABELS = ['Personal Info', 'Address', 'Financial', 'Documents', 'Review'];

const DOC_SLOTS = [
  { key: 'front',  label: 'MyKad (Front)',     hint: 'Clear photo showing your name, IC number, and photo' },
  { key: 'back',   label: 'MyKad (Back)',       hint: 'Clear photo showing your address and thumbprint' },
] as const;

type DocKey = typeof DOC_SLOTS[number]['key'];

function compressImage(file: File, maxPx = 1200, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image load error'));
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width  * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function DocUploadPanel({ wallet }: { wallet: string }) {
  const [docFiles, setDocFiles] = useState<Record<DocKey, File | null>>({ front: null, back: null });
  const refs: Record<DocKey, React.RefObject<HTMLInputElement | null>> = {
    front:  useRef<HTMLInputElement>(null),
    back:   useRef<HTMLInputElement>(null),
  };
  const [uploading, setUploading] = useState(false);
  const [done, setDone]   = useState(false);
  const [err,  setErr]    = useState('');

  const upload = async () => {
    if (!docFiles.front && !docFiles.back) { setErr('Please select at least one document.'); return; }
    if (!wallet) { setErr('Wallet not connected.'); return; }
    setUploading(true); setErr('');
    try {
      const [icFront, icBack] = await Promise.all([
        docFiles.front  ? compressImage(docFiles.front)  : Promise.resolve(''),
        docFiles.back   ? compressImage(docFiles.back)   : Promise.resolve(''),
      ]);
      const res = await fetch('/api/kyc/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, icFront, icBack }),
      });
      const d = await res.json();
      if (res.ok) setDone(true);
      else setErr(d.error ?? 'Upload failed');
    } catch (e) {
      setErr('Upload failed: ' + (e instanceof Error ? e.message : 'unknown error'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Paper sx={{ p: 3, bgcolor: '#12152A', border: '1px solid #1E2035', borderRadius: 3 }}>
      <Typography variant="body1" color="text.primary" sx={{ fontWeight: 600, mb: 0.5 }}>
        Upload Identity Documents
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.5 }}>
        Attach your MyKad photos so the admin can verify your identity visually.
      </Typography>

      {done ? (
        <Box sx={{ p: 2.5, textAlign: 'center', bgcolor: '#052e16', border: '1px solid #22c55e44', borderRadius: 2 }}>
          <Typography sx={{ fontSize: 28, mb: 0.5 }}>✅</Typography>
          <Typography variant="body2" sx={{ color: '#22c55e', fontWeight: 600 }}>Documents uploaded successfully</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            Admin can now view your photos in the KYC panel.
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
            {DOC_SLOTS.map(doc => (
              <Box key={doc.key}>
                <input ref={refs[doc.key]} type="file" accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={e => setDocFiles(p => ({ ...p, [doc.key]: e.target.files?.[0] ?? null }))} />
                <Box onClick={() => refs[doc.key].current?.click()}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 2,
                    cursor: 'pointer', transition: 'all 0.15s',
                    bgcolor: docFiles[doc.key] ? '#052e1620' : '#0D0F1A',
                    border: `1px solid ${docFiles[doc.key] ? '#22c55e55' : '#1E2035'}`,
                    '&:hover': { borderColor: '#7C3AED' },
                  }}>
                  <Typography sx={{ fontSize: 20 }}>{docFiles[doc.key] ? '✅' : '📄'}</Typography>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" color="text.primary" sx={{ fontWeight: 500 }}>{doc.label}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {docFiles[doc.key] ? docFiles[doc.key]!.name : doc.hint}
                    </Typography>
                  </Box>
                  <Box sx={{ px: 1.5, py: 0.5, borderRadius: 1, bgcolor: '#1E2035' }}>
                    <Typography variant="caption" color="text.secondary">{docFiles[doc.key] ? 'Change' : 'Choose'}</Typography>
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>

          {err && <Typography variant="caption" sx={{ color: '#ef4444', display: 'block', mb: 1.5 }}>{err}</Typography>}

          <Button fullWidth variant="contained" onClick={upload} disabled={uploading}
            sx={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)', color: 'white', py: 1.25,
                  '&:hover': { background: 'linear-gradient(135deg, #6d28d9, #0891B2)' } }}>
            {uploading ? 'Uploading…' : 'Upload Documents'}
          </Button>
        </>
      )}
    </Paper>
  );
}

export default function KYCPage() {
  const wallet = useWallet();
  const router = useRouter();
  const [step, setStep]           = useState<Step>(1);
  const [form, setForm]           = useState<FormData>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<number | null>(null);
  const [mounted, setMounted]     = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ status: string; reason?: string } | null>(null);

  const [files, setFiles] = useState<Record<DocKey, File | null>>({ front: null, back: null });
  const fileRefs: Record<DocKey, React.RefObject<HTMLInputElement | null>> = {
    front:  useRef<HTMLInputElement>(null),
    back:   useRef<HTMLInputElement>(null),
  };

  useEffect(() => { setMounted(true); }, []);

  const set = (field: keyof FormData, value: string | boolean) =>
    setForm(p => ({ ...p, [field]: value }));

  const docMeta = DOC_TYPES.find(d => d.value === form.docType) ?? DOC_TYPES[0];

  const canProceed = (): boolean => {
    if (step === 1) return !!(form.fullName && form.icNumber && form.dob && form.gender && form.phone && form.email);
    if (step === 2) return !!(form.addr1 && form.postcode && form.city && form.state);
    if (step === 3) return !!(form.employment && form.income && form.purpose && form.fundSource);
    if (step === 4) return true;
    if (step === 5) return form.agreeTerms && form.agreeDeclaration;
    return false;
  };

  const handleSubmit = async () => {
    if (!wallet.isConnected) { alert('Please connect your wallet first'); return; }
    if (!wallet.address) return;
    setSubmitting(true);
    const [icFront, icBack] = await Promise.all([
      files.front  ? compressImage(files.front)  : Promise.resolve(''),
      files.back   ? compressImage(files.back)   : Promise.resolve(''),
    ]);
    const res = await fetch('/api/kyc', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, wallet: wallet.address, icFront, icBack }), // includes docType
    });
    if (!res.ok) { setSubmitting(false); alert('Failed to save KYC data. Please try again.'); return; }
    const data = await res.json();
    setSubmittedId(data.id);
    setSubmitting(false);

    // Auto-verification: OCR the uploaded ID and match it against the form.
    // Only runs when a document was provided; otherwise it stays for manual review.
    if (files.front || files.back) {
      setVerifying(true);
      try {
        const vr = await fetch('/api/kyc/auto-verify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: wallet.address, docType: form.docType }),
        });
        const vd = await vr.json();
        setVerifyResult(vr.ok ? { status: vd.status, reason: vd.reason } : { status: 'pending' });
        if (vd.status === 'approved') wallet.refresh();
      } catch {
        setVerifyResult({ status: 'pending' });
      } finally {
        setVerifying(false);
      }
    }
  };

  // ── Post-submit Screen (verifying / approved / rejected / pending) ────────
  if (submittedId) {
    const ref = `KYC-${String(submittedId).padStart(6, '0')}`;
    const outcome = verifying ? 'verifying' : (verifyResult?.status ?? 'pending');

    const theme = {
      verifying: { icon: null,  ring: '#1E1B3A', accent: '#A78BFA', title: 'Verifying Documents' },
      approved:  { icon: '✅',  ring: '#052e16', accent: '#22c55e', title: 'KYC Approved' },
      rejected:  { icon: '❌',  ring: '#450a0a', accent: '#ef4444', title: 'Verification Failed' },
      pending:   { icon: '⏳',  ring: '#1E1B3A', accent: '#A78BFA', title: 'Application Submitted' },
    }[outcome] ?? { icon: '⏳', ring: '#1E1B3A', accent: '#A78BFA', title: 'Application Submitted' };

    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#0D0F1A' }}>
        <Navbar />
        <Box component="main" sx={{ maxWidth: 480, mx: 'auto', px: 2, py: 8 }}>
          <Paper sx={{ p: 5, textAlign: 'center', bgcolor: '#12152A', border: '1px solid #1E2035', borderRadius: 3 }}>
            <Box sx={{ width: 80, height: 80, borderRadius: '50%', bgcolor: theme.ring,
                       display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2.5 }}>
              {outcome === 'verifying'
                ? <CircularProgress size={40} thickness={2.5} sx={{ color: theme.accent }} />
                : <Typography sx={{ fontSize: 40 }}>{theme.icon}</Typography>}
            </Box>
            <Typography variant="h5" color="text.primary" sx={{ fontWeight: 700, mb: 1 }}>{theme.title}</Typography>

            {outcome === 'approved' && (
              <Chip label="✓ Identity Verified" size="small"
                sx={{ bgcolor: '#052e16', color: '#22c55e', border: '1px solid #22c55e44', fontWeight: 600, mb: 3 }} />
            )}
            {outcome === 'rejected' && (
              <Chip label="● Document Mismatch" size="small"
                sx={{ bgcolor: '#450a0a', color: '#ef4444', border: '1px solid #ef444444', fontWeight: 600, mb: 3 }} />
            )}
            {(outcome === 'pending' || outcome === 'verifying') && (
              <Chip label={outcome === 'verifying' ? '● Checking your document…' : '● Pending Review'} size="small"
                sx={{ bgcolor: '#1E1B3A', color: '#A78BFA', border: '1px solid #A78BFA33', fontWeight: 600, mb: 3 }} />
            )}

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Reference number
            </Typography>
            <Typography variant="h6" color="text.primary" sx={{ fontFamily: 'monospace', fontWeight: 700, mb: 3 }}>
              {ref}
            </Typography>

            <Paper sx={{ p: 2, mb: 3, bgcolor: '#0D0F1A', border: '1px solid #1E2035', borderRadius: 2, textAlign: 'left' }}>
              {outcome === 'verifying' && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  We&apos;re reading your uploaded document and matching it against your details. This usually takes a few seconds.
                </Typography>
              )}
              {outcome === 'approved' && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Your document matched your details and your identity has been verified on-chain.
                  You can now access borrowing services.
                </Typography>
              )}
              {outcome === 'rejected' && (
                <>
                  <Typography variant="caption" sx={{ color: '#ef4444', display: 'block', mb: 1, fontWeight: 600 }}>
                    The uploaded document did not match the information you provided.
                  </Typography>
                  {verifyResult?.reason && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      {verifyResult.reason}.
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Please make sure your full name, document number, and address exactly match your document, then re-upload a clearer photo.
                  </Typography>
                </>
              )}
              {outcome === 'pending' && (
                <>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    Your KYC application has been received and is currently under review by our compliance team.
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                    Estimated processing time:{' '}
                    <Box component="span" sx={{ color: 'text.primary' }}>1–3 business days</Box>
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    You will be notified once your verification is complete.
                  </Typography>
                </>
              )}
            </Paper>

            {outcome === 'rejected' ? (
              <Button fullWidth variant="contained" onClick={() => { setSubmittedId(null); setVerifyResult(null); setStep(1); }}
                sx={{ bgcolor: '#7C3AED', '&:hover': { bgcolor: '#6d28d9' }, py: 1.25 }}>
                Review & Resubmit
              </Button>
            ) : (
              <Button fullWidth variant="contained" disabled={outcome === 'verifying'}
                onClick={() => router.push(outcome === 'approved' ? '/?tab=deposit' : '/')}
                sx={{ background: outcome === 'approved' ? 'linear-gradient(135deg, #7C3AED, #06B6D4)' : undefined,
                      bgcolor: outcome === 'approved' ? undefined : '#7C3AED', color: 'white', py: 1.25,
                      '&:hover': { bgcolor: '#6d28d9' }, '&.Mui-disabled': { opacity: 0.4 } }}>
                {outcome === 'approved' ? 'Start Borrowing →' : 'Back to Dashboard'}
              </Button>
            )}
          </Paper>
        </Box>
      </Box>
    );
  }

  // ── Already Verified Screen ───────────────────────────────────────────────
  if (mounted && wallet.kycApproved && !submittedId) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#0D0F1A' }}>
        <Navbar />
        <Box component="main" sx={{ maxWidth: 480, mx: 'auto', px: 2, py: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Paper sx={{ p: 4, textAlign: 'center', bgcolor: '#12152A', border: '1px solid #1E2035', borderRadius: 3 }}>
            <Box sx={{
              width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 2,
              background: 'linear-gradient(135deg, #05140a, #052e16)',
              border: '2px solid #22c55e44',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Typography sx={{ fontSize: 30 }}>✅</Typography>
            </Box>
            <Typography variant="h5" color="text.primary" sx={{ fontWeight: 700, mb: 1 }}>KYC Verified</Typography>
            <Chip label="✓ Identity Confirmed" size="small"
              sx={{ bgcolor: '#052e16', color: '#22c55e', border: '1px solid #22c55e44', fontWeight: 600, mb: 3 }} />

            <Paper sx={{ p: 2, mb: 3, bgcolor: '#0D0F1A', border: '1px solid #1E2035', borderRadius: 2, textAlign: 'left' }}>
              {[
                { label: 'Wallet', value: wallet.address ? `${wallet.address.slice(0,10)}…${wallet.address.slice(-6)}` : '—' },
                { label: 'Status', value: 'Approved', vc: '#22c55e' },
                { label: 'Verification', value: 'On-chain (Hardhat)' },
                { label: 'Borrowing', value: 'Enabled', vc: '#22c55e' },
              ].map(r => (
                <Box key={r.label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.75, borderBottom: '1px solid #1E2035', '&:last-child': { borderBottom: 'none' } }}>
                  <Typography variant="caption" color="text.secondary">{r.label}</Typography>
                  <Typography variant="caption" sx={{ color: (r as { vc?: string }).vc ?? 'text.primary', fontWeight: 500 }}>{r.value}</Typography>
                </Box>
              ))}
            </Paper>

            <Button fullWidth variant="contained" onClick={() => router.push('/?tab=deposit')}
              sx={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)', color: 'white', py: 1.25,
                    '&:hover': { background: 'linear-gradient(135deg, #6d28d9, #0891B2)' } }}>
              Start Borrowing →
            </Button>
          </Paper>

          <DocUploadPanel wallet={wallet.address ?? ''} />
        </Box>
      </Box>
    );
  }

  // ── KYC Form ─────────────────────────────────────────────────────────────
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0D0F1A' }}>
      <Navbar />
      <Box component="main" sx={{ maxWidth: 672, mx: 'auto', px: 2, py: 5 }}>

        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" color="text.primary" sx={{ fontWeight: 700 }}>KYC Verification</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Complete identity verification to access borrowing services
          </Typography>
        </Box>

        {!wallet.isConnected && (
          <Alert severity="warning" sx={{ mb: 3, bgcolor: 'rgba(161,98,7,0.15)', color: '#fde68a',
            border: '1px solid rgba(234,179,8,0.3)', '& .MuiAlert-icon': { color: '#fde68a' } }}>
            Connect your MetaMask wallet to complete KYC verification.
          </Alert>
        )}

        {/* Stepper */}
        <Stepper activeStep={step - 1} sx={{ mb: 4 }}>
          {STEP_LABELS.map((label) => (
            <Step key={label}>
              <StepLabel sx={{
                '& .MuiStepLabel-label': { fontSize: 11, color: '#64748B' },
                '& .MuiStepLabel-label.Mui-active': { color: '#A78BFA' },
                '& .MuiStepLabel-label.Mui-completed': { color: '#A78BFA' },
              }}>
                {label}
              </StepLabel>
            </Step>
          ))}
        </Stepper>

        <Paper sx={{ p: 3, bgcolor: '#12152A', border: '1px solid #1E2035', borderRadius: 3 }}>

          {/* Step 1 — Personal Info */}
          {step === 1 && (
            <Box>
              <Typography variant="body1" sx={{ color: '#A78BFA', fontWeight: 600, mb: 3 }}>Personal Information</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <FormControl size="small" fullWidth required sx={{ gridColumn: { sm: 'span 2' } }}>
                  <InputLabel>Document Type</InputLabel>
                  <Select label="Document Type" value={form.docType}
                    onChange={e => set('docType', e.target.value)}>
                    {DOC_TYPES.map(d => <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField label={`Full Name (as per ${docMeta.label})`} required size="small" fullWidth
                  placeholder="e.g. Ahmad bin Abdullah"
                  value={form.fullName} onChange={e => set('fullName', e.target.value)} />
                <TextField label={docMeta.numberLabel} required size="small" fullWidth
                  placeholder={docMeta.placeholder}
                  value={form.icNumber} onChange={e => set('icNumber', e.target.value)} />
                <TextField label="Date of Birth" required size="small" fullWidth type="date"
                  slotProps={{ inputLabel: { shrink: true } }}
                  value={form.dob} onChange={e => set('dob', e.target.value)} />
                <FormControl size="small" fullWidth required>
                  <InputLabel>Gender</InputLabel>
                  <Select label="Gender" value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <MenuItem value="Male">Male</MenuItem>
                    <MenuItem value="Female">Female</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth required>
                  <InputLabel>Nationality</InputLabel>
                  <Select label="Nationality" value={form.nationality} onChange={e => set('nationality', e.target.value)}>
                    <MenuItem value="Malaysian">Malaysian</MenuItem>
                    <MenuItem value="Permanent Resident">Permanent Resident</MenuItem>
                    <MenuItem value="Foreigner">Foreigner</MenuItem>
                  </Select>
                </FormControl>
                <TextField label="Mobile Number" required size="small" fullWidth
                  placeholder="e.g. 012-3456789"
                  value={form.phone} onChange={e => set('phone', e.target.value)} />
                <TextField label="Email Address" required size="small" fullWidth type="email"
                  placeholder="you@example.com"
                  value={form.email} onChange={e => set('email', e.target.value)}
                  sx={{ gridColumn: { sm: 'span 2' } }} />
              </Box>
            </Box>
          )}

          {/* Step 2 — Address */}
          {step === 2 && (
            <Box>
              <Typography variant="body1" sx={{ color: '#A78BFA', fontWeight: 600, mb: 3 }}>Residential Address</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField label="Address Line 1" required size="small" fullWidth
                  placeholder="House/Unit No., Street"
                  value={form.addr1} onChange={e => set('addr1', e.target.value)} />
                <TextField label="Address Line 2" size="small" fullWidth
                  placeholder="Taman, Kawasan (optional)"
                  value={form.addr2} onChange={e => set('addr2', e.target.value)} />
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  <TextField label="Postcode" required size="small" fullWidth
                    placeholder="e.g. 50450"
                    value={form.postcode} onChange={e => set('postcode', e.target.value)} />
                  <TextField label="City" required size="small" fullWidth
                    placeholder="e.g. Kuala Lumpur"
                    value={form.city} onChange={e => set('city', e.target.value)} />
                </Box>
                <FormControl size="small" fullWidth required>
                  <InputLabel>State</InputLabel>
                  <Select label="State" value={form.state} onChange={e => set('state', e.target.value)}>
                    {MY_STATES.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </Select>
                </FormControl>
              </Box>
            </Box>
          )}

          {/* Step 3 — Financial */}
          {step === 3 && (
            <Box>
              <Typography variant="body1" sx={{ color: '#A78BFA', fontWeight: 600, mb: 3 }}>Financial Declaration</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <FormControl size="small" fullWidth required>
                  <InputLabel>Employment Status</InputLabel>
                  <Select label="Employment Status" value={form.employment} onChange={e => set('employment', e.target.value)}>
                    {EMPLOYMENT_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth required>
                  <InputLabel>Monthly Income Range</InputLabel>
                  <Select label="Monthly Income Range" value={form.income} onChange={e => set('income', e.target.value)}>
                    {INCOME_BRACKETS.map(b => <MenuItem key={b} value={b}>{b}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth required>
                  <InputLabel>Purpose of Loan</InputLabel>
                  <Select label="Purpose of Loan" value={form.purpose} onChange={e => set('purpose', e.target.value)}>
                    {LOAN_PURPOSES.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth required>
                  <InputLabel>Source of Funds</InputLabel>
                  <Select label="Source of Funds" value={form.fundSource} onChange={e => set('fundSource', e.target.value)}>
                    {FUND_SOURCES.map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                  </Select>
                </FormControl>
              </Box>
            </Box>
          )}

          {/* Step 4 — Documents */}
          {step === 4 && (
            <Box>
              <Typography variant="body1" sx={{ color: '#A78BFA', fontWeight: 600, mb: 0.5 }}>Document Upload</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 3 }}>
                Upload clear photos of your MyKad. Images are compressed and saved securely.
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {DOC_SLOTS.map(doc => {
                  const file = files[doc.key];
                  const preview = file ? URL.createObjectURL(file) : null;
                  return (
                    <Box key={doc.key}>
                      <input ref={fileRefs[doc.key]} type="file" accept="image/jpeg,image/png,image/webp"
                        style={{ display: 'none' }}
                        onChange={e => setFiles(p => ({ ...p, [doc.key]: e.target.files?.[0] ?? null }))} />
                      <Box onClick={() => fileRefs[doc.key].current?.click()}
                        sx={{
                          borderRadius: 2, overflow: 'hidden', cursor: 'pointer', transition: 'all 0.15s',
                          border: `2px solid ${file ? '#22c55e' : '#374151'}`,
                          bgcolor: '#0D0F1A',
                          '&:hover': { borderColor: file ? '#22c55e' : '#7C3AED' },
                        }}>
                        {file && preview ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5 }}>
                            <Box component="img" src={preview} alt={doc.label}
                              sx={{ width: 80, height: 56, objectFit: 'cover', borderRadius: 1.5,
                                    border: '1px solid #22c55e44', flexShrink: 0 }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                <Typography sx={{ fontSize: 14 }}>✅</Typography>
                                <Typography variant="body2" sx={{ color: '#22c55e', fontWeight: 600 }}>{doc.label}</Typography>
                              </Box>
                              <Typography variant="caption" color="text.secondary" noWrap>{file.name}</Typography>
                              <Typography variant="caption" sx={{ color: '#475569', display: 'block', mt: 0.25 }}>
                                {(file.size / 1024).toFixed(0)} KB · tap to replace
                              </Typography>
                            </Box>
                          </Box>
                        ) : (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2 }}>
                            <Box sx={{ width: 80, height: 56, borderRadius: 1.5, flexShrink: 0,
                                        bgcolor: '#131629', border: '1px dashed #374151',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                              📄
                            </Box>
                            <Box sx={{ flex: 1 }}>
                              <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600, mb: 0.5 }}>{doc.label}</Typography>
                              <Typography variant="caption" color="text.secondary">{doc.hint}</Typography>
                              <Box sx={{ display: 'inline-block', mt: 1, px: 1.5, py: 0.5, borderRadius: 999,
                                          bgcolor: '#7C3AED22', border: '1px solid #7C3AED44' }}>
                                <Typography variant="caption" sx={{ color: '#A78BFA' }}>Choose file</Typography>
                              </Box>
                            </Box>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>

              <Box sx={{ mt: 2.5, p: 1.5, display: 'flex', alignItems: 'flex-start', gap: 1,
                          bgcolor: '#0D1020', border: '1px solid #1E2035', borderRadius: 1.5 }}>
                <Typography sx={{ fontSize: 14, mt: 0.25 }}>ℹ️</Typography>
                <Typography variant="caption" color="text.secondary">
                  Photos are compressed client-side before upload. Accepted formats: JPG, PNG, WEBP.
                </Typography>
              </Box>
            </Box>
          )}

          {/* Step 5 — Review */}
          {step === 5 && (
            <Box>
              <Typography variant="body1" sx={{ color: '#A78BFA', fontWeight: 600, mb: 3 }}>Review & Submit</Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {[
                  ['Document Type',   docMeta.label],
                  ['Full Name',       form.fullName],
                  [docMeta.numberLabel, form.icNumber],
                  ['Date of Birth',   form.dob],
                  ['Gender',          form.gender],
                  ['Nationality',     form.nationality],
                  ['Phone',           form.phone],
                  ['Email',           form.email],
                  ['Address',         [form.addr1, form.addr2, form.postcode, form.city, form.state].filter(Boolean).join(', ')],
                  ['Employment',      form.employment],
                  ['Monthly Income',  form.income],
                  ['Loan Purpose',    form.purpose],
                  ['Source of Funds', form.fundSource],
                ].map(([k, v]) => (
                  <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', py: 1, borderBottom: '1px solid #1E2035' }}>
                    <Typography variant="caption" color="text.secondary">{k}</Typography>
                    <Typography variant="caption" sx={{ color: '#e2e8f0', textAlign: 'right', maxWidth: '55%' }}>
                      {v || '—'}
                    </Typography>
                  </Box>
                ))}
              </Box>

              <Box sx={{ mt: 3, p: 2.5, bgcolor: '#1a1d2e', borderRadius: 2 }}>
                <FormControlLabel
                  control={
                    <Checkbox checked={form.agreeTerms} onChange={e => set('agreeTerms', e.target.checked)}
                      sx={{ color: '#64748B', '&.Mui-checked': { color: '#7C3AED' }, mt: -0.25 }} />
                  }
                  label={
                    <Typography variant="body2" color="text.secondary">
                      I agree to the{' '}
                      <Box component="span" sx={{ color: '#A78BFA' }}>Terms of Service</Box>
                      {' '}and{' '}
                      <Box component="span" sx={{ color: '#A78BFA' }}>Privacy Policy</Box>
                      , and consent to the processing of my personal data for KYC/AML purposes.
                    </Typography>
                  }
                  sx={{ alignItems: 'flex-start', mb: 1.5 }}
                />
                <FormControlLabel
                  control={
                    <Checkbox checked={form.agreeDeclaration} onChange={e => set('agreeDeclaration', e.target.checked)}
                      sx={{ color: '#64748B', '&.Mui-checked': { color: '#7C3AED' }, mt: -0.25 }} />
                  }
                  label={
                    <Typography variant="body2" color="text.secondary">
                      I declare that all information provided is true and accurate. I understand that
                      providing false information is an offence under Malaysian law.
                    </Typography>
                  }
                  sx={{ alignItems: 'flex-start' }}
                />
              </Box>

              <Alert severity="info" sx={{ mt: 2.5, bgcolor: 'rgba(124,58,237,0.1)', color: '#A78BFA',
                border: '1px solid rgba(124,58,237,0.3)', '& .MuiAlert-icon': { color: '#A78BFA' } }}>
                No MetaMask signature required. Your application will be reviewed by the compliance team
                and approved within 1–3 business days.
              </Alert>
            </Box>
          )}
        </Paper>

        {/* Navigation buttons */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
          <Button variant="outlined" onClick={() => setStep(p => (p > 1 ? (p - 1) as Step : p))} disabled={step === 1}
            sx={{ borderColor: '#374151', color: '#64748B', '&:hover': { bgcolor: '#1a1d2e', borderColor: '#4B5563' },
                  '&.Mui-disabled': { opacity: 0.3 } }}>
            ← Back
          </Button>

          {step < 5 ? (
            <Button variant="contained" onClick={() => setStep(p => (p + 1) as Step)} disabled={!canProceed()}
              sx={{ bgcolor: '#7C3AED', '&:hover': { bgcolor: '#6d28d9' }, '&.Mui-disabled': { opacity: 0.4 } }}>
              Continue →
            </Button>
          ) : (
            <Button variant="contained" onClick={handleSubmit} disabled={!canProceed() || submitting}
              sx={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)', color: 'white',
                    '&:hover': { background: 'linear-gradient(135deg, #6d28d9, #0891B2)' },
                    '&.Mui-disabled': { opacity: 0.4 } }}>
              {submitting ? 'Submitting…' : 'Submit KYC'}
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
}
