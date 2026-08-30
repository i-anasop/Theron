"use client";

/**
 * A compact day-shape for the site cards.
 *
 * Not a chart — a glyph. It carries one fact: where the dangerous part of the
 * day sits relative to the shift, so three sites can be compared at a glance
 * before any of them is opened.
 */
export default function Sparkline({
  values,
  threshold,
  shiftFrom,
  shiftTo,
  first,
  last,
}: {
  values: number[];
  threshold: number;
  shiftFrom: number;
  shiftTo: number;
  first: number;
  last: number;
}) {
  if (values.length < 2) return null;

  const W = 100;
  const H = 26;
  const min = Math.min(...values, threshold) - 2;
  const max = Math.max(...values, threshold) + 2;
  const span = max - min || 1;

  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / span) * H;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  const hourSpan = Math.max(1, last - first);
  const bandX = (h: number) => ((h - first) / hourSpan) * W;

  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <rect
        x={bandX(shiftFrom)}
        y={0}
        width={Math.max(0, bandX(shiftTo) - bandX(shiftFrom))}
        height={H}
        fill="var(--cobalt)"
        opacity="0.1"
      />
      <path d={area} fill="var(--high)" opacity="0.13" />
      <line
        x1="0"
        y1={y(threshold)}
        x2={W}
        y2={y(threshold)}
        stroke="var(--extreme)"
        strokeWidth="1"
        strokeDasharray="2 2"
        opacity="0.5"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={line}
        fill="none"
        stroke="var(--high)"
        strokeWidth="1.4"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
