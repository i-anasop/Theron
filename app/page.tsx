"use client";

import { useEffect, useState } from "react";
import { DEMO_DATE, DEMO_GOALS } from "@/lib/demo";
import type { Counterfactual } from "@/lib/analysis/counterfactual";
import type { CallRecord } from "@/lib/fortyguard/client";

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
    guidance: string;
  };
  baselineSummary?: string;
  percentile?: number;
  error?: string;
}

interface SweepResponse {
  ranAt: string;
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

export default function Page() {
  const [sweep, setSweep] = useState<SweepResponse | null>(null);
  const [sweeping, setSweeping] = useState(false);
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
      if (!res.ok) throw new Error(await res.text());
      setSweep(await res.json());
    } catch (e) {
      setError(`Sweep failed: ${(e as Error).message}`);
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
      if (!res.ok) throw new Error(data.error ?? "Agent failed");
      setAgent(data);
    } catch (e) {
      setError(`Agent failed: ${(e as Error).message}`);
    } finally {
      setThinking(false);
    }
  }

  useEffect(() => {
    void runSweep();
  }, []);

  const totals = sweep
    ? {
        crew: sweep.assessments.reduce((n, a) => n + a.site.crewSize, 0),
        needing: sweep.assessments.filter((a) => a.counterfactual && a.counterfactual.verdict !== "keep").length,
        avoided: sweep.assessments.reduce((n, a) => n + (a.counterfactual?.crewDegreeHoursAvoided ?? 0), 0),
      }
    : null;

  return (
    <div className="shell">
      <header className="masthead">
        <div className="brand">
          <div className="eyebrow">FortyGuard Temperature API · Track 06 Agentic AI</div>
          <h1>Theron</h1>
          <p className="tagline">
            An autonomous heat-safety agent for outdoor workforces. It plans its own API calls, ranks today
            against each site&rsquo;s own history, and proves a shift change before recommending one.
          </p>
        </div>
        <div className="livechip">
          <span className="dot live" />
          Autonomous sweep · daily 04:00 PT
        </div>
      </header>

      {error && <div className="err">{error}</div>}

      <section>
        <h2>
          Portfolio <span className="sub">{sweep ? `${sweep.date} · ${sweep.assessments.length} sites` : "loading"}</span>
        </h2>

        {totals && (
          <div className="summary-row">
            <span>
              <b>{totals.crew}</b> workers monitored
            </span>
            <span>
              <b>{totals.needing}</b> sites needing intervention
            </span>
            <span>
              <b>{totals.avoided.toLocaleString()}</b> crew-°F·h avoidable today
            </span>
            <span>
              <b>{sweep!.creditsSpent.toLocaleString()}</b> credits spent ·{" "}
              <b>{sweep!.cacheHits}</b>/{sweep!.apiCalls} from cache
            </span>
          </div>
        )}

        <div className="grid">
          {(sweep?.assessments ?? []).map((a) => {
            const cf = a.counterfactual;
            const verdict = cf?.verdict ?? (a.triage ? "screened" : "unknown");
            const shiftStart = Number(a.site.shift.start.slice(0, 2));
            const shiftEnd = Number(a.site.shift.end.slice(0, 2));

            return (
              <article key={a.site.id} className={`card ${verdict}`}>
                <div className="card-head">
                  <div>
                    <h3>{a.site.name}</h3>
                    <div className="meta">
                      {a.site.city}, {a.site.state} · {a.site.operator} · {a.site.crewSize} crew ·{" "}
                      {a.site.shift.start}&ndash;{a.site.shift.end}
                    </div>
                  </div>
                  <span className={`verdict ${verdict}`}>{verdict.replace("_", " ")}</span>
                </div>

                {a.error && <p className="headline">{a.error}</p>}
                {cf && <p className="headline">{cf.headline}</p>}

                {!cf && a.triage && (
                  <>
                    <p className="headline">
                      Screened with 2 API calls instead of 24. Shift peak {a.triage.shiftPeakF}&deg;F at{" "}
                      {a.triage.humidityPct}% RH &mdash; classified <strong>{a.triage.risk}</strong>.{" "}
                      {a.triage.needsDeepAnalysis
                        ? "Flagged for the full hourly analysis."
                        : "No further spend warranted."}
                    </p>
                    <dl className="stats">
                      <div className="stat">
                        <dt>Shift peak</dt>
                        <dd>{a.triage.shiftPeakF}&deg;F</dd>
                      </div>
                      <div className="stat">
                        <dt>Humidity</dt>
                        <dd>{a.triage.humidityPct}%</dd>
                      </div>
                      <div className="stat">
                        <dt>Screening HI</dt>
                        <dd>~{a.triage.screeningHeatIndexF}&deg;F</dd>
                      </div>
                    </dl>
                    <p className="meta">
                      Screening estimate only &mdash; pairs the shift mean temperature with the worst hourly
                      humidity. Used to decide whether to buy the hourly curve, never quoted as a measurement.
                    </p>
                  </>
                )}

                {cf && (
                  <>
                    <div className="strip">
                      {cf.current.hours.concat(
                        cf.proposed.hours.filter(
                          (h) => !cf.current.hours.some((c) => c.hourIndex === h.hourIndex),
                        ),
                      )
                        .sort((x, y) => x.hourIndex - y.hourIndex)
                        .map((h) => {
                          const pct = Math.max(6, Math.min(100, ((h.heatIndexF - 70) / 45) * 100));
                          const inShift = h.hourIndex >= shiftStart && h.hourIndex < shiftEnd;
                          return (
                            <div
                              key={h.hourIndex}
                              className={`hr${inShift ? " inshift" : ""}`}
                              title={`${h.hour} — ${h.tempF}°F, ${h.humidityPct}% RH, heat index ${h.heatIndexF}°F (${h.risk})`}
                            >
                              <div className={`bar ${h.risk}`} style={{ height: `${pct}%` }} />
                            </div>
                          );
                        })}
                    </div>
                    <div className="strip-axis">
                      <span>hourly heat index</span>
                      <span>▬ scheduled shift</span>
                    </div>

                    <dl className="stats">
                      <div className="stat">
                        <dt>Peak heat index</dt>
                        <dd>{cf.current.peakHeatIndexF}°F</dd>
                      </div>
                      <div className="stat">
                        <dt>Exposure over trigger</dt>
                        <dd>{cf.current.degreeHoursOverTrigger}</dd>
                      </div>
                      <div className="stat">
                        <dt>{cf.verdict === "reschedule" ? "Avoidable" : "Best available"}</dt>
                        <dd>
                          {cf.verdict === "reschedule"
                            ? `−${cf.percentReduction}%`
                            : `${cf.proposed.degreeHoursOverTrigger}`}
                        </dd>
                      </div>
                    </dl>

                    {a.baselineSummary && <p className="meta">{a.baselineSummary}</p>}
                  </>
                )}
              </article>
            );
          })}
        </div>

        <div className="legend">
          <span>
            <i className="swatch" style={{ background: "var(--safe)" }} /> safe
          </span>
          <span>
            <i className="swatch" style={{ background: "var(--caution)" }} /> caution — OSHA initial trigger
          </span>
          <span>
            <i className="swatch" style={{ background: "var(--high)" }} /> high — OSHA high-heat trigger
          </span>
          <span>
            <i className="swatch" style={{ background: "var(--extreme)" }} /> extreme
          </span>
        </div>

        <button className="ghost" onClick={runSweep} disabled={sweeping} style={{ marginTop: 16 }}>
          {sweeping ? "Sweeping…" : "Run sweep now"}
        </button>
      </section>

      <section>
        <h2>
          Agent console <span className="sub">plain-language goal → planned API calls → cited decision</span>
        </h2>

        <div className="console">
          <div className="console-bar">
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !thinking && askAgent()}
              placeholder="Ask Theron something…"
            />
            <button onClick={askAgent} disabled={thinking || !goal.trim()}>
              {thinking ? "Working…" : "Run agent"}
            </button>
          </div>

          <div className="chips">
            {DEMO_GOALS.map((g) => (
              <button key={g} className="chip" onClick={() => setGoal(g)}>
                {g}
              </button>
            ))}
          </div>

          <div className="console-body">
            {thinking && (
              <div className="thinking">
                <div className="tick">planning · choosing endpoints · checking budget…</div>
              </div>
            )}

            {!thinking && !agent && (
              <div className="thinking">
                <div>Ask a question, or pick one above. The agent decides which endpoints to call.</div>
              </div>
            )}

            {agent && (
              <>
                <div className="thinking" style={{ marginBottom: 14 }}>
                  {agent.toolCalls.map((t, i) => (
                    <div key={i}>
                      <span className="tick">→</span> {t.name}
                      {JSON.stringify(t.input) !== "{}" && (
                        <span style={{ opacity: 0.7 }}> {JSON.stringify(t.input).slice(0, 90)}</span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="answer">{agent.answer}</p>
                <div className="summary-row">
                  <span>
                    <b>{agent.toolCalls.length}</b> tool calls
                  </span>
                  <span>
                    <b>{agent.iterations}</b> iterations
                  </span>
                  <span>
                    <b>{agent.creditsSpent.toLocaleString()}</b> credits spent
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

      <section>
        <h2>
          Audit trail <span className="sub">every API call the agent made, and what it cost</span>
        </h2>
        <p className="note">
          Nothing here is asserted without a call behind it. Cached rows cost nothing — the same polygon and
          hour always returns the same answer, so Theron never pays twice for a question it has already asked.
        </p>

        <div className="scroller">
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
              {((agent?.trail ?? sweep?.trail ?? []) as CallRecord[]).slice(0, 40).map((c, i) => (
                <tr key={i}>
                  <td>
                    <span className={`pill ${c.cached ? "cache" : "live"}`}>{c.cached ? "cache" : "live"}</span>
                  </td>
                  <td className="mono">{c.endpoint}</td>
                  <td className="mono">{c.credits.toLocaleString()}</td>
                  <td className="mono">{c.durationMs} ms</td>
                  <td className="mono">{c.activityId ? c.activityId.slice(0, 8) : "—"}</td>
                  <td>{c.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer>
        <span>Theron · FortyGuard Hackathon &rsquo;26 · Track 06 Agentic AI</span>
        <span>Thresholds from OSHA&rsquo;s proposed heat standard — a proposed rule, not settled law</span>
      </footer>
    </div>
  );
}
