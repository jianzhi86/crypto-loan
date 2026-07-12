'use client';

import { useState, useEffect } from 'react';

export interface AuthUser {
  id: string;
  email?: string | null;
  name?: string | null;
  walletAddress?: string | null;
  isAdmin?: boolean;
}

export function useAuth() {
  const [user, setUser]       = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = () =>
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : { user: null })
      .then(d => { setUser(d.user ?? null); setLoading(false); })
      .catch(() => setLoading(false));

  useEffect(() => { refresh(); }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  return { user, loading, refresh, logout };
}
