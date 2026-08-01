import { createTheme } from '@mui/material/styles';
import { PALETTE } from '@/lib/tokens';

// Passbook light-neobank theme: cool paper ground, white cards, indigo brand,
// reserved green/red status colours. See lib/tokens.ts for the rationale.
const N = {
  bg:        PALETTE.bg,
  paper:     PALETTE.surface,
  card:      PALETTE.surface,
  inner:     PALETTE.raised,
  border:    PALETTE.line,
  rule:      PALETTE.rule,
  indigo:    PALETTE.indigo,
  indigoHi:  PALETTE.indigoHi,
  indigoDeep:PALETTE.indigoDeep,
  up:        PALETTE.up,
  down:      PALETTE.down,
  amber:     PALETTE.amber,
  textPri:   PALETTE.text,
  textSec:   PALETTE.textDim,
  divider:   PALETTE.line,
};

// ── Dark app theme ──────────────────────────────────────────────────────────
// The signed-in app runs on the brand navy (see the landing page's Vision &
// Mission band): navy ground, raised navy cards, glass hairlines, brightened
// accents. Scoped to the (screen) shell via a nested ThemeProvider in
// AppShell; the marketing/auth pages keep the light theme below.
const D = {
  bg:      '#0B1226',
  paper:   '#111B38',
  inner:   '#0F1730',
  border:  'rgba(255,255,255,0.1)',
  indigo:  '#3D5BF5',
  indigoHi:'#6E8BFF',
  text:    '#F2F5FF',
  textDim: 'rgba(255,255,255,0.65)',
};

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: D.bg, paper: D.paper },
    primary:   { main: D.indigo, light: D.indigoHi, dark: '#2333B8', contrastText: '#FFFFFF' },
    secondary: { main: '#2BD9A2', dark: '#0E9F6E' },
    success:   { main: '#2BD9A2' },
    warning:   { main: '#FFB224' },
    error:     { main: '#FF7A7E' },
    text:      { primary: D.text, secondary: D.textDim },
    divider:   D.border,
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, sans-serif',
    h1: { fontFamily: 'var(--font-display), system-ui, sans-serif', fontWeight: 700, letterSpacing: '-0.5px' },
    h2: { fontFamily: 'var(--font-display), system-ui, sans-serif', fontWeight: 700, letterSpacing: '-0.5px' },
    h3: { fontFamily: 'var(--font-display), system-ui, sans-serif', fontWeight: 700 },
    h4: { fontFamily: 'var(--font-display), system-ui, sans-serif', fontWeight: 700 },
    button: { textTransform: 'none' as const, fontWeight: 600 },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: D.paper,
          border: `1px solid ${D.border}`,
          backgroundImage: 'none',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundColor: D.paper, backgroundImage: 'none' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, borderRadius: 10 },
        contained: {
          backgroundColor: D.indigo,
          backgroundImage: 'none',
          color: '#FFFFFF',
          boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
          '&:hover': { backgroundColor: '#2333B8', boxShadow: '0 4px 14px rgba(61,91,245,0.4)' },
          '&.Mui-disabled': { backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' },
        },
        outlined: {
          borderColor: D.border,
          color: D.text,
          '&:hover': { borderColor: D.indigoHi, backgroundColor: 'rgba(110,139,255,0.08)' },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: D.inner,
          borderRadius: 10,
          '& fieldset': { borderColor: D.border },
          '&:hover fieldset': { borderColor: D.indigoHi },
          '&.Mui-focused fieldset': { borderColor: D.indigoHi },
        },
        input: { color: D.text },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { color: D.textDim, '&.Mui-focused': { color: D.indigoHi } },
      },
    },
    MuiSelect: { styleOverrides: { icon: { color: D.textDim } } },
    MuiMenu: {
      styleOverrides: {
        paper: { backgroundColor: D.paper, border: `1px solid ${D.border}`, borderRadius: 12 },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: 'rgba(110,139,255,0.08)' },
          '&.Mui-selected': { backgroundColor: 'rgba(110,139,255,0.14)' },
          '&.Mui-selected:hover': { backgroundColor: 'rgba(110,139,255,0.2)' },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: D.border },
        head: { color: D.textDim, backgroundColor: 'transparent', fontSize: 12, fontWeight: 600 },
      },
    },
    MuiChip: { styleOverrides: { root: { borderRadius: 999, fontWeight: 600 } } },
    MuiDivider: { styleOverrides: { root: { borderColor: D.border } } },
    MuiLinearProgress: {
      styleOverrides: {
        root: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 999, height: 6 },
        bar:  { borderRadius: 999 },
      },
    },
    MuiSkeleton: {
      styleOverrides: { root: { backgroundColor: 'rgba(255,255,255,0.08)' } },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { backgroundColor: D.paper, border: `1px solid ${D.border}`, backgroundImage: 'none', borderRadius: 18 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          color: D.textDim,
          fontWeight: 600,
          '&.Mui-selected': { color: D.indigoHi },
        },
      },
    },
    MuiTabs: {
      styleOverrides: { indicator: { backgroundColor: D.indigoHi, height: 3, borderRadius: 999 } },
    },
    MuiSlider: {
      styleOverrides: {
        root: { color: D.indigoHi },
        rail: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, opacity: 1 },
        thumb: { boxShadow: '0 0 0 6px rgba(110,139,255,0.2)' },
      },
    },
    MuiStepIcon: {
      styleOverrides: {
        root: {
          color: 'rgba(255,255,255,0.15)',
          '&.Mui-active':    { color: D.indigoHi },
          '&.Mui-completed': { color: D.indigo },
        },
      },
    },
    MuiStepLabel: {
      styleOverrides: {
        label: {
          color: D.textDim,
          '&.Mui-active':    { color: D.indigoHi },
          '&.Mui-completed': { color: D.text },
        },
      },
    },
    MuiStepConnector: {
      styleOverrides: { line: { borderColor: 'rgba(255,255,255,0.15)' } },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: { color: D.textDim, '&.Mui-checked': { color: D.indigoHi } },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(11,18,38,0.92)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          color: '#FFFFFF',
        },
      },
    },
    MuiAlert: { styleOverrides: { root: { borderRadius: 12 } } },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: '#1B2647', color: '#FFFFFF', fontSize: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)' },
        arrow: { color: '#1B2647' },
      },
    },
  },
});

const theme = createTheme({
  palette: {
    mode: 'light',
    background: { default: N.bg, paper: N.paper },
    primary:   { main: N.indigo, light: N.indigoHi, dark: N.indigoDeep, contrastText: '#FFFFFF' },
    secondary: { main: N.up, dark: '#0B7E58' },
    success:   { main: N.up },
    warning:   { main: N.amber },
    error:     { main: N.down },
    text:      { primary: N.textPri, secondary: N.textSec },
    divider:   N.divider,
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, sans-serif',
    // Display headings wear the Hanken Grotesk — the passbook voice.
    h1: { fontFamily: 'var(--font-display), system-ui, sans-serif', fontWeight: 700, letterSpacing: '-0.5px' },
    h2: { fontFamily: 'var(--font-display), system-ui, sans-serif', fontWeight: 700, letterSpacing: '-0.5px' },
    h3: { fontFamily: 'var(--font-display), system-ui, sans-serif', fontWeight: 700 },
    h4: { fontFamily: 'var(--font-display), system-ui, sans-serif', fontWeight: 700 },
    button: { textTransform: 'none' as const, fontWeight: 600 },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: N.card,
          border: `1px solid ${N.border}`,
          backgroundImage: 'none',
          boxShadow: '0 1px 2px rgba(16,21,28,0.04)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, borderRadius: 10 },
        contained: {
          backgroundColor: N.indigo,
          backgroundImage: 'none',
          color: '#FFFFFF',
          boxShadow: '0 1px 2px rgba(16,21,28,0.08)',
          '&:hover': {
            backgroundColor: N.indigoDeep,
            boxShadow: '0 4px 14px rgba(42,63,214,0.28)',
          },
          '&.Mui-disabled': {
            backgroundColor: '#E2E7EE',
            color: '#A9B4C2',
          },
        },
        outlined: {
          borderColor: N.border,
          color: N.textPri,
          '&:hover': { borderColor: N.indigo, backgroundColor: 'rgba(42,63,214,0.04)' },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: N.paper,
          borderRadius: 10,
          '& fieldset': { borderColor: N.border },
          '&:hover fieldset': { borderColor: N.indigo },
          '&.Mui-focused fieldset': { borderColor: N.indigo },
        },
        input: { color: N.textPri },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { color: N.textSec, '&.Mui-focused': { color: N.indigo } },
      },
    },
    MuiSelect: {
      styleOverrides: { icon: { color: N.textSec } },
    },
    MuiMenu: {
      styleOverrides: {
        paper: { backgroundColor: N.paper, border: `1px solid ${N.border}`, borderRadius: 12 },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: 'rgba(42,63,214,0.06)' },
          '&.Mui-selected': { backgroundColor: 'rgba(42,63,214,0.1)' },
          '&.Mui-selected:hover': { backgroundColor: 'rgba(42,63,214,0.16)' },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: N.border },
        head: { color: N.textSec, backgroundColor: 'transparent', fontSize: 12, fontWeight: 600 },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 999, fontWeight: 600 } },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: N.border } },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { backgroundColor: '#E7EBF1', borderRadius: 999, height: 6 },
        bar:  { borderRadius: 999 },
      },
    },
    MuiSkeleton: {
      styleOverrides: { root: { backgroundColor: 'rgba(16,21,28,0.07)' } },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { backgroundColor: N.paper, border: `1px solid ${N.border}`, backgroundImage: 'none', borderRadius: 18 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          color: N.textSec,
          fontWeight: 600,
          '&.Mui-selected': { color: N.indigo },
        },
      },
    },
    MuiTabs: {
      styleOverrides: { indicator: { backgroundColor: N.indigo, height: 3, borderRadius: 999 } },
    },
    MuiSlider: {
      styleOverrides: {
        root: { color: N.indigo },
        rail: { backgroundColor: '#D7DEE6', borderRadius: 999, opacity: 1 },
        thumb: { boxShadow: '0 0 0 6px rgba(42,63,214,0.16)' },
      },
    },
    MuiStepIcon: {
      styleOverrides: {
        root: {
          color: '#D7DEE6',
          '&.Mui-active':    { color: N.indigo },
          '&.Mui-completed': { color: N.indigoDeep },
        },
      },
    },
    MuiStepLabel: {
      styleOverrides: {
        label: {
          color: N.textSec,
          '&.Mui-active':    { color: N.indigo },
          '&.Mui-completed': { color: N.textPri },
        },
      },
    },
    MuiStepConnector: {
      styleOverrides: { line: { borderColor: '#D7DEE6' } },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: { color: N.textSec, '&.Mui-checked': { color: N.indigo } },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          // Brand navy chrome (see the landing page's Vision & Mission band):
          // dark header over light content surfaces.
          backgroundColor: 'rgba(11,18,38,0.92)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          color: '#FFFFFF',
        },
      },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 12 } },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#10151C',
          color: '#FFFFFF',
          fontSize: 12,
          borderRadius: 8,
        },
        arrow: { color: '#10151C' },
      },
    },
  },
});

export default theme;
