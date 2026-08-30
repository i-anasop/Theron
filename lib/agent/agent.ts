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
import type { Worksite } from "../sites";

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

WHAT THE DATA SOURCE CAN AND CANNOT DO

You read from the FortyGuard Temperature API. Its limits are facts about the world, not preferences, and a
user deserves the real reason when something is impossible:

- COVERAGE IS THE UNITED STATES ONLY. There is no reading for anywhere else - not Pakistan, not Europe, not
  anywhere outside the U.S. If someone asks about a non-U.S. place, say plainly that the temperature data
  source covers U.S. locations only, so no measurement exists for that point. Do NOT say you are "limited to
  your portfolio" - that is the wrong reason and it misleads them about what the product can do.
- DATES run from 2021-01-01 to now, plus 12 hours of forecast. Anything earlier or further ahead does not
  exist.
- You are NOT limited to the registered worksites. screen_location analyses any U.S. coordinates. If a user
  names a U.S. town, city or address, screen it rather than telling them it is not on your list. If you do
  not know its coordinates precisely, say which point you used.
- Users can add their own worksites, with their own crew size and shift. Sites marked addedByUser in
  list_worksites are theirs; treat them exactly like the built-in ones.

When you cannot do something, say what WOULD work. "The data covers the U.S. only, but I can screen any U.S.
site - give me a city or coordinates" is useful. "That is not in my portfolio" is not.

THINGS YOU MUST NOT INVENT

This is a compliance product. A fabricated fact here ends up in a safety file, and the user cannot tell
your guesses apart from your measurements. So:

- Never state a number you did not receive from a tool. Do not compute derived figures yourself — every
  number you report must appear verbatim in a tool result. If you want crew-degF-hours, read the
  crewDegreeHoursAvoided field; do not multiply anything by hand.
- Never cite a specific regulation number, CFR section, docket number, or Federal Register page. You do not
  have a tool that returns them, so you do not know them.
- Whenever you mention OSHA AT ALL, in any sentence, you must also say that the standard is PROPOSED and not
  settled law. There is no exception to this. A safety manager who reads your output and believes a proposed
  rule is already binding will make a compliance decision on a false premise, and that is on you. If saying
  it every time reads repetitively, mention OSHA less — do not drop the qualifier.
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

CONVERSATION

You are talking to a person, not filling in a form.

- If they greet you or make small talk, answer in one friendly line and say what you can look up. Do not
  call tools for a greeting.
- Treat follow-ups as part of the same conversation. "What about Houston?", "why?", "and tomorrow?" all
  refer to the site and day already under discussion.
- Ask a short clarifying question only when the request is genuinely ambiguous AND the answer would change
  what you spend credits on. Otherwise state your assumption in one clause and get on with it.
- If someone asks what you can do, say it plainly in a few lines rather than listing tool names.

Be concise. Under 300 words unless more is asked for. No preamble, no restating the question.`;

export interface AgentRunOptions {
  goal: string;
  /**
   * Prior turns of the conversation, oldest first.
   *
   * Only the question and the final answer of each turn are replayed, not the
   * tool traffic underneath — that would balloon the context for no gain, and
   * the answers already carry every figure the tools produced.
   */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  baselines: SiteBaseline[];
  /** Worksites the user added themselves. */
  userSites?: Worksite[];
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
  /** Fires when a tool finishes, so a UI can show progress rather than a spinner. */
  onToolResult?: (r: {
    name: string;
    ok: boolean;
    ms: number;
    creditsSpent: number;
    apiCalls: number;
    cacheHits: number;
    summary: string;
  }) => void;
  /** Fires at the start of each model turn. */
  onThinking?: (iteration: number) => void;
}

/**
 * A one-line, human-readable gist of a tool result.
 *
 * The raw JSON is the wrong thing to stream to a watching human: it is long,
 * and the interesting part is buried. This pulls out the field that answers
 * "what did that call establish?" so the trace reads as a narrative.
 */
function summarize(name: string, raw: string): string {
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    if (d.error) return String(d.error);

    switch (name) {
      case "list_worksites":
        return `${Array.isArray(d) ? d.length : "?"} worksites in portfolio`;
      case "check_credit_budget":
        return `${Number(d.remaining ?? 0).toLocaleString()} credits available`;
      case "get_site_baseline": {
        const s = d.stats as { count?: number; meanPeakC?: number } | undefined;
        return s ? `${s.count} historical days, mean peak ${s.meanPeakC}°C` : "baseline loaded";
      }
      case "get_hourly_heat_curve": {
        const r = d.readings as Array<{ heatIndexF: number }> | undefined;
        if (!r?.length) return "no readings";
        return `${r.length} hours, peak heat index ${Math.max(...r.map((x) => x.heatIndexF))}°F`;
      }
      case "evaluate_shift_move":
        return `${String(d.verdict ?? "?").replace("_", " ")} — ${d.percentReduction ?? 0}% exposure reduction`;
      case "compare_to_baseline":
        return `${d.percentile}th percentile for this site`;
      case "classify_heat_risk":
        return `${String(d.level ?? "").toUpperCase()} — heat index ${d.heatIndexF}°F`;
      default:
        return "done";
    }
  } catch {
    return "done";
  }
}

export { summarize };

/**
 * Guarantees the compliance caveat, rather than hoping the model remembers it.
 *
 * OSHA's heat rule is a PROPOSED standard. A safety manager who reads an answer
 * and believes it is already binding makes a decision on a false premise, so
 * this property has to hold every time — and "every time" is not something a
 * prompt can promise. The eval suite caught the model dropping the qualifier on
 * two of eight scenarios even after the instruction was hardened, which is
 * exactly why the invariant lives here instead.
 */
export function enforceProposedRuleCaveat(answer: string): string {
  if (!/OSHA/i.test(answer)) return answer;
  if (/propos/i.test(answer)) return answer;
  return (
    answer.trimEnd() +
    "\n\nNote: OSHA's heat injury and illness prevention standard is a proposed rule, not settled law. " +
    "Several state plans already enforce comparable or stricter limits."
  );
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

  const operatingDate = opts.operatingDate ?? new Date().toISOString().slice(0, 10);

  const ctx: AgentContext = {
    client,
    budget,
    baselines: opts.baselines,
    trail,
    userSites: opts.userSites,
    operatingDate,
  };
  const tools = buildTools(ctx);
  const byName = new Map<string, AgentTool>(tools.map((t) => [t.name, t]));
  const llm = new LLMClient();

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
    ...(opts.history ?? []).map((m) =>
      m.role === "user"
        ? ({ role: "user", content: m.content } as LLMMessage)
        : ({ role: "assistant", content: m.content } as LLMMessage),
    ),
    { role: "user", content: opts.goal },
  ];

  const maxIterations = opts.maxIterations ?? 12;
  let iterations = 0;
  let answer = "";

  while (iterations < maxIterations) {
    iterations++;
    opts.onThinking?.(iterations);
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

      const t0 = Date.now();
      const callsBefore = trail.length;

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

      const made = trail.slice(callsBefore);
      opts.onToolResult?.({
        name: call.name,
        ok,
        ms: Date.now() - t0,
        creditsSpent: budget.totalSpent,
        apiCalls: made.length,
        cacheHits: made.filter((c) => c.cached).length,
        summary: summarize(call.name, result),
      });

      messages.push({ role: "tool", tool_call_id: call.id, content: result });
      toolCalls.push({ name: call.name, input: parsed, ok });
    }
  }

  return {
    answer: enforceProposedRuleCaveat(answer.trim()),
    trail,
    creditsSpent: budget.totalSpent,
    toolCalls,
    iterations,
    provider: llm.provider.name,
    model: llm.activeModel,
  };
}
