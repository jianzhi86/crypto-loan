import type { ReactNode } from 'react';
import type { AclRule } from './acl';

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  acl?: AclRule;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const DashboardIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </svg>
);

const MarketsIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <path d="M3.5 17.5l5-6 4 3.5 7.5-9" />
    <path d="M15.5 5.5H20V10" />
  </svg>
);

const PortfolioIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12V3.5z" />
    <path d="M15.5 3.9A8.5 8.5 0 0 1 20.1 8.5H15.5V3.9z" />
  </svg>
);

const DocsIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <path d="M4.5 5A2.5 2.5 0 0 1 7 2.5h12.5V18H7A2.5 2.5 0 0 0 4.5 20.5V5z" />
    <path d="M4.5 20.5A2.5 2.5 0 0 0 7 23h12.5v-5" />
  </svg>
);

const KycIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <circle cx="8.5" cy="10.5" r="2" />
    <path d="M5.5 16c.5-1.7 1.7-2.5 3-2.5s2.5.8 3 2.5" />
    <path d="M14.5 9.5H18.5M14.5 13H18.5" />
  </svg>
);

const SettingsIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z" />
  </svg>
);

const DepositIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="14" width="18" height="7" rx="2" />
    <path d="M12 3v8M9 8l3 3 3-3" />
  </svg>
);

const WithdrawIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <rect x="3" y="14" width="18" height="7" rx="2" />
    <path d="M12 11V3M9 6l3-3 3 3" />
  </svg>
);

const BorrowIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v2.5M12 14.5V17" />
    <path d="M9.5 9.5C9.5 8.1 10.6 7 12 7s2.5 1.1 2.5 2.5c0 2.5-2.5 3-2.5 5" />
  </svg>
);

const RepayIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <path d="M4 12a8 8 0 1 0 8-8" />
    <path d="M4 7v5h5" />
    <path d="M12 10v2.5l1.5 1.5" />
  </svg>
);

const BuyIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <path d="M3 6h2l3.5 9.5L9.5 17h9.5" />
    <circle cx="10" cy="20" r="1.5" />
    <circle cx="18" cy="20" r="1.5" />
    <path d="M8.5 13h10l1.5-5H7" />
  </svg>
);

const AdminIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" {...stroke}>
    <path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6l8-3z" />
    <path d="M8.5 12l2.5 2.5 4.5-4.5" />
  </svg>
);

export const LockIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" {...stroke}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Menu',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
      { href: '/markets',   label: 'Markets',   icon: MarketsIcon   },
      { href: '/portfolio', label: 'Portfolio', icon: PortfolioIcon, acl: { requiresAuth: true } },
      { href: '/docs',      label: 'Docs',      icon: DocsIcon      },
    ],
  },
  {
    title: 'Actions',
    items: [
      { href: '/dashboard?tab=deposit',  label: 'Deposit',  icon: DepositIcon,  acl: { requiresAuth: true } },
      { href: '/dashboard?tab=withdraw', label: 'Withdraw', icon: WithdrawIcon, acl: { requiresAuth: true } },
      { href: '/dashboard?tab=borrow',   label: 'Borrow',   icon: BorrowIcon,   acl: { requiresAuth: true } },
      { href: '/dashboard?tab=repay',    label: 'Repay',    icon: RepayIcon,    acl: { requiresAuth: true } },
      { href: '/dashboard?tab=buy',      label: 'Buy MYR',  icon: BuyIcon,      acl: { requiresAuth: true } },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/kyc',      label: 'KYC',      icon: KycIcon,      acl: { requiresAuth: true } },
      { href: '/settings', label: 'Settings', icon: SettingsIcon, acl: { requiresAuth: true } },
    ],
  },
  {
    title: 'Administration',
    items: [
      { href: '/admin', label: 'Admin', icon: AdminIcon, acl: { requiresAdmin: true } },
    ],
  },
];
