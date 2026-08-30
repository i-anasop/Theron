"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

/**
 * Screen any U.S. location on demand.
 *
 * The cost is stated before the button is pressed, not after. This is the only
 * place on the site that spends credits, and someone about to spend should be
 * told what it costs and what they get — a screening estimate, not a full
 * analysis.
 */

interface Result {
  shiftPeakF: number;
  shiftMeanF: number;
  humidityPct: number;
  screeningHeatIndexF: number;
  risk: string;
  needsDeepAnalysis: boolean;
  guidance: string;
  creditsSpent: number;
  cached: boolean;
}

const PRESETS = [
  { label: "Las Vegas Strip", lat: 36.1147, lon: -115.1728 },
  { label: "Houston Ship Channel", lat: 29.7355, lon: -95.2649 },
  { label: "Miami Downtown", lat: 25.7743, lon: -80.1937 },
  { label: "Sacramento", lat: 38.5816, lon: -121.4944 },
];

export default function ScreenLocation({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ costPerScreen: number; remaining: number } | null>(null);

  useEffect(() => {
    if (!open || quota) return;
    fetch("/api/screen")
      .then((r) => (r.ok ? r.json() : null))
      .then((q) => q && setQuota(q))
      .catch(() => {});
  }, [open, quota]);

  async function run(la?: number, lo?: number, nm?: string) {
    const latN = la ?? Number(lat);
    const lonN = lo ?? Number(lon);
    if (!Number.isFinite(latN) || !Number.isFinite(lonN)) {
      setError("Enter a latitude and longitude.");
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: latN, lon: lonN, label: nm ?? label, date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Screening failed (${res.status})`);
      setResult(data);
      setQuota((q) => (q ? { ...q, remaining: Math.max(0, q.remaining - (data.creditsSpent ?? 0)) } : q));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="screen-open" onClick={() => setOpen(true)} type="button">
        <span className="screen-open-ico">
          <Icon name="gauge" size={17} />
        </span>
        <span>
          <b>Screen your own location</b>
          <small>Any U.S. coordinates &mdash; live from the Temperature API</small>
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" width="16" height="16" aria-hidden>
          <path d="M5 12h13M13 6l6 6-6 6" />
        </svg>
      </button>
    );
  }

  return (
    <section className="screen">
      <header className="screen-head">
        <div>
          <span className="label">Screen a location</span>
          <p>Two API calls. A real reading for anywhere in the United States.</p>
        </div>
        <button className="btn ghost sm" onClick={() => setOpen(false)} type="button">
          Close
        </button>
      </header>

      <div className="screen-presets">
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => run(p.lat, p.lon, p.label)} disabled={busy} type="button">
            {p.label}
          </button>
        ))}
      </div>

      <div className="screen-form">
        <label>
          <span className="label">Name</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="North yard" />
        </label>
        <label>
          <span className="label">Latitude</span>
          <input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="33.4484" inputMode="decimal" />
        </label>
        <label>
          <span className="label">Longitude</span>
          <input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="-112.0740" inputMode="decimal" />
        </label>
        <button className="btn" onClick={() => run()} disabled={busy} type="button">
          {busy ? "Screening…" : "Screen it"}
        </button>
      </div>

      <p className="screen-cost">
        <Icon name="receipt" size={13} />
        {quota
          ? `${quota.costPerScreen.toLocaleString()} credits per new location · ${quota.remaining.toLocaleString()} left in this session's allowance · repeats are free`
          : "Two calls per location. Repeats are served from cache and cost nothing."}
      </p>

      {error && <div className="err">{error}</div>}

      {result && (
        <div className={`screen-result r-${result.risk}`}>
          <div className="screen-result-top">
            <span className={`tag ${result.risk}`}>{result.risk}</span>
            <span className="screen-badge">
              {result.cached ? "from cache · 0 credits" : `${result.creditsSpent.toLocaleString()} credits`}
            </span>
          </div>
          <div className="screen-nums">
            <div>
              <span className="label">Shift peak</span>
              <b>{result.shiftPeakF}&deg;F</b>
            </div>
            <div>
              <span className="label">Humidity</span>
              <b>{result.humidityPct}%</b>
            </div>
            <div>
              <span className="label">Screening index</span>
              <b>~{result.screeningHeatIndexF}&deg;F</b>
            </div>
          </div>
          <p className="screen-guidance">{result.guidance}</p>
          <p className="screen-caveat">
            Screening estimate &mdash; the shift mean temperature against the worst hourly humidity. It decides
            whether a site is worth a full hourly analysis; it is not itself a measurement of any single hour.
          </p>
        </div>
      )}
    </section>
  );
}
