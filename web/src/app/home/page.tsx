import type { Metadata } from 'next';
import HomeContent from './HomeContent';

export const metadata: Metadata = {
  title: 'CryptoLend — Borrow Ringgit Against Your Crypto',
  description:
    'Unlock cash without selling. Borrow Malaysian Ringgit against your crypto at variable rates from 3.0% APR — non-custodial, KYC-compliant, repay anytime.',
};

export default function HomePage() {
  return <HomeContent />;
}
