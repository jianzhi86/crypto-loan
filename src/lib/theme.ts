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
          backgroundColor: 'rgba(244,246,248,0.85)',
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${N.border}`,
          color: N.textPri,
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
