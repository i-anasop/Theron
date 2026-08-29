"use client";

import { useMemo } from "react";
import type { HourReading } from "@/lib/analysis/hourly";

/**
 * The day's heat-index curve, with the OSHA high-heat trigger drawn across it
 * and the shift windows shaded.
 *
 * The threshold line is the point of the chart: it makes "how far over the
 * line, and for how long" visible at a glance, which is exactly the quantity
 * the counterfactual optimises. A bar chart of temperatures would look similar
 * and say nothing.
 */

const OSHA_HIGH = 90;
const Y_MIN = 70;
const Y_MAX = 118;
const W = 340;
const H = 104;

const RISK_COLOR: Record<string, string> = {
  safe: "var(--safe)",
  caution: "var(--caution)",
  high: "var(--high)",
  extreme: "var(--extreme)",
};

export default function HeatChart({
  hours,
  shiftStart,
  shiftEnd,
  proposedStart,
  proposedEnd,
  id,
  height,
}: {
  hours: HourReading[];
  shiftStart: number;
  shiftEnd: number;
  proposedStart?: number;
  proposedEnd?: number;
  id: string;
  height?: number;
}) {
  const pts = useMemo(() => {
    if (!hours.length) return [];
    const span = Math.max(1, hours.length - 1);
    return hours.map((h, i) => ({
      x: (i / span) * W,
      y: H - ((Math.min(Y_MAX, Math.max(Y_MIN, h.heatIndexF)) - Y_MIN) / (Y_MAX - Y_MIN)) * H,
      h,
    }));
  }, [hours]);

  if (!pts.length) return null;

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const thresholdY = H - ((OSHA_HIGH - Y_MIN) / (Y_MAX - Y_MIN)) * H;

  const first = hours[0].hourIndex;
  const last = hours[hours.length - 1].hourIndex;
  const bandX = (hour: number) => ((hour - first) / Math.max(1, last - first)) * W;

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={height ? { height } : undefined}
        role="img"
        aria-label={`Hourly heat index. Peak ${Math.max(...hours.map((h) => h.heatIndexF))} degrees Fahrenheit.`}
      >
        <defs>
          <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--extreme)" stopOpacity="0.26" />
            <stop offset="55%" stopColor="var(--high)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--cobalt)" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {proposedStart !== undefined && proposedEnd !== undefined && (
          <rect
            x={bandX(proposedStart)}
            y={0}
            width={Math.max(0, bandX(proposedEnd) - bandX(proposedStart))}
            height={H}
            fill="var(--safe)"
            opacity="0.11"
          />
        )}

        <rect
          x={bandX(shiftStart)}
          y={0}
          width={Math.max(0, bandX(shiftEnd) - bandX(shiftStart))}
          height={H}
          fill="var(--cobalt)"
          opacity="0.08"
        />

        <line
          x1="0"
          y1={thresholdY}
          x2={W}
          y2={thresholdY}
          stroke="var(--extreme)"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.55"
          vectorEffect="non-scaling-stroke"
        />

        <path d={area} fill={`url(#g-${id})`} />
        <path
          d={line}
          fill="none"
          stroke="var(--high)"
          strokeWidth="1.7"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {pts.map((p) => (
          <circle
            key={p.h.hourIndex}
            cx={p.x}
            cy={p.y}
            r="2.1"
            fill={RISK_COLOR[p.h.risk] ?? "var(--ink-3)"}
            vectorEffect="non-scaling-stroke"
          >
            <title>
              {p.h.hour} — {p.h.tempF}°F air, {p.h.humidityPct}% humidity → heat index {p.h.heatIndexF}°F (
              {p.h.risk})
            </title>
          </circle>
        ))}
      </svg>

      <div className="chart-key">
        <span>
          <i className="sw" style={{ background: "var(--cobalt)", opacity: 0.35 }} /> scheduled
        </span>
        {proposedStart !== undefined && (
          <span>
            <i className="sw" style={{ background: "var(--safe)", opacity: 0.45 }} /> proposed
          </span>
        )}
        <span style={{ color: "var(--extreme)" }}>┄ OSHA high-heat trigger · 90°F</span>
      </div>
    </div>
  );
}
