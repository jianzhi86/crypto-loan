'use client';

import { useId } from 'react';

/**
 * Tiny 24-hour price line for a table row. Single series at sparkline scale:
 * no axes or grid, a 1.5px line with a faint area fill, colored by the same
 * gain/loss tokens as the signed % change shown beside it (so direction is
 * never carried by color alone). The <title> gives hover + screen-reader
 * users the low / high / last numbers.
 */
export default function Sparkline({
  points,
  up,
  width = 96,
  height = 32,
}: {
  points: number[];
  up: boolean;
  width?: number;
  height?: number;
}) {
  const gradId = useId();
  if (!points || points.length < 2) {
    return (
      <svg width={width} height={height} role="img" aria-label="24h chart unavailable">
        <line x1="4" y1={height / 2} x2={width - 4} y2={height / 2}
          stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="3 4" strokeLinecap="round" />
      </svg>
    );
  }

  const color = up ? '#2BD9A2' : '#E5484D';
  const pad = 2.5;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;

  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  // Flat series (span 0) sits on the midline instead of dividing by zero.
  const y = (v: number) => span === 0
    ? height / 2
    : pad + (1 - (v - min) / span) * (height - pad * 2);

  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`;

  const fmt = (v: number) =>
    'RM ' + v.toLocaleString('en-MY', { maximumFractionDigits: v >= 100 ? 0 : v >= 1 ? 2 : 4 });

  return (
    <svg width={width} height={height} role="img"
      aria-label={`24h price: low ${fmt(min)}, high ${fmt(max)}, now ${fmt(points[points.length - 1])}`}>
      <title>{`24h — Low ${fmt(min)} · High ${fmt(max)} · Now ${fmt(points[points.length - 1])}`}</title>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Last-price dot anchors the eye to "now" */}
      <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r="2" fill={color} />
    </svg>
  );
}
