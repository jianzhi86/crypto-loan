'use client';

import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import type { SxProps, Theme } from '@mui/material/styles';

const CHARSET = '!<>-_\\/[]{}—=+*^?#§$%&'.split('');

type Props = {
  /** Phrases to cycle through, decoding one into the next. */
  phrases: string[];
  /** How long a fully-revealed phrase stays before scrambling to the next (ms). */
  hold?: number;
  className?: string;
  sx?: SxProps<Theme>;
  /** Tint applied to characters that are still scrambling. */
  scrambleColor?: string;
};

type Queue = {
  from: string;
  to: string;
  start: number;
  end: number;
  char?: string;
}[];

/**
 * Classic "decode" text-scramble effect. Each character interpolates from a
 * random glyph to its target over a randomized frame window, driven by rAF.
 * No animation library required.
 */
export default function TextScramble({
  phrases,
  hold = 2400,
  className,
  sx,
  scrambleColor = '#2A3FD6',
}: Props) {
  // Render markup as an array of {char, dim} so scrambling chars can be tinted.
  const [output, setOutput] = useState<{ char: string; dim: boolean }[]>([]);
  const frameRef = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (phrases.length === 0) return;

    let cancelled = false;
    let queue: Queue = [];
    let resolveDone: (() => void) | null = null;

    const setText = (newText: string, oldText: string) =>
      new Promise<void>((resolve) => {
        resolveDone = resolve;
        const length = Math.max(oldText.length, newText.length);
        queue = [];
        for (let i = 0; i < length; i++) {
          const from = oldText[i] || '';
          const to = newText[i] || '';
          const start = Math.floor(Math.random() * 40);
          const end = start + Math.floor(Math.random() * 40) + 10;
          queue.push({ from, to, start, end });
        }
        frameRef.current = 0;
        update();
      });

    const update = () => {
      if (cancelled) return;
      let complete = 0;
      const next: { char: string; dim: boolean }[] = [];
      for (const item of queue) {
        let { char } = item;
        const { from, to, start, end } = item;
        if (frameRef.current >= end) {
          complete++;
          next.push({ char: to, dim: false });
        } else if (frameRef.current >= start) {
          if (!char || Math.random() < 0.28) {
            char = CHARSET[Math.floor(Math.random() * CHARSET.length)];
            item.char = char;
          }
          next.push({ char, dim: true });
        } else {
          next.push({ char: from, dim: false });
        }
      }
      setOutput(next);
      if (complete === queue.length) {
        resolveDone?.();
      } else {
        frameRef.current++;
        rafRef.current = requestAnimationFrame(update);
      }
    };

    let counter = 0;
    const run = async () => {
      const current = phrases[counter % phrases.length];
      const previous = phrases[(counter - 1 + phrases.length) % phrases.length];
      await setText(current, counter === 0 ? '' : previous);
      if (cancelled) return;
      counter++;
      timeoutRef.current = setTimeout(run, hold);
    };

    run();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [phrases, hold]);

  return (
    <Box
      component="span"
      className={className}
      aria-label={phrases.join(' ')}
      sx={{
        display: 'block',
        width: '100%',
        whiteSpace: 'normal',
        overflow: 'hidden',
        ...sx,
      }}
    >
      {(() => {
        // Group consecutive non-space chars into nowrap word-spans;
        // spaces remain as plain breakable inlines.
        const groups: { chars: typeof output; key: number; nowrap: boolean }[] = [];
        let current: typeof output = [];
        let key = 0;
        for (const c of output) {
          if (c.char === ' ') {
            if (current.length > 0) {
              groups.push({ chars: current, key: key++, nowrap: true });
              current = [];
            }
            groups.push({ chars: [c], key: key++, nowrap: false });
          } else {
            current.push(c);
          }
        }
        if (current.length > 0) groups.push({ chars: current, key: key++, nowrap: true });

        return groups.map((g) => (
          <Box
            key={g.key}
            component="span"
            sx={{ whiteSpace: g.nowrap ? 'nowrap' : 'normal' }}
          >
            {g.chars.map((c, i) => (
              <Box
                key={i}
                component="span"
                sx={{ color: c.dim ? scrambleColor : 'inherit', opacity: c.dim ? 0.85 : 1 }}
              >
                {c.char}
              </Box>
            ))}
          </Box>
        ));
      })()}
    </Box>
  );
}
