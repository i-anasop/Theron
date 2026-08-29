/**
 * Runs a sweep on demand, for the dashboard's "Run sweep now" control.
 *
 * Same code path as the cron tick, so what a judge triggers by hand is
 * literally what runs unattended.
 */

import { NextResponse } from "next/server";
import { sweep } from "@/lib/monitor";
import { BASELINES } from "@/lib/baselines";
import { appCache } from "@/lib/cache-factory";
import { DEMO_DATE, PUBLIC_ROUTES_OFFLINE } from "@/lib/demo";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { date?: string; allowance?: number };

  const result = await sweep({
    // Defaults to the fully-cached demo date so the dashboard responds
    // instantly and spends nothing; pass a date to run against live data.
    date: body.date ?? DEMO_DATE,
    baselines: BASELINES,
    allowance: body.allowance ?? 400_000,
    cache: appCache(),
    // Public route: cached data only. The allowance above is a second line of
    // defence, not the primary one.
    offline: PUBLIC_ROUTES_OFFLINE,
    alert: false,
  });

  return NextResponse.json({
    ranAt: result.ranAt,
    date: result.date,
    creditsSpent: result.creditsSpent,
    apiCalls: result.trail.length,
    cacheHits: result.trail.filter((c) => c.cached).length,
    trail: result.trail,
    assessments: result.assessments.map((a) => ({
      site: {
        id: a.site.id,
        name: a.site.name,
        operator: a.site.operator,
        city: a.site.city,
        state: a.site.state,
        crewSize: a.site.crewSize,
        shift: a.site.shift,
        work: a.site.work,
      },
      counterfactual: a.counterfactual,
      triage: a.triage,
      baselineSummary: a.baselineSummary,
      percentile: a.percentile,
      error: a.error,
    })),
  });
}
