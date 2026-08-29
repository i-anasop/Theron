"use client";

import { useRef, useState } from "react";
import { DEMO_GOALS } from "@/lib/demo";
import type { CallRecord } from "@/lib/fortyguard/client";

/**
 * Watching the agent work is the demonstration.
 *
 * Each step lands as it happens: the model turn, the tool it chose, what that
 * tool established, and what it cost. A viewer can see it deciding — which is
 * the difference between "an agent" and "a text box that eventually answers".
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
  provider: string;
  model: string;
  trail: CallRecord[];
  toolCalls: number;
}

export default function AgentConsole({ onTrail }: { onTrail?: (t: CallRecord[]) => void }) {
  const [goal, setGoal] = useState(DEMO_GOALS[0]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [answer, setAnswer] = useState("");
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function push(s: Step) {
    setSteps((prev) => [...prev, s]);
  }

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

  async function run() {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setRunning(true);
    setSteps([]);
    setAnswer("");
    setSummary(null);
    setError(null);

    try {
      const res = await fetch("/api/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
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
            push({ kind: "think", label: `Planning · turn ${data.iteration}`, state: "running" });
          } else if (ev === "tool") {
            finishLast({ state: "ok" });
            const args = JSON.stringify(data.input);
            push({
              kind: "tool",
              label: data.name,
              detail: args === "{}" ? undefined : args,
              state: "running",
            });
          } else if (ev === "tool_done") {
            finishLast({
              state: data.ok ? "ok" : "failed",
              result: data.summary,
              ms: data.ms,
              apiCalls: data.apiCalls,
              cacheHits: data.cacheHits,
            });
          } else if (ev === "retry") {
            push({ kind: "think", label: `Rate limited · waiting ${data.seconds}s`, state: "running" });
          } else if (ev === "answer") {
            finishLast({ state: "ok" });
            setAnswer(data.answer);
          } else if (ev === "done") {
            setSummary(data);
            onTrail?.(data.trail ?? []);
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

  return (
    <div className="console">
      <div className="console-bar">
        <input
          type="text"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !running && run()}
          placeholder="Ask Theron a question…"
          aria-label="Goal for the agent"
        />
        <button className="btn" onClick={run} disabled={running || !goal.trim()}>
          {running ? "Working…" : "Run agent"}
        </button>
      </div>

      <div className="suggest">
        {DEMO_GOALS.map((g) => (
          <button key={g} className="sug" onClick={() => setGoal(g)} disabled={running}>
            {g}
          </button>
        ))}
      </div>

      <div className="console-out">
        {!steps.length && !running && !answer && (
          <p className="muted">
            Ask something. You&rsquo;ll see each decision as it happens &mdash; which endpoint it picks, what
            that call establishes, and what it costs.
          </p>
        )}

        {steps.length > 0 && (
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
        )}

        {answer && (
          <div className="answer-card">
            <div className="label" style={{ marginBottom: 9 }}>Decision</div>
            <p className="answer">{answer}</p>
          </div>
        )}

        {error && <div className="err">{error}</div>}

        {summary && (
          <div className="runbar">
            <span>
              <b>{summary.toolCalls}</b> tool calls
            </span>
            <span>
              <b>{summary.iterations}</b> turns
            </span>
            <span>
              <b>{summary.creditsSpent.toLocaleString()}</b> credits
            </span>
            <span>
              <b>{summary.trail?.length ?? 0}</b> API calls
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
