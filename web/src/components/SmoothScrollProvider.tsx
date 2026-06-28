'use client';

import { useSmoothScroll } from '@/hooks/useSmoothScroll';

export default function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  useSmoothScroll();
  return <>{children}</>;
}
