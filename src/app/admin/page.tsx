import { prisma } from '@/lib/db/prisma';
import type { KycSubmission } from '@prisma/client';
import { AdminApproveBtn } from '@/components/AdminApproveBtn';
import { AdminSyncPriceBtn } from '@/components/AdminSyncPriceBtn';

export const dynamic = 'force-dynamic';

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    pending:  { bg: '#1E1B3A', text: '#A78BFA' },
    approved: { bg: '#052e16', text: '#22c55e' },
    rejected: { bg: '#450a0a', text: '#ef4444' },
  };
  const c = colors[status] ?? colors.pending;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: c.bg, color: c.text }}>
      {status}
    </span>
  );
}

export default async function AdminPage() {
  const submissions = await prisma.kycSubmission.findMany({
    orderBy: { submittedAt: 'desc' },
  });

  const pending  = submissions.filter(s => s.status === 'pending').length;
  const approved = submissions.filter(s => s.status === 'approved').length;

  return (
    <div className="min-h-screen p-8" style={{ backgroundColor: '#0D0F1A', color: '#F1F5F9' }}>
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">KYC Submissions</h1>
            <p className="text-sm mt-1" style={{ color: '#64748B' }}>
              Local SQLite database · {submissions.length} record{submissions.length !== 1 ? 's' : ''}
              {pending > 0 && <span style={{ color: '#A78BFA' }}> · {pending} pending review</span>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <AdminSyncPriceBtn />
            {pending > 0 && (
              <div className="px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ backgroundColor: '#1E1B3A', color: '#A78BFA', border: '1px solid #A78BFA33' }}>
                ⏳ {pending} Pending
              </div>
            )}
            <div className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: '#052e16', color: '#22c55e', border: '1px solid #22c55e33' }}>
              ● Database Connected
            </div>
          </div>
        </div>

        {/* Stats */}
        {submissions.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: 'Total', value: submissions.length, color: '#94A3B8' },
              { label: 'Pending Review', value: pending, color: '#A78BFA' },
              { label: 'Approved', value: approved, color: '#22c55e' },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-4" style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
                <p className="text-xs mb-1" style={{ color: '#64748B' }}>{s.label}</p>
                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {submissions.length === 0 ? (
          <div className="rounded-2xl p-16 text-center"
            style={{ backgroundColor: '#131629', border: '1px dashed #1E2035' }}>
            <p className="text-3xl mb-3">📭</p>
            <p className="text-sm font-medium text-white mb-1">No KYC submissions yet</p>
            <p className="text-xs" style={{ color: '#64748B' }}>
              Submit a KYC form from the /kyc page to see records here
            </p>
          </div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #1E2035' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#131629', borderBottom: '1px solid #1E2035' }}>
                  {['ID','Wallet','Full Name','IC Number','DOB','Phone','City / State','Employment','Purpose','Status','Submitted','Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium whitespace-nowrap"
                      style={{ color: '#64748B' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {submissions.map((s: KycSubmission, i: number) => (
                  <tr key={s.id}
                    style={{ backgroundColor: i % 2 === 0 ? '#0D0F1A' : '#0F111D', borderBottom: '1px solid #1E2035' }}>
                    <td className="px-4 py-3 text-xs" style={{ color: '#64748B' }}>{s.id}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#94A3B8' }}>
                      {s.wallet.slice(0, 8)}…{s.wallet.slice(-4)}
                    </td>
                    <td className="px-4 py-3 font-medium text-white whitespace-nowrap">{s.fullName}</td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: '#94A3B8' }}>{s.icNumber}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#94A3B8' }}>{s.dob}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#94A3B8' }}>{s.phone}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#94A3B8' }}>
                      {s.city}, {s.state}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#94A3B8' }}>{s.employment}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#94A3B8' }}>{s.purpose}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: '#64748B' }}>
                      {new Date(s.submittedAt).toLocaleString('en-MY')}
                    </td>
                    <td className="px-4 py-3">
                      <AdminApproveBtn wallet={s.wallet} initialStatus={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Schema info for assignment demo */}
        <div className="mt-6 rounded-xl p-5" style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
          <h2 className="text-sm font-semibold text-white mb-3">Database Schema</h2>
          <pre className="text-xs overflow-x-auto" style={{ color: '#64748B' }}>{`Table: KycSubmission (PostgreSQL · Supabase)
  id          SERIAL    PRIMARY KEY
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
  status      TEXT      DEFAULT 'pending'
  submittedAt DATETIME  DEFAULT now()
  updatedAt   DATETIME`}</pre>
        </div>
      </div>
    </div>
  );
}
