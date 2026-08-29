"use client";

import { useEffect, useMemo, useState } from "react";
import { DEMO_DATE, DEMO_GOALS } from "@/lib/demo";
import type { Counterfactual } from "@/lib/analysis/counterfactual";
import type { HourReading } from "@/lib/analysis/hourly";
import type { CallRecord } from "@/lib/fortyguard/client";

/* ────────────────────────────── types ────────────────────────────── */

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

/* ───────────────────────────── heat chart ─────────────────────────── */

const OSHA_HIGH = 90;
const Y_MIN = 70;
const Y_MAX = 118;
const W = 320;
const H = 96;

const RISK_COLOR: Record<string, string> = {
  safe: "var(--safe)",
  caution: "var(--caution)",
  high: "var(--high)",
  extreme: "var(--extreme)",
};

function HeatChart({
  hours,
  shiftStart,
  shiftEnd,
  proposedStart,
  proposedEnd,
  id,
}: {
  hours: HourReading[];
  shiftStart: number;
  shiftEnd: number;
  proposedStart?: number;
  proposedEnd?: number;
  id: string;
}) {
  const pts = useMemo(() => {
    if (!hours.length) return [];
    const span = Math.max(1, hours.length - 1);
    return hours.map((h, i) => ({
      x: (i / span) * W,
      y: H - ((Math.min(Y_MAX, Math.max(Y_MIN, h.heatIndexF)) - Y_MIN) / (Y_MAX - Y_MIN)) * H,
      h,
    }));
  }, [hours]);

  if (!pts.length) return null;

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const thresholdY = H - ((OSHA_HIGH - Y_MIN) / (Y_MAX - Y_MIN)) * H;

  // Hour index → x position, for the shift bands.
  const first = hours[0].hourIndex;
  const last = hours[hours.length - 1].hourIndex;
  const bandX = (hour: number) => ((hour - first) / Math.max(1, last - first)) * W;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
           aria-label="Hourly heat index across the day">
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--extreme)" stopOpacity="0.34" />
            <stop offset="55%" stopColor="var(--high)" stopOpacity="0.13" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* proposed window, drawn behind everything */}
        {proposedStart !== undefined && proposedEnd !== undefined && (
          <rect
            x={bandX(proposedStart)} y={0}
            width={Math.max(0, bandX(proposedEnd) - bandX(proposedStart))} height={H}
            fill="var(--safe)" opacity="0.11"
          />
        )}

        {/* currently scheduled shift */}
        <rect
          x={bandX(shiftStart)} y={0}
          width={Math.max(0, bandX(shiftEnd) - bandX(shiftStart))} height={H}
          fill="var(--accent)" opacity="0.07"
        />

        {/* OSHA high-heat trigger */}
        <line
          x1="0" y1={thresholdY} x2={W} y2={thresholdY}
          stroke="var(--extreme)" strokeWidth="1" strokeDasharray="3 3"
          opacity="0.5" vectorEffect="non-scaling-stroke"
        />

        <path d={area} fill={`url(#fill-${id})`} />
        <path
          d={line} fill="none" stroke="var(--high)" strokeWidth="1.6"
          strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
        />

        {pts.map((p) => (
          <circle
            key={p.h.hourIndex} cx={p.x} cy={p.y} r="2"
            fill={RISK_COLOR[p.h.risk] ?? "var(--text-3)"}
            vectorEffect="non-scaling-stroke"
          >
            <title>
              {p.h.hour} — {p.h.tempF}°F, {p.h.humidityPct}% RH → heat index {p.h.heatIndexF}°F ({p.h.risk})
            </title>
          </circle>
        ))}
      </svg>

      <div className="chart-legend">
        <span><i className="dotm" style={{ background: "var(--accent)", opacity: .5 }} /> scheduled</span>
        {proposedStart !== undefined && (
          <span><i className="dotm" style={{ background: "var(--safe)", opacity: .6 }} /> proposed</span>
        )}
        <span style={{ color: "var(--extreme)" }}>┄ OSHA high-heat trigger (90°F)</span>
      </div>
    </div>
  );
}

/* ────────────────────────────── page ─────────────────────────────── */

export default function Page() {
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
      if (!res.ok) throw new Error(`sweep returned ${res.status}`);
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
      if (!res.ok) throw new Error(data.error ?? `agent returned ${res.status}`);
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

  const headline = sweep?.assessments.find((a) => a.counterfactual?.verdict === "reschedule")?.counterfactual;
  const totals = sweep && {
    crew: sweep.assessments.reduce((n, a) => n + a.site.crewSize, 0),
    flagged: sweep.assessments.filter(
      (a) => (a.counterfactual && a.counterfactual.verdict !== "keep") || a.triage?.needsDeepAnalysis,
    ).length,
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="mark">
          <div className="glyph">T</div>
          <div className="wordmark">
            Theron
            <small>Heat Safety Operations Agent</small>
          </div>
        </div>
        <div className="status">
          <span className="beacon" />
          Autonomous sweep · daily 04:00 PT
        </div>
      </header>

      <div className="hero">
        <h1>
          It doesn&rsquo;t recommend a shift change. It <em>proves</em> one.
        </h1>
        <p>
          Theron watches a portfolio of U.S. worksites with no human in the loop. It plans its own Temperature
          API calls, ranks today against each site&rsquo;s own multi-year history, then queries the alternative
          hours and reports the measured difference &mdash; with every call it made shown below.
        </p>

        <div className="kpis">
          <div className="kpi accent">
            <span className="label">Exposure avoided</span>
            <div className="v">
              {headline ? `${headline.percentReduction}` : "—"}
              <small>%</small>
            </div>
            <div className="foot">
              {headline ? `${headline.degreeHoursAvoided} °F·h below the OSHA trigger` : "awaiting sweep"}
            </div>
          </div>
          <div className="kpi">
            <span className="label">Crew hours removed</span>
            <div className="v">{headline ? headline.crewDegreeHoursAvoided.toLocaleString() : "—"}</div>
            <div className="foot">crew-°F·h across the affected crew</div>
          </div>
          <div className="kpi">
            <span className="label">Workers monitored</span>
            <div className="v">{totals ? totals.crew : "—"}</div>
            <div className="foot">{totals ? `${totals.flagged} sites flagged today` : "across the portfolio"}</div>
          </div>
          <div className="kpi">
            <span className="label">Credits this run</span>
            <div className="v">{sweep ? sweep.creditsSpent.toLocaleString() : "—"}</div>
            <div className="foot">
              {sweep ? `${sweep.cacheHits}/${sweep.apiCalls} calls served from cache` : "cache-first by design"}
            </div>
          </div>
        </div>
      </div>

      {error && <div className="err">{error}</div>}

      <section>
        <div className="sec-head">
          <div>
            <h2>Worksite portfolio</h2>
            <p>{sweep ? `${sweep.date} · ${sweep.assessments.length} sites assessed` : "loading…"}</p>
          </div>
          <button className="btn quiet" onClick={runSweep} disabled={sweeping}>
            {sweeping ? "Sweeping…" : "Run sweep"}
          </button>
        </div>

        <div className="sites">
          {(sweep?.assessments ?? []).map((a) => {
            const cf = a.counterfactual;
            const verdict = cf?.verdict ?? (a.triage ? "screened" : "unknown");
            const shiftStart = Number(a.site.shift.start.slice(0, 2));
            const shiftEnd = Number(a.site.shift.end.slice(0, 2));

            const allHours = cf
              ? [...cf.current.hours, ...cf.proposed.hours]
                  .filter((h, i, arr) => arr.findIndex((x) => x.hourIndex === h.hourIndex) === i)
                  .sort((x, y) => x.hourIndex - y.hourIndex)
              : [];

            return (
              <article key={a.site.id} className="site">
                <div className="site-top">
                  <div>
                    <h3>{a.site.name}</h3>
                    <div className="sub">
                      {a.site.city}, {a.site.state} · {a.site.crewSize} crew · shift {a.site.shift.start}&ndash;
                      {a.site.shift.end}
                    </div>
                  </div>
                  <span className={`tag ${verdict}`}>{verdict.replace("_", " ")}</span>
                </div>

                <div className="site-body">
                  {a.error && <p className="verdict-line">{a.error}</p>}

                  {cf && (
                    <>
                      <p className="verdict-line">{cf.headline}</p>

                      <HeatChart
                        id={a.site.id}
                        hours={allHours}
                        shiftStart={shiftStart}
                        shiftEnd={shiftEnd}
                        proposedStart={cf.verdict === "reschedule" ? cf.proposed.startHour : undefined}
                        proposedEnd={cf.verdict === "reschedule" ? cf.proposed.endHour : undefined}
                      />

                      <div className="metrics">
                        <div className="metric">
                          <span className="label">Peak heat idx</span>
                          <div className="m warn">{cf.current.peakHeatIndexF}&deg;F</div>
                        </div>
                        <div className="metric">
                          <span className="label">Exposure now</span>
                          <div className="m">{cf.current.degreeHoursOverTrigger}</div>
                        </div>
                        <div className="metric">
                          <span className="label">If moved</span>
                          <div className={`m ${cf.degreeHoursAvoided > 0 ? "down" : ""}`}>
                            {cf.proposed.degreeHoursOverTrigger}
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {!cf && a.triage && (
                    <>
                      <p className="verdict-line">
                        Screened with <b>2 API calls instead of 24</b>. Shift peak {a.triage.shiftPeakF}&deg;F at{" "}
                        {a.triage.humidityPct}% humidity &mdash; classified <b>{a.triage.risk}</b>.{" "}
                        {a.triage.needsDeepAnalysis
                          ? "Flagged for full hourly analysis."
                          : "No further spend warranted."}
                      </p>
                      <div className="metrics">
                        <div className="metric">
                          <span className="label">Shift peak</span>
                          <div className="m warn">{a.triage.shiftPeakF}&deg;F</div>
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
                      <div className="baseline-note">
                        Screening estimate only &mdash; the shift mean temperature against the worst hourly
                        humidity. Used to decide whether to buy the hourly curve, never quoted as a measurement.
                      </div>
                    </>
                  )}

                  {a.baselineSummary && <div className="baseline-note">{a.baselineSummary}</div>}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <div className="sec-head">
          <div>
            <h2>Agent console</h2>
            <p>Plain-language goal → the agent plans its own calls → a decision with citations</p>
          </div>
        </div>

        <div className="console">
          <div className="prompt-row">
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

          <div className="suggestions">
            {DEMO_GOALS.map((g) => (
              <button key={g} className="sugg" onClick={() => setGoal(g)}>
                {g}
              </button>
            ))}
          </div>

          <div className="console-out">
            {thinking && <div className="working">planning · selecting endpoints · checking budget…</div>}

            {!thinking && !agent && (
              <p className="placeholder">
                Ask a question, or pick one above. The agent decides which endpoints to call and how much to
                spend — then shows you both.
              </p>
            )}

            {agent && (
              <>
                <div className="trace">
                  {agent.toolCalls.map((t, i) => (
                    <div className="trace-row" key={i}>
                      <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                      <span>{t.name}</span>
                      {JSON.stringify(t.input) !== "{}" && (
                        <span className="args">{JSON.stringify(t.input)}</span>
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

      <section>
        <div className="sec-head">
          <div>
            <h2>Audit trail</h2>
            <p>Every Temperature API call behind the numbers above</p>
          </div>
        </div>

        <div className="callout">
          Nothing here is asserted without a call behind it. Cached rows cost nothing — the same polygon and
          hour always returns the same answer, so Theron never pays twice for a question it has already asked.
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
                  <td className="note">{c.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer>
        <span>Theron · FortyGuard Hackathon &rsquo;26 · Track 06 Agentic AI</span>
        <span>OSHA thresholds reference a proposed rule, not settled law</span>
      </footer>
    </div>
  );
}
