import FeatureGate from '@/components/FeatureGate';

// Server-side enforcement for the Markets page — the page itself is a Client
// Component and cannot gate itself before rendering.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <FeatureGate feature="page.markets">{children}</FeatureGate>;
}
