// Access control rules for sidebar navigation items.

import { type FlagMap, isHidden, isMaintenance, flagMessage } from '@/lib/features';

export interface AclContext {
  isAuthenticated: boolean;
  isAdmin: boolean;
  kycApproved: boolean;
  /** Current feature-flag states. Absent means "no toggles applied". */
  flags?: FlagMap;
}

export interface AclRule {
  /** Item only visible when logged in as an admin. Hidden otherwise. */
  requiresAdmin?: boolean;
  /** Item requires a logged-in account. Shown locked when signed out. */
  requiresAuth?: boolean;
  /** Item requires an approved KYC. Shown locked until verified. */
  requiresKyc?: boolean;
  /** Feature-flag key governing this item — hidden or locked per its state. */
  feature?: string;
}

export type AclStatus = 'allowed' | 'locked' | 'hidden';

export function checkAcl(rule: AclRule | undefined, ctx: AclContext): AclStatus {
  if (!rule) return 'allowed';
  if (rule.requiresAdmin && !ctx.isAdmin) return 'hidden';

  // Admins bypass feature gates so they can check a paused area before
  // switching it back on — but never bypass auth or KYC gates.
  if (rule.feature && ctx.flags && !ctx.isAdmin) {
    if (isHidden(ctx.flags, rule.feature)) return 'hidden';
    if (isMaintenance(ctx.flags, rule.feature)) return 'locked';
  }

  if (rule.requiresAuth && !ctx.isAuthenticated) return 'locked';
  if (rule.requiresKyc && !ctx.kycApproved) return 'locked';
  return 'allowed';
}

/**
 * Why an item is locked. The caller needs this to decide what clicking does:
 * a sign-in lock should send you to the login page, but a maintenance lock
 * should explain itself rather than navigate you somewhere unrelated.
 */
export type LockKind = 'auth' | 'kyc' | 'maintenance' | null;

export function lockKind(rule: AclRule | undefined, ctx: AclContext): LockKind {
  // Maintenance is checked first: it is the more specific and more actionable
  // explanation when an item is both paused and gated.
  if (rule?.feature && ctx.flags && !ctx.isAdmin && isMaintenance(ctx.flags, rule.feature)) return 'maintenance';
  if (rule?.requiresAuth && !ctx.isAuthenticated) return 'auth';
  if (rule?.requiresKyc && !ctx.kycApproved) return 'kyc';
  return null;
}

/** Reason shown in the tooltip when an item is locked. */
export function lockReason(rule: AclRule | undefined, ctx: AclContext): string {
  switch (lockKind(rule, ctx)) {
    case 'maintenance': return flagMessage(ctx.flags!, rule!.feature!);
    case 'auth':        return 'Sign in to access';
    case 'kyc':         return 'KYC verification required';
    default:            return '';
  }
}
