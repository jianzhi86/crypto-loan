import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: '#0D0F1A', paper: '#131629' },
    primary:   { main: '#7C3AED', light: '#A78BFA', dark: '#5B21B6' },
    secondary: { main: '#06B6D4', dark: '#0891B2' },
    success:   { main: '#22c55e' },
    warning:   { main: '#eab308' },
    error:     { main: '#ef4444' },
    text:      { primary: '#F1F5F9', secondary: '#64748B' },
    divider:   '#1E2035',
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'var(--font-geist-sans), system-ui, -apple-system, sans-serif',
    button: { textTransform: 'none' as const },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: { backgroundColor: '#131629', border: '1px solid #1E2035', backgroundImage: 'none' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none' },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: '#0D0F1A',
          '& fieldset': { borderColor: '#1E2035' },
          '&:hover fieldset': { borderColor: '#7C3AED' },
          '&.Mui-focused fieldset': { borderColor: '#7C3AED' },
        },
        input: { color: '#F1F5F9' },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { color: '#64748B', '&.Mui-focused': { color: '#7C3AED' } },
      },
    },
    MuiSelect: {
      styleOverrides: { icon: { color: '#64748B' } },
    },
    MuiMenu: {
      styleOverrides: {
        paper: { backgroundColor: '#131629', border: '1px solid #1E2035' },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: '#1E2035' },
          '&.Mui-selected': { backgroundColor: '#7C3AED22' },
          '&.Mui-selected:hover': { backgroundColor: '#7C3AED33' },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: '#1E2035' },
        head: { color: '#64748B', backgroundColor: '#131629', fontSize: 12, fontWeight: 500 },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 999 } },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor: '#1E2035' } },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { backgroundColor: '#1E2035', borderRadius: 999, height: 6 },
        bar:  { borderRadius: 999 },
      },
    },
    MuiSkeleton: {
      styleOverrides: { root: { backgroundColor: '#1E2035' } },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { backgroundColor: '#0D0F1A', border: '1px solid #1E2035', backgroundImage: 'none' },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          color: '#64748B',
          '&.Mui-selected': { color: '#A78BFA' },
        },
      },
    },
    MuiTabs: {
      styleOverrides: { indicator: { backgroundColor: '#7C3AED' } },
    },
    MuiSlider: {
      styleOverrides: {
        root: { color: '#7C3AED' },
        rail: { backgroundColor: '#1E2035' },
      },
    },
    MuiStepIcon: {
      styleOverrides: {
        root: {
          color: '#374151',
          '&.Mui-active':    { color: '#7C3AED' },
          '&.Mui-completed': { color: '#7C3AED' },
        },
      },
    },
    MuiStepLabel: {
      styleOverrides: {
        label: {
          color: '#6B7280',
          '&.Mui-active':    { color: '#A78BFA' },
          '&.Mui-completed': { color: '#7C3AED' },
        },
      },
    },
    MuiStepConnector: {
      styleOverrides: { line: { borderColor: '#374151' } },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: { color: '#64748B', '&.Mui-checked': { color: '#7C3AED' } },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: '#0D0F1Acc',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #1E2035',
        },
      },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 12 } },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: '#131629', border: '1px solid #1E2035', color: '#F1F5F9', fontSize: 12 },
      },
    },
  },
});

export default theme;
