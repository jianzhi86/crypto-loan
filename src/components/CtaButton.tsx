'use client';

import Link from 'next/link';
import Button from '@mui/material/Button';
import type { SxProps, Theme } from '@mui/material/styles';

type Props = {
  href: string;
  children: React.ReactNode;
  variant?: 'text' | 'contained' | 'outlined';
  sx?: SxProps<Theme>;
};

/**
 * Client wrapper so Server Components can render a next/link Button without
 * passing the Link function across the server/client boundary.
 */
export default function CtaButton({ href, children, variant, sx }: Props) {
  return (
    <Button component={Link} href={href} variant={variant} sx={sx}>
      {children}
    </Button>
  );
}
