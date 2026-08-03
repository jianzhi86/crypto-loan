'use client';

import Image from 'next/image';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import MarketingHeader from '@/components/MarketingHeader';
import TextScramble from '@/components/TextScramble';
import FaqAccordion from '@/components/FaqAccordion';
import CtaButton from '@/components/CtaButton';
import FadeInSection from '@/components/FadeInSection';
import { BankIcon, BoltIcon, LockIcon, RefreshIcon, ShieldIcon, TrendDownIcon } from '@/components/Icons';

const C = {
  bg: '#F4F6F8',
  surface: '#FFFFFF',
  raised: '#EEF1F5',
  line: '#E2E7EE',
  rule: '#D7DEE6',
  indigo: '#2A3FD6',
  indigoHi: '#4458E8',
  up: '#0E9F6E',
  down: '#E5484D',
  ink: '#10151C',
  slate: '#5A6675',
  mute: '#8B96A5',
};
const DISPLAY = 'var(--font-display), system-ui, sans-serif';

const HERO_PHRASES = [
  'Borrow ringgit, not your future.',
  'Keep your crypto. Unlock its value.',
  'Spend cash without selling.',
  'Your assets stay yours.',
];

// Protocol figures, read like a bank statement.
const STATEMENT = [
  { label: 'Total value locked', value: 'RM 24,180,000', note: 'across all collateral' },
  { label: 'Active loans', value: '1,842', note: 'borrowing right now' },
  { label: 'Total borrowed', value: 'RM 14,420,000', note: '59.6% utilised' },
  { label: 'Base borrow rate', value: 'From 3.00% APR', note: 'Variable · ETH collateral' },
];

const FEATURES = [
  { icon: <LockIcon size={22} />, title: 'Keep your crypto', body: 'Borrow against ETH, BTC, SOL and more — your collateral is never sold, so you keep all the upside.' },
  { icon: <TrendDownIcon size={22} />, title: 'Rates from 3.0% APR', body: 'Variable rates that track market conditions, with no hidden fees. Pay only for the days you borrow.' },
  { icon: <BoltIcon size={22} />, title: 'No credit checks', body: 'Your crypto is your credit. Get an instant decision based on collateral, not paperwork or a credit score.' },
  { icon: <BankIcon size={22} />, title: 'Instant MYR via DuitNow', body: 'Receive Malaysian Ringgit straight to your bank account through DuitNow, or take it as MYRC tokens.' },
  { icon: <ShieldIcon size={22} />, title: 'Non-custodial escrow', body: 'Collateral is locked in audited smart contracts — not held by a company. You stay in control on-chain.' },
  { icon: <RefreshIcon size={22} />, title: 'Repay anytime', body: 'No fixed schedule, no early-repayment penalty. Repay whenever you like and unlock your collateral instantly.' },
];

const STEPS = [
  { n: '01', title: 'Deposit collateral', body: 'Lock your crypto into a non-custodial smart contract.' },
  { n: '02', title: 'Choose your LTV', body: 'Pick how much to borrow — up to 50–70% of your collateral.' },
  { n: '03', title: 'Receive MYR', body: 'Get ringgit via DuitNow or as MYRC tokens, in minutes.' },
  { n: '04', title: 'Repay & reclaim', body: 'Repay anytime with no penalty and unlock your assets.' },
];

const ASSETS = [
  { symbol: 'BTC', color: '#F7931A' },
  { symbol: 'ETH', color: '#627EEA' },
  { symbol: 'SOL', color: '#9945FF' },
  { symbol: 'BNB', color: '#F3BA2F' },
  { symbol: 'XRP', color: '#00AAE4' },
  { symbol: 'AVAX', color: '#E84142' },
  { symbol: 'LINK', color: '#2A5ADA' },
  { symbol: 'DOT', color: '#E6007A' },
  { symbol: 'ADA', color: '#0033AD' },
];

const FOOTER_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/markets', label: 'Markets' },
  { href: '/docs', label: 'Docs' },
  { href: '/kyc', label: 'KYC' },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography sx={{ color: C.indigo, fontSize: 12.5, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', mb: 1.5 }}>
      {children}
    </Typography>
  );
}

// The real brand mark (transparent PNG), replacing the old letter-in-a-box
// stand-in so the landing page matches the actual logo everywhere else.
function Mark({ size = 32 }: { size?: number }) {
  return <Image src="/logo-mark.png" alt="CryptoLend mark" width={size} height={size} />;
}

export default function HomeContent() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: C.bg, color: C.ink }}>
      <MarketingHeader />

      {/* ── Hero ─────────────────────────────────────────── */}
      <FadeInSection>
        <Box
          sx={{
            minHeight: { xs: 'auto', md: '85vh' },
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: -240, left: '50%', transform: 'translateX(-50%)',
              width: 1000, height: 640,
              background: 'radial-gradient(circle at 50% 0%, rgba(42,63,214,0.10), transparent 60%)',
              pointerEvents: 'none', zIndex: 0,
            },
          }}
        >
          <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1, pt: { xs: 7, md: 12 }, pb: { xs: 6, md: 9 } }}>
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 1.75, py: 0.625, borderRadius: 999, border: `1px solid ${C.line}`, bgcolor: C.surface, mb: 3 }}>
              <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: C.up }} />
              <Typography sx={{ fontSize: 12.5, color: C.slate, fontWeight: 500, letterSpacing: 0.2 }}>
                Crypto-backed loans · Malaysia
              </Typography>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.1fr 0.9fr' }, gap: { xs: 5, md: 6 }, alignItems: 'start' }}>
              {/* Left: message */}
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ height: '210px', position: 'relative', zIndex: 0 }}>

                  <Typography component="h1" sx={{ fontFamily: DISPLAY, fontSize: { xs: 38, sm: 50, md: 60 }, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-1.5px', color: C.ink }}>
                    <Box component="span" sx={{ display: 'block' }}>Cash from your crypto.</Box>
                    <Box component="span" sx={{ display: 'block', minHeight: '1.15em', color: C.indigo }}>
                      <TextScramble phrases={HERO_PHRASES} />
                    </Box>
                  </Typography>
                </Box>

                <Box sx={{ position: 'relative', zIndex: 1, backgroundColor: 'rgb(244, 246, 248)' }}>
                  <Typography sx={{ maxWidth: 520, fontSize: { xs: 16, md: 18 }, color: C.slate, lineHeight: 1.65, mb: 4 }}>
                    Borrow Malaysian Ringgit against ETH, BTC and more — without ever selling. Non-custodial,
                    instant, and built for Malaysia. Keep your upside while you unlock liquidity.
                  </Typography>

                  <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 4 }}>
                    <CtaButton href="/dashboard" variant="contained" sx={{ px: 3.5, py: 1.5, fontSize: 15.5, borderRadius: 2.5, fontWeight: 700 }}>
                      Start borrowing
                    </CtaButton>
                    <CtaButton href="/docs" variant="outlined" sx={{ px: 3.5, py: 1.5, fontSize: 15.5, borderRadius: 2.5, fontWeight: 600 }}>
                      Learn more
                    </CtaButton>
                  </Box>

                  <Box sx={{ display: 'flex', gap: { xs: 3, md: 4 }, flexWrap: 'wrap' }}>
                    {[
                      { k: '3.0%', v: 'APR from' },
                      { k: '70%', v: 'Max LTV' },
                      { k: '9+', v: 'Assets' },
                    ].map((s) => (
                      <Box key={s.v}>
                        <Typography sx={{ fontFamily: DISPLAY, color: C.ink, fontWeight: 700, fontSize: 22 }}>{s.k}</Typography>
                        <Typography sx={{ color: C.slate, fontSize: 13 }}>{s.v}</Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>

              {/* Right: the passbook — signature element */}
              <Box
                sx={{
                  bgcolor: C.surface, border: `1px solid ${C.line}`, borderRadius: 4,
                  boxShadow: '0 1px 2px rgba(16,21,28,0.04), 0 18px 48px rgba(16,21,28,0.08)',
                  overflow: 'hidden',
                  minWidth: '500px'
                }}
              >
                <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.line}`, bgcolor: C.raised }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                    <Mark size={26} />
                    <Typography sx={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 14.5, color: C.ink }}>Protocol statement</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: C.up }} />
                    <Typography sx={{ fontSize: 11.5, color: C.slate, fontWeight: 600 }}>Live</Typography>
                  </Box>
                </Box>
                <Box sx={{ px: 3, py: 1 }}>
                  {STATEMENT.map((row) => (
                    <Box key={row.label} className="ledger-row">
                      <Box>
                        <Typography sx={{ fontSize: 13.5, color: C.ink, fontWeight: 600 }}>{row.label}</Typography>
                        <Typography sx={{ fontSize: 11.5, color: C.mute }}>{row.note}</Typography>
                      </Box>
                      <Typography className="tnum" sx={{ fontSize: 16, color: C.ink, fontWeight: 600 }}>{row.value}</Typography>
                    </Box>
                  ))}
                </Box>
                <Box sx={{ px: 3, py: 1.75, borderTop: `1px solid ${C.line}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: C.raised }}>
                  <Typography sx={{ fontSize: 12, color: C.slate }}>Updated continuously · Hardhat testnet</Typography>
                  <Typography className="tnum" sx={{ fontSize: 12, color: C.up, fontWeight: 600 }}>+3.2% wk</Typography>
                </Box>
              </Box>
            </Box>
          </Container>
        </Box>
      </FadeInSection>

      {/* ── Features ─────────────────────────────────────── */}
      <FadeInSection delay={200}>
        <Container maxWidth="lg" id="features" sx={{ minHeight: { xs: 'auto', md: '85vh' }, display: 'flex', flexDirection: 'column', justifyContent: 'center', py: { xs: 7, md: 11 }, scrollMarginTop: 80 }}>
          <Box sx={{ mb: 5 }}>
            <SectionLabel>Why CryptoLend</SectionLabel>
            <Typography component="h2" sx={{ fontFamily: DISPLAY, fontSize: { xs: 28, md: 40 }, fontWeight: 700, letterSpacing: '-1px', color: C.ink, maxWidth: 620 }}>
              A smarter way to access cash
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {FEATURES.map((f) => (
              <FadeInSection key={f.title} delay={100}>
                <Box
                  key={f.title}
                  sx={{
                    bgcolor: C.surface, border: `1px solid ${C.line}`, borderRadius: 3, p: 3,
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: 'rgba(42,63,214,0.4)', boxShadow: '0 8px 24px rgba(16,21,28,0.07)', transform: 'translateY(-2px)' },
                  }}
                >
                  <Box sx={{ width: 44, height: 44, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2A3FD6', bgcolor: 'rgba(42,63,214,0.07)', border: '1px solid rgba(42,63,214,0.15)', mb: 2 }}>
                    {f.icon}
                  </Box>
                  <Typography sx={{ fontSize: 17.5, fontWeight: 700, mb: 0.75, color: C.ink }}>{f.title}</Typography>
                  <Typography sx={{ color: C.slate, fontSize: 14, lineHeight: 1.6 }}>{f.body}</Typography>
                </Box>
              </FadeInSection>
            ))}
          </Box>
        </Container>
      </FadeInSection>

      {/* ── How it works ─────────────────────────────────── */}
      <FadeInSection delay={150}>
        <Box id="how" sx={{ minHeight: { xs: 'auto', md: '80vh' }, display: 'flex', flexDirection: 'column', justifyContent: 'center', bgcolor: C.surface, borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, scrollMarginTop: 80 }}>
          <Container maxWidth="lg" sx={{ py: { xs: 7, md: 11 } }}>
            <Box sx={{ mb: 5 }}>
              <SectionLabel>How it works</SectionLabel>
              <Typography component="h2" sx={{ fontFamily: DISPLAY, fontSize: { xs: 28, md: 40 }, fontWeight: 700, letterSpacing: '-1px', color: C.ink }}>
                Borrow in four steps
              </Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 3 }}>
              {STEPS.map((s) => (
                <Box key={s.n} sx={{ pt: 2.5, borderTop: `2px solid ${C.indigo}` }}>
                  <Typography className="tnum" sx={{ fontSize: 13, fontWeight: 700, color: C.indigo, mb: 1.5, letterSpacing: 1 }}>
                    {s.n}
                  </Typography>
                  <Typography sx={{ fontSize: 17, fontWeight: 700, mb: 0.75, color: C.ink }}>{s.title}</Typography>
                  <Typography sx={{ color: C.slate, fontSize: 14, lineHeight: 1.6 }}>{s.body}</Typography>
                </Box>
              ))}
            </Box>
          </Container>
        </Box>
      </FadeInSection>

      {/* ── Borrow vs Sell ───────────────────────────────── */}
      <Box sx={{ minHeight: { xs: 'auto', md: '85vh' }}}>
        <FadeInSection delay={150}>
          <Container maxWidth="lg" sx={{display: 'flex', flexDirection: 'column', justifyContent: 'center', py: { xs: 7, md: 11 } }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 4, md: 6 }, alignItems: 'center' }}>
              <Box>
                <SectionLabel>Borrow vs Sell</SectionLabel>
                <Typography component="h2" sx={{ fontFamily: DISPLAY, fontSize: { xs: 26, md: 36 }, fontWeight: 700, letterSpacing: '-1px', mb: 2, color: C.ink }}>
                  Don&apos;t sell the asset you believe in
                </Typography>
                <Typography sx={{ color: C.slate, fontSize: 16, lineHeight: 1.7, mb: 3 }}>
                  Selling crypto for cash means giving up future upside — and potentially a tax event.
                  Borrowing against it lets you access ringgit today while keeping every coin. If the
                  market rises, the gains are still yours.
                </Typography>
                <CtaButton href="/dashboard" variant="contained" sx={{ px: 3.5, py: 1.25, fontSize: 15, borderRadius: 2.5, fontWeight: 700 }}>
                  Try the loan calculator
                </CtaButton>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box sx={{ bgcolor: C.surface, border: `1px solid ${C.line}`, borderRadius: 3, p: 2.75 }}>
                  <Typography sx={{ color: C.down, fontWeight: 700, fontSize: 13.5, mb: 1.5 }}>If you sell</Typography>
                  <Typography sx={{ color: C.slate, fontSize: 13.5, lineHeight: 1.8 }}>
                    Lose your position · Miss the upside · Possible tax event · Have to buy back later
                  </Typography>
                </Box>
                <Box sx={{ borderRadius: 3, p: 2.75, bgcolor: 'rgba(14,159,110,0.06)', border: '1px solid rgba(14,159,110,0.3)' }}>
                  <Typography sx={{ color: C.up, fontWeight: 700, fontSize: 13.5, mb: 1.5 }}>If you borrow</Typography>
                  <Typography sx={{ color: C.slate, fontSize: 13.5, lineHeight: 1.8 }}>
                    Keep your crypto · Keep the upside · Get cash now · Repay &amp; reclaim anytime
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Container>
        </FadeInSection>

        {/* ── Supported assets ─────────────────────────────── */}
        <FadeInSection delay={150}>
          <Container maxWidth="lg" sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', pb: { xs: 7, md: 11 } }}>
            <Box sx={{ mb: 3 }}>
              <Typography sx={{ color: C.slate, fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>
                Supported collateral
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25 }}>
              {ASSETS.map((a) => (
                <Box key={a.symbol} sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderRadius: 999, bgcolor: C.surface, border: `1px solid ${C.line}` }}>
                  <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: a.color }} />
                  <Typography sx={{ fontWeight: 700, fontSize: 13.5, color: C.ink }}>{a.symbol}</Typography>
                </Box>
              ))}
            </Box>
          </Container>
        </FadeInSection>
      </Box>

      {/* ── Vision & Mission ─────────────────────────────── */}
      {/* The brand-board values (CryptoLend_Img/Vision & Mission.png) rebuilt
          natively on the dark-background brand treatment, so it stays sharp
          and responsive instead of shipping a flat white screenshot. */}
      <FadeInSection delay={150}>
        <Box sx={{ position: 'relative', overflow: 'hidden', bgcolor: '#0B1226' }}>
          <Box sx={{ position: 'absolute', top: -120, left: '-8%', width: 420, height: 420, borderRadius: '50%', pointerEvents: 'none',
                     background: 'radial-gradient(circle, rgba(42,63,214,0.35) 0%, transparent 70%)' }} />
          <Box sx={{ position: 'absolute', bottom: -140, right: '-6%', width: 460, height: 460, borderRadius: '50%', pointerEvents: 'none',
                     background: 'radial-gradient(circle, rgba(74,125,255,0.22) 0%, transparent 70%)' }} />
          <Container maxWidth="lg" sx={{ position: 'relative', py: { xs: 7, md: 10 } }}>
            <Box sx={{ textAlign: 'center', mb: { xs: 5, md: 6 } }}>
              <Typography sx={{ color: '#8FA0FF', fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', fontWeight: 700, mb: 1.5 }}>
                Vision &amp; Mission
              </Typography>
              <Typography component="h2" sx={{ fontFamily: DISPLAY, fontSize: { xs: 28, md: 40 }, fontWeight: 700, letterSpacing: '-1px', color: '#FFFFFF', lineHeight: 1.15 }}>
                Borrow ringgit,{' '}
                <Box component="span" sx={{
                  background: 'linear-gradient(90deg, #6E8BFF, #3D5BF5)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                  not your future.
                </Box>
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 15.5, lineHeight: 1.7, maxWidth: 590, mx: 'auto', mt: 2 }}>
                CryptoLend exists so Malaysians never have to choose between cash today and
                the assets they believe in for tomorrow.
              </Typography>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2 }}>
              {[
                {
                  title: 'Modern & Minimal',
                  body:  'Clean, simple borrowing — easy to understand from your first day.',
                  icon:  <Image src="/logo-mark.png" alt="" width={26} height={26} />,
                  tile:  '#FFFFFF',
                },
                {
                  title: 'Trust & Security',
                  body:  'Non-custodial and transparent — your keys, your crypto, always.',
                  icon:  <ShieldIcon size={24} color="#fff" />,
                },
                {
                  title: 'Growth & Liquidity',
                  body:  'Unlock ringgit liquidity while your assets keep their upside.',
                  icon:  (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 20V13M12 20V8M19 20V4" />
                    </svg>
                  ),
                },
                {
                  title: 'Built for Malaysia',
                  body:  'Tailored for MYR lending, DuitNow payouts and BNM-aligned KYC.',
                  icon:  (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="8.75" />
                      <circle cx="12" cy="12" r="4.75" />
                      <circle cx="12" cy="12" r="1" />
                    </svg>
                  ),
                },
              ].map((v) => (
                <Box key={v.title} sx={{
                  p: 3, borderRadius: 3,
                  bgcolor: 'rgba(255,255,255,0.045)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  backdropFilter: 'blur(4px)',
                  transition: 'all 0.2s',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(110,139,255,0.45)', transform: 'translateY(-3px)' },
                }}>
                  <Box sx={{
                    width: 46, height: 46, borderRadius: 2.25, mb: 2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: v.tile ?? 'linear-gradient(135deg, #2A3FD6, #4A7DFF)',
                    boxShadow: '0 6px 18px rgba(42,63,214,0.35)',
                  }}>
                    {v.icon}
                  </Box>
                  <Typography sx={{ color: '#FFFFFF', fontWeight: 700, fontSize: 15.5, mb: 0.75 }}>{v.title}</Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.62)', fontSize: 13.5, lineHeight: 1.65 }}>{v.body}</Typography>
                </Box>
              ))}
            </Box>
          </Container>
        </Box>
      </FadeInSection>

      {/* ── FAQ ──────────────────────────────────────────── */}
      <FadeInSection delay={150}>
        <Box id="faq" sx={{ minHeight: { xs: 'auto', md: '85vh' }, display: 'flex', flexDirection: 'column', justifyContent: 'center', bgcolor: C.surface, borderTop: `1px solid ${C.line}`, scrollMarginTop: 80 }}>
          <Container maxWidth="lg" sx={{ py: { xs: 7, md: 11 } }}>
            <Box sx={{ mb: 5 }}>
              <SectionLabel>FAQ</SectionLabel>
              <Typography component="h2" sx={{ fontFamily: DISPLAY, fontSize: { xs: 28, md: 40 }, fontWeight: 700, letterSpacing: '-1px', color: C.ink }}>
                Questions, answered
              </Typography>
            </Box>
            <FaqAccordion />
          </Container>
        </Box>
      </FadeInSection>

      {/* ── CTA band ─────────────────────────────────────── */}
      <FadeInSection delay={150}>
        <Container maxWidth="lg" sx={{ minHeight: { xs: 'auto', md: '80vh' }, display: 'flex', flexDirection: 'column', justifyContent: 'center', py: { xs: 8, md: 12 } }}>
          <Box
            sx={{
              position: 'relative', overflow: 'hidden', borderRadius: 5,
              px: { xs: 4, md: 8 }, py: { xs: 6, md: 8 }, textAlign: 'center',
              bgcolor: C.indigo, color: '#fff',
            }}
          >
            <Typography component="h2" sx={{ fontFamily: DISPLAY, fontSize: { xs: 28, md: 42 }, fontWeight: 700, letterSpacing: '-1px', mb: 1.5 }}>
              Ready to unlock liquidity?
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: { xs: 15.5, md: 17 }, maxWidth: 520, mx: 'auto', mb: 3.5 }}>
              Put your crypto to work in minutes — keep your assets, get the cash.
            </Typography>
            <CtaButton href="/dashboard" sx={{ px: 4.5, py: 1.5, fontSize: 16, borderRadius: 2.5, fontWeight: 700, bgcolor: '#fff', color: C.indigo, '&:hover': { bgcolor: '#EEF1F5' } }}>
              Start borrowing
            </CtaButton>
          </Box>
        </Container>
      </FadeInSection>

      {/* ── Footer ───────────────────────────────────────── */}
      <Box component="footer" sx={{ borderTop: `1px solid ${C.line}`, bgcolor: C.surface }}>
        <Container maxWidth="lg" sx={{ py: 5 }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', gap: 4, mb: 3.5 }}>
            <Box sx={{ maxWidth: 320 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
                <Mark size={28} />
                <Typography sx={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, color: C.ink }}>
                  Crypto<Box component="span" sx={{ color: C.indigo }}>Lend</Box>
                </Typography>
              </Box>
              <Typography sx={{ color: C.slate, fontSize: 13.5, lineHeight: 1.6 }}>
                Crypto-backed lending for Malaysia. Borrow ringgit against your assets — non-custodial and compliant.
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { xs: 2, md: 4 } }}>
              {FOOTER_LINKS.map((l) => (
                <Box key={l.href} component="a" href={l.href} sx={{ textDecoration: 'none' }}>
                  <Typography sx={{ color: C.slate, fontSize: 14, '&:hover': { color: C.indigo } }}>{l.label}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
          <Typography sx={{ color: C.mute, fontSize: 12, lineHeight: 1.6, pt: 3, borderTop: `1px solid ${C.line}` }}>
            Demo running on Hardhat testnet — no real funds. Crypto lending carries liquidation risk;
            borrow responsibly. Identity verification (KYC/AML) is required per Bank Negara Malaysia regulations.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}
