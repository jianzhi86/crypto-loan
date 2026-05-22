'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useWallet } from '@/lib/WalletContext';

const NAV = [
  { href: '/',          label: 'Dashboard' },
  { href: '/markets',   label: 'Markets'   },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/docs',      label: 'Docs'      },
  { href: '/kyc',       label: 'KYC'       },
];

function short(addr: string) { return addr.slice(0, 6) + '…' + addr.slice(-4); }

export default function Navbar() {
  const pathname = usePathname();
  const router   = useRouter();
  const wallet   = useWallet();
  const isLive   = wallet.isConnected && wallet.isCorrectNetwork;

  return (
    <>
      {/* ── Main bar ── */}
      <nav className="sticky top-0 z-50 px-6 py-4"
        style={{ borderBottom: '1px solid #1E2035', backgroundColor: '#0D0F1Acc', backdropFilter: 'blur(12px)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">

          {/* Logo + links */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}>C</div>
              <span className="text-lg font-bold text-white tracking-tight">CryptoLend</span>
            </Link>
            <div className="hidden md:flex items-center gap-6">
              {NAV.map(({ href, label }) => (
                <Link key={href} href={href} className="text-sm transition-colors hover:text-white"
                  style={{ color: pathname === href ? '#06B6D4' : '#64748B' }}>
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Network pill */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
              style={{ backgroundColor: '#131629', color: isLive ? '#94A3B8' : '#F59E0B', border: '1px solid #1E2035' }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block"
                style={{ backgroundColor: isLive ? '#22c55e' : wallet.isConnected ? '#F59E0B' : '#475569' }} />
              {isLive ? 'Hardhat Local' : wallet.isConnected ? 'Wrong Network' : 'Not Connected'}
            </div>

            {/* KYC badge */}
            {isLive && (
              <button
                onClick={() => router.push('/kyc')}
                className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors"
                style={{
                  backgroundColor: wallet.kycApproved ? '#052e16' : '#1a0f2e',
                  color: wallet.kycApproved ? '#22c55e' : '#A78BFA',
                  border: `1px solid ${wallet.kycApproved ? '#22c55e44' : '#7C3AED55'}`,
                  cursor: 'pointer',
                }}>
                <span>{wallet.kycApproved ? '✓' : '🪪'}</span>
                {wallet.kycApproved ? 'KYC Verified' : 'KYC Required'}
              </button>
            )}

            {wallet.isConnected ? (
              <div className="flex items-center gap-2">
                {!wallet.isCorrectNetwork && (
                  <button onClick={wallet.switchToHardhat}
                    className="px-3 py-2 rounded-lg text-xs font-semibold"
                    style={{ backgroundColor: '#F59E0B22', color: '#F59E0B', border: '1px solid #F59E0B44' }}>
                    Switch to Hardhat
                  </button>
                )}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                  style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#22c55e' }} />
                  <span className="text-white font-mono text-xs">{short(wallet.address!)}</span>
                  <span style={{ color: '#64748B' }}>·</span>
                  <span style={{ color: '#94A3B8' }} className="text-xs">{wallet.ethBalance} ETH</span>
                </div>
              </div>
            ) : (
              <button onClick={wallet.connect}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}>
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ── Network warning ── */}
      {wallet.isConnected && !wallet.isCorrectNetwork && (
        <div className="px-6 py-3 text-sm flex items-center justify-between"
          style={{ backgroundColor: '#431407', color: '#fb923c', borderBottom: '1px solid #7c2d12' }}>
          <span>⚠ Wrong network. Switch to Hardhat Local (localhost:8545, chain ID 31337).</span>
          <button onClick={wallet.switchToHardhat}
            className="text-xs px-3 py-1 rounded font-semibold"
            style={{ backgroundColor: '#fb923c22', border: '1px solid #fb923c44' }}>
            Switch Now
          </button>
        </div>
      )}

      {/* ── Contracts not deployed warning ── */}
      {wallet.isConnected && wallet.isCorrectNetwork && !wallet.isDeployed && (
        <div className="px-6 py-3 text-sm flex items-center justify-between"
          style={{ backgroundColor: '#1e1b3a', color: '#A78BFA', borderBottom: '1px solid #2e2654' }}>
          <span>⚠ Contracts not deployed yet. Run <code className="font-mono bg-black/30 px-1 rounded">npm run deploy:local</code> first.</span>
        </div>
      )}
    </>
  );
}
