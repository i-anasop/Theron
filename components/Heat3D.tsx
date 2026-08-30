"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TileGrid } from "@/lib/analysis/tiles";

/**
 * The worksite as a thermal terrain.
 *
 * Each of the site's tiles is drawn as an extruded prism whose height is its
 * temperature, projected isometrically. Because the tiles are real 20-60 m
 * cells, the surface that emerges is the actual shape of the heat over that
 * ground — hot asphalt stands up, shaded corners sink — and stepping through
 * the day makes the whole terrain breathe.
 *
 * Canvas rather than WebGL: a few hundred prisms is well within 2D's budget,
 * and it avoids shipping a 3D library for one visual. Painter's algorithm on
 * depth-sorted tiles handles occlusion correctly for a height field.
 */

const RAMP: Array<[number, number, number]> = [
  [ 46, 106, 168],
  [ 82, 148, 178],
  [186, 176, 132],
  [216, 150,  86],
  [196,  99,  60],
  [150,  46,  38],
];

function ramp(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = RAMP[i];
  const b = RAMP[Math.min(RAMP.length - 1, i + 1)];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

const rgb = (c: [number, number, number], k = 1) =>
  `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;

export default function Heat3D({ siteId, date }: { siteId: string; date: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [grid, setGrid] = useState<TileGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [hourIdx, setHourIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [hover, setHover] = useState<{ x: number; y: number; tempF: number } | null>(null);

  /* interaction state kept in refs so the draw loop never restarts */
  const yaw = useRef(0.62);
  const dragging = useRef(false);
  const lastX = useRef(0);
  const morph = useRef(0); // 0..1 between hourIdx and next
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/tiles?site=${encodeURIComponent(siteId)}&date=${encodeURIComponent(date)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((g: TileGrid | null) => {
        if (!alive) return;
        setGrid(g);
        if (g?.hours?.length) {
          let hottest = 0;
          g.hours.forEach((h, i) => {
            if (h.peakF > g.hours[hottest].peakF) hottest = i;
          });
          setHourIdx(hottest);
        }
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [siteId, date]);

  /* advance the hour, smoothly */
  useEffect(() => {
    if (!playing || !grid?.hours.length) return;
    const id = setInterval(() => {
      morph.current = 0;
      setHourIdx((i) => (i + 1) % grid.hours.length);
    }, 1500);
    return () => clearInterval(id);
  }, [playing, grid]);

  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv || !grid) return;

    const rect = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(rect.width * dpr)) {
      cv.width = Math.round(rect.width * dpr);
      cv.height = Math.round(rect.height * dpr);
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const W = rect.width;
    const H = rect.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const hours = grid.hours;
    const cur = hours[hourIdx];
    const nxt = hours[(hourIdx + 1) % hours.length];
    if (!cur) return;

    const m = playing ? Math.min(1, morph.current) : 0;
    const { minF, maxF } = grid.scale;
    const span = maxF - minF || 1;

    const { minLon, maxLon, minLat, maxLat } = grid.bounds;
    const lonSpan = maxLon - minLon || 1e-6;
    const latSpan = maxLat - minLat || 1e-6;

    const cos = Math.cos(yaw.current);
    const sin = Math.sin(yaw.current);

    // Fit the rotated footprint into the canvas.
    const scale = Math.min(W / 2.35, H / 1.5);
    const cx = W / 2;
    const cy = H * 0.60;
    const lift = Math.min(78, H * 0.30);

    const project = (lon: number, lat: number, h: number): [number, number] => {
      const u = (lon - minLon) / lonSpan - 0.5;
      const v = (lat - minLat) / latSpan - 0.5;
      const rx = u * cos - v * sin;
      const ry = u * sin + v * cos;
      return [cx + (rx - ry) * scale * 0.86, cy + (rx + ry) * scale * 0.43 - h * lift];
    };

    // Depth sort: far tiles first.
    const order = grid.tiles
      .map((t, i) => {
        const c = t.ring[0];
        const u = (c[0] - minLon) / lonSpan - 0.5;
        const v = (c[1] - minLat) / latSpan - 0.5;
        return { i, d: (u * cos - v * sin) + (u * sin + v * cos) };
      })
      .sort((a, b) => a.d - b.d);

    for (const { i } of order) {
      const tile = grid.tiles[i];
      const t0 = cur.tempsF[i];
      const t1 = nxt?.tempsF[i] ?? t0;
      if (t0 === undefined) continue;

      const temp = t0 + (t1 - t0) * m;
      const norm = (temp - minF) / span;
      const h = Math.max(0.02, norm) * 0.9;
      const col = ramp(norm);

      // quad corners (ring is closed, so first four are the square)
      const top = tile.ring.slice(0, 4).map((c) => project(c[0], c[1], h));
      const base = tile.ring.slice(0, 4).map((c) => project(c[0], c[1], 0));

      // two visible side faces, shaded
      for (const [a, b, shade] of [
        [1, 2, 0.72],
        [2, 3, 0.55],
      ] as Array<[number, number, number]>) {
        ctx.beginPath();
        ctx.moveTo(top[a][0], top[a][1]);
        ctx.lineTo(top[b][0], top[b][1]);
        ctx.lineTo(base[b][0], base[b][1]);
        ctx.lineTo(base[a][0], base[a][1]);
        ctx.closePath();
        ctx.fillStyle = rgb(col, shade);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.moveTo(top[0][0], top[0][1]);
      for (let k = 1; k < 4; k++) ctx.lineTo(top[k][0], top[k][1]);
      ctx.closePath();
      ctx.fillStyle = rgb(col);
      ctx.fill();
    }
  }, [grid, hourIdx, playing]);

  /* animation loop */
  useEffect(() => {
    if (!grid) return;
    let last = performance.now();
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      if (playing && !reduced) {
        morph.current = Math.min(1, morph.current + dt / 1500);
        if (!dragging.current) yaw.current += dt * 0.00006;
      }
      draw();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [grid, playing, draw]);

  /* drag to rotate */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const down = (e: PointerEvent) => {
      dragging.current = true;
      lastX.current = e.clientX;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      yaw.current += (e.clientX - lastX.current) * 0.006;
      lastX.current = e.clientX;
    };
    const up = (e: PointerEvent) => {
      dragging.current = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [grid]);

  const frame = grid?.hours[hourIdx];

  return (
    <div className="h3d">
      <div className="h3d-top">
        <div className="h3d-read">
          <span className="h3d-hour">{frame?.label ?? "--:--"}</span>
          <span className="h3d-temp">{frame ? `${frame.meanF}°F` : "—"}</span>
          {frame && <span className={`tag ${frame.risk}`}>{frame.risk}</span>}
        </div>
        <button
          className="h3d-play"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
              <rect x="7" y="5" width="3.6" height="14" rx="1" />
              <rect x="13.4" y="5" width="3.6" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
              <path d="M8 5.5v13l11-6.5-11-6.5Z" />
            </svg>
          )}
        </button>
      </div>

      <div className="h3d-stage" ref={wrapRef}>
        {loading && <div className="h3d-empty">building thermal terrain…</div>}
        {!loading && !grid && <div className="h3d-empty">No spatial data cached.</div>}
        <canvas ref={canvasRef} className="h3d-canvas" onMouseLeave={() => setHover(null)} />
        {hover && (
          <div className="h3d-tip" style={{ left: hover.x + 12, top: hover.y - 30 }}>
            {hover.tempF}&deg;F
          </div>
        )}
      </div>

      {grid && (
        <div className="h3d-foot">
          <input
            type="range"
            min={0}
            max={grid.hours.length - 1}
            value={hourIdx}
            onChange={(e) => {
              setPlaying(false);
              morph.current = 0;
              setHourIdx(Number(e.target.value));
            }}
            aria-label="Hour of day"
          />
          <div className="h3d-legend">
            <span>{grid.tiles.length} tiles · 60 m</span>
            <span className="h3d-hint">drag to rotate</span>
            <span>
              {grid.scale.minF}&deg;&ndash;{grid.scale.maxF}&deg;F
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
