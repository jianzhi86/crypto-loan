// Access control rules for sidebar navigation items.

export interface AclContext {
  isAuthenticated: boolean;
  isAdmin: boolean;
  kycApproved: boolean;
}

export interface AclRule {
  /** Item only visible when logged in as an admin. Hidden otherwise. */
  requiresAdmin?: boolean;
  /** Item requires a logged-in account. Shown locked when signed out. */
  requiresAuth?: boolean;
  /** Item requires an approved KYC. Shown locked until verified. */
  requiresKyc?: boolean;
}

export type AclStatus = 'allowed' | 'locked' | 'hidden';

export function checkAcl(rule: AclRule | undefined, ctx: AclContext): AclStatus {
  if (!rule) return 'allowed';
  if (rule.requiresAdmin && !ctx.isAdmin) return 'hidden';
  if (rule.requiresAuth && !ctx.isAuthenticated) return 'locked';
  if (rule.requiresKyc && !ctx.kycApproved) return 'locked';
  return 'allowed';
}

/** Reason shown in the tooltip when an item is locked. */
export function lockReason(rule: AclRule | undefined, ctx: AclContext): string {
  if (rule?.requiresAuth && !ctx.isAuthenticated) return 'Sign in to access';
  if (rule?.requiresKyc && !ctx.kycApproved) return 'KYC verification required';
  return '';
}
