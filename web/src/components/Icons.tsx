import type { CSSProperties } from 'react';

/**
 * Line icons for UI states — empty tables, notices, maintenance screens.
 *
 * These replace the emoji that were used as illustrations. Emoji render
 * differently on every OS, sit at the wrong optical weight next to text, and
 * cannot inherit colour; these are stroked SVGs matching the sidebar's icon
 * language (1.5–1.7 weight, round caps) and take their colour from `currentColor`.
 */

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: CSSProperties;
}

const base = (size: number, strokeWidth: number, color?: string, style?: CSSProperties) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: color ?? 'currentColor',
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  style: { flexShrink: 0, ...style },
  'aria-hidden': true,
});

/** Maintenance / work in progress. */
export const WrenchIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <path d="M14.7 6.3a4 4 0 0 0 5.02 5.02l-8.4 8.4a2.4 2.4 0 0 1-3.4-3.4l8.4-8.4z" />
    <path d="M14.7 6.3l1.6-1.6a4 4 0 0 1 5.02 5.02l-1.6 1.6" />
    <path d="M6.5 17.5h.01" />
  </svg>
);

/** No results for the current search or filters. */
export const SearchIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M15.8 15.8L20.5 20.5" />
  </svg>
);

/** Nothing has been created yet. */
export const InboxIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <path d="M3.5 13.5h4l1.5 2.5h6l1.5-2.5h4" />
    <path d="M5.8 5h12.4a2 2 0 0 1 1.9 1.4l1.4 7.1v3a2 2 0 0 1-2 2H4.5a2 2 0 0 1-2-2v-3l1.4-7.1A2 2 0 0 1 5.8 5z" />
  </svg>
);

/** Read-only / protected data. */
export const LockIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M7.75 10.5V7.5a4.25 4.25 0 0 1 8.5 0v3" />
    <path d="M12 14.5v2.5" />
  </svg>
);

/** Audit trail / activity log. */
export const ClipboardIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <path d="M9 4.5H7.5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-12a2 2 0 0 0-2-2H15" />
    <rect x="9" y="2.75" width="6" height="3.5" rx="1.25" />
    <path d="M8.75 11h6.5M8.75 14.5h6.5M8.75 18h3.5" />
  </svg>
);

/** Export / download. */
export const DownloadIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <path d="M12 3.5v10.5M8.5 10.5l3.5 3.5 3.5-3.5" />
    <path d="M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />
  </svg>
);

/** Warning / restricted account. */
export const AlertIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <path d="M10.3 4.2 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4M12 16.8h.01" />
  </svg>
);

/** Scope / governance note. */
export const ShieldIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <path d="M12 2.75l7.5 2.8v5.6c0 4.7-3.2 8-7.5 9.4-4.3-1.4-7.5-4.7-7.5-9.4v-5.6L12 2.75z" />
    <path d="M9.25 11.75l2 2 3.5-3.75" />
  </svg>
);

/** Pending review. */
export const ClockIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.25V12l3 1.75" />
  </svg>
);

/**
 * Wrapper for an icon used as a MUI Chip's `icon` prop. Chip expects its own
 * icon components and applies margins that leave a raw SVG mis-aligned, so the
 * spacing is corrected once here rather than at every call site.
 */
export const ChipGlyph = ({ children }: { children: React.ReactNode }) => (
  <span style={{ display: 'flex', alignItems: 'center', marginLeft: 8, marginRight: -3, color: 'inherit' }}>
    {children}
  </span>
);

/** Reveal password. */
export const EyeIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/** Hide password. */
export const EyeOffIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <path d="M9.9 5.8A9.5 9.5 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.8 3.7" />
    <path d="M6.3 7.9A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 3.9-.83" />
    <path d="M10 10a3 3 0 0 0 4.2 4.2" />
    <path d="M3.5 3.5l17 17" />
  </svg>
);

/**
 * Browser wallet (MetaMask and friends). A generic wallet mark rather than the
 * fox emoji, which is both off-brand and inaccurate for other injected wallets.
 */
export const WalletIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <path d="M3.5 8.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2" />
    <rect x="2.75" y="8.5" width="18.5" height="11" rx="2.5" />
    <path d="M16.5 14h1.5" />
  </svg>
);

/** Solana — a wordless glyph standing in for the ◎ character. */
export const SolanaIcon = ({ size = 24, color, strokeWidth = 1.6, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <path d="M6 8h11l-2.5-2.5M6 8l2.5 2.5" />
    <path d="M18 12H7l2.5-2.5M18 12l-2.5 2.5" />
    <path d="M6 16h11l-2.5-2.5M6 16l2.5 2.5" />
  </svg>
);

/** Confirmed / verified. */
export const CheckIcon = ({ size = 24, color, strokeWidth = 1.8, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <path d="M4.5 12.5l5 5 10-11" />
  </svg>
);

/** Rate going down. */
export const TrendDownIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <path d="M3.5 6.5l6 7 4-3.5 7 8.5" />
    <path d="M20.5 13.5v5h-5" />
  </svg>
);

/** Rate going up. */
export const TrendUpIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <path d="M3.5 17.5l6-7 4 3.5 7-8.5" />
    <path d="M20.5 10.5v-5h-5" />
  </svg>
);

/** Speed / instant. */
export const BoltIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <path d="M13.5 2.5L4.5 13.5h6l-1 8 9-11h-6l1-8z" />
  </svg>
);

/** Bank / fiat payout. */
export const BankIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <path d="M3.5 9.5L12 4l8.5 5.5" />
    <path d="M5.5 9.5v8M9.8 9.5v8M14.2 9.5v8M18.5 9.5v8" />
    <path d="M3 20.5h18" />
  </svg>
);

/** Repay / cycle. */
export const RefreshIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <path d="M20.5 4v5h-5" />
  </svg>
);

/** Identity document. */
export const IdCardIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <rect x="2.75" y="5" width="18.5" height="14" rx="2.5" />
    <circle cx="8.5" cy="11" r="2" />
    <path d="M5.5 16c.5-1.6 1.7-2.4 3-2.4s2.5.8 3 2.4" />
    <path d="M14.75 10h4M14.75 13.5h4" />
  </svg>
);

/** Cash out / borrow. */
export const CashIcon = ({ size = 24, color, strokeWidth = 1.5, style }: IconProps) => (
  <svg {...base(size, strokeWidth, color, style)}>
    <rect x="2.75" y="6" width="18.5" height="12" rx="2.5" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 10.5v3M18 10.5v3" />
  </svg>
);

/**
 * Small breathing dot for "live" indicators, replacing the ● character —
 * which has no consistent size across fonts and cannot animate.
 */
export const LiveDot = ({ color = 'currentColor', size = 7 }: { color?: string; size?: number }) => (
  <span
    aria-hidden
    style={{
      width: size, height: size, borderRadius: '50%', background: color,
      display: 'inline-block', flexShrink: 0, position: 'relative',
      boxShadow: `0 0 0 0 ${color}`,
      animation: 'liveDotPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
    }}
  />
);
