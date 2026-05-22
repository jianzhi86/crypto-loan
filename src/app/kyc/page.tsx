'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
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

interface FormData {
  fullName: string;
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
  agreeTerms: boolean;
  agreeDeclaration: boolean;
}

const EMPTY: FormData = {
  fullName:'', icNumber:'', dob:'', gender:'', nationality:'Malaysian',
  phone:'', email:'', addr1:'', addr2:'', postcode:'', city:'', state:'',
  employment:'', income:'', purpose:'', fundSource:'',
  agreeTerms: false, agreeDeclaration: false,
};

const STEP_LABELS = ['Personal Info','Address','Financial','Documents','Review'];

const DOC_SLOTS = [
  { key: 'front',  label: 'MyKad (Front)',      hint: 'Clear photo showing your name, IC number, and photo' },
  { key: 'back',   label: 'MyKad (Back)',       hint: 'Clear photo showing your address and thumbprint' },
  { key: 'selfie', label: 'Selfie with MyKad',  hint: 'Hold your MyKad next to your face' },
] as const;

type DocKey = typeof DOC_SLOTS[number]['key'];

function StepBar({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEP_LABELS.map((label, i) => {
        const step = (i + 1) as Step;
        const done = step < current;
        const active = step === current;
        return (
          <div key={label} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
                ${done ? 'bg-purple-500 border-purple-500 text-white'
                  : active ? 'border-purple-400 text-purple-400 bg-transparent'
                  : 'border-gray-600 text-gray-600 bg-transparent'}`}>
                {done ? '✓' : step}
              </div>
              <span className={`text-xs mt-1 ${active ? 'text-purple-300' : done ? 'text-purple-400' : 'text-gray-600'}`}>
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`h-0.5 flex-1 -mt-5 ${done ? 'bg-purple-500' : 'bg-gray-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-[#1a1d2e] border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors";
const selectCls = inputCls + " cursor-pointer";

export default function KYCPage() {
  const wallet = useWallet();
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  // File upload state
  const [files, setFiles] = useState<Record<DocKey, File | null>>({ front: null, back: null, selfie: null });
  const fileRefs: Record<DocKey, React.RefObject<HTMLInputElement | null>> = {
    front:  useRef<HTMLInputElement>(null),
    back:   useRef<HTMLInputElement>(null),
    selfie: useRef<HTMLInputElement>(null),
  };

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && wallet.kycApproved && !submittedId) {
      router.push('/');
    }
  }, [mounted, wallet.kycApproved, submittedId, router]);

  const set = (field: keyof FormData, value: string | boolean) =>
    setForm(p => ({ ...p, [field]: value }));

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

    const res = await fetch('/api/kyc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, wallet: wallet.address }),
    });

    if (!res.ok) {
      setSubmitting(false);
      alert('Failed to save KYC data. Please try again.');
      return;
    }

    const data = await res.json();
    setSubmittedId(data.id);
    setSubmitting(false);
  };

  // ── Pending Review Screen ──────────────────────────────────────────────────
  if (submittedId) {
    const ref = `KYC-${String(submittedId).padStart(6, '0')}`;
    return (
      <div className="min-h-screen bg-[#0D0F1A] text-white">
        <Navbar />
        <main className="max-w-lg mx-auto px-4 py-16">
          <div className="bg-[#12152A] border border-gray-800 rounded-2xl p-10 text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ backgroundColor: '#1E1B3A' }}>
              <span className="text-4xl">⏳</span>
            </div>

            <h2 className="text-xl font-bold text-white mb-2">Application Submitted</h2>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold mb-4"
              style={{ backgroundColor: '#1E1B3A', color: '#A78BFA', border: '1px solid #A78BFA33' }}>
              ● Pending Review
            </div>

            <p className="text-sm mb-1" style={{ color: '#64748B' }}>
              Reference number
            </p>
            <p className="font-mono text-lg font-bold text-white mb-6">{ref}</p>

            <div className="rounded-xl p-4 mb-6 text-left space-y-2"
              style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035' }}>
              <p className="text-xs" style={{ color: '#64748B' }}>
                Your KYC application has been received and is currently under review by our compliance team.
              </p>
              <p className="text-xs" style={{ color: '#64748B' }}>
                Estimated processing time: <span className="text-white">1–3 business days</span>
              </p>
              <p className="text-xs" style={{ color: '#64748B' }}>
                You will be notified once your verification is complete.
              </p>
            </div>

            <button
              onClick={() => router.push('/')}
              className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── KYC Form ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0D0F1A] text-white">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">KYC Verification</h1>
          <p className="text-gray-400 text-sm mt-1">
            Complete identity verification to access borrowing services
          </p>
        </div>

        {!wallet.isConnected && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4 mb-6 text-sm text-yellow-300">
            Connect your MetaMask wallet to complete KYC verification.
          </div>
        )}

        <StepBar current={step} />

        <div className="bg-[#12152A] border border-gray-800 rounded-2xl p-6">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-purple-300 mb-4">Personal Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full Name (as per MyKad)" required>
                  <input className={inputCls} placeholder="e.g. Ahmad bin Abdullah"
                    value={form.fullName} onChange={e => set('fullName', e.target.value)} />
                </Field>
                <Field label="MyKad / IC Number" required>
                  <input className={inputCls} placeholder="e.g. 901231-14-5678"
                    value={form.icNumber} onChange={e => set('icNumber', e.target.value)} />
                </Field>
                <Field label="Date of Birth" required>
                  <input type="date" className={inputCls}
                    value={form.dob} onChange={e => set('dob', e.target.value)} />
                </Field>
                <Field label="Gender" required>
                  <select className={selectCls} value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option value="">Select gender</option>
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                </Field>
                <Field label="Nationality" required>
                  <select className={selectCls} value={form.nationality} onChange={e => set('nationality', e.target.value)}>
                    <option>Malaysian</option>
                    <option>Permanent Resident</option>
                    <option>Foreigner</option>
                  </select>
                </Field>
                <Field label="Mobile Number" required>
                  <input className={inputCls} placeholder="e.g. 012-3456789"
                    value={form.phone} onChange={e => set('phone', e.target.value)} />
                </Field>
                <Field label="Email Address" required>
                  <input type="email" className={inputCls} placeholder="you@example.com"
                    value={form.email} onChange={e => set('email', e.target.value)} />
                </Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-purple-300 mb-4">Residential Address</h2>
              <Field label="Address Line 1" required>
                <input className={inputCls} placeholder="House/Unit No., Street"
                  value={form.addr1} onChange={e => set('addr1', e.target.value)} />
              </Field>
              <Field label="Address Line 2">
                <input className={inputCls} placeholder="Taman, Kawasan (optional)"
                  value={form.addr2} onChange={e => set('addr2', e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Postcode" required>
                  <input className={inputCls} placeholder="e.g. 50450"
                    value={form.postcode} onChange={e => set('postcode', e.target.value)} />
                </Field>
                <Field label="City" required>
                  <input className={inputCls} placeholder="e.g. Kuala Lumpur"
                    value={form.city} onChange={e => set('city', e.target.value)} />
                </Field>
              </div>
              <Field label="State" required>
                <select className={selectCls} value={form.state} onChange={e => set('state', e.target.value)}>
                  <option value="">Select state</option>
                  {MY_STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-purple-300 mb-4">Financial Declaration</h2>
              <Field label="Employment Status" required>
                <select className={selectCls} value={form.employment} onChange={e => set('employment', e.target.value)}>
                  <option value="">Select status</option>
                  {EMPLOYMENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Monthly Income Range" required>
                <select className={selectCls} value={form.income} onChange={e => set('income', e.target.value)}>
                  <option value="">Select income range</option>
                  {INCOME_BRACKETS.map(b => <option key={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="Purpose of Loan" required>
                <select className={selectCls} value={form.purpose} onChange={e => set('purpose', e.target.value)}>
                  <option value="">Select purpose</option>
                  {LOAN_PURPOSES.map(p => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Source of Funds" required>
                <select className={selectCls} value={form.fundSource} onChange={e => set('fundSource', e.target.value)}>
                  <option value="">Select source</option>
                  {FUND_SOURCES.map(f => <option key={f}>{f}</option>)}
                </select>
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-purple-300 mb-4">Document Upload</h2>
              <p className="text-sm text-gray-400">
                Upload clear photos or scans of your documents. Files must be JPG, PNG, or PDF under 5MB.
              </p>

              {DOC_SLOTS.map(doc => (
                <div key={doc.key}>
                  {/* Hidden real file input */}
                  <input
                    ref={fileRefs[doc.key]}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={e => setFiles(p => ({ ...p, [doc.key]: e.target.files?.[0] ?? null }))}
                  />
                  {/* Clickable upload area */}
                  <div
                    onClick={() => fileRefs[doc.key].current?.click()}
                    className="border-2 rounded-xl p-6 text-center cursor-pointer transition-colors"
                    style={{
                      borderStyle: 'dashed',
                      borderColor: files[doc.key] ? '#22c55e' : '#374151',
                      backgroundColor: files[doc.key] ? '#052e1620' : 'transparent',
                    }}
                    onMouseEnter={e => { if (!files[doc.key]) (e.currentTarget as HTMLElement).style.borderColor = '#7c3aed'; }}
                    onMouseLeave={e => { if (!files[doc.key]) (e.currentTarget as HTMLElement).style.borderColor = '#374151'; }}
                  >
                    {files[doc.key] ? (
                      <>
                        <div className="text-3xl mb-2">✅</div>
                        <p className="text-sm font-medium text-green-400">{files[doc.key]!.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {(files[doc.key]!.size / 1024).toFixed(0)} KB · Click to replace
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="text-3xl mb-2">📄</div>
                        <p className="text-sm font-medium text-gray-300">{doc.label}</p>
                        <p className="text-xs text-gray-500 mt-1">{doc.hint}</p>
                        <button
                          type="button"
                          className="mt-3 text-xs text-purple-400 border border-purple-700 px-3 py-1 rounded-full hover:bg-purple-900/30 transition-colors"
                          onClick={e => { e.stopPropagation(); fileRefs[doc.key].current?.click(); }}
                        >
                          Choose File
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}

              <div className="bg-blue-900/20 border border-blue-800 rounded-lg p-3 text-xs text-blue-300">
                On Hardhat testnet, documents are selected locally and not uploaded to a server.
                In production, files would be encrypted and stored securely.
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-purple-300 mb-4">Review & Submit</h2>

              <div className="space-y-3 text-sm">
                {[
                  ['Full Name', form.fullName],
                  ['IC Number', form.icNumber],
                  ['Date of Birth', form.dob],
                  ['Gender', form.gender],
                  ['Nationality', form.nationality],
                  ['Phone', form.phone],
                  ['Email', form.email],
                  ['Address', [form.addr1, form.addr2, form.postcode, form.city, form.state].filter(Boolean).join(', ')],
                  ['Employment', form.employment],
                  ['Monthly Income', form.income],
                  ['Loan Purpose', form.purpose],
                  ['Source of Funds', form.fundSource],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-gray-800 pb-2">
                    <span className="text-gray-500">{k}</span>
                    <span className="text-gray-200 text-right max-w-[60%]">{v || '—'}</span>
                  </div>
                ))}
              </div>

              <div className="bg-[#1a1d2e] rounded-xl p-4 space-y-3 mt-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 accent-purple-500"
                    checked={form.agreeTerms} onChange={e => set('agreeTerms', e.target.checked)} />
                  <span className="text-sm text-gray-300">
                    I agree to the <span className="text-purple-400">Terms of Service</span> and{' '}
                    <span className="text-purple-400">Privacy Policy</span>, and consent to the processing
                    of my personal data for KYC/AML purposes.
                  </span>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" className="mt-0.5 accent-purple-500"
                    checked={form.agreeDeclaration} onChange={e => set('agreeDeclaration', e.target.checked)} />
                  <span className="text-sm text-gray-300">
                    I declare that all information provided is true and accurate. I understand that
                    providing false information is an offence under Malaysian law.
                  </span>
                </label>
              </div>

              <div className="bg-purple-900/20 border border-purple-800 rounded-lg p-3 text-xs text-purple-300">
                No MetaMask signature required. Your application will be reviewed by the compliance team
                and approved within 1–3 business days.
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between mt-6">
          <button
            onClick={() => setStep(p => (p > 1 ? (p - 1) as Step : p))}
            disabled={step === 1}
            className="px-5 py-2 rounded-lg border border-gray-700 text-gray-400 text-sm hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Back
          </button>

          {step < 5 ? (
            <button
              onClick={() => setStep(p => (p + 1) as Step)}
              disabled={!canProceed()}
              className="px-6 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!canProceed() || submitting}
              className="px-6 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? 'Submitting…' : 'Submit KYC'}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
