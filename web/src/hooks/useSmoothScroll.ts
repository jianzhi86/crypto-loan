'use client';

import { useEffect } from 'react';
import Lenis from 'lenis';

/**
 * Attaches Lenis smooth scrolling to the window.
 * Listens for 'lenis:stop' / 'lenis:start' custom events so dialogs
 * can pause smooth scroll while they are open (otherwise Lenis intercepts
 * all wheel events and CSS/JS scroll locks have no effect).
 */
export function useSmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.7,
      touchMultiplier: 1.5,
      infinite: false,
    });

    const stop  = () => lenis.stop();
    const start = () => lenis.start();
    window.addEventListener('lenis:stop',  stop);
    window.addEventListener('lenis:start', start);

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('lenis:stop',  stop);
      window.removeEventListener('lenis:start', start);
      lenis.destroy();
    };
  }, []);
}
