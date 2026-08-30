"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

/**
 * The workspace's front door: a conversation, not a one-shot form.
 *
 * Each turn keeps its own reasoning trace, collapsed by default. The trace is
 * what proves the answer was worked out rather than generated, so it stays
 * available — but folded away, because after the first look what a user wants
 * is the answer.
 */

type StepState = "running" | "ok" | "failed";

interface Step {
  kind: "think" | "tool";
  label: string;
  detail?: string;
  result?: string;
  state: StepState;
  ms?: number;
}

interface Turn {
  id: number;
  question: string;
  steps: Step[];
  answer: string;
  error?: string;
  credits?: number;
  apiCalls?: number;
  model?: string;
  done: boolean;
  open: boolean;
}

const SUGGESTIONS = [
  "Can my Phoenix crew work their normal shift today?",
  "Which site needs attention most right now?",
  "Is today unusually hot for the Phoenix site?",
  "Find a safer window for the Phoenix shift.",
];

export default function AgentStage() {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [running, setRunning] = useState(false);
  const [showSug, setShowSug] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    if (turns.length) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  function patch(id: number, fn: (t: Turn) => Turn) {
    setTurns((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }

  function closeLastStep(t: Turn, patchStep: Partial<Step>): Turn {
    const steps = [...t.steps];
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].state === "running") {
        steps[i] = { ...steps[i], ...patchStep };
        break;
      }
    }
    return { ...t, steps };
  }

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || running) return;

    const id = nextId.current++;
    const history = turns
      .filter((t) => t.answer)
      .flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer },
      ]);

    setInput("");
    setShowSug(false);
    setRunning(true);
    setTurns((prev) => [
      ...prev.map((t) => ({ ...t, open: false })),
      { id, question: q, steps: [], answer: "", done: false, open: true },
    ]);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch("/api/agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: q, history }),
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
          const ev = chunk.split("\n").find((l) => l.startsWith("event: "))?.slice(7).trim();
          const dl = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!ev || !dl) continue;
          const data = JSON.parse(dl.slice(6));

          if (ev === "thinking") {
            patch(id, (t) => {
              const base = closeLastStep(t, { state: "ok" });
              return {
                ...base,
                steps: [...base.steps, { kind: "think", label: "Thinking", state: "running" }],
              };
            });
          } else if (ev === "tool") {
            patch(id, (t) => {
              const base = closeLastStep(t, { state: "ok" });
              const args = JSON.stringify(data.input);
              return {
                ...base,
                steps: [
                  ...base.steps,
                  {
                    kind: "tool",
                    label: data.name,
                    detail: args === "{}" ? undefined : args,
                    state: "running",
                  },
                ],
              };
            });
          } else if (ev === "tool_done") {
            patch(id, (t) =>
              closeLastStep(t, { state: data.ok ? "ok" : "failed", result: data.summary, ms: data.ms }),
            );
          } else if (ev === "retry") {
            patch(id, (t) => ({
              ...t,
              steps: [...t.steps, { kind: "think", label: `Rate limited, waiting ${data.seconds}s`, state: "running" }],
            }));
          } else if (ev === "answer") {
            patch(id, (t) => ({ ...closeLastStep(t, { state: "ok" }), answer: data.answer }));
          } else if (ev === "done") {
            patch(id, (t) => ({
              ...t,
              done: true,
              open: false,
              credits: data.creditsSpent,
              apiCalls: data.trail?.length ?? 0,
              model: data.model,
            }));
          } else if (ev === "error") {
            patch(id, (t) => ({ ...t, error: data.message, done: true }));
          }
        }
      }
      patch(id, (t) => ({ ...closeLastStep(t, { state: "ok" }), done: true }));
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        patch(id, (t) => ({ ...t, error: (e as Error).message, done: true }));
      }
    } finally {
      setRunning(false);
    }
  }

  const composer = (
    <div className="cmp">
      <div className="cmp-field">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Ask about a site, a shift, or the whole portfolio…"
          rows={2}
          aria-label="Message Theron"
          disabled={running}
        />
        <div className="cmp-actions">
          <button
            className={`cmp-sug-btn ${showSug ? "on" : ""}`}
            onClick={() => setShowSug((s) => !s)}
            aria-label="Show example questions"
            aria-expanded={showSug}
            title="Example questions"
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 18h6M10 21.5h4" />
              <path d="M12 2.5a6.5 6.5 0 0 0-3.7 11.85c.45.32.7.85.7 1.4V16h6v-.25c0-.55.25-1.08.7-1.4A6.5 6.5 0 0 0 12 2.5Z" />
            </svg>
          </button>
          <button
            className="cmp-send"
            onClick={() => void send()}
            disabled={running || !input.trim()}
            aria-label="Send"
            type="button"
          >
            {running ? (
              <span className="cmp-spin" aria-hidden />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {showSug && (
        <div className="cmp-sug">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => void send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  /* ── empty state ── */
  if (!turns.length) {
    return (
      <div className="ask-empty">
        <div className="ask-empty-in">
          <Image src="/logo.png" alt="" width={56} height={56} className="ask-mark" priority />
          <h1>What do you need to know?</h1>
          {composer}
        </div>
      </div>
    );
  }

  /* ── conversation ── */
  return (
    <div className="ask-thread">
      <div className="thread">
        {turns.map((t) => (
          <div className="turn" key={t.id}>
            <div className="turn-q">
              <p>{t.question}</p>
            </div>

            <div className="turn-a">
              <span className="turn-avatar" aria-hidden>
                <Image src="/logo.png" alt="" width={28} height={28} />
              </span>

              <div className="turn-body">
                {t.steps.length > 0 && (
                  <div className={`trace-box ${t.open ? "open" : ""}`}>
                    <button
                      className="trace-head"
                      onClick={() => patch(t.id, (x) => ({ ...x, open: !x.open }))}
                      aria-expanded={t.open}
                      type="button"
                    >
                      <span className="trace-caret" aria-hidden>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </span>
                      {t.done ? (
                        <span>
                          Checked the data &middot; {t.steps.filter((s) => s.kind === "tool").length} lookups
                        </span>
                      ) : (
                        <span className="trace-live">
                          {t.steps[t.steps.length - 1]?.label ?? "Working"}
                          <i />
                          <i />
                          <i />
                        </span>
                      )}
                    </button>

                    {t.open && (
                      <ol className="trace-list">
                        {t.steps.map((s, i) => (
                          <li key={i} className={`tr ${s.state} ${s.kind}`}>
                            <span className="tr-dot" aria-hidden />
                            <div>
                              <span className="tr-label">{s.label}</span>
                              {s.result && <span className="tr-res">{s.result}</span>}
                            </div>
                            {s.ms !== undefined && <span className="tr-ms">{s.ms}ms</span>}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}

                {t.answer && <div className="turn-answer">{t.answer}</div>}
                {t.error && <div className="err" style={{ marginTop: 10 }}>{t.error}</div>}

                {t.done && t.answer && (
                  <div className="turn-meta">
                    <span>{t.apiCalls ?? 0} data lookups</span>
                    <span>{(t.credits ?? 0).toLocaleString()} credits</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="composer-dock">{composer}</div>
    </div>
  );
}
