'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import {
  AlertIcon, BoltIcon, CartIcon, CashIcon, ClockIcon, DocIcon, HelpIcon, IdCardIcon,
  LockIcon, PulseIcon, TrendDownIcon, TrendUpIcon,
} from '@/components/Icons';

// Monochrome stroke icons (the sidebar's icon language), not emoji — they sit
// at the right optical weight next to text and inherit the row's colour.
const SECTIONS = [
  { id: 'overview',    label: 'Overview',         icon: <DocIcon size={16} />     },
  { id: 'how-it-works', label: 'How It Works',    icon: <BoltIcon size={16} />    },
  { id: 'kyc',         label: 'KYC Verification', icon: <IdCardIcon size={16} />  },
  { id: 'collateral',  label: 'Collateral & LTV', icon: <LockIcon size={16} />    },
  { id: 'health',      label: 'Health Factor',    icon: <PulseIcon size={16} />   },
  { id: 'buy-myr',     label: 'Buy MYR',          icon: <CartIcon size={16} />    },
  { id: 'interest',    label: 'Interest & Fees',  icon: <TrendUpIcon size={16} /> },
  // { id: 'setup',       label: 'Local Setup'       },
  // { id: 'contracts',   label: 'Smart Contracts'   },
  { id: 'faq',         label: 'FAQ',              icon: <HelpIcon size={16} />    },
];

const SECTION_ICON: Record<string, React.ReactNode> = Object.fromEntries(
  SECTIONS.map(s => [s.id, s.icon]),
);

const CODE = {
  hardhatNode: 'npm run chain',
  deployLocal: 'npm run deploy:local',
  devServer:   'npm run dev',
  metamaskRPC: 'http://127.0.0.1:8545',
  chainId:     '31337',
};

const C = {
  border:  'rgba(255,255,255,0.12)',
  inner:   '#0F1730',
  slate:   'rgba(255,255,255,0.65)',
  blue:    '#6E8BFF',
  teal:    '#2BD9A2',
  gold:    '#FFB224',
  red:     '#E5484D',
  ink:     '#F2F5FF',
  muted:   'rgba(255,255,255,0.45)',
};

function Section({ id, title, badge, children }: { id: string; title: string; badge?: string; children: React.ReactNode }) {
  const icon = SECTION_ICON[id];
  return (
    <Box component="section" id={id} sx={{ mb: 7, scrollMarginTop: 120 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        {icon && (
          <Box sx={{
            width: 34, height: 34, borderRadius: 2, flexShrink: 0,
            bgcolor: C.inner, border: `1px solid ${C.border}`, color: C.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            '& svg': { width: 18, height: 18 },
          }}>
            {icon}
          </Box>
        )}
        <Typography variant="h5" color="text.primary" sx={{ fontWeight: 700, lineHeight: 1 }}>{title}</Typography>
        {badge && (
          <Chip label={badge} size="small"
            sx={{ bgcolor: 'rgba(110,139,255,0.16)', color: C.blue, fontWeight: 600, fontSize: 11, height: 20 }} />
        )}
      </Box>
      <Box sx={{ color: C.slate, display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</Box>
    </Box>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Typography variant="body2" sx={{ lineHeight: 1.85, color: C.slate }}>{children}</Typography>;
}

function Strong({ children }: { children: React.ReactNode }) {
  return <Box component="strong" sx={{ color: C.ink, fontWeight: 600 }}>{children}</Box>;
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <Box component="code" sx={{ fontFamily: 'monospace', fontSize: 12, bgcolor: C.inner,
      px: 0.75, py: 0.25, borderRadius: 0.5, color: '#9DB1FF' }}>
      {children}
    </Box>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <Box component="pre"
      sx={{ fontSize: 12.5, p: 2.5, borderRadius: 2, overflowX: 'auto', fontFamily: 'monospace',
            bgcolor: '#0F1730', border: `1px solid ${C.border}`, color: '#9DB1FF', m: 0, lineHeight: 1.9 }}>
      {children}
    </Box>
  );
}

function StepCard({ n, title, desc, sub }: { n: string; title: string; desc: string; sub?: string }) {
  return (
    <Paper sx={{ display: 'flex', gap: 2, p: 2.5, bgcolor: '#111B38', border: `1px solid ${C.border}`, borderRadius: 2 }}>
      <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Typography sx={{ color: 'white', fontSize: 14, fontWeight: 700 }}>{n}</Typography>
      </Box>
      <Box>
        <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600, mb: 0.5 }}>{title}</Typography>
        <Typography variant="caption" sx={{ lineHeight: 1.7, color: C.slate, display: 'block' }}>{desc}</Typography>
        {sub && <Typography variant="caption" sx={{ lineHeight: 1.7, color: C.muted, display: 'block', mt: 0.5 }}>{sub}</Typography>}
      </Box>
    </Paper>
  );
}


// Gradient families for the stat tiles — one hue per meaning, so the icon
// colour repeats the story the value colour already tells.
const GRAD = {
  blue: 'linear-gradient(135deg, #6E8BFF, #4A7DFF)',
  gold: 'linear-gradient(135deg, #FFB224, #FFA114)',
  red:  'linear-gradient(135deg, #E5484D, #FF7A5C)',
  teal: 'linear-gradient(135deg, #0FA372, #2BD9A2)',
} as const;

function InfoGrid({ items }: { items: { label: string; value: string; color?: string; icon?: React.ReactNode; grad?: string }[] }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
      {items.map(it => (
        <Paper key={it.label} sx={{ p: 2, bgcolor: '#111B38', border: `1px solid ${C.border}`, borderRadius: 2, textAlign: 'center' }}>
          {it.icon && (
            <Box sx={{
              width: 36, height: 36, borderRadius: 2, mx: 'auto', mb: 1.25,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              background: it.grad ?? GRAD.blue,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}>
              {it.icon}
            </Box>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{it.label}</Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, color: it.color ?? C.ink }}>{it.value}</Typography>
        </Paper>
      ))}
    </Box>
  );
}


const FaqItem = ({ q, a }: { q: string; a: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  return (
    <Paper onClick={() => setOpen(o => !o)}
      sx={{ p: 2.5, bgcolor: '#111B38', border: `1px solid ${C.border}`, borderRadius: 2, cursor: 'pointer',
            transition: 'border-color 0.15s', '&:hover': { borderColor: 'rgba(255,255,255,0.3)' } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>{q}</Typography>
        <Typography sx={{ color: C.blue, fontSize: 20, lineHeight: 1, flexShrink: 0, fontWeight: 300 }}>{open ? '−' : '+'}</Typography>
      </Box>
      {open && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1.5, lineHeight: 1.8, color: C.slate }}>{a}</Typography>
      )}
    </Paper>
  );
};

export default function DocsPage() {
  const [active, setActive] = useState('overview');

  // Scroll-spy for the "On this page" nav: whichever section currently crosses
  // the reading band near the top of the viewport becomes active. Driven by
  // IntersectionObserver rather than scroll events, so it works regardless of
  // how the page is scrolled (Lenis smooth-scroll included).
  useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        // Multiple sections can cross the band at once — highlight the first
        // in document order so the nav follows reading order.
        const current = SECTIONS.find(s => visible.has(s.id));
        if (current) setActive(current.id);
      },
      // Band: from just under the sticky header down to 35% of the viewport.
      { rootMargin: '-120px 0px -65% 0px', threshold: 0 },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    // The last section (FAQ — mostly collapsed rows) can be too short to ever
    // reach the reading band: the page bottoms out first. When scrolled to
    // (near) the bottom, the last entry wins outright.
    const onScroll = () => {
      const doc = document.documentElement;
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 80) {
        setActive(SECTIONS[SECTIONS.length - 1].id);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0B1226', color: 'text.primary' }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, sm: 3 }, py: 5, display: 'flex', gap: 5 }}>

        {/* Sticky sidebar nav */}
        <Box component="aside" sx={{ display: { xs: 'none', lg: 'block' }, width: 200, flexShrink: 0 }}>
          <Box sx={{ position: 'sticky', top: 130 }}>
            <Typography variant="caption" sx={{ color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, display: 'block', mb: 1.5, px: 1.5, fontSize: 10.5 }}>
              On this page
            </Typography>
            {SECTIONS.map(s => (
              <Box key={s.id} component="a" href={`#${s.id}`}
                onClick={() => setActive(s.id)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.25,
                  px: 1.5, py: 0.875, mb: 0.25, borderRadius: 1.5, textDecoration: 'none',
                  fontSize: 13.5, lineHeight: 1,
                  bgcolor: active === s.id ? 'rgba(110,139,255,0.16)' : 'transparent',
                  color: active === s.id ? C.blue : C.slate,
                  fontWeight: active === s.id ? 600 : 400,
                  borderLeft: `2px solid ${active === s.id ? C.blue : 'transparent'}`,
                  transition: 'all 0.15s',
                  '&:hover': { color: C.ink, bgcolor: C.inner },
                  '& svg': { flexShrink: 0, opacity: active === s.id ? 1 : 0.65 },
                }}>
                {s.icon}
                {s.label}
              </Box>
            ))}
          </Box>
        </Box>

        {/* Main content */}
        <Box component="main" sx={{ flex: 1, maxWidth: 800, minWidth: 0 }}>

          {/* Page header */}
          <Box sx={{ mb: 6 }}>
            <Typography variant="h4" color="text.primary" sx={{ fontWeight: 700, mb: 1 }}>Documentation</Typography>
            <Typography variant="body2" sx={{ color: C.slate, lineHeight: 1.7 }}>
              Everything you need to understand, set up, and use the CryptoLend protocol on Hardhat testnet.
            </Typography>
          </Box>

          {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
          <Section id="overview" title="Overview">
            <P>
              CryptoLend is a decentralised lending protocol running on a local Hardhat blockchain.
              Deposit <Strong>ETH</Strong> as collateral and borrow <Strong>MockMYR</Strong> — a simulated
              ERC-20 stablecoin pegged to RM 1.00 — against your crypto holdings without selling your assets.
            </P>
            <InfoGrid items={[
              {
                label: 'Max LTV', value: '70%', color: C.blue, grad: GRAD.blue,
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 5L5 19" /><circle cx="7.5" cy="7.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" />
                  </svg>
                ),
              },
              { label: 'Annual Interest',      value: '4.8% APR',      color: C.gold, grad: GRAD.gold, icon: <TrendUpIcon size={18} /> },
              { label: 'Liq. Threshold',       value: '80% LTV',       color: C.red,   grad: GRAD.red,  icon: <AlertIcon size={18} />     },
              { label: 'Origination Fee',      value: '0.1%',          color: C.slate, grad: GRAD.teal, icon: <CashIcon size={18} />      },
              { label: 'Loan Term',            value: '90 days',       color: C.slate, grad: GRAD.blue, icon: <ClockIcon size={18} />     },
              { label: 'Liq. Penalty',         value: '10%',           color: C.red,   grad: GRAD.red,  icon: <TrendDownIcon size={18} /> },
            ]} />
            <Alert severity="warning" sx={{ borderRadius: 2, fontSize: 13 }}>
              <strong>Testnet only.</strong> All MYR tokens are mock ERC-20s with no real-world value. Never connect a wallet holding real funds.
            </Alert>
          </Section>

          {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
          <Section id="how-it-works" title="How It Works">
            <P>The full lifecycle of a loan has five stages:</P>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <StepCard n="1" title="Complete KYC" desc="Submit identity verification through the KYC page. An admin reviews and approves your submission, setting an on-chain flag that allows you to borrow." />
              <StepCard n="2" title="Deposit ETH Collateral" desc="Send ETH to the CryptoLoan contract. Your ETH is locked and determines your borrowing power. You can top up collateral at any time." />
              <StepCard n="3" title="Borrow MYR" desc="Request MockMYR tokens up to 70% of your collateral value. The contract mints MYR directly to your MetaMask wallet." sub="Requires an approved KYC on-chain." />
              <StepCard n="4" title="Repay Loan" desc="Approve the contract to spend your MYR, then repay principal + accrued interest. Repaying does not require KYC." sub="Two MetaMask confirmations: ERC-20 approve → repay." />
              <StepCard n="5" title="Withdraw Collateral" desc="Once your debt is fully cleared, withdraw your ETH collateral back to your wallet. Partial withdrawals are allowed as long as LTV stays within limits." />
            </Box>
            <Alert severity="info" sx={{ borderRadius: 2, fontSize: 13 }}>
              Need MYR to repay but don&apos;t have enough? Use the <strong>Buy MYR</strong> tab to purchase MockMYR directly with ETH at the current on-chain exchange rate.
            </Alert>
          </Section>

          {/* ── KYC ──────────────────────────────────────────────────────────── */}
          <Section id="kyc" title="KYC Verification" badge="Required to borrow">
            <P>
              Borrowing requires a completed Know-Your-Customer (KYC) check. The KYC flag is stored
              both in the database and on-chain inside the <InlineCode>CryptoLoan</InlineCode> contract.
            </P>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {[
                { step: '1', title: 'Submit application', desc: 'Fill in the 5-step KYC form: personal info, address, financial declaration, document photos (MyKad front & back), and review.' },
                { step: '2', title: 'Admin review',       desc: 'The admin panel shows pending submissions with uploaded photos. The admin clicks "Approve" to trigger the on-chain approval.' },
                { step: '3', title: 'On-chain approval',  desc: 'The server calls setKycApproved(wallet, true) via the owner private key. After this, the wallet can call borrow().' },
              ].map(s => (
                <Paper key={s.step} sx={{ display: 'flex', gap: 2, p: 2, bgcolor: '#111B38', border: `1px solid ${C.border}`, borderRadius: 2 }}>
                  <Chip label={`Step ${s.step}`} size="small" sx={{ bgcolor: C.inner, color: C.slate, fontSize: 11, height: 22, flexShrink: 0, mt: 0.25 }} />
                  <Box>
                    <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600, mb: 0.25 }}>{s.title}</Typography>
                    <Typography variant="caption" sx={{ color: C.slate, lineHeight: 1.7 }}>{s.desc}</Typography>
                  </Box>
                </Paper>
              ))}
            </Box>
            <Alert severity="info" sx={{ borderRadius: 2, fontSize: 13 }}>
              If the Hardhat node is restarted and on-chain state is wiped, the system automatically re-syncs your on-chain KYC from the database — you do not need to resubmit.
            </Alert>
          </Section>

          {/* ── COLLATERAL & LTV ─────────────────────────────────────────────── */}
          <Section id="collateral" title="Collateral &amp; LTV">
            <P>
              LTV (Loan-to-Value) measures how much you have borrowed relative to your locked collateral.
              The protocol enforces a <Strong>70% maximum LTV</Strong>. If ETH price falls and your LTV
              breaches the liquidation threshold of 80%, the position becomes eligible for liquidation.
            </P>
            <CodeBlock>{`Collateral value (MYR)  = ETH deposited × on-chain ETH price
Max borrow (MYR)        = Collateral value × 70%
Current LTV             = Borrowed MYR ÷ Collateral value × 100%
Health Factor           = (Collateral value × 80%) ÷ Total debt`}</CodeBlock>
            <Alert severity="info" sx={{ borderRadius: 2, fontSize: 13 }}>
              Per-asset LTV limits, liquidation thresholds, and live prices are listed on the{' '}
              <Box component="a" href="/markets" sx={{ color: '#6E8BFF', fontWeight: 600 }}>Markets</Box> page.
            </Alert>
            <Alert severity="warning" sx={{ borderRadius: 2, fontSize: 13 }}>
              The on-chain ETH price is set by the deploy script (default <strong>RM 18,000</strong>). The live CoinGecko price shown in the navbar is for reference only — borrow limits use the contract price.
            </Alert>
          </Section>

          {/* ── HEALTH FACTOR ────────────────────────────────────────────────── */}
          <Section id="health" title="Health Factor">
            <P>
              The health factor (HF) summarises the safety of your position as a single number.
              It is calculated from your collateral value, outstanding debt, and the liquidation threshold.
              A position is safe above <Strong>1.5</Strong> and at risk of liquidation below <Strong>1.0</Strong>.
            </P>
            <CodeBlock>{`Health Factor = (Collateral × ETH price × Liquidation threshold%) ÷ Total debt

Example (ETH = RM 18,000, threshold = 80%):
  Deposited  : 1 ETH  →  RM 18,000 collateral value
  Borrowed   : RM 9,000
  HF         = (18,000 × 80%) ÷ 9,000 = 14,400 ÷ 9,000 = 1.60  →  Moderate`}</CodeBlock>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
              {[
                { range: 'HF ≥ 2.0',   label: 'Safe',     desc: 'Well-collateralised. You can borrow more or withdraw some ETH.',       c: C.teal },
                { range: '1.5 – 2.0',  label: 'Moderate', desc: 'Buffer is thinning. Consider adding collateral or repaying some debt.', c: C.gold },
                { range: 'HF < 1.0',   label: 'At Risk',  desc: 'Position may be liquidated at any time. Act immediately.',              c: C.red  },
              ].map(h => (
                <Paper key={h.range} sx={{ p: 2, bgcolor: `${h.c}08`, border: `1px solid ${h.c}33`, borderRadius: 2, textAlign: 'center' }}>
                  <Typography variant="body2" sx={{ color: h.c, fontWeight: 700, mb: 0.25 }}>{h.label}</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: C.ink, display: 'block', mb: 0.75 }}>{h.range}</Typography>
                  <Typography variant="caption" sx={{ color: C.slate, lineHeight: 1.6 }}>{h.desc}</Typography>
                </Paper>
              ))}
            </Box>
            <Alert severity="error" sx={{ borderRadius: 2, fontSize: 13 }}>
              Keep your health factor above <strong>1.5</strong> at all times. ETH price drops can push your HF below 1.0 without any action on your part.
            </Alert>
          </Section>

          {/* ── BUY MYR ──────────────────────────────────────────────────────── */}
          <Section id="buy-myr" title="Buy MYR" badge="New">
            <P>
              The <Strong>Buy MYR</Strong> tab lets you purchase MockMYR tokens directly with ETH at the
              current on-chain exchange rate. This is useful when you need MYR to repay a loan but
              your wallet balance is insufficient.
            </P>
            <CodeBlock>{`ETH cost formula:
  ethNeeded = (myrAmount × 1e18) ÷ (ethPrice × 1e6)

Example (ETH price = RM 18,000):
  To buy RM 500 MYR  →  500 ÷ 18,000 ≈ 0.02778 ETH
  (a 0.1% buffer is added automatically to cover rounding)`}</CodeBlock>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {[
                { icon: '1', title: 'Enter MYR amount',       desc: 'Type how much MYR you want to buy. The UI instantly shows the required ETH cost at the current rate.' },
                { icon: '2', title: 'Confirm in MetaMask',    desc: 'A single payable transaction is sent to buyMYR(). MetaMask will show the ETH value being sent.' },
                { icon: '3', title: 'MYR lands in wallet',    desc: 'The contract mints MockMYR to your address and refunds any ETH overpayment. Your balance updates automatically.' },
              ].map(s => (
                <Paper key={s.icon} sx={{ display: 'flex', gap: 2, p: 2, bgcolor: '#111B38', border: `1px solid ${C.border}`, borderRadius: 2 }}>
                  <Box sx={{ width: 30, height: 30, borderRadius: '50%', bgcolor: C.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Typography sx={{ color: 'white', fontSize: 13, fontWeight: 700 }}>{s.icon}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600, mb: 0.25 }}>{s.title}</Typography>
                    <Typography variant="caption" sx={{ color: C.slate, lineHeight: 1.7 }}>{s.desc}</Typography>
                  </Box>
                </Paper>
              ))}
            </Box>
            <Alert severity="info" sx={{ borderRadius: 2, fontSize: 13 }}>
              The <strong>Repay</strong> tab shows an &quot;Insufficient MYR&quot; warning with your exact shortfall and a one-click button that pre-fills the Buy MYR tab with the amount you need.
            </Alert>
          </Section>

          {/* ── INTEREST & FEES ──────────────────────────────────────────────── */}
          <Section id="interest" title="Interest &amp; Fees">
            <P>
              Interest accrues continuously from the moment you borrow. The protocol charges a flat
              origination fee on new borrows and a variable APR on the outstanding principal.
            </P>
            <CodeTable />
            <CodeBlock>{`Daily interest   = Principal × (4.8% ÷ 365)
Accrued interest = Daily interest × days elapsed

Repay amount today = Principal + accrued interest

Example (RM 10,000 borrowed for 30 days):
  Daily interest   = 10,000 × (0.048 ÷ 365) ≈ RM 1.315 / day
  After 30 days    = 10,000 + (1.315 × 30)   ≈ RM 10,039.45`}</CodeBlock>
            <Alert severity="info" sx={{ borderRadius: 2, fontSize: 13 }}>
              You can repay any amount at any time — partial repayments reduce your principal and lower future interest. There is no early repayment penalty.
            </Alert>
          </Section>

          {/* ── LOCAL SETUP ──────────────────────────────────────────────────── */}
          {/* <Section id="setup" title="Local Setup">
            <P>Follow these steps to run the full stack locally. You need three separate terminal windows.</P>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { n: 1, title: 'Start Hardhat node',         sub: 'Terminal 1 — keep this running.',   code: CODE.hardhatNode },
                { n: 2, title: 'Deploy smart contracts',     sub: 'Terminal 2 — run after node starts.', code: CODE.deployLocal },
                { n: 3, title: 'Start Next.js dev server',   sub: 'Terminal 3.',                         code: CODE.devServer   },
              ].map(s => (
                <Box key={s.n}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: C.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Typography sx={{ color: 'white', fontSize: 12, fontWeight: 700 }}>{s.n}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600, lineHeight: 1 }}>{s.title}</Typography>
                      <Typography variant="caption" sx={{ color: C.muted }}>{s.sub}</Typography>
                    </Box>
                  </Box>
                  <CodeBlock>{s.code}</CodeBlock>
                </Box>
              ))}
            </Box>

            <Box>
              <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600, mb: 1, mt: 1 }}>4. Add Hardhat network to MetaMask</Typography>
              <CodeBlock>{`Network name : Hardhat Local\nNew RPC URL  : ${CODE.metamaskRPC}\nChain ID     : ${CODE.chainId}\nCurrency     : ETH`}</CodeBlock>
            </Box>

            <P>
              Import one of the Hardhat test accounts using a private key printed when you run{' '}
              <InlineCode>npm run chain</InlineCode>. Each account starts with <Strong>10,000 ETH</Strong>.
              The <strong>first account</strong> is the contract owner and cannot be used as a borrower.
            </P>
            <Alert severity="success" sx={{ borderRadius: 2, fontSize: 13 }}>
              The deploy script automatically writes contract addresses to <InlineCode>src/lib/contractConfig.ts</InlineCode>. You never need to copy addresses manually — just redeploy and refresh the browser.
            </Alert>
          </Section> */}

          {/* ── SMART CONTRACTS ────────────────────────────────────────────────
          <Section id="contracts" title="Smart Contracts">
            <P>Two contracts are deployed on the local Hardhat node:</P>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                {
                  name: 'CryptoLoan.sol',
                  badge: 'Main contract',
                  badgeColor: C.blue,
                  desc: 'Accepts ETH collateral, enforces KYC and LTV limits, mints MockMYR on borrow, accepts MockMYR on repay, and sells MYR for ETH via buyMYR().',
                  fns: ['depositCollateral()', 'borrow(uint256)', 'repay(uint256)', 'buyMYR(uint256)', 'withdrawCollateral(uint256)', 'getLoanInfo(address)', 'setEthPrice(uint256)', 'setKycApproved(address,bool)'],
                },
                {
                  name: 'MockMYR.sol',
                  badge: 'ERC-20 token',
                  badgeColor: C.teal,
                  desc: 'Simulated Malaysian Ringgit stablecoin. Only CryptoLoan (the minter) can mint tokens. Standard ERC-20 approve/transfer are available to users.',
                  fns: ['mint(address,uint256)', 'approve(address,uint256)', 'balanceOf(address)', 'transfer(address,uint256)', 'transferFrom(...)'],
                },
              ].map(c => (
                <Paper key={c.name} sx={{ p: 2.5, bgcolor: '#111B38', border: `1px solid ${C.border}`, borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <Typography variant="body2" color="text.primary" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{c.name}</Typography>
                    <Chip label={c.badge} size="small"
                      sx={{ bgcolor: `${c.badgeColor}15`, color: c.badgeColor, fontWeight: 600, fontSize: 10.5, height: 20 }} />
                  </Box>
                  <Typography variant="caption" sx={{ color: C.slate, display: 'block', mb: 1.5, lineHeight: 1.7 }}>{c.desc}</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {c.fns.map(fn => (
                      <Chip key={fn} label={fn} size="small"
                        sx={{ bgcolor: C.inner, color: C.blue, fontFamily: 'monospace', fontSize: 11, height: 22 }} />
                    ))}
                  </Box>
                </Paper>
              ))}
            </Box>
            <Alert severity="info" sx={{ borderRadius: 2, fontSize: 13 }}>
              To interact with contracts directly: <InlineCode>npx hardhat console --network localhost</InlineCode>, then use the ABI from <InlineCode>contractConfig.ts</InlineCode>.
            </Alert>
          </Section> */}

          {/* ── FAQ ──────────────────────────────────────────────────────────── */}
          <Section id="faq" title="FAQ">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {[
                {
                  q: 'Why do I need to run the deploy script every time?',
                  a: 'Each Hardhat node restart wipes all contract state and generates fresh addresses. Run `npm run chain` then `npm run deploy:local` — the deploy script regenerates contractConfig.ts automatically.',
                },
                {
                  q: 'Why does repay require two MetaMask confirmations?',
                  a: 'MockMYR is an ERC-20 token. Before the CryptoLoan contract can pull MYR from your wallet, you must first grant it an allowance (the "approve" step). This is standard ERC-20 behaviour — the same flow used by Uniswap, Aave, and every DeFi protocol.',
                },
                {
                  q: 'Can I borrow more than 70% LTV?',
                  a: 'No. The contract enforces the limit on-chain and will revert with "Exceeds max LTV" if you try. The UI also disables the borrow button when the requested amount would breach 70%.',
                },
                {
                  q: 'What happens if I don\'t repay before maturity?',
                  a: 'The 90-day loan term is informational — there is no automatic penalty at maturity in the current testnet build. Interest continues to accrue daily until you repay. In a production deployment a liquidation bot would monitor positions and liquidate at-risk loans.',
                },
                {
                  q: 'Why is my KYC dialog appearing even though I\'m already verified?',
                  a: 'This was a race condition between the on-chain read and the database check. Both happen in parallel when the wallet connects; if the chain read resolved first, kycApproved was momentarily false. This is fixed: the dialog now waits for both the chain read and the DB check to complete.',
                },
                {
                  q: 'What is the exchange rate when buying MYR?',
                  a: 'The rate is set by the on-chain ETH price in the contract (default RM 18,000 / ETH, set at deploy time). The live CoinGecko price in the navbar is for display only. A 0.1% buffer is added to the ETH cost to cover integer rounding.',
                },
                {
                  q: 'Why can\'t I access Portfolio or Settings?',
                  a: 'Those pages require a connected MetaMask wallet. Once you click "Connect Wallet" and MetaMask is on the Hardhat Local network, the sidebar unlocks automatically. Admin-only pages additionally require an admin JWT session.',
                },
                {
                  q: 'How do I update the ETH price used for loan calculations?',
                  a: 'The contract owner calls setEthPrice(uint256) — for example via the Hardhat console: `npx hardhat console --network localhost`, then `const c = await ethers.getContractAt("CryptoLoan", "<address>"); await c.setEthPrice(20000);` to set RM 20,000 / ETH.',
                },
              ].map(item => <FaqItem key={item.q} q={item.q} a={item.a} />)}
            </Box>
          </Section>

        </Box>
      </Box>
    </Box>
  );
}

function CodeTable() {
  return (
    <TableContainer component={Paper} sx={{ bgcolor: 'transparent', border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {['Fee / Rate', 'Value', 'When charged'].map(h => (
              <TableCell key={h} sx={{ color: 'rgba(255,255,255,0.65)', bgcolor: '#0F1730', fontSize: 12, fontWeight: 600 }}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {[
            ['Annual Interest (APR)',  '4.8%',     'Accrues continuously on borrowed principal'],
            ['Origination Fee',        '0.1%',     'Charged once when a borrow is issued'],
            ['Liquidation Penalty',    '10%',      'Applied to collateral seized during liquidation'],
            ['Repayment',             'None',      'No early repayment or prepayment penalty'],
          ].map(([fee, val, when], i) => (
            <TableRow key={i} sx={{ '&:last-child td': { border: 0 } }}>
              <TableCell sx={{ color: '#F2F5FF', fontWeight: 500 }}>{fee}</TableCell>
              <TableCell sx={{ color: '#6E8BFF', fontWeight: 600 }}>{val}</TableCell>
              <TableCell sx={{ color: 'rgba(255,255,255,0.65)' }}>{when}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
