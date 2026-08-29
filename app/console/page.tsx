"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DEMO_DATE, DEMO_GOALS } from "@/lib/demo";
import type { Counterfactual } from "@/lib/analysis/counterfactual";
import type { CallRecord } from "@/lib/fortyguard/client";
import HeatChart from "@/components/HeatChart";

interface Assessment {
  site: {
    id: string;
    name: string;
    operator: string;
    city: string;
    state: string;
    crewSize: number;
    shift: { start: string; end: string };
    work: string;
  };
  counterfactual: Counterfactual | null;
  triage?: {
    shiftPeakF: number;
    shiftMeanF: number;
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

interface AgentResponse {
  answer: string;
  trail: CallRecord[];
  toolCalls: Array<{ name: string; input: unknown; ok: boolean }>;
  creditsSpent: number;
  iterations: number;
  provider: string;
  model: string;
  error?: string;
}

export default function Console() {
  const [sweep, setSweep] = useState<SweepResponse | null>(null);
  const [sweeping, setSweeping] = useState(true);
  const [goal, setGoal] = useState(DEMO_GOALS[0]);
  const [agent, setAgent] = useState<AgentResponse | null>(null);
  const [thinking, setThinking] = useState(false);
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
      setSweep(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSweeping(false);
    }
  }

  async function askAgent() {
    setThinking(true);
    setError(null);
    setAgent(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      const data = (await res.json()) as AgentResponse;
      if (!res.ok) throw new Error(data.error ?? `Agent failed (${res.status})`);
      setAgent(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  useEffect(() => {
    void runSweep();
  }, []);

  return (
    <div className="wrap" style={{ paddingTop: 44 }}>
      <div className="sec-head">
        <div className="eyebrow">Live console</div>
        <div className="sec-row">
          <div>
            <h2>Portfolio</h2>
            <p>
              {sweep
                ? `${sweep.date} · ${sweep.assessments.length} worksites · ${sweep.creditsSpent} credits spent (${sweep.cacheHits}/${sweep.apiCalls} cached)`
                : "Assessing worksites…"}
            </p>
          </div>
          <button className="btn ghost sm" onClick={runSweep} disabled={sweeping}>
            {sweeping ? "Sweeping…" : "Re-run sweep"}
          </button>
        </div>
      </div>

      {error && <div className="err">{error}</div>}

      <div className="grid-2">
        {(sweep?.assessments ?? []).map((a) => {
          const cf = a.counterfactual;
          const verdict = cf?.verdict ?? (a.triage ? "screened" : "unknown");
          const hours = cf
            ? [...cf.current.hours, ...cf.proposed.hours]
                .filter((h, i, arr) => arr.findIndex((x) => x.hourIndex === h.hourIndex) === i)
                .sort((x, y) => x.hourIndex - y.hourIndex)
            : [];

          return (
            <article key={a.site.id} className="site">
              <div className="site-top">
                <div>
                  <h3>
                    <Link href={`/sites/${a.site.id}`}>{a.site.name}</Link>
                  </h3>
                  <div className="sub">
                    {a.site.city}, {a.site.state} · {a.site.crewSize} crew · shift {a.site.shift.start}&ndash;
                    {a.site.shift.end}
                  </div>
                </div>
                <span className={`tag ${verdict}`}>{verdict.replace("_", " ")}</span>
              </div>

              <div className="site-body">
                {a.error && <p className="verdict">{a.error}</p>}

                {cf && (
                  <>
                    <p className="verdict">{cf.headline}</p>
                    <HeatChart
                      id={a.site.id}
                      hours={hours}
                      shiftStart={cf.current.startHour}
                      shiftEnd={cf.current.endHour}
                      proposedStart={cf.verdict === "reschedule" ? cf.proposed.startHour : undefined}
                      proposedEnd={cf.verdict === "reschedule" ? cf.proposed.endHour : undefined}
                    />
                    <div className="metrics">
                      <div className="metric">
                        <span className="label">Peak heat idx</span>
                        <div className="m hot">{cf.current.peakHeatIndexF}&deg;F</div>
                      </div>
                      <div className="metric">
                        <span className="label">Exposure now</span>
                        <div className="m">{cf.current.degreeHoursOverTrigger}</div>
                      </div>
                      <div className="metric">
                        <span className="label">If moved</span>
                        <div className={`m ${cf.degreeHoursAvoided > 0 ? "good" : ""}`}>
                          {cf.proposed.degreeHoursOverTrigger}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {!cf && a.triage && (
                  <>
                    <p className="verdict">
                      Screened with <b>2 API calls instead of 24</b>. Shift peak {a.triage.shiftPeakF}&deg;F at{" "}
                      {a.triage.humidityPct}% humidity, classified <b>{a.triage.risk}</b>.{" "}
                      {a.triage.needsDeepAnalysis
                        ? "Flagged for full hourly analysis."
                        : "No further spend warranted."}
                    </p>
                    <div className="metrics">
                      <div className="metric">
                        <span className="label">Shift peak</span>
                        <div className="m hot">{a.triage.shiftPeakF}&deg;F</div>
                      </div>
                      <div className="metric">
                        <span className="label">Humidity</span>
                        <div className="m">{a.triage.humidityPct}%</div>
                      </div>
                      <div className="metric">
                        <span className="label">Screening idx</span>
                        <div className="m">~{a.triage.screeningHeatIndexF}&deg;F</div>
                      </div>
                    </div>
                    <div className="foot-note">
                      Screening estimate only &mdash; the shift mean temperature against the worst hourly
                      humidity. It decides whether to buy the hourly curve; it is never quoted as a measurement.
                    </div>
                  </>
                )}

                {a.baselineSummary && <div className="foot-note">{a.baselineSummary}</div>}
              </div>
            </article>
          );
        })}
      </div>

      <section style={{ paddingBottom: 30 }}>
        <div className="sec-head">
          <div className="eyebrow">Agent</div>
          <h2>Ask it something</h2>
          <p>
            A plain-language goal. The agent decides which endpoints to call, what it will cost, and what the
            data supports &mdash; then shows you all three.
          </p>
        </div>

        <div className="console">
          <div className="console-bar">
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !thinking && askAgent()}
              placeholder="Ask Theron a question…"
              aria-label="Goal for the agent"
            />
            <button className="btn" onClick={askAgent} disabled={thinking || !goal.trim()}>
              {thinking ? "Working…" : "Run agent"}
            </button>
          </div>

          <div className="suggest">
            {DEMO_GOALS.map((g) => (
              <button key={g} className="sug" onClick={() => setGoal(g)}>
                {g}
              </button>
            ))}
          </div>

          <div className="console-out">
            {thinking && <div className="working">planning · selecting endpoints · checking budget…</div>}

            {!thinking && !agent && (
              <p className="muted">
                Pick a question above, or write your own. Nothing here costs credits &mdash; the analysis it
                needs is already cached.
              </p>
            )}

            {agent && (
              <>
                <div className="trace">
                  {agent.toolCalls.map((t, i) => (
                    <div className="trace-row" key={i}>
                      <span className="i">{String(i + 1).padStart(2, "0")}</span>
                      <span>{t.name}</span>
                      {JSON.stringify(t.input) !== "{}" && (
                        <span className="a">{JSON.stringify(t.input)}</span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="answer">{agent.answer}</p>
                <div className="runbar">
                  <span>
                    <b>{agent.toolCalls.length}</b> tool calls
                  </span>
                  <span>
                    <b>{agent.iterations}</b> iterations
                  </span>
                  <span>
                    <b>{agent.creditsSpent.toLocaleString()}</b> credits
                  </span>
                  <span>
                    reasoning <b>{agent.model}</b>
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section style={{ paddingTop: 0 }}>
        <div className="sec-head">
          <div className="eyebrow">Audit trail</div>
          <h2>Every call behind the numbers</h2>
        </div>

        <div className="callout" style={{ marginBottom: 16 }}>
          Nothing above is asserted without a call behind it. Cached rows cost nothing &mdash; the same polygon
          and hour always returns the same answer, so Theron never pays twice for a question it has already
          asked.
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
              {((agent?.trail ?? sweep?.trail ?? []) as CallRecord[]).slice(0, 30).map((c, i) => (
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
