/**
 * Theron's agent loop.
 *
 * The model plans and explains; the tools decide. Every figure in the output
 * traces back to a recorded API call, and the trail is returned alongside the
 * answer so a reader can check the work rather than trust it.
 *
 * The loop is written by hand rather than taken from a vendor SDK because the
 * reasoning provider is swappable (see llm.ts) — the same loop runs on any
 * OpenAI-compatible endpoint, including free tiers.
 */

import { FortyGuardClient, type CallRecord } from "../fortyguard/client";
import { CreditBudget } from "../fortyguard/cost";
import type { CacheStore } from "../fortyguard/cache";
import { type AgentContext, type AgentTool, buildTools, toLLMTools } from "./tools";
import { LLMClient, type LLMMessage } from "./llm";
import type { SiteBaseline } from "../../scripts/baseline";

const SYSTEM_PROMPT = `You are Theron, an autonomous heat-safety operations agent for outdoor workforces.

Your user is a safety manager responsible for crews working outdoors in high-heat U.S. metros. They act on
what you tell them: they will move a shift, call in extra water and shade, or stand a crew down. Write for
someone who has to justify that decision to an operations director and, if it goes wrong, to a regulator.

HOW YOU WORK

1. Plan before you spend. Analysis calls cost real credits and the allowance is finite. Check the budget,
   decide the smallest set of calls that answers the question, and say what you intend to spend.

2. Cost is charged per call, not per unit of data. One heatmap call returns aggregates over any time window
   for the same price, so never split a window that one call could answer. The only reason to request N
   separate hours is that you genuinely need N distinct hourly values.

3. When evaluating whether a shift should move, search the WHOLE day (hour 0 to 23), not just the hours
   around the current shift. Night and evening windows are legitimate alternatives, and a narrow search
   will miss the answer. Hours already fetched are cached and cost nothing to reuse.

4. Judge heat relative to the site, not against a universal threshold. Crews acclimatise. Use
   compare_to_baseline so "hot" means "hot for this site at this time of year".

THINGS YOU MUST NOT INVENT

This is a compliance product. A fabricated fact here ends up in a safety file, and the user cannot tell
your guesses apart from your measurements. So:

- Never state a number you did not receive from a tool. Do not compute derived figures yourself — every
  number you report must appear verbatim in a tool result. If you want crew-degF-hours, read the
  crewDegreeHoursAvoided field; do not multiply anything by hand.
- Never cite a specific regulation number, CFR section, docket number, or Federal Register page. You do not
  have a tool that returns them, so you do not know them. Refer to "OSHA's proposed heat injury and illness
  prevention standard" in words, and say plainly that it is a proposed rule and not settled law.
- Never invent control measures, rest-to-work ratios, break durations, or water quantities. The
  classify_heat_risk tool returns the guidance for a given condition; call it and quote what it returns.
  If you have not called it, do not offer controls.
- Report credits ACTUALLY spent, not what you estimated a plan would cost. Cached results cost nothing, so
  a run can legitimately spend zero. Call check_credit_budget at the end and quote the spent figure it
  returns. Never state a spend you calculated from the price list.

If a fact you want is not available from any tool, say that it is outside what you can verify.

HOW YOU REPORT

Lead with the decision, then the evidence, then the caveats. One clear recommendation per site with the
measured before/after attached. Quantify the benefit in the units the manager works in: degF-hours of
exposure above the trigger, the percentage reduction, and crew-degF-hours across the whole crew — all read
directly from the evaluate_shift_move result.

"Keep the shift as scheduled" and "no safe window exists, stand the crew down" are both valid and useful
answers. Report gaps in the data as gaps; never fill them in.

Be concise. Aim for under 400 words. No preamble, no restating the question, no tables of contents.`;

export interface AgentRunOptions {
  goal: string;
  baselines: SiteBaseline[];
  /** Credits this run may spend. */
  allowance?: number;
  cache?: CacheStore;
  /** Serve only cached data; never call the API. Used by the public demo. */
  offline?: boolean;
  /**
   * The date the agent should treat as "today" when the user does not name
   * one. In production this is the real date; the public demo pins it to the
   * snapshot date so the agent works against data that exists.
   */
  operatingDate?: string;
  maxIterations?: number;
  onToolCall?: (name: string, input: unknown) => void;
  onText?: (text: string) => void;
  /** Called when a provider rate limit forces a wait, with the delay in seconds. */
  onRetry?: (waitSeconds: number) => void;
}

export interface AgentRunResult {
  answer: string;
  trail: CallRecord[];
  creditsSpent: number;
  toolCalls: Array<{ name: string; input: unknown; ok: boolean }>;
  iterations: number;
  provider: string;
  model: string;
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const budget = new CreditBudget(opts.allowance ?? 150_000);
  const trail: CallRecord[] = [];
  const toolCalls: AgentRunResult["toolCalls"] = [];

  const client = new FortyGuardClient({
    budget,
    cache: opts.cache,
    offline: opts.offline,
    onCall: (record) => trail.push(record),
  });

  const ctx: AgentContext = { client, budget, baselines: opts.baselines, trail };
  const tools = buildTools(ctx);
  const byName = new Map<string, AgentTool>(tools.map((t) => [t.name, t]));
  const llm = new LLMClient();

  const operatingDate = opts.operatingDate ?? new Date().toISOString().slice(0, 10);

  const messages: LLMMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "system",
      content:
        `Operating date: ${operatingDate}. When the user says "today" or does not name a date, use this one.\n` +
        (opts.offline
          ? "This session is running against cached analysis only and cannot issue new API calls. If a tool " +
            "reports that data is not cached, say so plainly — do not present it as an absence of heat risk."
          : "Live API calls are enabled; spend against the allowance deliberately."),
    },
    { role: "user", content: opts.goal },
  ];

  const maxIterations = opts.maxIterations ?? 12;
  let iterations = 0;
  let answer = "";

  while (iterations < maxIterations) {
    iterations++;
    const response = await llm.chat(messages, toLLMTools(tools), (waitMs) =>
      opts.onRetry?.(Math.round(waitMs / 1000)),
    );

    if (response.content) {
      answer = response.content;
      opts.onText?.(response.content);
    }

    if (!response.toolCalls.length) break;

    messages.push({
      role: "assistant",
      content: response.content,
      tool_calls: response.toolCalls,
    });

    // Execute this turn's tool calls, then return every result together.
    for (const call of response.toolCalls) {
      const tool = byName.get(call.name);
      let result: string;
      let ok = true;
      let parsed: unknown = {};

      try {
        parsed = call.argumentsJson ? JSON.parse(call.argumentsJson) : {};
      } catch {
        // Models occasionally emit malformed JSON; tell the model rather than crash.
        ok = false;
        result = JSON.stringify({ error: `Could not parse arguments: ${call.argumentsJson}` });
        opts.onToolCall?.(call.name, call.argumentsJson);
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
        toolCalls.push({ name: call.name, input: call.argumentsJson, ok });
        continue;
      }

      opts.onToolCall?.(call.name, parsed);

      if (!tool) {
        ok = false;
        result = JSON.stringify({ error: `Unknown tool "${call.name}".` });
      } else {
        try {
          result = await tool.run(parsed as Record<string, unknown>);
        } catch (err) {
          ok = false;
          result = JSON.stringify({ error: (err as Error).message });
        }
      }

      messages.push({ role: "tool", tool_call_id: call.id, content: result });
      toolCalls.push({ name: call.name, input: parsed, ok });
    }
  }

  return {
    answer: answer.trim(),
    trail,
    creditsSpent: budget.totalSpent,
    toolCalls,
    iterations,
    provider: llm.provider.name,
    model: llm.provider.model,
  };
}
