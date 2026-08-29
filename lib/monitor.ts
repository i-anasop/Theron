/**
 * The autonomous sweep.
 *
 * This is what makes Theron an agent rather than a dashboard: it runs on a
 * schedule with nobody watching, decides for each site whether the crew is
 * safe, and reaches out when the answer changes. The same function backs the
 * cron tick and the "run now" button, so what the judges trigger by hand is
 * exactly what runs at 04:00.
 *
 * Budget discipline matters more here than anywhere else in the system. A
 * sweep that runs every few hours across a growing portfolio is the one thing
 * that could quietly drain an account, so every sweep is handed a hard
 * allowance and stops cleanly when it is exhausted.
 */

import { FortyGuardClient, type CallRecord } from "./fortyguard/client";
import { CreditBudget } from "./fortyguard/cost";
import type { CacheStore } from "./fortyguard/cache";
import { WORKSITES, type Worksite } from "./sites";
import { buildHourlyCurve } from "./analysis/hourly";
import { findBestShift, type Counterfactual } from "./analysis/counterfactual";
import { compareToBaseline } from "./analysis/percentile";
import { triageSite, type TriageResult } from "./analysis/triage";
import { sendSlackAlert } from "./alerts/slack";
import type { SiteBaseline } from "../scripts/baseline";

export interface SiteAssessment {
  site: Worksite;
  counterfactual: Counterfactual | null;
  /** Cheap screening result, present when the full hourly curve was not run. */
  triage?: TriageResult;
  baselineSummary?: string;
  percentile?: number;
  alerted: boolean;
  error?: string;
}

export interface SweepResult {
  ranAt: string;
  date: string;
  assessments: SiteAssessment[];
  creditsSpent: number;
  trail: CallRecord[];
  budgetExhausted: boolean;
}

export interface SweepOptions {
  date?: string;
  baselines?: SiteBaseline[];
  /** Hard credit ceiling for this sweep. */
  allowance?: number;
  sites?: Worksite[];
  cache?: CacheStore;
  /** Post to Slack for any site that is not "keep". */
  alert?: boolean;
  dashboardUrl?: string;
  /** Hours to analyse. Defaults to the whole day so night windows are considered. */
  hours?: number[];
  /**
   * Serve only what the cache holds; never call the API. The public demo runs
   * this way so no visitor can spend the account's credits.
   */
  offline?: boolean;
}

export async function sweep(opts: SweepOptions = {}): Promise<SweepResult> {
  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const sites = opts.sites ?? WORKSITES;
  const baselines = opts.baselines ?? [];
  const hours = opts.hours ?? Array.from({ length: 24 }, (_, i) => i);

  const budget = new CreditBudget(opts.allowance ?? 120_000);
  const trail: CallRecord[] = [];
  const client = new FortyGuardClient({
    budget,
    cache: opts.cache,
    offline: opts.offline,
    onCall: (r) => trail.push(r),
  });

  const assessments: SiteAssessment[] = [];
  let budgetExhausted = false;

  for (const site of sites) {
    // Stop cleanly rather than throwing mid-portfolio.
    if (!budget.canAfford("heatmap", hours.length)) {
      budgetExhausted = true;
      assessments.push({
        site,
        counterfactual: null,
        alerted: false,
        error: `Skipped — ${budget.remaining} credits left, needs ~${hours.length * 4220}.`,
      });
      continue;
    }

    try {
      const curve = await buildHourlyCurve(client, site, date, hours);

      // No hourly curve — fall back to the cheap screening pass rather than
      // reporting nothing. Triage costs two calls instead of twenty-four.
      if (!curve.readings.length) {
        let triage: TriageResult | undefined;
        let triageError: string | undefined;
        try {
          triage = await triageSite(client, site, date);
        } catch (err) {
          triageError =
            (err as Error).name === "CacheMissError"
              ? "No cached data for this site and date."
              : (err as Error).message;
        }
        assessments.push({ site, counterfactual: null, triage, alerted: false, error: triageError });
        continue;
      }

      const cf = findBestShift(curve, site);

      let baselineSummary: string | undefined;
      let percentile: number | undefined;
      const baseline = baselines.find((b) => b.siteId === site.id);
      if (baseline && curve.readings.length) {
        const peakC = Math.max(...curve.readings.map((r) => r.tempC));
        const cmp = compareToBaseline(baseline, peakC);
        baselineSummary = cmp.summary;
        percentile = cmp.percentile;
      }

      let alerted = false;
      if (opts.alert && cf && cf.verdict !== "keep") {
        alerted = await sendSlackAlert({
          site,
          counterfactual: cf,
          baselineSummary,
          dashboardUrl: opts.dashboardUrl,
        });
      }

      assessments.push({ site, counterfactual: cf, baselineSummary, percentile, alerted });
    } catch (err) {
      assessments.push({ site, counterfactual: null, alerted: false, error: (err as Error).message });
    }
  }

  return {
    ranAt: new Date().toISOString(),
    date,
    assessments,
    creditsSpent: budget.totalSpent,
    trail,
    budgetExhausted,
  };
}
