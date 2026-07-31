'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { ClipboardIcon, InboxIcon, LockIcon, SearchIcon } from '@/components/Icons';

/** Shared visual language for the admin screens, matched to the existing KYC table. */

export const C = {
  border: '#E2E7EE',
  head:   '#EEF1F5',
  slate:  '#5A6675',
  ink:    '#10151C',
  muted:  '#A9B2BD',
  blue:   '#2A3FD6',
  green:  '#0E9F6E',
  amber:  '#C77700',
  red:    '#E5484D',
};

const TONES: Record<string, { bg: string; color: string }> = {
  green:   { bg: 'rgba(14,159,110,0.10)', color: C.green },
  amber:   { bg: 'rgba(199,119,0,0.10)',  color: C.amber },
  red:     { bg: 'rgba(229,72,77,0.10)',  color: C.red   },
  blue:    { bg: 'rgba(42,63,214,0.10)',  color: C.blue  },
  neutral: { bg: 'rgba(90,102,117,0.10)', color: C.slate },
};

export type Tone = keyof typeof TONES;

export function Badge({ label, tone = 'neutral', title }: { label: string; tone?: Tone; title?: string }) {
  const t = TONES[tone] ?? TONES.neutral;
  return (
    <Chip
      label={label}
      size="small"
      title={title}
      sx={{ bgcolor: t.bg, color: t.color, fontWeight: 600, height: 20, fontSize: 11, borderRadius: 1 }}
    />
  );
}

export function PageHeader({ title, subtitle, actions }: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Box sx={{
      display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between',
      flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 3,
    }}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700, color: C.ink }}>{title}</Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ color: C.slate, mt: 0.5 }}>{subtitle}</Typography>
        )}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</Box>}
    </Box>
  );
}

export function StatCards({ stats }: { stats: { label: string; value: React.ReactNode; color?: string; hint?: string }[] }) {
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: `repeat(${Math.min(stats.length, 5)}, 1fr)` },
      gap: 2, mb: 3,
    }}>
      {stats.map(s => (
        <Paper key={s.label} sx={{ p: 2, border: `1px solid ${C.border}`, borderRadius: 2, boxShadow: 'none' }}>
          <Typography variant="caption" sx={{ color: C.slate }}>{s.label}</Typography>
          <Typography variant="h4" sx={{ color: s.color ?? C.slate, mt: 0.5, fontWeight: 700, fontSize: 28 }}>
            {s.value}
          </Typography>
          {s.hint && <Typography variant="caption" sx={{ color: C.muted }}>{s.hint}</Typography>}
        </Paper>
      ))}
    </Box>
  );
}

/** Banner marking a table as a mirror of on-chain data that must not be edited. */
export function ReadOnlyNotice({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{
      display: 'flex', gap: 1.5, alignItems: 'flex-start',
      p: 1.75, mb: 2.5, borderRadius: 2,
      bgcolor: 'rgba(42,63,214,0.04)', border: '1px solid rgba(42,63,214,0.15)',
    }}>
      <Box sx={{ color: C.blue, mt: '1px' }}><LockIcon size={16} /></Box>
      <Typography variant="body2" sx={{ color: C.slate, fontSize: 12.5, lineHeight: 1.6 }}>
        {children}
      </Typography>
    </Box>
  );
}

/**
 * Empty table placeholder. `icon` names one of a small set rather than taking
 * arbitrary content, so every empty state across the admin looks the same.
 */
export function EmptyState({ icon = 'inbox', title, hint }: {
  icon?: 'inbox' | 'search' | 'clipboard';
  title: string;
  hint?: string;
}) {
  const Glyph = { inbox: InboxIcon, search: SearchIcon, clipboard: ClipboardIcon }[icon];
  return (
    <Paper sx={{ p: 8, textAlign: 'center', border: `1px dashed ${C.border}`, borderRadius: 3, boxShadow: 'none' }}>
      <Box sx={{
        width: 48, height: 48, mx: 'auto', mb: 2, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: '#F4F6F8', color: C.muted,
      }}>
        <Glyph size={22} />
      </Box>
      <Typography variant="body1" sx={{ fontWeight: 500, color: C.ink }} gutterBottom>{title}</Typography>
      {hint && <Typography variant="body2" sx={{ color: C.slate }}>{hint}</Typography>}
    </Paper>
  );
}

export const cellSx = {
  color: C.slate, fontSize: 12, borderColor: C.border, whiteSpace: 'nowrap' as const,
};
export const headSx = {
  color: C.slate, bgcolor: C.head, fontSize: 11, fontWeight: 600,
  whiteSpace: 'nowrap' as const, borderColor: C.border,
};
export const monoSx = { ...cellSx, fontFamily: 'monospace', fontSize: 11.5 };
