'use client';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';

const GRID = 'rgba(255,255,255,0.06)';
const AXIS  = 'rgba(255,255,255,0.30)';

/* ─── Sparkline ──────────────────────────────────────────────────────────── */
export function Sparkline({ data, color }: { data: { v: number }[]; color?: string }) {
  const c = color ?? '#2BD9A2';
  const gradId = `sg-${c.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height={52}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={c} stopOpacity={0.35} />
            <stop offset="95%" stopColor={c} stopOpacity={0}    />
          </linearGradient>
        </defs>
        <Area
          type="monotone" dataKey="v"
          stroke={c} strokeWidth={1.8}
          fill={`url(#${gradId})`}
          dot={false} isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─── Protocol overview area chart ──────────────────────────────────────── */
type MonthRow = { month: string; borrowed: number; repaid: number; outstanding: number };

const TOOLTIP_STYLE: React.CSSProperties = {
  background: '#14203A',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 8,
  fontSize: 12,
  color: '#F2F5FF',
};

function rmShort(n: number) {
  return n >= 1_000_000 ? `RM ${(n/1_000_000).toFixed(1)}M`
       : n >= 1_000    ? `RM ${(n/1_000).toFixed(0)}K`
       : `RM ${n.toFixed(0)}`;
}

export function ProtocolAreaChart({ data }: { data: MonthRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="gBorrow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#2BD9A2" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#2BD9A2" stopOpacity={0}    />
          </linearGradient>
          <linearGradient id="gRepaid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#6E8BFF" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#6E8BFF" stopOpacity={0}    />
          </linearGradient>
          <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#FFB224" stopOpacity={0.20} />
            <stop offset="95%" stopColor="#FFB224" stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="month" tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={rmShort} tick={{ fill: AXIS, fontSize: 10 }} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any, name: any) => [rmShort(v as number), name] as any}
        />
        <Area type="monotone" dataKey="borrowed"    name="Borrowed"    stroke="#2BD9A2" strokeWidth={2} fill="url(#gBorrow)" dot={false} />
        <Area type="monotone" dataKey="repaid"      name="Repaid"      stroke="#6E8BFF" strokeWidth={2} fill="url(#gRepaid)" dot={false} />
        <Area type="monotone" dataKey="outstanding" name="Outstanding" stroke="#FFB224" strokeWidth={2} fill="url(#gOut)"    dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─── Activity donut ─────────────────────────────────────────────────────── */
type SliceRow = { name: string; value: number; color: string };

const CustomLegend = ({ payload }: { payload?: { value: string; color: string }[] }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, pl: 1 }}>
    {(payload ?? []).map(e => (
      <Box key={e.value} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: e.color, flexShrink: 0 }} />
        <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>{e.value}</Typography>
      </Box>
    ))}
  </Box>
);

export function ActivityDonut({ data, center }: { data: SliceRow[]; center: string }) {
  return (
    <PieChart width={200} height={160}>
      <Pie
        data={data} cx={75} cy={75} innerRadius={46} outerRadius={68}
        dataKey="value" paddingAngle={3} isAnimationActive={false}
      >
        {data.map((s, i) => <Cell key={i} fill={s.color ?? '#6E8BFF'} />)}
      </Pie>
      <text x={76} y={71} textAnchor="middle" dominantBaseline="middle" fill="#F2F5FF" fontSize={18} fontWeight={800}>
        {center}
      </text>
      <text x={76} y={88} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.4)" fontSize={10}>
        txs
      </text>
      <Legend content={<CustomLegend />} layout="vertical" align="right" verticalAlign="middle" />
    </PieChart>
  );
}
