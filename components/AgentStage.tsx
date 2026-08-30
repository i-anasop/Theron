"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import type { CallRecord } from "@/lib/fortyguard/client";

/**
 * The workspace's front door.
 *
 * Empty state is deliberately close to bare: a line of type and a field. The
 * moment a goal is submitted the page reflows — the prompt rises to the top
 * and the agent's reasoning fills the space beneath — so the interface is only
 * ever showing the one thing that matters at that moment.
 */

type StepState = "running" | "ok" | "failed";

interface Step {
  kind: "think" | "tool";
  label: string;
  detail?: string;
  result?: string;
  state: StepState;
  ms?: number;
  apiCalls?: number;
  cacheHits?: number;
}

interface RunSummary {
  creditsSpent: number;
  iterations: number;
  model: string;
  trail: CallRecord[];
  toolCalls: number;
}

const SUGGESTIONS = [
  "Should the Phoenix crew work their scheduled shift today?",
  "Sweep the portfolio and tell me which site needs intervention most.",
  "How does today compare to this site's own history?",
  "Is there a safer window for the Phoenix shift, and by how much?",
];

export default function AgentStage() {
  const [goal, setGoal] = useState("");
  const [started, setStarted] = useState(false);
  const [asked, setAsked] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [answer, setAnswer] = useState("");
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function finishLast(patch: Partial<Step>) {
    setSteps((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].state === "running") {
          next[i] = { ...next[i], ...patch };
          break;
        }
      }
      return next;
    });
  }

  async function run(text?: string) {
    const q = (text ?? goal).trim();
    if (!q || running) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setAsked(q);
    setGoal(q);
    setStarted(true);
    setRunning(true);
    setSteps([]);
    setAnswer("");
    setSummary(null);
    setError(null);

    try {
      const res = await fetch("/api/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: q }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Agent unavailable (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const evLine = chunk.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!evLine || !dataLine) continue;
          const ev = evLine.slice(7).trim();
          const data = JSON.parse(dataLine.slice(6));

          if (ev === "thinking") {
            finishLast({ state: "ok" });
            setSteps((p) => [...p, { kind: "think", label: `Planning · turn ${data.iteration}`, state: "running" }]);
          } else if (ev === "tool") {
            finishLast({ state: "ok" });
            const args = JSON.stringify(data.input);
            setSteps((p) => [
              ...p,
              { kind: "tool", label: data.name, detail: args === "{}" ? undefined : args, state: "running" },
            ]);
          } else if (ev === "tool_done") {
            finishLast({
              state: data.ok ? "ok" : "failed",
              result: data.summary,
              ms: data.ms,
              apiCalls: data.apiCalls,
              cacheHits: data.cacheHits,
            });
          } else if (ev === "retry") {
            setSteps((p) => [...p, { kind: "think", label: `Rate limited · waiting ${data.seconds}s`, state: "running" }]);
          } else if (ev === "answer") {
            finishLast({ state: "ok" });
            setAnswer(data.answer);
          } else if (ev === "done") {
            setSummary(data);
          } else if (ev === "error") {
            setError(data.message);
          }
        }
      }
      finishLast({ state: "ok" });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  function reset() {
    abortRef.current?.abort();
    setStarted(false);
    setRunning(false);
    setSteps([]);
    setAnswer("");
    setSummary(null);
    setError(null);
    setGoal("");
  }

  const field = (
    <div className="ask-field">
      <input
        type="text"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && run()}
        placeholder="Ask about a worksite, a shift, or the whole portfolio…"
        aria-label="What do you want to know?"
        disabled={running}
        autoFocus={!started}
      />
      <button className="ask-go" onClick={() => run()} disabled={running || !goal.trim()} aria-label="Run agent">
        {running ? (
          <span className="ask-spin" aria-hidden />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1"
               strokeLinecap="round" strokeLinejoin="round" width="17" height="17" aria-hidden>
            <path d="M5 12h13M13 6l6 6-6 6" />
          </svg>
        )}
      </button>
    </div>
  );

  /* ── empty state ── */
  if (!started) {
    return (
      <div className="ask-stage">
        <div className="ask-center">
          <Image src="/logo.png" alt="" width={62} height={62} className="ask-mark" priority />
          <h1 className="ask-h1">What do you need to know?</h1>
          <p className="ask-sub">
            Put a goal in plain language. Theron plans its own API calls, checks the data, and answers with the
            measurement behind it.
          </p>

          {field}

          <div className="ask-chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="ask-chip" onClick={() => run(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── working / answered ── */
  return (
    <div className="ask-run">
      <div className="ask-run-head">
        <div className="ask-asked">
          <span className="label">You asked</span>
          <p>{asked}</p>
        </div>
        <button className="btn ghost sm" onClick={reset}>
          New question
        </button>
      </div>

      {field}

      <div className="ask-body">
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={i} className={`step ${s.state} ${s.kind}`}>
              <span className="step-dot" aria-hidden />
              <div className="step-body">
                <div className="step-line">
                  <span className="step-label">{s.label}</span>
                  {s.detail && <code className="step-args">{s.detail}</code>}
                  {s.ms !== undefined && <span className="step-ms">{s.ms} ms</span>}
                </div>
                {s.result && <div className="step-result">{s.result}</div>}
                {s.apiCalls !== undefined && s.apiCalls > 0 && (
                  <div className="step-meta">
                    {s.apiCalls} API call{s.apiCalls === 1 ? "" : "s"} · {s.cacheHits} from cache
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        {error && <div className="err">{error}</div>}

        {answer && (
          <div className="answer-card">
            <span className="label">Decision</span>
            <p className="answer">{answer}</p>
          </div>
        )}

        {summary && (
          <div className="runbar">
            <span>
              <b>{summary.toolCalls}</b> tool calls
            </span>
            <span>
              <b>{summary.iterations}</b> turns
            </span>
            <span>
              <b>{summary.trail?.length ?? 0}</b> API calls
            </span>
            <span>
              <b>{summary.creditsSpent.toLocaleString()}</b> credits
            </span>
            <span>
              reasoning <b>{summary.model}</b>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
