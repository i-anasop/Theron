"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts a number up once it scrolls into view.
 *
 * Eased rather than linear, so the value decelerates into its final state
 * instead of stopping dead — a linear count reads as a loading spinner, an
 * eased one reads as a measurement settling.
 */
export default function CountUp({
  to,
  duration = 1100,
  decimals = 0,
  suffix = "",
  prefix = "",
}: {
  to: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [v, setV] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setV(to);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || done.current) return;
        done.current = true;
        io.disconnect();

        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          // easeOutCubic
          const eased = 1 - Math.pow(1 - p, 3);
          setV(to * eased);
          if (p < 1) requestAnimationFrame(tick);
          else setV(to);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}
