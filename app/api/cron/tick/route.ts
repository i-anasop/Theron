/**
 * The autonomous tick.
 *
 * Vercel Cron calls this on a schedule with nobody watching. It is the
 * strongest single piece of evidence that Theron is an agent and not a
 * dashboard: the audit trail fills in overnight, and the alerts arrive
 * whether or not anyone opened the page.
 *
 * Note what this handler deliberately does NOT do: poll a FortyGuard task
 * inside the request. Analysis submissions take 25-45 seconds each and a
 * serverless function is killed well before a portfolio sweep could finish
 * synchronously. The sweep is bounded by a hard credit allowance and a tight
 * hour window so it completes inside the function's budget; anything larger
 * belongs in a queue.
 */

import { NextResponse } from "next/server";
import { sweep } from "@/lib/monitor";
import { BASELINES } from "@/lib/baselines";
import { appCache } from "@/lib/cache-factory";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Vercel Cron authenticates with the shared secret. Reject anything else so
  // a public URL cannot be used to spend the account's credits.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? undefined;

  // The shift-planning horizon: the API forecasts 12 hours ahead, which is
  // exactly one work shift. A tick only ever needs to see that far.
  const now = new Date();
  const startHour = Math.max(0, now.getUTCHours() - 2);
  const hours = Array.from({ length: 14 }, (_, i) => (startHour + i) % 24).sort((a, b) => a - b);

  const result = await sweep({
    date,
    baselines: BASELINES,
    allowance: Number(process.env.SWEEP_ALLOWANCE ?? 120_000),
    cache: appCache(),
    alert: true,
    hours,
    dashboardUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });

  return NextResponse.json({
    ok: true,
    ranAt: result.ranAt,
    date: result.date,
    creditsSpent: result.creditsSpent,
    budgetExhausted: result.budgetExhausted,
    apiCalls: result.trail.length,
    cacheHits: result.trail.filter((c) => c.cached).length,
    sites: result.assessments.map((a) => ({
      id: a.site.id,
      city: a.site.city,
      verdict: a.counterfactual?.verdict ?? "unknown",
      headline: a.counterfactual?.headline,
      alerted: a.alerted,
      error: a.error,
    })),
  });
}
