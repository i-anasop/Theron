"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TileGrid } from "@/lib/analysis/tiles";

/**
 * The day's heat, as moving air.
 *
 * Layered waves flowing across a dark field. Everything they do is driven by
 * the site's real hourly data: colour comes from the heat ramp at that hour's
 * temperature, amplitude and speed rise with how far the hour sits above the
 * OSHA trigger, and the rising motes thicken as the air does. Stepping the
 * hour makes the whole field calm at dawn and boil by mid-afternoon.
 *
 * It is decorative in form and honest in substance: nothing moves that is not
 * a measurement.
 */

const RAMP: Array<[number, number, number]> = [
  [ 38,  96, 158],
  [ 64, 140, 176],
  [148, 168, 150],
  [214, 176, 110],
  [216, 132,  76],
  [188,  76,  52],
  [146,  40,  36],
];

function ramp(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = RAMP[i];
  const b = RAMP[Math.min(RAMP.length - 1, i + 1)];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

const LAYERS = 7;

interface Mote {
  x: number;
  y: number;
  r: number;
  v: number;
  drift: number;
}

export default function HeatWaves({ siteId, date }: { siteId: string; date: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [grid, setGrid] = useState<TileGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);

  const tRef = useRef(0);
  const heatRef = useRef(0);        // eased 0..1 intensity
  const targetHeat = useRef(0);
  const motesRef = useRef<Mote[]>([]);
  const rafRef = useRef(0);

  useEffect(() => {
    let alive = true;
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
          setIdx(hottest);
        }
        setLoading(false);
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [siteId, date]);

  useEffect(() => {
    if (!playing || !grid?.hours.length) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % grid.hours.length), 1900);
    return () => clearInterval(id);
  }, [playing, grid]);

  const frame = grid?.hours[idx];

  /* target intensity from the real temperature */
  useEffect(() => {
    if (!grid || !frame) return;
    const { minF, maxF } = grid.scale;
    targetHeat.current = (frame.meanF - minF) / (maxF - minF || 1);
  }, [grid, frame]);

  const draw = useCallback(
    (w: number, h: number, ctx: CanvasRenderingContext2D) => {
      const heat = heatRef.current;
      const t = tRef.current;

      // ground
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#0a1320");
      bg.addColorStop(1, "#060d16");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // a low glow that warms with the day
      const glow = ctx.createRadialGradient(w * 0.5, h * 1.02, 0, w * 0.5, h * 1.02, h * 1.25);
      const gc = ramp(heat);
      glow.addColorStop(0, `rgba(${gc[0] | 0},${gc[1] | 0},${gc[2] | 0},${0.34 + heat * 0.3})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";

      for (let L = 0; L < LAYERS; L++) {
        const p = L / (LAYERS - 1);
        const c = ramp(Math.min(1, heat * (0.45 + p * 0.85)));
        const baseY = h * (0.44 + p * 0.5);
        const amp = (5 + p * 15) * (0.45 + heat * 1.25);
        const speed = (0.16 + p * 0.42) * (0.5 + heat);
        const k1 = 0.0075 + p * 0.004;
        const k2 = 0.017 + p * 0.006;

        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 5) {
          const y =
            baseY +
            Math.sin(x * k1 + t * speed + L * 1.3) * amp +
            Math.sin(x * k2 - t * speed * 1.5 + L) * amp * 0.42;
          if (x === 0) ctx.lineTo(0, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();

        const alpha = 0.055 + p * 0.05 + heat * 0.045;
        ctx.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
        ctx.fill();

        // crest line
        ctx.beginPath();
        for (let x = 0; x <= w; x += 5) {
          const y =
            baseY +
            Math.sin(x * k1 + t * speed + L * 1.3) * amp +
            Math.sin(x * k2 - t * speed * 1.5 + L) * amp * 0.42;
          if (x === 0) ctx.moveTo(0, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${0.1 + heat * 0.16})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // rising motes — thicker as the air heats
      const motes = motesRef.current;
      const want = Math.round(14 + heat * 40);
      while (motes.length < want) {
        motes.push({
          x: Math.random() * w,
          y: h + Math.random() * h * 0.5,
          r: 0.6 + Math.random() * 1.5,
          v: 0.12 + Math.random() * 0.4,
          drift: (Math.random() - 0.5) * 0.25,
        });
      }
      motes.length = want;

      const mc = ramp(Math.min(1, heat + 0.15));
      for (const m of motes) {
        m.y -= m.v * (0.5 + heat * 1.6);
        m.x += m.drift + Math.sin(m.y * 0.02 + t * 0.4) * 0.28;
        if (m.y < -6) {
          m.y = h + 8;
          m.x = Math.random() * w;
        }
        const fade = Math.max(0, Math.min(1, m.y / h));
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${mc[0] | 0},${mc[1] | 0},${mc[2] | 0},${0.18 * fade + heat * 0.14})`;
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
    },
    [],
  );

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;

      heatRef.current += (targetHeat.current - heatRef.current) * 0.045;
      if (!reduced) tRef.current += dt * 0.0022;

      const rect = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(rect.width * dpr)) {
        cv.width = Math.round(rect.width * dpr);
        cv.height = Math.round(rect.height * dpr);
      }
      const ctx = cv.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw(rect.width, rect.height, ctx);
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <figure className="hw">
      <div className="hw-top">
        <div className="hw-read">
          <span className="hw-hour">{frame?.label ?? "--:--"}</span>
          <span className="hw-temp">{frame ? `${frame.meanF}°F` : "—"}</span>
          {frame && <span className={`tag ${frame.risk}`}>{frame.risk}</span>}
        </div>
        <button
          className="hw-play"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
              <rect x="7" y="5" width="3.6" height="14" rx="1" />
              <rect x="13.4" y="5" width="3.6" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
              <path d="M8 5.5v13l11-6.5-11-6.5Z" />
            </svg>
          )}
        </button>
      </div>

      <div className="hw-stage">
        <canvas ref={canvasRef} className="hw-canvas" />
        {loading && <span className="hw-empty">reading the day…</span>}
      </div>

      {grid && (
        <div className="hw-foot">
          <input
            type="range"
            min={0}
            max={grid.hours.length - 1}
            value={idx}
            onChange={(e) => {
              setPlaying(false);
              setIdx(Number(e.target.value));
            }}
            aria-label="Hour of day"
          />
          <figcaption className="hw-cap">
            <span>Phoenix worksite · real hourly readings</span>
            <span>
              {grid.scale.minF}&deg;&ndash;{grid.scale.maxF}&deg;F
            </span>
          </figcaption>
        </div>
      )}
    </figure>
  );
}
