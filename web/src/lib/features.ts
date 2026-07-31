/**
 * Feature toggles.
 *
 * The registry below is the source of truth for which keys exist and what they
 * mean; the FeatureFlag table only stores *overrides*. That way an empty table
 * means "everything on", a key removed from the code stops mattering even if a
 * stale row lingers, and a new key ships enabled without a migration.
 */

/** Normal operation. */
export const ON = 'ON';
/** Still visible, but entering it shows a maintenance notice and writes refuse. */
export const MAINTENANCE = 'MAINTENANCE';
/** Removed from navigation entirely; direct visits are redirected. */
export const HIDDEN = 'HIDDEN';

export type FlagState = typeof ON | typeof MAINTENANCE | typeof HIDDEN;

export interface FlagDef {
  key: string;
  label: string;
  group: 'Site' | 'Loan actions' | 'Pages' | 'Access';
  description: string;
  /** Which states make sense for this flag — the admin UI only offers these. */
  states: FlagState[];
  /** Shown to users when the flag is in MAINTENANCE and no custom message is set. */
  defaultMessage: string;
}

const ALL: FlagState[] = [ON, MAINTENANCE, HIDDEN];
/** Things you can pause but not make invisible — hiding them would just confuse. */
const PAUSABLE: FlagState[] = [ON, MAINTENANCE];

export const FLAGS: FlagDef[] = [
  {
    key: 'site.maintenance',
    label: 'Site-wide maintenance',
    group: 'Site',
    description: 'Takes the app offline for everyone except admins. Sign-in, the landing page and the explorer stay reachable — so you can always log back in and switch this off. Admins keep full access to verify a fix first.',
    states: PAUSABLE,
    defaultMessage: 'CryptoLend is undergoing scheduled maintenance. We will be back shortly.',
  },

  { key: 'action.deposit',  label: 'Deposit collateral', group: 'Loan actions', description: 'Deposit ETH as collateral.', states: PAUSABLE, defaultMessage: 'Deposits are temporarily paused for maintenance.' },
  { key: 'action.withdraw', label: 'Withdraw collateral', group: 'Loan actions', description: 'Withdraw ETH collateral.', states: PAUSABLE, defaultMessage: 'Withdrawals are temporarily paused for maintenance.' },
  { key: 'action.borrow',   label: 'Borrow MYR',  group: 'Loan actions', description: 'Take out a new MYR loan.', states: PAUSABLE, defaultMessage: 'Borrowing is temporarily paused for maintenance.' },
  { key: 'action.repay',    label: 'Repay loan',  group: 'Loan actions', description: 'Repay outstanding MYR debt. Think twice before pausing this — users cannot reduce their liquidation risk while it is off.', states: PAUSABLE, defaultMessage: 'Repayments are temporarily paused for maintenance.' },
  { key: 'action.buy',      label: 'Buy MYR',     group: 'Loan actions', description: 'Swap ETH for MYR.', states: PAUSABLE, defaultMessage: 'MYR purchases are temporarily paused for maintenance.' },
  { key: 'action.transfer', label: 'Bank transfer', group: 'Loan actions', description: 'Off-chain MYR payout to a registered bank account.', states: PAUSABLE, defaultMessage: 'Bank transfers are temporarily paused for maintenance.' },

  { key: 'page.markets',   label: 'Markets',   group: 'Pages', description: 'Rates and calculator page.', states: ALL, defaultMessage: 'The markets page is under maintenance.' },
  { key: 'page.portfolio', label: 'Portfolio', group: 'Pages', description: 'Personal position and history page.', states: ALL, defaultMessage: 'The portfolio page is under maintenance.' },
  { key: 'page.docs',      label: 'Docs',      group: 'Pages', description: 'Documentation page.', states: ALL, defaultMessage: 'Docs are under maintenance.' },
  { key: 'page.kyc',       label: 'KYC',       group: 'Pages', description: 'KYC submission form. Turning this off blocks new verifications.', states: ALL, defaultMessage: 'KYC submissions are temporarily closed.' },
  { key: 'page.settings',  label: 'Settings',  group: 'Pages', description: 'Account and bank account settings.', states: ALL, defaultMessage: 'Settings are under maintenance.' },
  { key: 'page.ico',       label: 'ICO',       group: 'Pages', description: 'Token sale page.', states: ALL, defaultMessage: 'The token sale page is under maintenance.' },
  { key: 'page.explorer',  label: 'Explorer',  group: 'Pages', description: 'Public transaction explorer. Hiding it does not make the data private — the same transactions remain readable on-chain by anyone.', states: ALL, defaultMessage: 'The explorer is under maintenance.' },

  { key: 'auth.signup', label: 'New sign-ups', group: 'Access', description: 'Allow new accounts to be registered.', states: PAUSABLE, defaultMessage: 'New registrations are temporarily closed.' },
  { key: 'auth.login',  label: 'Sign-in',      group: 'Access', description: 'Allow existing users to sign in. Admins can always sign in, so you cannot lock yourself out.', states: PAUSABLE, defaultMessage: 'Sign-in is temporarily unavailable while we perform maintenance.' },
];

export const FLAG_BY_KEY: Record<string, FlagDef> = Object.fromEntries(FLAGS.map(f => [f.key, f]));

export interface FlagValue {
  state: FlagState;
  message: string;
}

export type FlagMap = Record<string, FlagValue>;

/** Every flag at its default (all on) — the fallback when the DB is unreachable. */
export function defaultFlagMap(): FlagMap {
  return Object.fromEntries(FLAGS.map(f => [f.key, { state: ON as FlagState, message: '' }]));
}

export const isOn = (m: FlagMap, key: string): boolean => (m[key]?.state ?? ON) === ON;
export const isHidden = (m: FlagMap, key: string): boolean => m[key]?.state === HIDDEN;
export const isMaintenance = (m: FlagMap, key: string): boolean => m[key]?.state === MAINTENANCE;

/** Message to show for a blocked flag, falling back to the registry default. */
export function flagMessage(m: FlagMap, key: string): string {
  return m[key]?.message?.trim() || FLAG_BY_KEY[key]?.defaultMessage || 'This feature is temporarily unavailable.';
}

/** Maps a dashboard action tab to its flag key, so the tab strip and the API agree. */
export const ACTION_FLAG: Record<string, string> = {
  deposit:  'action.deposit',
  withdraw: 'action.withdraw',
  borrow:   'action.borrow',
  repay:    'action.repay',
  buy:      'action.buy',
};
