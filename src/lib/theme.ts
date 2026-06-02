import { createTheme } from '@mui/material/styles';

// Nexo-inspired palette: deep navy + teal-green + amber
const N = {
  bg:       '#060D1F',
  paper:    '#0B1628',
  card:     '#0F1E38',
  border:   'rgba(255,255,255,0.08)',
  teal:     '#00C8A0',
  tealLt:   '#33D4B2',
  tealDk:   '#009E80',
  gold:     '#FFB800',
  blue:     '#2E7EFF',
  red:      '#FF4560',
  textPri:  '#E2EBF9',
  textSec:  '#7A90B6',
  divider:  'rgba(255,255,255,0.07)',
};

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: N.bg, paper: N.paper },
    primary:   { main: N.teal,  light: N.tealLt, dark: N.tealDk },
    secondary: { main: N.gold,  dark: '#E6A600'  },
    success:   { main: N.teal  },
    warning:   { main: N.gold  },
    error:     { main: N.red   },
    text:      { primary: N.textPri, secondary: N.textSec },
    divider:   N.divider,
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, sans-serif',
    button: { textTransform: 'none' as const, fontWeight: 600 },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: N.paper,
          border: `1px solid ${N.border}`,
          backgroundImage: 'none',
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
          background: `linear-gradient(135deg, ${N.teal} 0%, #0090D0 100%)`,
          color: '#fff',
          boxShadow: `0 4px 14px rgba(0,200,160,0.25)`,
          '&:hover': {
            background: `linear-gradient(135deg, ${N.tealLt} 0%, #2E7EFF 100%)`,
            boxShadow: `0 6px 20px rgba(0,200,160,0.35)`,
          },
          '&.Mui-disabled': {
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.3)',
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: N.card,
          borderRadius: 10,
          '& fieldset': { borderColor: N.border },
          '&:hover fieldset': { borderColor: N.teal },
          '&.Mui-focused fieldset': { borderColor: N.teal },
        },
        input: { color: N.textPri },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { color: N.textSec, '&.Mui-focused': { color: N.teal } },
      },
    },
    MuiSelect: {
      styleOverrides: { icon: { color: N.textSec } },
    },
    MuiMenu: {
      styleOverrides: {
        paper: { backgroundColor: N.card, border: `1px solid ${N.border}`, borderRadius: 12 },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' },
          '&.Mui-selected': { backgroundColor: `${N.teal}22` },
          '&.Mui-selected:hover': { backgroundColor: `${N.teal}33` },
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
        root: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 999, height: 6 },
        bar:  { borderRadius: 999 },
      },
    },
    MuiSkeleton: {
      styleOverrides: { root: { backgroundColor: 'rgba(255,255,255,0.06)' } },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { backgroundColor: N.paper, border: `1px solid ${N.border}`, backgroundImage: 'none', borderRadius: 20 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          color: N.textSec,
          fontWeight: 600,
          '&.Mui-selected': { color: N.teal },
        },
      },
    },
    MuiTabs: {
      styleOverrides: { indicator: { backgroundColor: N.teal, height: 3, borderRadius: 999 } },
    },
    MuiSlider: {
      styleOverrides: {
        root: { color: N.teal },
        rail: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 999 },
        thumb: { boxShadow: `0 0 0 6px ${N.teal}22` },
      },
    },
    MuiStepIcon: {
      styleOverrides: {
        root: {
          color: 'rgba(255,255,255,0.1)',
          '&.Mui-active':    { color: N.teal },
          '&.Mui-completed': { color: N.tealDk },
        },
      },
    },
    MuiStepLabel: {
      styleOverrides: {
        label: {
          color: N.textSec,
          '&.Mui-active':    { color: N.tealLt },
          '&.Mui-completed': { color: N.teal },
        },
      },
    },
    MuiStepConnector: {
      styleOverrides: { line: { borderColor: 'rgba(255,255,255,0.1)' } },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: { color: N.textSec, '&.Mui-checked': { color: N.teal } },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(6,13,31,0.85)',
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${N.border}`,
        },
      },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 12 } },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: N.card,
          border: `1px solid ${N.border}`,
          color: N.textPri,
          fontSize: 12,
          borderRadius: 8,
        },
      },
    },
  },
});

export default theme;
