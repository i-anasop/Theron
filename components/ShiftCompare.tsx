"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The before/after of a rescheduled shift, as two proportional bars.
 *
 * This is the one comparison the whole product exists to make, so it gets a
 * dedicated visual rather than a row in a table. The bars are scaled to the
 * larger value and grow on entry, which makes the size of the reduction
 * legible before any number is read.
 */

export interface ShiftCompareProps {
  currentLabel: string;
  proposedLabel: string;
  currentValue: number;
  proposedValue: number;
  currentPeak: number;
  proposedPeak: number;
  percentReduction: number;
  crewHours: number;
  crewSize: number;
}

export default function ShiftCompare(p: ShiftCompareProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [go, setGo] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setGo(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setGo(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const max = Math.max(p.currentValue, p.proposedValue) || 1;
  const wNow = go ? (p.currentValue / max) * 100 : 0;
  const wNew = go ? (p.proposedValue / max) * 100 : 0;

  return (
    <div className="compare" ref={ref}>
      <div className="compare-row">
        <div className="compare-meta">
          <span className="label">As scheduled</span>
          <span className="compare-window">{p.currentLabel}</span>
        </div>
        <div className="compare-track">
          <div className="compare-bar now" style={{ width: `${wNow}%` }}>
            <span>{p.currentValue}</span>
          </div>
        </div>
        <div className="compare-peak">
          {p.currentPeak}
          <small>°F peak</small>
        </div>
      </div>

      <div className="compare-row">
        <div className="compare-meta">
          <span className="label">Theron&rsquo;s proposal</span>
          <span className="compare-window">{p.proposedLabel}</span>
        </div>
        <div className="compare-track">
          <div className="compare-bar next" style={{ width: `${wNew}%` }}>
            <span>{p.proposedValue}</span>
          </div>
        </div>
        <div className="compare-peak">
          {p.proposedPeak}
          <small>°F peak</small>
        </div>
      </div>

      <div className="compare-foot">
        <div>
          <span className="compare-delta">&minus;{p.percentReduction}%</span>
          <span className="compare-unit">heat exposure above the OSHA trigger</span>
        </div>
        <div className="compare-crew">
          {p.crewHours.toLocaleString()} crew-degree-hours removed across {p.crewSize} workers
        </div>
      </div>
    </div>
  );
}
