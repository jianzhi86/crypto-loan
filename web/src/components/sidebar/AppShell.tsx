'use client';

import { Suspense } from 'react';
import Box from '@mui/material/Box';
import Navbar from '@/components/Navbar';
import AccountStatusBanner from '@/components/AccountStatusBanner';
import Sidebar from './Sidebar';

/**
 * Shared shell for the main app screens: top navbar + collapsible
 * left sidebar + page content. Applied via the (app) route group layout.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <AccountStatusBanner />
      <Box sx={{ display: 'flex', alignItems: 'stretch' }}>
        <Suspense fallback={null}><Sidebar /></Suspense>
        <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
          {children}
        </Box>
      </Box>
    </>
  );
}
