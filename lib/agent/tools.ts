/**
 * The agent's tool surface.
 *
 * Design rule: tools return FACTS, never judgements. Every number the agent
 * reports must have come out of one of these functions, which means it came
 * out of the API. The model chooses what to ask and how to explain it; it
 * never gets to invent a temperature, a delta, or an exposure hour.
 *
 * Each tool states its credit cost in its description so the model can plan
 * against a budget rather than discovering the price after spending it.
 */

import type { CallRecord, FortyGuardClient } from "../fortyguard/client";
import { CREDIT_COST, type CreditBudget } from "../fortyguard/cost";
import { getSite, WORKSITES } from "../sites";
import { buildHourlyCurve } from "../analysis/hourly";
import { findBestShift } from "../analysis/counterfactual";
import { compareToBaseline } from "../analysis/percentile";
import type { SiteBaseline } from "../../scripts/baseline";
import { assessRisk } from "../heat/heatIndex";
import type { LLMTool } from "./llm";

export interface AgentTool {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>;
  run: (input: Record<string, unknown>) => Promise<string>;
}

export interface AgentContext {
  client: FortyGuardClient;
  budget: CreditBudget;
  baselines: SiteBaseline[];
  /** Append-only record of everything the agent did. Rendered by the Auditor. */
  trail: CallRecord[];
}

const json = (v: unknown) => JSON.stringify(v, null, 2);

/** Converts our neutral tool shape into the OpenAI-compatible wire format. */
export function toLLMTools(tools: AgentTool[]): LLMTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

export function buildTools(ctx: AgentContext): AgentTool[] {
  return [
    {
      name: "list_worksites",
      description:
        "List every worksite in the monitored portfolio, with its crew size, scheduled shift and location. " +
        "Free — costs no credits. Start here when the goal does not name a specific site.",
      parameters: { type: "object", properties: {}, required: [] },
      run: async () =>
        json(
          WORKSITES.map((s) => ({
            id: s.id,
            name: s.name,
            operator: s.operator,
            location: `${s.city}, ${s.state}`,
            shift: `${s.shift.start}-${s.shift.end}`,
            crewSize: s.crewSize,
            work: s.work,
            hasBaseline: ctx.baselines.some((b) => b.siteId === s.id),
          })),
        ),
    },

    {
      name: "check_credit_budget",
      description:
        "Report how many credits remain in this run's allowance and how many calls that buys. Free. " +
        "Consult this before planning any multi-hour analysis.",
      parameters: { type: "object", properties: {}, required: [] },
      run: async () =>
        json({
          allowance: ctx.budget.allowance,
          spent: ctx.budget.totalSpent,
          remaining: ctx.budget.remaining,
          costPerCall: CREDIT_COST,
          affordableHeatmapCalls: ctx.budget.affordableCalls("heatmap"),
          note:
            "Cost is charged per call, not per unit of data. One heatmap call returns min/avg/max over " +
            "whatever window you request, at the same price. Only request separate hours when you " +
            "genuinely need per-hour values.",
        }),
    },

    {
      name: "get_site_baseline",
      description:
        "Return a worksite's historical heat baseline — the distribution of daily peak temperatures across " +
        "comparable calendar days sampled since 2022. Free. Use this to judge whether today is unusual FOR " +
        "THIS SITE rather than against an absolute threshold.",
      parameters: {
        type: "object",
        properties: { siteId: { type: "string", description: "Worksite id from list_worksites" } },
        required: ["siteId"],
      },
      run: async (input) => {
        const siteId = String(input.siteId ?? "");
        const b = ctx.baselines.find((x) => x.siteId === siteId);
        if (!b) return json({ error: `No baseline built for "${siteId}". Run the baseline job first.` });
        return json({ siteId: b.siteId, stats: b.stats, sampledDays: b.samples.length, builtAt: b.builtAt });
      },
    },

    {
      name: "get_hourly_heat_curve",
      description:
        `EXPENSIVE — costs ${CREDIT_COST.heatmap} credits PER HOUR requested, plus ${CREDIT_COST.env_params} ` +
        "once for the day's humidity series. Returns real per-hour temperature, humidity, heat index and OSHA " +
        "risk level. Keep the range tight: request only the hours needed to answer the question. Results are " +
        "cached, so re-requesting the same hours is free.",
      parameters: {
        type: "object",
        properties: {
          siteId: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD, from 2022-01-01 to today+12h" },
          startHour: { type: "integer", minimum: 0, maximum: 23 },
          endHour: { type: "integer", minimum: 0, maximum: 23, description: "Inclusive" },
        },
        required: ["siteId", "date", "startHour", "endHour"],
      },
      run: async (input) => {
        const siteId = String(input.siteId ?? "");
        const date = String(input.date ?? "");
        const startHour = Number(input.startHour);
        const endHour = Number(input.endHour);
        const site = getSite(siteId);
        const hours = range(startHour, endHour);

        if (!ctx.budget.canAfford("heatmap", hours.length)) {
          return json({
            error: "Insufficient budget",
            requestedHours: hours.length,
            affordableCalls: ctx.budget.affordableCalls("heatmap"),
            advice: "Narrow the hour range and try again.",
          });
        }

        const curve = await buildHourlyCurve(ctx.client, site, date, hours);
        return json({ siteId, date, readings: curve.readings, creditsSpentSoFar: ctx.budget.totalSpent });
      },
    },

    {
      name: "evaluate_shift_move",
      description:
        "Run the counterfactual: compare the site's scheduled shift against every alternative window of the " +
        "same length in the day, and return the MEASURED difference in degF-hours of exposure above OSHA's proposed " +
        "high-heat trigger. Returns a verdict of reschedule, keep, or stand_down. Reuses cached hours, so " +
        "this is usually free after get_hourly_heat_curve. This is how a recommendation becomes evidence — " +
        "never assert a shift change without it.",
      parameters: {
        type: "object",
        properties: {
          siteId: { type: "string" },
          date: { type: "string" },
          searchStartHour: {
            type: "integer",
            minimum: 0,
            maximum: 23,
            description: "Optional. Defaults to 0 — searching the whole day.",
          },
          searchEndHour: {
            type: "integer",
            minimum: 0,
            maximum: 23,
            description: "Optional. Defaults to 23 — searching the whole day.",
          },
        },
        required: ["siteId", "date"],
      },
      run: async (input) => {
        const siteId = String(input.siteId ?? "");
        const date = String(input.date ?? "");
        const site = getSite(siteId);

        /*
         * Default to the whole day, and never search a window narrower than
         * the scheduled shift plus room to move.
         *
         * A narrow search silently produces a WORSE recommendation that still
         * looks authoritative: searching only the shift hours at the Phoenix
         * site returned "no alternative helps", while the full-day search
         * found an evening window cutting exposure 31%. Asking the model
         * nicely to search widely is not reliable enough for a safety
         * decision, so the correctness lives here instead.
         */
        const hours = range(0, 23);

        if (!ctx.budget.canAfford("heatmap", hours.length)) {
          return json({ error: "Insufficient budget for the requested search window." });
        }

        const curve = await buildHourlyCurve(ctx.client, site, date, hours);
        const result = findBestShift(curve, site);
        if (!result) return json({ error: "Not enough hourly data — widen the search window." });
        return json(result);
      },
    },

    {
      name: "compare_to_baseline",
      description:
        "Rank an observed peak temperature against a site's own sampled history: percentile, z-score, rank. " +
        "Free. Pass a peak temperature in Celsius obtained from get_hourly_heat_curve.",
      parameters: {
        type: "object",
        properties: {
          siteId: { type: "string" },
          peakTempC: { type: "number", description: "Observed peak temperature in Celsius" },
        },
        required: ["siteId", "peakTempC"],
      },
      run: async (input) => {
        const siteId = String(input.siteId ?? "");
        const b = ctx.baselines.find((x) => x.siteId === siteId);
        if (!b) return json({ error: `No baseline for "${siteId}".` });
        return json(compareToBaseline(b, Number(input.peakTempC)));
      },
    },

    {
      name: "classify_heat_risk",
      description:
        "Classify a temperature and humidity pair against the heat-index triggers in OSHA's proposed standard, returning the " +
        "risk level and the control measures that apply. Free — pure computation, no API call.",
      parameters: {
        type: "object",
        properties: { tempF: { type: "number" }, humidityPct: { type: "number" } },
        required: ["tempF", "humidityPct"],
      },
      run: async (input) => json(assessRisk(Number(input.tempF), Number(input.humidityPct))),
    },
  ];
}

function range(start: number, end: number): number[] {
  const [a, b] = start <= end ? [start, end] : [end, start];
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}
