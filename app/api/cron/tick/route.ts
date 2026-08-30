/**
 * The autonomous tick.
 *
 * Vercel Cron calls this on a schedule with nobody watching. It is the
 * strongest single piece of evidence that Theron is an agent and not a
 * dashboard — but only if it leaves a trace, so every firing is written to the
 * run log whether it succeeded, found nothing, or failed.
 *
 * Two deliberate choices:
 *
 *  - It TRIAGES rather than drilling. Two calls per site answers "is anyone in
 *    trouble" for 7,120 credits; the full hourly curve costs ~101,000. A daily
 *    sweep that drills every site would drain an account inside a week, and the
 *    whole point of the two-stage design is that it does not have to.
 *
 *  - It never polls a task inside the request. Analysis submissions take 25-45
 *    seconds and a serverless function is killed well before a portfolio sweep
 *    could finish synchronously, so the work is bounded to fit.
 */

import { NextResponse } from "next/server";
import { FortyGuardClient } from "@/lib/fortyguard/client";
import { CreditBudget, CREDIT_COST } from "@/lib/fortyguard/cost";
import { appCache } from "@/lib/cache-factory";
import { triageSite } from "@/lib/analysis/triage";
import { sendSlackAlert } from "@/lib/alerts/slack";
import { findBestShift } from "@/lib/analysis/counterfactual";
import { buildHourlyCurve } from "@/lib/analysis/hourly";
import { WORKSITES } from "@/lib/sites";
import { recordRun, type RunRecord, type SiteOutcome, type RunTrigger } from "@/lib/runlog";
import { DEMO_DATE } from "@/lib/demo";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const PER_SITE = CREDIT_COST.heatmap + CREDIT_COST.env_params;

export async function GET(request: Request) {
  const t0 = Date.now();
  const url = new URL(request.url);

  // Vercel Cron authenticates with the shared secret. A public URL that spends
  // credits needs a lock, not a hope.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  const authorised = !secret || auth === `Bearer ${secret}`;
  if (!authorised) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Vercel sets this header on scheduled invocations; anything else is a human.
  const trigger: RunTrigger = request.headers.get("x-vercel-cron") ? "schedule" : "manual";

  const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const allowance = Number(process.env.SWEEP_ALLOWANCE ?? WORKSITES.length * PER_SITE + 2_000);

  const budget = new CreditBudget(allowance);
  const trail: Array<{ cached: boolean }> = [];
  const client = new FortyGuardClient({
    budget,
    cache: appCache(),
    onCall: (r) => trail.push({ cached: r.cached }),
  });

  const outcomes: SiteOutcome[] = [];
  let alertsSent = 0;

  for (const site of WORKSITES) {
    if (!budget.canAfford("heatmap")) {
      outcomes.push({
        siteId: site.id,
        city: site.city,
        verdict: "skipped",
        alerted: false,
        note: "budget exhausted",
      });
      continue;
    }

    try {
      const t = await triageSite(client, site, date);

      /*
       * Only sites triage flags earn the hourly analysis — and the drill runs
       * against an OFFLINE client, so it happens only where the hours are
       * already cached.
       *
       * The budget gate alone is not enough protection here: it counts calls,
       * not cache hits, so a generous allowance would let an unattended timer
       * buy a full 24-hour curve at ~101,000 credits for a site nobody asked
       * about. A scheduled job should never be able to spend that on its own
       * initiative. Sites without cached hours stay flagged and are picked up
       * by an operator, or by the next run once the data exists.
       */
      let verdict = t.needsDeepAnalysis ? "flagged" : "clear";
      let alerted = false;

      if (t.needsDeepAnalysis) {
        const cachedOnly = new FortyGuardClient({ budget, cache: appCache(), offline: true });
        try {
          const curve = await buildHourlyCurve(
            cachedOnly,
            site,
            date,
            Array.from({ length: 24 }, (_, i) => i),
          );
          const cf = curve.readings.length ? findBestShift(curve, site) : null;
          if (cf) {
            verdict = cf.verdict;
            if (cf.verdict !== "keep") {
              alerted = await sendSlackAlert({ site, counterfactual: cf });
              if (alerted) alertsSent++;
            }
          }
        } catch {
          // No cached hours for this site: it stays flagged, and nothing is spent.
        }
      }

      outcomes.push({
        siteId: site.id,
        city: site.city,
        verdict,
        peakHeatIndexF: t.screeningHeatIndexF,
        alerted,
        note: t.risk,
      });
    } catch (err) {
      outcomes.push({
        siteId: site.id,
        city: site.city,
        verdict: "error",
        alerted: false,
        note: (err as Error).message.slice(0, 120),
      });
    }
  }

  const run: RunRecord = {
    id: `run_${Date.now().toString(36)}`,
    ranAt: new Date(t0).toISOString(),
    date,
    trigger,
    durationMs: Date.now() - t0,
    sitesChecked: outcomes.filter((o) => o.verdict !== "skipped").length,
    sitesFlagged: outcomes.filter((o) => ["flagged", "reschedule", "stand_down"].includes(o.verdict)).length,
    alertsSent,
    creditsSpent: budget.totalSpent,
    apiCalls: trail.length,
    cacheHits: trail.filter((c) => c.cached).length,
    outcomes,
  };

  await recordRun(run);

  return NextResponse.json({ ok: true, ...run, demoDate: DEMO_DATE });
}
