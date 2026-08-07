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
  { id: 'maturity',    label: 'Loan Term & Liquidation', icon: <ClockIcon size={16} /> },
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
              { label: 'APR (locked at borrow)', value: '3–15%',        color: C.gold,  grad: GRAD.gold, icon: <TrendUpIcon size={18} /> },
              { label: 'Liq. Threshold',       value: '80% LTV',       color: C.red,   grad: GRAD.red,  icon: <AlertIcon size={18} />     },
              { label: 'Loan Terms',           value: '1–12 months',   color: C.slate, grad: GRAD.blue, icon: <ClockIcon size={18} />     },
              { label: 'Grace Period',         value: '7 days',        color: C.slate, grad: GRAD.teal, icon: <CashIcon size={18} />      },
              { label: 'Liquidator Bonus',     value: '5%',            color: C.red,   grad: GRAD.red,  icon: <TrendDownIcon size={18} /> },
              { label: 'Late Penalty (overdue)', value: '5%',          color: C.red,   grad: GRAD.red,  icon: <AlertIcon size={18} />     },
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
              <StepCard n="3" title="Borrow MYR for a fixed term" desc="Pick a term (1, 3, 6 or 12 months) and borrow up to 70% of your collateral value. Each borrow is its own loan with its own due date, and the APR shown is locked into that loan for its whole life. The contract mints MYR directly to your MetaMask wallet." sub="Requires an approved KYC on-chain." />
              <StepCard n="4" title="Repay before the due date" desc="Approve the contract to spend your MYR, then repay that loan's principal + its accrued interest. Repay early anytime with no penalty. After the due date a 7-day grace period runs; past it, the loan can be liquidated even if your collateral is healthy." sub="Two MetaMask confirmations: ERC-20 approve → repay." />
              <StepCard n="5" title="Withdraw Collateral" desc="Once your debt is fully cleared, withdraw your ETH collateral back to your wallet. Partial withdrawals are allowed as long as LTV stays within limits." />
            </Box>
            <CodeBlock>{`Deposit collateral
      ↓
Borrow for a fixed term (due date set on-chain)
      ↓
Interest accumulates daily at the loan's locked APR
      ↓
Repay before the due date (or within the 7-day grace period)
      ↓
Collateral unlocked — withdraw or borrow again`}</CodeBlock>
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
            <CodeBlock>{`Health Factor = (Collateral Value × Liquidation Threshold)
                ÷ (Total Debt + Accrued Interest)

Example (ETH = RM 18,000, threshold = 80%):
  Deposited  : 1 ETH  →  RM 18,000 collateral value
  Borrowed   : RM 9,000 (+ RM 20 accrued interest)
  HF         = (18,000 × 80%) ÷ 9,020 = 14,400 ÷ 9,020 = 1.60  →  Moderate

HF > 1  : Safe
HF = 1  : Warning level
HF < 1  : Liquidatable`}</CodeBlock>
            <P>
              Your health factor changes mainly for two reasons: the <Strong>ETH price moves</Strong>{' '}
              (collateral value falls → HF falls), and <Strong>interest keeps accruing</Strong>{' '}
              (debt grows → HF falls slowly even if the price never moves).
            </P>
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

          {/* ── LOAN TERM & LIQUIDATION ──────────────────────────────────────── */}
          <Section id="maturity" title="Loan Term &amp; Liquidation">
            <P>
              Every borrow is a <Strong>fixed-term loan</Strong>. You choose the term when you borrow
              (1, 3, 6 or 12 months) and the contract stamps a real on-chain <Strong>due date</Strong> on
              the loan. After the due date, a <Strong>7-day grace period</Strong> gives you extra time to
              repay — interest keeps accruing through it — and only once THAT ends does the loan become
              liquidatable for lateness.
            </P>
            <CodeBlock>{`Borrow created
      ↓
Loan active                     (repay early anytime, no penalty)
      ↓
Due date reached                (loan term ends)
      ↓
7-day grace period              (last chance to repay)
      ↓
Eligible for liquidation if still unpaid

Example:
  Borrowed          : 1 August 2026 (2-month term)
  Due date          : 1 October 2026
  Grace period until: 8 October 2026
  Liquidation       : possible after 8 October 2026`}</CodeBlock>
            <P>There are exactly <Strong>two</Strong> ways a loan can be liquidated:</P>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              {[
                {
                  title: '1 · Collateral unsafe (price crash)',
                  desc: 'ETH price drops → collateral value drops → health factor falls below 1.0. Example: ETH falls from RM 10,000 to RM 5,000 and your HF goes 1.5 → 0.8. Any of your loans can then be liquidated, at any time — this is the classic DeFi risk and has nothing to do with dates.',
                },
                {
                  title: '2 · Loan overdue (maturity)',
                  desc: 'The loan reaches its due date, the 7-day grace period passes, and it still isn’t repaid. That one loan becomes liquidatable even if your collateral is perfectly healthy, and a 5% late penalty is added to what you owe. Your other, on-time loans are not affected.',
                },
              ].map(x => (
                <Paper key={x.title} sx={{ p: 2, bgcolor: '#111B38', border: `1px solid ${C.red}30`, borderRadius: 2 }}>
                  <Typography variant="body2" sx={{ color: C.red, fontWeight: 700, mb: 0.75 }}>{x.title}</Typography>
                  <Typography variant="caption" sx={{ color: C.slate, lineHeight: 1.7 }}>{x.desc}</Typography>
                </Paper>
              ))}
            </Box>
            <P>
              Liquidation is <Strong>proportional, never total</Strong>: the liquidator repays your debt
              and takes only enough ETH to cover what they repaid plus a 5% bonus. Whatever collateral is
              left over stays yours. Example: you owe RM 10,500 against 2 ETH worth RM 20,000 — the
              liquidator takes ≈ RM 11,025 worth of ETH and the remaining ≈ RM 8,975 worth stays in your
              account, withdrawable once your remaining debt allows.
            </P>
            <P>
              Two parties can act on an eligible loan, and the difference matters to you.
              Anyone holding MYR can <Strong>liquidate</Strong> it on the open market: they repay
              your debt and take the collateral plus their 5% bonus, exactly as above. Separately,
              the protocol itself can <Strong>recover</Strong> the loan — an administrator deducts
              collateral directly to settle the debt, with no MYR involved and no action needed from
              you. Recovery is what happens when a loan is left in default and nobody has stepped in
              to liquidate it.
            </P>
            <P>
              <Strong>The 5% late penalty applies only to the overdue path.</Strong> A loan recovered
              because its health factor fell below 1 pays no penalty — a price crash is not
              delinquency. A loan recovered for running past its due date and grace period pays the
              penalty on top of its debt, and the collateral deducted covers both.
            </P>
            <CodeBlock>{`Overdue recovery — worked example

  Outstanding debt          RM 10,000.00
  Late penalty (5%)         RM    500.00
                            ─────────────
  Total collected           RM 10,500.00

  ETH price (on-chain)      RM 10,000 / ETH
  Collateral deducted       1.0500 ETH
  Your remaining collateral stays yours and is withdrawable`}</CodeBlock>
            <P>
              Your debt is always settled <Strong>before</Strong> the penalty. If your collateral is
              not enough to cover both, the protocol gives up its penalty rather than increasing what
              you owe — you will never end a recovery owing more than you did before it. Every
              recovery is recorded on-chain and in the platform&apos;s audit log.
            </P>
            <Alert severity="info" sx={{ borderRadius: 2, fontSize: 13 }}>
              Fully repaying a loan marks it inactive on-chain — it can no longer be liquidated or
              recovered for any reason, no late penalty can be charged on it, and its share of your
              collateral is freed for withdrawal. Repaying at any point before the grace period ends
              avoids the penalty completely.
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
              Interest starts accruing from the day you borrow — the borrow day itself is charged — and
              then steps up once per calendar day (Malaysia midnight, UTC+8), not per second. Each loan
              is priced individually: the APR quoted at borrow time is <Strong>locked into that loan</Strong>{' '}
              for its whole life. Later market moves change the rate for <em>new</em> borrows only.
            </P>
            <CodeTable />
            <CodeBlock>{`APR for a NEW borrow = 3.0% base rate
                     + up to 4.0% utilization premium (how full the pool is)
                     … locked into the loan the moment you borrow (max 15%)

Accrued Interest = Principal × APR × elapsed time
                 = Principal × (APR ÷ 365) × whole days since borrow / last repay

  Principal    : what you still owe on THIS loan
  APR          : the rate locked at borrow — fixed for the loan's life
  Elapsed time : whole calendar days since this loan's clock last reset

Repay amount today = Principal + accrued interest (per loan)

Example (RM 10,000 borrowed for 30 days at 4.8% locked APR):
  Daily interest   = 10,000 × (0.048 ÷ 365) ≈ RM 1.315 / day
  After 30 days    = 10,000 + (1.315 × 30)   ≈ RM 10,039.45`}</CodeBlock>
            <P>
              Your repayment amount grows over time because interest keeps accumulating daily until the
              moment you repay. Repaying resets that loan&apos;s interest clock; interest is always charged
              before principal, so a payment smaller than the accrued interest doesn&apos;t reduce your
              principal at all.
            </P>
            <Alert severity="info" sx={{ borderRadius: 2, fontSize: 13 }}>
              You can repay any amount at any time before (or during) the grace period — partial repayments reduce that loan&apos;s principal and lower its future interest. There is no early repayment penalty.
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
                  q: 'How does CryptoLend work, end to end?',
                  a: 'Deposit ETH collateral → borrow MYR for a fixed term (1/3/6/12 months) → interest accumulates daily at the APR locked into that loan → repay before the due date (or within the 7-day grace period) → your collateral is unlocked to withdraw or borrow against again. Each borrow is its own on-chain loan with its own principal, rate, due date and interest clock.',
                },
                {
                  q: 'How does interest work? What is APR?',
                  a: 'APR is the yearly interest rate used to calculate borrowing costs. When you borrow, the current rate (3% base + a utilization premium) is locked into that loan for its whole life. Interest starts on the borrow day itself and steps up once per calendar day: Accrued Interest = Principal × APR × elapsed days ÷ 365. Your repayment amount grows over time because this interest keeps accumulating until the moment you repay.',
                },
                {
                  q: 'Why does my repayment amount change over time?',
                  a: 'The amount to settle a loan is its remaining principal plus its accrued interest, and the interest part grows every day the loan is open. Repaying resets that loan\'s interest clock. Interest is always charged before principal, so a payment smaller than the accrued interest will not reduce your principal at all.',
                },
                {
                  q: 'What is the Health Factor and why does it change?',
                  a: 'Health Factor = (Collateral Value × 80% liquidation threshold) ÷ (Total Debt + Accrued Interest). Above 1 is safe, 1 is the warning level, and below 1 your collateral can be liquidated. It changes mainly because the ETH price moves (collateral value falls → HF falls) and because interest keeps growing your debt.',
                },
                {
                  q: 'When can my loan be liquidated?',
                  a: 'In exactly two scenarios. (1) ETH price crash: your collateral value drops until the health factor falls below 1 — e.g. ETH halves and your HF goes 1.5 → 0.8 — and any of your loans can be liquidated at any time. (2) Loan overdue: a loan passes its due date, the 7-day grace period ends, and it still is not repaid — that loan becomes liquidatable even if your collateral is perfectly healthy.',
                },
                {
                  q: 'What is the grace period?',
                  a: 'The grace period provides additional repayment time after the loan maturity date before liquidation becomes possible. On CryptoLend it is 7 days, enforced by the smart contract. Interest continues to accrue during it — it is a shield against being liquidated the second your term ends, not a free extension.',
                },
                {
                  q: 'What happens if I repay late? Is there a penalty?',
                  a: 'Interest keeps accruing daily past the due date, so a late loan costs more every day. There is no penalty while you are inside the 7-day grace period — repay any time before it ends and you owe only principal plus interest. Once the grace period expires the loan is in default and a 5% late penalty is added on top of the debt. That penalty applies only to the overdue path: a loan acted on because its health factor fell below 1 pays no penalty, because a price crash is not delinquency.',
                },
                {
                  q: 'Can an administrator deduct my collateral?',
                  a: 'Yes, in the two cases the smart contract allows: your health factor has fallen below 1, or your loan has passed its due date plus the 7-day grace period. In either case an administrator can recover the loan, which deducts collateral directly to settle the debt (plus the 5% late penalty when it is a default). No MYR is involved and no approval from you is required — the on-chain rules are the authorisation. Only what is needed is taken, your debt is always settled before any penalty, and whatever collateral remains afterwards stays yours and is withdrawable. Every recovery is written to the audit log.',
                },
                {
                  q: 'What happens to my collateral during liquidation?',
                  a: 'Only enough is taken to cover the debt being repaid plus a 5% liquidator bonus — never automatically all of it. Example: RM 10,500 owed against 2 ETH worth RM 20,000 — about RM 11,025 worth of ETH is seized and the rest stays yours. If your collateral is not enough to cover everything, the protocol absorbs the shortfall rather than increasing your debt. Collateral is required in the first place because MYR is lent against it: it is what guarantees the debt when a borrower walks away.',
                },
                {
                  q: 'What happens when I fully repay a loan?',
                  a: 'The loan is marked inactive on-chain: it stops accruing interest, can no longer be liquidated for any reason, and its share of your collateral becomes withdrawable. Repayment must cover the loan\'s principal plus all accrued interest — the app re-quotes the exact figure from the contract when you confirm, so nothing is left behind. Collateral stays deposited (earning supply interest) until you withdraw it yourself.',
                },
                {
                  q: 'Why does repay require two MetaMask confirmations?',
                  a: 'MockMYR is an ERC-20 token. Before the CryptoLoan contract can pull MYR from your wallet, you must first grant it an allowance (the "approve" step). This is standard ERC-20 behaviour — the same flow used by Uniswap, Aave, and every DeFi protocol.',
                },
                {
                  q: 'Can I borrow more than 70% LTV?',
                  a: 'No. The contract enforces the limit on-chain and will revert with "Exceeds max LTV" if you try. The limit applies to the SUM of all your active loans against your one collateral pot. The UI also disables the borrow button when the requested amount would breach 70%.',
                },
                {
                  q: 'What is the exchange rate when buying MYR?',
                  a: 'The rate is set by the on-chain ETH price in the contract (set at deploy time and kept in sync with the market by the price keeper). The live CoinGecko price in the navbar is for display only. A 0.1% buffer is added to the ETH cost to cover integer rounding.',
                },
                {
                  q: 'Why can\'t I access Portfolio or Settings?',
                  a: 'Those pages require a connected MetaMask wallet. Once you click "Connect Wallet" and MetaMask is on the Hardhat Local network, the sidebar unlocks automatically. Admin-only pages additionally require an admin JWT session.',
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
            ['Annual Interest (APR)',  '3–15%, locked at borrow', 'Base 3% + utilization premium at borrow time; fixed for the loan\'s life, accrues daily'],
            ['Origination Fee',        'None (0%)', 'Nothing is deducted from a borrow — you receive the full amount'],
            ['Liquidator Bonus',       '5%',       'Extra collateral a liquidator receives on top of the debt they cover'],
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
