'use client';

import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

const FAQS = [
  {
    q: 'What can I use as collateral?',
    a: 'You deposit supported crypto — ETH, BTC, SOL, BNB, XRP, AVAX, LINK, DOT or ADA — into a non-custodial smart contract. Your assets stay locked on-chain and are never sold; you simply borrow against their value.',
  },
  {
    q: 'How much can I borrow?',
    a: 'Up to 50–70% of your collateral value depending on the asset (its loan-to-value ratio). A conservative LTV keeps your health factor high and lowers liquidation risk.',
  },
  {
    q: 'What happens if the market drops? (liquidation)',
    a: 'Every loan has a live health factor. If your collateral falls and the health factor approaches 1.0, you can add collateral or repay to stay safe. If it crosses the liquidation threshold, only enough of your collateral is sold to cover the debt (plus a small liquidator bonus) — the rest stays yours.',
  },
  {
    q: 'Do loans have a due date?',
    a: 'Yes — every loan is fixed-term. You pick 1, 3, 6 or 12 months when you borrow, and the due date is recorded on-chain. Repay before it to stay in good standing; after the due date a 7-day grace period gives you extra time before an unpaid loan can be liquidated, even if your collateral is still healthy. Interest keeps accruing until you repay.',
  },
  {
    q: 'Do I need to verify my identity?',
    a: 'Yes. To comply with Malaysian AML/CFT regulations (Bank Negara Malaysia), a quick KYC check is required before you can withdraw a loan. It takes only a few minutes.',
  },
  {
    q: 'How do I receive the money, and how do I repay?',
    a: 'Approved loans are paid out as MYRC, the ringgit-denominated token, credited to your wallet in the same transaction as the borrow. Repay each loan (principal plus its accrued interest) any time before its due date with no early-repayment penalty, and your collateral is unlocked instantly.',
  },
  {
    q: 'What is the MYRC token?',
    a: 'MYRC (Ringgit Token) is the ringgit-denominated stable token used across the platform. You can acquire it on the Buy MYRC page and use it for loans and repayments.',
  },
];

export default function FaqAccordion() {
  return (
    <Box sx={{ maxWidth: 820, mx: 'auto' }}>
      {FAQS.map((item, i) => (
        <Accordion
          key={i}
          disableGutters
          elevation={0}
          sx={{
            bgcolor: '#FFFFFF',
            border: '1px solid #E2E7EE',
            borderRadius: '14px !important',
            mb: 1.5,
            '&:before': { display: 'none' },
            overflow: 'hidden',
          }}
        >
          <AccordionSummary
            expandIcon={
              <Box sx={{ color: '#2A3FD6', fontSize: 20, lineHeight: 1, fontWeight: 700 }}>+</Box>
            }
            sx={{ px: 3, py: 1, '& .MuiAccordionSummary-content': { my: 1.5 } }}
          >
            <Typography sx={{ color: '#10151C', fontWeight: 600, fontSize: 15.5 }}>
              {item.q}
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ px: 3, pb: 2.5, pt: 0 }}>
            <Typography sx={{ color: '#5A6675', fontSize: 14.5, lineHeight: 1.7 }}>
              {item.a}
            </Typography>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}
