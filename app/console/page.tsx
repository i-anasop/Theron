"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DEMO_DATE } from "@/lib/demo";
import type { Counterfactual } from "@/lib/analysis/counterfactual";
import type { CallRecord } from "@/lib/fortyguard/client";
import HeatChart from "@/components/HeatChart";
import HeatGrid from "@/components/HeatGrid";
import AgentConsole from "@/components/AgentConsole";

interface Assessment {
  site: {
    id: string;
    name: string;
    city: string;
    state: string;
    crewSize: number;
    shift: { start: string; end: string };
  };
  counterfactual: Counterfactual | null;
  triage?: {
    shiftPeakF: number;
    humidityPct: number;
    screeningHeatIndexF: number;
    risk: string;
    needsDeepAnalysis: boolean;
  };
  baselineSummary?: string;
  error?: string;
}

interface SweepResponse {
  date: string;
  creditsSpent: number;
  apiCalls: number;
  cacheHits: number;
  trail: CallRecord[];
  assessments: Assessment[];
}

export default function Console() {
  const [sweep, setSweep] = useState<SweepResponse | null>(null);
  const [sweeping, setSweeping] = useState(true);
  const [agentTrail, setAgentTrail] = useState<CallRecord[] | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSweep() {
    setSweeping(true);
    setError(null);
    try {
      const res = await fetch("/api/sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: DEMO_DATE }),
      });
      if (!res.ok) throw new Error(`Sweep failed (${res.status})`);
      const data: SweepResponse = await res.json();
      setSweep(data);
      const deep = data.assessments.find((a) => a.counterfactual);
      setFocus((f) => f ?? deep?.site.id ?? data.assessments[0]?.site.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSweeping(false);
    }
  }

  useEffect(() => {
    void runSweep();
  }, []);

  const trail = agentTrail ?? sweep?.trail ?? [];

  return (
    <div className="wrap" style={{ paddingTop: 40, paddingBottom: 20 }}>
      <div className="sec-row" style={{ marginBottom: 20 }}>
        <div>
          <div className="eyebrow">Live console</div>
          <h2 style={{ margin: "9px 0 0", fontSize: "1.55rem", fontWeight: 660, letterSpacing: "-.032em" }}>
            Portfolio
          </h2>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span className="label">
            {sweep
              ? `${sweep.date} · ${sweep.creditsSpent} credits · ${sweep.cacheHits}/${sweep.apiCalls} cached`
              : "assessing…"}
          </span>
          <button className="btn ghost sm" onClick={runSweep} disabled={sweeping}>
            {sweeping ? "Sweeping…" : "Re-run"}
          </button>
        </div>
      </div>

      {error && <div className="err">{error}</div>}

      {/* site selector */}
      <div className="sitebar">
        {(sweep?.assessments ?? []).map((a) => {
          const v = a.counterfactual?.verdict ?? (a.triage ? "screened" : "unknown");
          return (
            <button
              key={a.site.id}
              className={`sitepill ${focus === a.site.id ? "on" : ""}`}
              onClick={() => setFocus(a.site.id)}
            >
              <span className="sitepill-name">{a.site.city}</span>
              <span className={`tag ${v}`}>{v.replace("_", " ")}</span>
            </button>
          );
        })}
      </div>

      {/* focused site: spatial field + curve side by side */}
      {focus && (
        <div className="focus-grid">
          <HeatGrid siteId={focus} date={DEMO_DATE} />

          {(() => {
            const a = sweep?.assessments.find((x) => x.site.id === focus);
            const cf = a?.counterfactual;
            if (!a) return null;

            if (!cf) {
              return (
                <div className="card" style={{ padding: 20 }}>
                  <div className="label">Screened, not drilled</div>
                  <p className="verdict" style={{ marginTop: 10 }}>
                    {a.triage
                      ? `Shift peak ${a.triage.shiftPeakF}°F at ${a.triage.humidityPct}% humidity — classified ${a.triage.risk}. Screened with 2 API calls instead of 24.`
                      : (a.error ?? "No analysis available.")}
                  </p>
                </div>
              );
            }

            const hours = [...cf.current.hours, ...cf.proposed.hours]
              .filter((h, i, arr) => arr.findIndex((x) => x.hourIndex === h.hourIndex) === i)
              .sort((x, y) => x.hourIndex - y.hourIndex);

            return (
              <div className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="sec-row">
                  <div>
                    <div className="label">Verdict</div>
                    <div
                      style={{
                        fontSize: "1.28rem",
                        fontWeight: 660,
                        letterSpacing: "-.03em",
                        textTransform: "capitalize",
                        marginTop: 5,
                      }}
                    >
                      {cf.verdict.replace("_", " ")}
                    </div>
                  </div>
                  <Link href={`/sites/${a.site.id}`} className="btn ghost sm">
                    Full analysis
                  </Link>
                </div>

                <HeatChart
                  id={`c-${a.site.id}`}
                  hours={hours}
                  shiftStart={cf.current.startHour}
                  shiftEnd={cf.current.endHour}
                  proposedStart={cf.verdict === "reschedule" ? cf.proposed.startHour : undefined}
                  proposedEnd={cf.verdict === "reschedule" ? cf.proposed.endHour : undefined}
                  height={140}
                />

                <div className="metrics">
                  <div className="metric">
                    <span className="label">Peak</span>
                    <div className="m hot">{cf.current.peakHeatIndexF}&deg;F</div>
                  </div>
                  <div className="metric">
                    <span className="label">Now</span>
                    <div className="m">{cf.current.degreeHoursOverTrigger}</div>
                  </div>
                  <div className="metric">
                    <span className="label">If moved</span>
                    <div className={`m ${cf.degreeHoursAvoided > 0 ? "good" : ""}`}>
                      {cf.proposed.degreeHoursOverTrigger}
                    </div>
                  </div>
                </div>

                <p className="verdict">{cf.headline}</p>
              </div>
            );
          })()}
        </div>
      )}

      {/* agent */}
      <section style={{ paddingBottom: 28 }}>
        <div className="sec-head">
          <div className="eyebrow">Agent</div>
          <h2>Watch it decide</h2>
        </div>
        <AgentConsole onTrail={setAgentTrail} />
      </section>

      {/* audit */}
      <section style={{ paddingTop: 0 }}>
        <div className="sec-row" style={{ marginBottom: 14 }}>
          <div>
            <div className="eyebrow">Audit trail</div>
            <h2 style={{ margin: "9px 0 0", fontSize: "1.4rem", fontWeight: 660, letterSpacing: "-.03em" }}>
              Every call behind the numbers
            </h2>
          </div>
          <span className="label">{trail.length} calls · {trail.filter((c) => c.cached).length} cached</span>
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
              {trail.slice(0, 24).map((c, i) => (
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
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
