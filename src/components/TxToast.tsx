'use client';

import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@/lib/WalletContext';

function Spinner() {
  return (
    <svg className="animate-spin" width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="#1E2035" strokeWidth="2.5" />
      <path d="M10 2a8 8 0 0 1 8 8" stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function StepDots({ step, total }: { step: number; total: number }) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center gap-1.5 mt-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="transition-all duration-300"
          style={{
            width: i + 1 === step ? 16 : 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: i + 1 <= step ? '#A78BFA' : '#1E2035',
          }} />
      ))}
      <span className="text-xs ml-1" style={{ color: '#64748B' }}>
        Step {step} of {total}
      </span>
    </div>
  );
}

export default function TxToast() {
  const wallet    = useWallet();
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRef  = useRef(wallet.clearTx);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { clearRef.current = wallet.clearTx; }, [wallet.clearTx]);

  useEffect(() => {
    if (!mounted) return;
    if (wallet.txStatus === 'success') {
      timerRef.current = setTimeout(() => clearRef.current(), 4000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [mounted, wallet.txStatus]);

  if (wallet.txStatus === 'idle') return null;

  const isPending = wallet.txStatus === 'pending';
  const isSuccess = wallet.txStatus === 'success';
  const isError   = wallet.txStatus === 'error';

  const borderColor = isPending ? '#7C3AED' : isSuccess ? '#22c55e' : '#ef4444';
  const iconBg      = isPending ? '#1a1535' : isSuccess ? '#052e16'  : '#450a0a';

  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-80 rounded-2xl shadow-2xl overflow-hidden"
      style={{ backgroundColor: '#12152A', border: `1px solid ${borderColor}44` }}
    >
      {/* Top accent bar */}
      <div className="h-0.5 w-full" style={{ backgroundColor: borderColor }} />

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ backgroundColor: iconBg }}>
            {isPending && <Spinner />}
            {isSuccess && <span className="text-base">✓</span>}
            {isError   && <span className="text-base">✕</span>}
          </div>

          {/* Message */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold mb-0.5"
              style={{ color: isPending ? '#A78BFA' : isSuccess ? '#22c55e' : '#ef4444' }}>
              {isPending ? 'Transaction Pending' : isSuccess ? 'Transaction Confirmed' : 'Transaction Failed'}
            </p>
            <p className="text-sm text-white leading-snug">{wallet.txMessage}</p>

            {isPending && (
              <StepDots step={wallet.txStep} total={wallet.txTotalSteps} />
            )}

            {isSuccess && (
              <div className="mt-2 flex items-center gap-1.5">
                <div className="h-1 flex-1 rounded-full" style={{ backgroundColor: '#22c55e33' }}>
                  <div className="h-full rounded-full" style={{ backgroundColor: '#22c55e', width: '100%' }} />
                </div>
                <span className="text-xs" style={{ color: '#475569' }}>Dismissing…</span>
              </div>
            )}
          </div>

          {/* Close */}
          <button onClick={wallet.clearTx}
            className="text-xs w-5 h-5 flex items-center justify-center rounded flex-shrink-0 hover:bg-white/10 transition-colors"
            style={{ color: '#475569' }}>
            ✕
          </button>
        </div>

        {isPending && (
          <p className="text-xs mt-3 pt-3 border-t" style={{ color: '#475569', borderColor: '#1E2035' }}>
            Waiting for MetaMask confirmation…
          </p>
        )}
      </div>
    </div>
  );
}
