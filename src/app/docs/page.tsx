'use client';

import { useState } from 'react';
import Navbar from '@/components/Navbar';

const SECTIONS = [
  { id: 'overview',   label: 'Overview'          },
  { id: 'how-it-works', label: 'How It Works'    },
  { id: 'collateral', label: 'Collateral & LTV'  },
  { id: 'health',     label: 'Health Factor'     },
  { id: 'setup',      label: 'Local Setup'       },
  { id: 'contracts',  label: 'Smart Contracts'   },
  { id: 'faq',        label: 'FAQ'               },
];

const CODE = {
  hardhatNode:   'npm run chain',
  deployLocal:   'npm run deploy:local',
  devServer:     'npm run dev',
  metamaskRPC:   'http://127.0.0.1:8545',
  chainId:       '31337',
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-12">
      <h2 className="text-2xl font-bold text-white mb-4">{title}</h2>
      <div className="space-y-4" style={{ color: '#94A3B8' }}>{children}</div>
    </section>
  );
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="leading-relaxed text-sm">{children}</p>;
}
function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="text-xs p-4 rounded-xl overflow-x-auto font-mono"
      style={{ backgroundColor: '#0D0F1A', border: '1px solid #1E2035', color: '#06B6D4' }}>
      {children}
    </pre>
  );
}
function Table({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #1E2035' }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid #1E2035', backgroundColor: '#0D0F1A' }}>
            {['Asset', 'Max LTV', 'Liq. Threshold'].map(h => (
              <th key={h} className="text-left px-4 py-3 text-xs font-medium" style={{ color: '#64748B' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b, c]) => (
            <tr key={a} style={{ borderBottom: '1px solid #1E2035' }}>
              <td className="px-4 py-3 text-white font-medium">{a}</td>
              <td className="px-4 py-3" style={{ color: '#06B6D4' }}>{b}</td>
              <td className="px-4 py-3" style={{ color: '#eab308' }}>{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Callout({ type, children }: { type: 'info' | 'warning' | 'tip'; children: React.ReactNode }) {
  const cfg = {
    info:    { bg: '#1E3A5F', border: '#3B82F6', icon: 'ℹ', c: '#93C5FD' },
    warning: { bg: '#431407', border: '#EA580C', icon: '⚠', c: '#FCA5A5' },
    tip:     { bg: '#052e16', border: '#16A34A', icon: '✓', c: '#86EFAC' },
  }[type];
  return (
    <div className="flex gap-3 p-4 rounded-xl text-sm"
      style={{ backgroundColor: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <span style={{ color: cfg.c }}>{cfg.icon}</span>
      <span style={{ color: cfg.c }}>{children}</span>
    </div>
  );
}

export default function DocsPage() {
  const [active, setActive] = useState('overview');

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0D0F1A', color: '#F1F5F9' }}>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex gap-8">

        {/* Sidebar */}
        <aside className="hidden lg:block w-52 flex-shrink-0">
          <div className="sticky top-24 space-y-1">
            <p className="text-xs font-semibold mb-3 px-3" style={{ color: '#475569' }}>DOCUMENTATION</p>
            {SECTIONS.map(s => (
              <a key={s.id} href={`#${s.id}`} onClick={() => setActive(s.id)}
                className="block px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  backgroundColor: active === s.id ? '#1E1B3A' : 'transparent',
                  color: active === s.id ? '#A78BFA' : '#64748B',
                  borderLeft: active === s.id ? '2px solid #7C3AED' : '2px solid transparent',
                }}>
                {s.label}
              </a>
            ))}
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 max-w-3xl">

          <Section id="overview" title="Overview">
            <P>
              CryptoLend is a decentralised lending protocol running on a local Hardhat blockchain. It lets you
              deposit ETH as collateral and borrow <strong className="text-white">Malaysian Ringgit (MYR)</strong> — a
              simulated stablecoin (MockMYR) pegged to RM 1.00 — against your crypto holdings.
            </P>
            <P>
              The protocol is designed for local development and testing. All coin prices are fetched live from
              CoinGecko in MYR. The on-chain ETH price used for loan calculations is set separately in the smart
              contract by the deployer.
            </P>
            <Callout type="warning">
              This is a testnet demo only. Never use real funds. All MYR tokens are mock ERC-20 tokens with no real-world value.
            </Callout>
          </Section>

          <Section id="how-it-works" title="How It Works">
            <P>The protocol has three main actions:</P>
            <div className="space-y-3">
              {[
                { n: '1', title: 'Deposit Collateral', desc: 'Send ETH to the CryptoLoan contract. Your ETH is locked as collateral and determines how much MYR you can borrow.' },
                { n: '2', title: 'Borrow MYR', desc: 'Request MockMYR tokens up to 70% of your collateral value (LTV). The contract mints MYR directly to your wallet.' },
                { n: '3', title: 'Repay & Withdraw', desc: 'Approve the contract to spend your MYR, then call repay. Once debt is cleared, you can withdraw your ETH collateral.' },
              ].map(s => (
                <div key={s.n} className="flex gap-4 p-4 rounded-xl" style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 text-white"
                    style={{ background: 'linear-gradient(135deg, #7C3AED, #06B6D4)' }}>{s.n}</div>
                  <div>
                    <p className="font-semibold text-white text-sm mb-1">{s.title}</p>
                    <p className="text-xs">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <Callout type="info">
              Repaying requires <strong>two MetaMask confirmations</strong>: first an ERC-20 approval, then the repay transaction.
            </Callout>
          </Section>

          <Section id="collateral" title="Collateral & LTV">
            <P>
              LTV (Loan-to-Value) measures how much you have borrowed relative to your collateral.
              The maximum LTV is <strong className="text-white">70%</strong> — you cannot borrow more than 70% of
              your collateral value in MYR.
            </P>
            <CodeBlock>{`Collateral value  = ETH deposited × ETH price (MYR)
Max borrow (MYR)  = Collateral value × 70%
Current LTV       = Borrowed MYR / Collateral value × 100%`}
            </CodeBlock>
            <Table rows={[
              ['ETH (Hardhat)',  '70%', '80%'],
              ['BTC (demo)',     '70%', '80%'],
              ['SOL (demo)',     '65%', '75%'],
              ['BNB (demo)',     '65%', '75%'],
            ]} />
          </Section>

          <Section id="health" title="Health Factor">
            <P>
              The health factor (HF) tells you how safe your position is. It is calculated as:
            </P>
            <CodeBlock>{`HF = (Collateral × ETH price × Liquidation threshold%) / Borrowed MYR

Example:
  1 ETH × RM 18,000 × 80% / RM 9,000 borrowed = 1.60`}
            </CodeBlock>
            <div className="grid grid-cols-3 gap-3">
              {[
                { range: 'HF ≥ 2.0', label: 'Safe',     desc: 'Position is well-collateralised', c: '#22c55e' },
                { range: '1.5 – 2.0', label: 'Moderate', desc: 'Consider adding more collateral', c: '#eab308' },
                { range: 'HF < 1.5', label: 'At Risk',   desc: 'Close to liquidation threshold', c: '#ef4444' },
              ].map(h => (
                <div key={h.range} className="p-3 rounded-xl text-center"
                  style={{ backgroundColor: `${h.c}0F`, border: `1px solid ${h.c}33` }}>
                  <p className="font-bold text-sm mb-0.5" style={{ color: h.c }}>{h.label}</p>
                  <p className="text-xs mb-1.5 text-white font-mono">{h.range}</p>
                  <p className="text-xs" style={{ color: h.c + 'BB' }}>{h.desc}</p>
                </div>
              ))}
            </div>
            <Callout type="warning">
              If the health factor drops below 1.0 your position can be liquidated. Always keep a safe buffer above 1.5.
            </Callout>
          </Section>

          <Section id="setup" title="Local Setup">
            <P>Follow these steps to run the full stack locally:</P>
            <div className="space-y-4">
              {[
                { n: 1, title: 'Start Hardhat node (Terminal 1)', code: CODE.hardhatNode },
                { n: 2, title: 'Deploy contracts (Terminal 2)', code: CODE.deployLocal },
                { n: 3, title: 'Start Next.js dev server (Terminal 3)', code: CODE.devServer },
              ].map(s => (
                <div key={s.n}>
                  <p className="text-sm text-white font-semibold mb-2">{s.n}. {s.title}</p>
                  <CodeBlock>{s.code}</CodeBlock>
                </div>
              ))}
            </div>

            <p className="text-sm text-white font-semibold mt-6 mb-3">4. Configure MetaMask</p>
            <div className="space-y-2">
              <CodeBlock>{`Network name : Hardhat Local
RPC URL      : ${CODE.metamaskRPC}
Chain ID     : ${CODE.chainId}
Currency     : ETH`}
              </CodeBlock>
              <P>
                Import one of the Hardhat test accounts using a private key printed when you run{' '}
                <code className="font-mono text-xs bg-black/30 px-1 rounded" style={{ color: '#A78BFA' }}>npm run chain</code>.
                Each account starts with <strong className="text-white">10,000 ETH</strong>.
              </P>
            </div>
            <Callout type="tip">
              The deploy script automatically writes contract addresses to <code className="font-mono text-xs">src/lib/contractConfig.ts</code>. You do not need to copy addresses manually.
            </Callout>
          </Section>

          <Section id="contracts" title="Smart Contracts">
            <P>Two contracts are deployed during setup:</P>
            <div className="space-y-3">
              {[
                {
                  name: 'CryptoLoan.sol',
                  desc: 'Main lending contract. Accepts ETH collateral, mints MockMYR on borrow, accepts MockMYR on repay.',
                  fns: ['depositCollateral()', 'borrow(uint256)', 'repay(uint256)', 'withdrawCollateral(uint256)', 'getLoanInfo(address)', 'setEthPrice(uint256)'],
                },
                {
                  name: 'MockMYR.sol',
                  desc: 'ERC-20 mock stablecoin. Only the CryptoLoan contract can mint. You can approve and transfer freely.',
                  fns: ['mint(address,uint256)', 'approve(address,uint256)', 'balanceOf(address)', 'transferFrom(...)'],
                },
              ].map(c => (
                <div key={c.name} className="p-4 rounded-xl" style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
                  <p className="font-bold text-white mb-1">{c.name}</p>
                  <p className="text-xs mb-3">{c.desc}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {c.fns.map(fn => (
                      <code key={fn} className="text-xs px-2 py-0.5 rounded font-mono"
                        style={{ backgroundColor: '#7C3AED22', color: '#A78BFA' }}>{fn}</code>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <P>
              After deployment, addresses are written to{' '}
              <code className="font-mono text-xs bg-black/30 px-1 rounded" style={{ color: '#06B6D4' }}>src/lib/contractConfig.ts</code>.
              Re-run the deploy script any time you restart the Hardhat node (addresses change on each fresh node start).
            </P>
          </Section>

          <Section id="faq" title="FAQ">
            <div className="space-y-4">
              {[
                {
                  q: 'Why do I need to run the deploy script every time?',
                  a: "Hardhat node generates fresh addresses on each start. Run `npm run chain` then `npm run deploy:local` together. The deploy script updates contractConfig.ts automatically.",
                },
                {
                  q: 'What is the exchange rate between ETH price and MYR borrow limit?',
                  a: "The on-chain ETH price (set in MYR by the deploy script, default RM 18,000) determines your max borrow. The UI shows real CoinGecko prices for reference but borrow limits use the on-chain price.",
                },
                {
                  q: 'Why does repay require two MetaMask confirmations?',
                  a: "MockMYR is an ERC-20 token. Before the contract can deduct your MYR balance, you must first approve it to spend on your behalf (standard ERC-20 flow).",
                },
                {
                  q: 'Can I borrow more than 70% LTV?',
                  a: "No. The contract enforces the 70% max LTV on-chain and will revert with \"Exceeds max LTV\" if you try.",
                },
                {
                  q: 'How do I update the ETH price in the contract?',
                  a: "The deployer account can call setEthPrice(uint256) directly via the Hardhat console: `npx hardhat console --network localhost` then interact with the deployed CryptoLoan contract.",
                },
              ].map(({ q, a }) => (
                <details key={q}
                  className="group p-4 rounded-xl cursor-pointer"
                  style={{ backgroundColor: '#131629', border: '1px solid #1E2035' }}>
                  <summary className="text-sm font-semibold text-white list-none flex justify-between items-center">
                    {q}
                    <span className="text-lg" style={{ color: '#7C3AED' }}>+</span>
                  </summary>
                  <p className="text-xs mt-3 leading-relaxed" style={{ color: '#94A3B8' }}>{a}</p>
                </details>
              ))}
            </div>
          </Section>

        </main>
      </div>
    </div>
  );
}
