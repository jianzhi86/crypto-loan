'use client';

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';

interface FadeInSectionProps {
  children: React.ReactNode;
  /** Delay in ms before the animation starts after entering viewport (for stagger when you have multiple items) */
  delay?: number;
  /** How long the opacity/translate transition takes */
  duration?: number;
  /** Pixels of the element that must be visible before it triggers */
  threshold?: number;
  /** CSS transform to use instead of the default translateY */
  slideY?: number;
}

export default function FadeInSection({
  children,
  delay = 0,
  duration = 600,
  threshold = 0.25,
  slideY = 24,
}: FadeInSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold },
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [threshold]);

  return (
    <Box
      ref={ref}
      sx={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : `translateY(${slideY}px)`,
        transition: `opacity ${duration}ms cubic-bezier(0.4,0,0.2,1), transform ${duration}ms cubic-bezier(0.4,0,0.2,1)`,
        transitionDelay: `${delay}ms`,
      }}
    >
      {children}
    </Box>
  );
}
