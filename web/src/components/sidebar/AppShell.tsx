'use client';

import { Suspense } from 'react';
import Box from '@mui/material/Box';
import { ThemeProvider } from '@mui/material/styles';
import Navbar from '@/components/Navbar';
import AccountStatusBanner from '@/components/AccountStatusBanner';
import Sidebar from './Sidebar';
import { darkTheme } from '@/lib/theme';

/**
 * Shared shell for the main app screens: top navbar + collapsible
 * left sidebar + page content. Applied via the (app) route group layout.
 *
 * The signed-in app runs on the dark navy theme (Nexo-style); the marketing
 * and auth pages outside this shell keep the light theme. Nesting the
 * provider here scopes every MUI default — paper, text, inputs, dialogs —
 * without touching the pages outside.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider theme={darkTheme}>
      <Navbar />
      <AccountStatusBanner />
      {/* `color` here is load-bearing: MUI v9 drops the `color="text.primary"`
          prop form (no CSS is emitted), so that text inherits from its
          ancestors — previously the body's light-theme ink, which turned
          invisible on navy. Setting the inherited default at the shell root
          fixes every prop-form usage inside the app in one place. */}
      <Box sx={{ display: 'flex', alignItems: 'stretch', bgcolor: '#0B1226', color: '#F2F5FF' }}>
        <Suspense fallback={null}><Sidebar /></Suspense>
        <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
          {children}
        </Box>
      </Box>
    </ThemeProvider>
  );
}
