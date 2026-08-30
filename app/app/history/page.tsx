"use client";

import { useEffect, useState } from "react";
import { DEMO_DATE } from "@/lib/demo";
import type { CallRecord } from "@/lib/fortyguard/client";
import Icon from "@/components/Icon";

/**
 * The audit trail as its own destination.
 *
 * It was a table at the bottom of another page, which is the wrong place for
 * the thing that makes the output checkable. Here it is the subject.
 */

interface SweepResponse {
  date: string;
  creditsSpent: number;
  apiCalls: number;
  cacheHits: number;
  trail: CallRecord[];
}

export default function History() {
  const [data, setData] = useState<SweepResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "cache" | "live">("all");

  useEffect(() => {
    fetch("/api/sweep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: DEMO_DATE }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const trail = data?.trail ?? [];
  const shown = trail.filter((c) => (filter === "all" ? true : filter === "cache" ? c.cached : !c.cached));
  const byEndpoint = trail.reduce<Record<string, number>>((acc, c) => {
    acc[c.endpoint] = (acc[c.endpoint] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="work-h1">Trail</h1>
          <p className="work-sub">
            Every Temperature API call behind the numbers. Nothing is asserted without a row here.
          </p>
        </div>
      </div>

      <div className="trail-stats">
        <div className="trail-stat">
          <span className="label">
            <Icon name="file" size={14} /> Calls
          </span>
          <b>{loading ? "—" : trail.length}</b>
        </div>
        <div className="trail-stat">
          <span className="label">
            <Icon name="shield" size={14} /> Served from cache
          </span>
          <b>{loading ? "—" : trail.filter((c) => c.cached).length}</b>
        </div>
        <div className="trail-stat lead">
          <span className="label">
            <Icon name="receipt" size={14} /> Credits spent
          </span>
          <b>{loading ? "—" : trail.reduce((n, c) => n + c.credits, 0).toLocaleString()}</b>
        </div>
        <div className="trail-stat">
          <span className="label">
            <Icon name="gauge" size={14} /> Endpoints used
          </span>
          <b>{loading ? "—" : Object.keys(byEndpoint).length}</b>
        </div>
      </div>

      <div className="callout" style={{ marginTop: 16 }}>
        Cached rows cost nothing. The same polygon and hour always returns the same answer, so Theron never
        pays twice for a question it has already asked &mdash; which is why a full portfolio sweep can run at
        zero credits.
      </div>

      <div className="filterbar">
        {(["all", "cache", "live"] as const).map((f) => (
          <button key={f} className={`filt ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "All calls" : f === "cache" ? "Cache hits" : "Live calls"}
            <span>
              {f === "all"
                ? trail.length
                : f === "cache"
                  ? trail.filter((c) => c.cached).length
                  : trail.filter((c) => !c.cached).length}
            </span>
          </button>
        ))}
      </div>

      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Endpoint</th>
              <th>Credits</th>
              <th>Latency</th>
              <th>Activity ID</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 30 }} className="wrap-cell">
                  Loading trail…
                </td>
              </tr>
            )}
            {!loading &&
              shown.map((c, i) => (
                <tr key={i}>
                  <td>
                    <span className={`chip ${c.cached ? "cache" : "live"}`}>{c.cached ? "cache" : "live"}</span>
                  </td>
                  <td className="m">{c.endpoint}</td>
                  <td className="m">{c.credits.toLocaleString()}</td>
                  <td className="m">{c.durationMs} ms</td>
                  <td className="m">{c.activityId ? c.activityId.slice(0, 8) : "—"}</td>
                  <td className="wrap-cell">{c.note ?? ""}</td>
                </tr>
              ))}
            {!loading && !shown.length && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: 30 }} className="wrap-cell">
                  No calls match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
