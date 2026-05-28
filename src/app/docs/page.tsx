'use client';

import { useState } from 'react';
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
import Navbar from '@/components/Navbar';

const SECTIONS = [
  { id: 'overview',     label: 'Overview'         },
  { id: 'how-it-works', label: 'How It Works'     },
  { id: 'collateral',   label: 'Collateral & LTV' },
  { id: 'health',       label: 'Health Factor'    },
  { id: 'setup',        label: 'Local Setup'       },
  { id: 'contracts',    label: 'Smart Contracts'   },
  { id: 'faq',          label: 'FAQ'               },
];

const CODE = {
  hardhatNode:  'npm run chain',
  deployLocal:  'npm run deploy:local',
  devServer:    'npm run dev',
  metamaskRPC:  'http://127.0.0.1:8545',
  chainId:      '31337',
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Box component="section" id={id} sx={{ mb: 6 }}>
      <Typography variant="h5" color="text.primary" gutterBottom sx={{ fontWeight: 700 }}>{title}</Typography>
      <Box sx={{ color: '#94A3B8', display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</Box>
    </Box>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Typography variant="body2" sx={{ lineHeight: 1.8 }}>{children}</Typography>;
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <Box
      component="pre"
      sx={{ fontSize: 12, p: 2, borderRadius: 2, overflowX: 'auto', fontFamily: 'monospace',
            bgcolor: '#0D0F1A', border: '1px solid #1E2035', color: '#06B6D4', m: 0 }}
    >
      {children}
    </Box>
  );
}

function DocTable({ rows }: { rows: [string, string, string][] }) {
  return (
    <TableContainer component={Paper} sx={{ bgcolor: 'transparent', border: '1px solid #1E2035', borderRadius: 2 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {['Asset', 'Max LTV', 'Liq. Threshold'].map(h => (
              <TableCell key={h} sx={{ color: '#64748B', bgcolor: '#0D0F1A', fontSize: 12 }}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(([a, b, c]) => (
            <TableRow key={a}>
              <TableCell sx={{ color: 'text.primary', fontWeight: 500 }}>{a}</TableCell>
              <TableCell sx={{ color: '#06B6D4' }}>{b}</TableCell>
              <TableCell sx={{ color: '#eab308' }}>{c}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function Callout({ type, children }: { type: 'info' | 'warning' | 'tip'; children: React.ReactNode }) {
  const severityMap = { info: 'info', warning: 'warning', tip: 'success' } as const;
  return <Alert severity={severityMap[type]} sx={{ fontSize: 13 }}>{children}</Alert>;
}

const FaqItem = ({ q, a }: { q: string; a: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <Paper onClick={() => setOpen(o => !o)}
      sx={{ p: 2, bgcolor: '#131629', border: '1px solid #1E2035', borderRadius: 2, cursor: 'pointer',
            '&:hover': { borderColor: '#2a2d50' } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>{q}</Typography>
        <Typography sx={{ color: '#7C3AED', fontSize: 18, lineHeight: 1, ml: 1, flexShrink: 0 }}>{open ? '−' : '+'}</Typography>
      </Box>
      {open && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1.5, lineHeight: 1.7, color: '#94A3B8' }}>{a}</Typography>
      )}
    </Paper>
  );
};

export default function DocsPage() {
  const [active, setActive] = useState('overview');

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0D0F1A', color: 'text.primary' }}>
      <Navbar />
      <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 2, sm: 3 }, py: 4, display: 'flex', gap: 4 }}>

        {/* Sidebar */}
        <Box component="aside" sx={{ display: { xs: 'none', lg: 'block' }, width: 208, flexShrink: 0 }}>
          <Box sx={{ position: 'sticky', top: 88 }}>
            <Typography variant="caption" sx={{ color: '#475569', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600, display: 'block', mb: 1.5, px: 1.5 }}>
              Documentation
            </Typography>
            {SECTIONS.map(s => (
              <Box key={s.id} component="a" href={`#${s.id}`} onClick={() => setActive(s.id)}
                sx={{ display: 'block', px: 1.5, py: 1, mb: 0.25, borderRadius: 1.5, textDecoration: 'none',
                      fontSize: 14, bgcolor: active === s.id ? '#1E1B3A' : 'transparent',
                      color: active === s.id ? '#A78BFA' : '#64748B',
                      borderLeft: `2px solid ${active === s.id ? '#7C3AED' : 'transparent'}`,
                      transition: 'all 0.15s', '&:hover': { color: 'white', bgcolor: '#131629' } }}>
                {s.label}
              </Box>
            ))}
          </Box>
        </Box>

        {/* Content */}
        <Box component="main" sx={{ flex: 1, maxWidth: 768 }}>

          <Section id="overview" title="Overview">
            <P>CryptoLend is a decentralised lending protocol running on a local Hardhat blockchain. It lets you deposit ETH as collateral and borrow <Box component="strong" sx={{ color: 'text.primary' }}>Malaysian Ringgit (MYR)</Box> — a simulated stablecoin (MockMYR) pegged to RM 1.00 — against your crypto holdings.</P>
            <P>The protocol is designed for local development and testing. All coin prices are fetched live from CoinGecko in MYR. The on-chain ETH price used for loan calculations is set separately in the smart contract by the deployer.</P>
            <Callout type="warning">This is a testnet demo only. Never use real funds. All MYR tokens are mock ERC-20 tokens with no real-world value.</Callout>
          </Section>

          <Section id="how-it-works" title="How It Works">
            <P>The protocol has three main actions:</P>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {[
                { n: '1', title: 'Deposit Collateral', desc: 'Send ETH to the CryptoLoan contract. Your ETH is locked as collateral and determines how much MYR you can borrow.' },
                { n: '2', title: 'Borrow MYR',         desc: 'Request MockMYR tokens up to 70% of your collateral value (LTV). The contract mints MYR directly to your wallet.' },
                { n: '3', title: 'Repay & Withdraw',   desc: 'Approve the contract to spend your MYR, then call repay. Once debt is cleared, you can withdraw your ETH collateral.' },
              ].map(s => (
                <Paper key={s.n} sx={{ display: 'flex', gap: 2, p: 2, bgcolor: '#131629', border: '1px solid #1E2035', borderRadius: 2 }}>
                  <Box sx={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #7C3AED, #06B6D4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Typography sx={{ color: 'white', fontSize: 14, fontWeight: 700 }}>{s.n}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="body2" color="text.primary" gutterBottom sx={{ fontWeight: 600 }}>{s.title}</Typography>
                    <Typography variant="caption" sx={{ lineHeight: 1.6, color: '#94A3B8' }}>{s.desc}</Typography>
                  </Box>
                </Paper>
              ))}
            </Box>
            <Callout type="info">Repaying requires <strong>two MetaMask confirmations</strong>: first an ERC-20 approval, then the repay transaction.</Callout>
          </Section>

          <Section id="collateral" title="Collateral &amp; LTV">
            <P>LTV (Loan-to-Value) measures how much you have borrowed relative to your collateral. The maximum LTV is <Box component="strong" sx={{ color: 'text.primary' }}>70%</Box> — you cannot borrow more than 70% of your collateral value in MYR.</P>
            <CodeBlock>{`Collateral value  = ETH deposited × ETH price (MYR)\nMax borrow (MYR)  = Collateral value × 70%\nCurrent LTV       = Borrowed MYR / Collateral value × 100%`}</CodeBlock>
            <DocTable rows={[['ETH (Hardhat)','70%','80%'],['BTC','70%','80%'],['SOL','65%','75%'],['BNB','65%','75%'],['XRP','55%','65%'],['AVAX','60%','70%'],['LINK','60%','70%'],['DOT','55%','65%'],['ADA','50%','60%']]} />
          </Section>

          <Section id="health" title="Health Factor">
            <P>The health factor (HF) tells you how safe your position is. It is calculated as:</P>
            <CodeBlock>{`HF = (Collateral × ETH price × Liquidation threshold%) / Borrowed MYR\n\nExample:\n  1 ETH × RM 18,000 × 80% / RM 9,000 borrowed = 1.60`}</CodeBlock>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
              {[
                { range: 'HF ≥ 2.0', label: 'Safe',     desc: 'Position is well-collateralised', c: '#22c55e' },
                { range: '1.5 – 2.0', label: 'Moderate', desc: 'Consider adding more collateral', c: '#eab308' },
                { range: 'HF < 1.5', label: 'At Risk',   desc: 'Close to liquidation threshold', c: '#ef4444' },
              ].map(h => (
                <Box key={h.range} sx={{ p: 1.5, borderRadius: 2, textAlign: 'center', bgcolor: `${h.c}0F`, border: `1px solid ${h.c}33` }}>
                  <Typography variant="body2" sx={{ color: h.c, fontWeight: 700 }}>{h.label}</Typography>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.primary', display: 'block', my: 0.5 }}>{h.range}</Typography>
                  <Typography variant="caption" sx={{ color: `${h.c}BB` }}>{h.desc}</Typography>
                </Box>
              ))}
            </Box>
            <Callout type="warning">If the health factor drops below 1.0 your position can be liquidated. Always keep a safe buffer above 1.5.</Callout>
          </Section>

          <Section id="setup" title="Local Setup">
            <P>Follow these steps to run the full stack locally:</P>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { n: 1, title: 'Start Hardhat node (Terminal 1)',       code: CODE.hardhatNode },
                { n: 2, title: 'Deploy contracts (Terminal 2)',          code: CODE.deployLocal },
                { n: 3, title: 'Start Next.js dev server (Terminal 3)',  code: CODE.devServer   },
              ].map(s => (
                <Box key={s.n}>
                  <Typography variant="body2" color="text.primary" gutterBottom sx={{ fontWeight: 600 }}>{s.n}. {s.title}</Typography>
                  <CodeBlock>{s.code}</CodeBlock>
                </Box>
              ))}
            </Box>
            <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600, mt: 2 }}>4. Configure MetaMask</Typography>
            <CodeBlock>{`Network name : Hardhat Local\nRPC URL      : ${CODE.metamaskRPC}\nChain ID     : ${CODE.chainId}\nCurrency     : ETH`}</CodeBlock>
            <P>Import one of the Hardhat test accounts using a private key printed when you run <Box component="code" sx={{ fontFamily: 'monospace', fontSize: 12, bgcolor: 'rgba(0,0,0,0.3)', px: 0.75, borderRadius: 0.5, color: '#A78BFA' }}>npm run chain</Box>. Each account starts with <Box component="strong" sx={{ color: 'text.primary' }}>10,000 ETH</Box>.</P>
            <Callout type="tip">The deploy script automatically writes contract addresses to <code>src/lib/contractConfig.ts</code>. You do not need to copy addresses manually.</Callout>
          </Section>

          <Section id="contracts" title="Smart Contracts">
            <P>Two contracts are deployed during setup:</P>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {[
                { name: 'CryptoLoan.sol', desc: 'Main lending contract. Accepts ETH collateral, mints MockMYR on borrow, accepts MockMYR on repay.', fns: ['depositCollateral()','borrow(uint256)','repay(uint256)','withdrawCollateral(uint256)','getLoanInfo(address)','setEthPrice(uint256)'] },
                { name: 'MockMYR.sol',    desc: 'ERC-20 mock stablecoin. Only the CryptoLoan contract can mint. You can approve and transfer freely.', fns: ['mint(address,uint256)','approve(address,uint256)','balanceOf(address)','transferFrom(...)'] },
              ].map(c => (
                <Paper key={c.name} sx={{ p: 2, bgcolor: '#131629', border: '1px solid #1E2035', borderRadius: 2 }}>
                  <Typography variant="body2" color="text.primary" gutterBottom sx={{ fontWeight: 700 }}>{c.name}</Typography>
                  <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', mb: 1.5 }}>{c.desc}</Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {c.fns.map(fn => (
                      <Chip key={fn} label={fn} size="small" sx={{ bgcolor: '#7C3AED22', color: '#A78BFA', fontFamily: 'monospace', fontSize: 11, height: 22 }} />
                    ))}
                  </Box>
                </Paper>
              ))}
            </Box>
          </Section>

          <Section id="faq" title="FAQ">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {[
                { q: "Why do I need to run the deploy script every time?", a: "Hardhat node generates fresh addresses on each start. Run `npm run chain` then `npm run deploy:local` together. The deploy script updates contractConfig.ts automatically." },
                { q: "What is the exchange rate between ETH price and MYR borrow limit?", a: "The on-chain ETH price (set in MYR by the deploy script, default RM 18,000) determines your max borrow. The UI shows real CoinGecko prices for reference but borrow limits use the on-chain price." },
                { q: "Why does repay require two MetaMask confirmations?", a: "MockMYR is an ERC-20 token. Before the contract can deduct your MYR balance, you must first approve it to spend on your behalf (standard ERC-20 flow)." },
                { q: "Can I borrow more than 70% LTV?", a: "No. The contract enforces the 70% max LTV on-chain and will revert with \"Exceeds max LTV\" if you try." },
                { q: "How do I update the ETH price in the contract?", a: "The deployer account can call setEthPrice(uint256) directly via the Hardhat console: `npx hardhat console --network localhost` then interact with the deployed CryptoLoan contract." },
              ].map(item => <FaqItem key={item.q} q={item.q} a={item.a} />)}
            </Box>
          </Section>

        </Box>
      </Box>
    </Box>
  );
}
