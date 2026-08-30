"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DEMO_DATE } from "@/lib/demo";
import type { Counterfactual } from "@/lib/analysis/counterfactual";
import type { CallRecord } from "@/lib/fortyguard/client";
import HeatChart from "@/components/HeatChart";
import HeatGrid from "@/components/HeatGrid";
import Sparkline from "@/components/Sparkline";
import Icon from "@/components/Icon";

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

const VERDICT_COPY: Record<string, string> = {
  reschedule: "Move the shift",
  stand_down: "Stand down",
  keep: "Safe as scheduled",
  screened: "Screened only",
  unknown: "No data",
};

export default function Monitor() {
  const [sweep, setSweep] = useState<SweepResponse | null>(null);
  const [sweeping, setSweeping] = useState(true);
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
      setFocus((f) => f ?? data.assessments.find((a) => a.counterfactual)?.site.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSweeping(false);
    }
  }

  useEffect(() => {
    void runSweep();
  }, []);

  const active = sweep?.assessments.find((a) => a.site.id === focus) ?? null;
  const cf = active?.counterfactual ?? null;
  const flagged = (sweep?.assessments ?? []).filter(
    (a) => (a.counterfactual && a.counterfactual.verdict !== "keep") || a.triage?.needsDeepAnalysis,
  ).length;

  const hours = cf
    ? [...cf.current.hours, ...cf.proposed.hours]
        .filter((h, i, arr) => arr.findIndex((x) => x.hourIndex === h.hourIndex) === i)
        .sort((x, y) => x.hourIndex - y.hourIndex)
    : [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="work-h1">Monitor</h1>
          <p className="work-sub">Live conditions across every worksite Theron watches.</p>
        </div>
        <button className="btn ghost sm" onClick={runSweep} disabled={sweeping}>
          {sweeping ? "Sweeping…" : "Re-run sweep"}
        </button>
      </div>

      <div className="opsbar">
        <div className="opsbar-live">
          <span className="beacon" />
          <div>
            <span className="label">System</span>
            <b>{sweep?.assessments.length ?? "—"} sites monitored</b>
          </div>
        </div>
        <div className="opsbar-item">
          <span className="label">Assessed</span>
          <b>{sweep?.date ?? "…"}</b>
        </div>
        <div className="opsbar-item">
          <span className="label">Needing action</span>
          <b className={flagged ? "hot" : ""}>{sweep ? flagged : "—"}</b>
        </div>
        <div className="opsbar-item">
          <span className="label">Credits spent</span>
          <b>{sweep ? sweep.creditsSpent.toLocaleString() : "—"}</b>
        </div>
        <div className="opsbar-item">
          <span className="label">Next autonomous sweep</span>
          <b>04:00 PT</b>
        </div>
      </div>

      {error && <div className="err">{error}</div>}

      <div className="portfolio">
        {sweeping && !sweep
          ? [0, 1, 2].map((i) => <div key={i} className="sitecard skeleton" />)
          : (sweep?.assessments ?? []).map((a) => {
              const v = a.counterfactual?.verdict ?? (a.triage ? "screened" : "unknown");
              const on = focus === a.site.id;
              const cfa = a.counterfactual;
              return (
                <button
                  key={a.site.id}
                  className={`sitecard ${on ? "on" : ""} v-${v}`}
                  onClick={() => setFocus(a.site.id)}
                  aria-pressed={on}
                >
                  <div className="sitecard-top">
                    <div>
                      <div className="sitecard-city">
                        {a.site.city}, {a.site.state}
                      </div>
                      <div className="sitecard-name">{a.site.name}</div>
                    </div>
                    <span className={`tag ${v}`}>{v.replace("_", " ")}</span>
                  </div>

                  {cfa ? (
                    <Sparkline
                      values={cfa.current.hours
                        .concat(cfa.proposed.hours)
                        .filter((h, i, arr) => arr.findIndex((x) => x.hourIndex === h.hourIndex) === i)
                        .sort((x, y) => x.hourIndex - y.hourIndex)
                        .map((h) => h.heatIndexF)}
                      threshold={90}
                      shiftFrom={cfa.current.startHour}
                      shiftTo={cfa.current.endHour}
                      first={Math.min(...cfa.current.hours.map((h) => h.hourIndex))}
                      last={Math.max(...cfa.proposed.hours.map((h) => h.hourIndex))}
                    />
                  ) : (
                    <div className="spark-empty" />
                  )}

                  <div className="sitecard-foot">
                    <span>
                      <Icon name="crew" size={13} /> {a.site.crewSize}
                    </span>
                    <span>
                      <Icon name="clock" size={13} /> {a.site.shift.start}&ndash;{a.site.shift.end}
                    </span>
                    <strong>
                      {cfa
                        ? `${cfa.current.peakHeatIndexF}°F peak`
                        : a.triage
                          ? `${a.triage.shiftPeakF}°F peak`
                          : "—"}
                    </strong>
                  </div>
                </button>
              );
            })}
      </div>

      {focus && active && (
        <div className="focus">
          <div className="focus-main">
            <HeatGrid siteId={focus} date={DEMO_DATE} />
          </div>

          <div className="focus-side">
            <div className={`decision v-${cf?.verdict ?? "screened"}`}>
              <span className="label">Decision</span>
              <div className="decision-v">
                {VERDICT_COPY[cf?.verdict ?? (active.triage ? "screened" : "unknown")]}
              </div>
              {cf && (
                <div className="decision-move">
                  <span>{cf.current.label}</span>
                  <i aria-hidden>→</i>
                  <span className="to">{cf.proposed.label}</span>
                </div>
              )}
            </div>

            {cf ? (
              <>
                <div className="panel" style={{ padding: 16 }}>
                  <HeatChart
                    id={`c-${active.site.id}`}
                    hours={hours}
                    shiftStart={cf.current.startHour}
                    shiftEnd={cf.current.endHour}
                    proposedStart={cf.verdict === "reschedule" ? cf.proposed.startHour : undefined}
                    proposedEnd={cf.verdict === "reschedule" ? cf.proposed.endHour : undefined}
                    height={118}
                  />
                </div>

                <div className="kpi-row">
                  <div className="kpi-box">
                    <span className="label">Peak</span>
                    <b className="hot">{cf.current.peakHeatIndexF}&deg;</b>
                  </div>
                  <div className="kpi-box">
                    <span className="label">Now</span>
                    <b>{cf.current.degreeHoursOverTrigger}</b>
                  </div>
                  <div className="kpi-box">
                    <span className="label">Moved</span>
                    <b className={cf.degreeHoursAvoided > 0 ? "good" : ""}>
                      {cf.proposed.degreeHoursOverTrigger}
                    </b>
                  </div>
                  <div className="kpi-box lead">
                    <span className="label">Cut</span>
                    <b>{cf.percentReduction}%</b>
                  </div>
                </div>

                <p className="focus-note">{cf.headline}</p>

                <Link
                  href={`/app/sites/${active.site.id}`}
                  className="btn ghost sm"
                  style={{ alignSelf: "flex-start" }}
                >
                  Full analysis &rarr;
                </Link>
              </>
            ) : (
              <div className="panel" style={{ padding: 18 }}>
                <span className="label">Screened, not drilled</span>
                <p className="focus-note" style={{ marginTop: 10 }}>
                  {active.triage
                    ? `Shift peak ${active.triage.shiftPeakF}°F at ${active.triage.humidityPct}% humidity, classified ${active.triage.risk}. Two API calls instead of twenty-four.`
                    : (active.error ?? "No analysis available.")}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
