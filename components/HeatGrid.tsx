"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TileGrid } from "@/lib/analysis/tiles";

/**
 * The worksite's thermal field, animated across the day.
 *
 * Rendered to canvas rather than SVG: a few hundred filled polygons redrawn on
 * every animation frame is exactly the workload canvas is for, and it keeps
 * playback smooth on a phone.
 *
 * Colour interpolates through a perceptual heat ramp anchored to the day's own
 * min and max, so the scale is stable while scrubbing — a tile that darkens is
 * genuinely hotter, not just hotter relative to that one hour.
 */

const RAMP: Array<[number, number, number]> = [
  [ 46, 106, 168], // cool cobalt
  [ 96, 158, 178],
  [214, 189, 122],
  [216, 142,  78],
  [196,  99,  60], // terracotta
  [150,  46,  38], // deep ember
];

function rampColor(t: number): string {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = RAMP[i];
  const b = RAMP[Math.min(RAMP.length - 1, i + 1)];
  const m = (k: number) => Math.round(a[k] + (b[k] - a[k]) * f);
  return `rgb(${m(0)},${m(1)},${m(2)})`;
}

export default function HeatGrid({ siteId, date }: { siteId: string; date: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [grid, setGrid] = useState<TileGrid | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hover, setHover] = useState<{ x: number; y: number; tempF: number; id: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/tiles?site=${encodeURIComponent(siteId)}&date=${encodeURIComponent(date)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((g: TileGrid | null) => {
        if (!alive) return;
        setGrid(g);
        // Open on the hottest hour — the moment the decision is about.
        if (g?.hours?.length) {
          let hottest = 0;
          g.hours.forEach((h, i) => {
            if (h.peakF > g.hours[hottest].peakF) hottest = i;
          });
          setIdx(hottest);
        }
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [siteId, date]);

  /* playback */
  useEffect(() => {
    if (!playing || !grid?.hours.length) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % grid.hours.length), 620);
    return () => clearInterval(t);
  }, [playing, grid]);

  const frame = grid?.hours[idx];

  /* projection: lon/lat → canvas px, aspect-corrected for latitude */
  const project = useCallback(
    (w: number, h: number) => {
      if (!grid) return null;
      const { minLon, maxLon, minLat, maxLat } = grid.bounds;
      const lonSpan = maxLon - minLon || 1e-6;
      const latSpan = maxLat - minLat || 1e-6;
      return (lon: number, lat: number): [number, number] => [
        ((lon - minLon) / lonSpan) * w,
        h - ((lat - minLat) / latSpan) * h,
      ];
    },
    [grid],
  );

  /* draw */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !grid || !frame) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = cv.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);

    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const p = project(w, h);
    if (!p) return;

    const { minF, maxF } = grid.scale;
    const span = maxF - minF || 1;

    grid.tiles.forEach((tile, i) => {
      const temp = frame.tempsF[i];
      if (temp === undefined) return;
      ctx.beginPath();
      tile.ring.forEach(([lon, lat], k) => {
        const [x, y] = p(lon, lat);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = rampColor((temp - minF) / span);
      ctx.fill();
    });

    if (hover) {
      const tile = grid.tiles[hover.id];
      if (tile) {
        ctx.beginPath();
        tile.ring.forEach(([lon, lat], k) => {
          const [x, y] = p(lon, lat);
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.strokeStyle = "rgba(255,255,255,.95)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }, [grid, frame, hover, project]);

  /* hover hit-test against the tile grid */
  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv || !grid || !frame) return;
    const rect = cv.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const p = project(rect.width, rect.height);
    if (!p) return;

    for (let i = 0; i < grid.tiles.length; i++) {
      const ring = grid.tiles[i].ring.map(([lon, lat]) => p(lon, lat));
      const xs = ring.map((c) => c[0]);
      const ys = ring.map((c) => c[1]);
      if (mx >= Math.min(...xs) && mx <= Math.max(...xs) && my >= Math.min(...ys) && my <= Math.max(...ys)) {
        setHover({ x: mx, y: my, tempF: frame.tempsF[i], id: i });
        return;
      }
    }
    setHover(null);
  };

  const legend = useMemo(() => {
    if (!grid) return [];
    const { minF, maxF } = grid.scale;
    return [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      color: rampColor(t),
      label: Math.round(minF + (maxF - minF) * t),
    }));
  }, [grid]);

  if (loading) {
    return (
      <div className="grid-shell">
        <div className="grid-empty working">loading thermal field…</div>
      </div>
    );
  }

  if (!grid || !frame) {
    return (
      <div className="grid-shell">
        <div className="grid-empty">No cached spatial data for this site.</div>
      </div>
    );
  }

  return (
    <div className="grid-shell">
      <div className="grid-head">
        <div>
          <span className="label">Thermal field · {grid.tiles.length} tiles at 60 m</span>
          <div className="grid-read">
            <span className="grid-hour">{frame.label}</span>
            <span className="grid-temp">{frame.meanF}&deg;F</span>
            <span className={`tag ${frame.risk}`}>{frame.risk}</span>
          </div>
        </div>
        <button
          className="btn ghost sm"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause animation" : "Play animation"}
        >
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
      </div>

      <div className="grid-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="grid-canvas"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
        {hover && (
          <div
            className="grid-tip"
            style={{
              left: Math.min(hover.x + 12, 999),
              top: Math.max(hover.y - 34, 4),
            }}
          >
            {hover.tempF}&deg;F <span>tile {hover.id}</span>
          </div>
        )}
      </div>

      <input
        type="range"
        className="grid-scrub"
        min={0}
        max={grid.hours.length - 1}
        value={idx}
        onChange={(e) => {
          setPlaying(false);
          setIdx(Number(e.target.value));
        }}
        aria-label="Hour of day"
      />

      <div className="grid-foot">
        <div className="grid-legend">
          {legend.map((l) => (
            <span key={l.label}>
              <i style={{ background: l.color }} />
              {l.label}&deg;
            </span>
          ))}
        </div>
        <span className="grid-note">
          {grid.hours[0].label}&ndash;{grid.hours[grid.hours.length - 1].label} · drag to scrub
        </span>
      </div>
    </div>
  );
}
