'use client';

import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { ClipboardIcon, InboxIcon, LockIcon, SearchIcon } from '@/components/Icons';

/** Shared visual language for the admin screens. */

export const C = {
  border: 'rgba(255,255,255,0.10)',
  head:   '#0A1020',
  slate:  'rgba(255,255,255,0.65)',
  ink:    '#F2F5FF',
  muted:  'rgba(255,255,255,0.38)',
  blue:   '#6E8BFF',
  green:  '#2BD9A2',
  amber:  '#FFB224',
  red:    '#E5484D',
};

const TONES: Record<string, { bg: string; color: string }> = {
  green:   { bg: 'rgba(43,217,162,0.12)',   color: C.green },
  amber:   { bg: 'rgba(255,178,36,0.12)',   color: C.amber },
  red:     { bg: 'rgba(229,72,77,0.12)',    color: C.red   },
  blue:    { bg: 'rgba(110,139,255,0.12)',  color: C.blue  },
  neutral: { bg: 'rgba(100,116,139,0.12)', color: C.slate },
};

export type Tone = keyof typeof TONES;

export function Badge({ label, tone = 'neutral', title }: { label: string; tone?: Tone; title?: string }) {
  const t = TONES[tone] ?? TONES.neutral;
  return (
    <Chip
      label={label} size="small" title={title}
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
        <Typography variant="h5" sx={{ fontWeight: 800, color: C.ink, fontSize: 21, letterSpacing: -0.3 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ color: C.muted, mt: 0.4, fontSize: 12.5 }}>{subtitle}</Typography>
        )}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</Box>}
    </Box>
  );
}

/** KPI-style stat tiles with optional left-border accent */
export function StatCards({ stats }: {
  stats: {
    label: string;
    value: React.ReactNode;
    color?: string;
    hint?: string;
    accent?: string;
  }[];
}) {
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: `repeat(${Math.min(stats.length, 5)}, 1fr)` },
      gap: 1.5, mb: 3,
    }}>
      {stats.map(s => (
        <Paper key={s.label} sx={{
          p: 2, bgcolor: '#0D1628',
          border: `1px solid ${C.border}`,
          borderLeft: `3px solid ${s.accent ?? s.color ?? C.border}`,
          borderRadius: 2, boxShadow: 'none',
        }}>
          <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.75 }}>
            {s.label}
          </Typography>
          <Typography sx={{ color: s.color ?? C.ink, fontWeight: 800, fontSize: 28, lineHeight: 1.1, letterSpacing: -0.5 }}>
            {s.value}
          </Typography>
          {s.hint && (
            <Typography sx={{ fontSize: 10.5, color: C.muted, mt: 0.4 }}>{s.hint}</Typography>
          )}
        </Paper>
      ))}
    </Box>
  );
}

/** Banner marking a section as read-only / off-chain scoped. */
export function ReadOnlyNotice({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{
      display: 'flex', gap: 1.5, alignItems: 'flex-start',
      p: 1.75, mb: 2.5, borderRadius: 2,
      bgcolor: 'rgba(110,139,255,0.04)', border: `1px solid rgba(110,139,255,0.14)`,
    }}>
      <Box sx={{ color: C.blue, mt: '1px', flexShrink: 0 }}><LockIcon size={15} /></Box>
      <Typography variant="body2" sx={{ color: C.slate, fontSize: 12.5, lineHeight: 1.65 }}>
        {children}
      </Typography>
    </Box>
  );
}

export function EmptyState({ icon = 'inbox', title, hint }: {
  icon?: 'inbox' | 'search' | 'clipboard';
  title: string;
  hint?: string;
}) {
  const Glyph = { inbox: InboxIcon, search: SearchIcon, clipboard: ClipboardIcon }[icon];
  return (
    <Paper sx={{
      py: 10, px: 4, textAlign: 'center',
      border: `1px dashed ${C.border}`, borderRadius: 3, boxShadow: 'none', bgcolor: '#0D1628',
    }}>
      <Box sx={{
        width: 52, height: 52, mx: 'auto', mb: 2.5, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: 'rgba(110,139,255,0.07)', border: `1px solid rgba(110,139,255,0.15)`, color: C.blue,
      }}>
        <Glyph size={22} />
      </Box>
      <Typography sx={{ fontWeight: 600, color: C.ink, fontSize: 14, mb: 0.5 }}>{title}</Typography>
      {hint && <Typography sx={{ color: C.muted, fontSize: 12.5 }}>{hint}</Typography>}
    </Paper>
  );
}

export const cellSx = {
  color: C.slate, fontSize: 12.5, borderColor: C.border, whiteSpace: 'nowrap' as const, py: '10px',
};
export const headSx = {
  color: C.muted, bgcolor: C.head, fontSize: 10.5, fontWeight: 700,
  textTransform: 'uppercase' as const, letterSpacing: '0.06em',
  whiteSpace: 'nowrap' as const, borderColor: C.border, py: '10px',
};
export const monoSx = { ...cellSx, fontFamily: 'monospace', fontSize: 11.5 };
