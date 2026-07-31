'use client';

/**
 * Session access for components.
 *
 * This used to own the fetch itself, which meant every consumer issued its own
 * /api/auth/me request and could reach a different conclusion from its
 * neighbours. The state now lives in a single provider; this stays as the entry
 * point so existing imports keep working.
 */
export { useAuthContext as useAuth } from '@/lib/AuthContext';
export type { AuthUser } from '@/lib/AuthContext';
