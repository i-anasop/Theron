/**
 * Screens any U.S. location, live.
 *
 * This is the one public route permitted to spend credits, so it is fenced
 * carefully:
 *
 *  - Triage only. Two calls (one heatmap over the shift window, one humidity
 *    series) answer "is this site worth worrying about" for 7,120 credits
 *    instead of the ~101,000 a full hourly curve costs.
 *  - Results are cached content-addressed, so asking the same question twice
 *    is free and a judge clicking around repeatedly costs nothing.
 *  - A process-wide ceiling caps what this endpoint can ever spend, because a
 *    public URL that spends money needs a limit that is not a good intention.
 *  - U.S.-only bounds are checked before any call, since the API rejects the
 *    rest of the world and a rejected task still burns a round trip.
 */

import { NextResponse } from "next/server";
import { FortyGuardClient } from "@/lib/fortyguard/client";
import { CreditBudget, CREDIT_COST } from "@/lib/fortyguard/cost";
import { appCache } from "@/lib/cache-factory";
import { triageSite } from "@/lib/analysis/triage";
import type { Worksite } from "@/lib/sites";
import { DEMO_DATE } from "@/lib/demo";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Rough continental U.S. plus Alaska and Hawaii. */
const US_BOUNDS = { minLat: 18.0, maxLat: 71.5, minLon: -179.5, maxLon: -66.0 };

const SCREEN_COST = CREDIT_COST.heatmap + CREDIT_COST.env_params;

/**
 * Ceiling for this endpoint over the life of the process. Deliberately small:
 * enough to prove the live path works, not enough to matter if it is abused.
 */
const SESSION_CEILING = Number(process.env.SCREEN_CEILING ?? 120_000);
let spentThisProcess = 0;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    lat?: number;
    lon?: number;
    label?: string;
    date?: string;
    shiftStart?: string;
    shiftEnd?: string;
    crewSize?: number;
  };

  const lat = Number(body.lat);
  const lon = Number(body.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json({ error: "Provide a latitude and longitude." }, { status: 400 });
  }
  if (
    lat < US_BOUNDS.minLat || lat > US_BOUNDS.maxLat ||
    lon < US_BOUNDS.minLon || lon > US_BOUNDS.maxLon
  ) {
    return NextResponse.json(
      { error: "The Temperature API covers United States locations only. Pick a point inside the U.S." },
      { status: 400 },
    );
  }

  const site: Worksite = {
    id: `adhoc-${lat.toFixed(3)}-${lon.toFixed(3)}`,
    name: body.label?.slice(0, 60) || "Custom location",
    operator: "—",
    city: body.label?.slice(0, 40) || "Custom location",
    state: "US",
    lat,
    lon,
    timezone: "UTC",
    shift: { start: body.shiftStart || "06:00", end: body.shiftEnd || "15:00" },
    crewSize: Math.max(1, Math.min(2000, Number(body.crewSize) || 20)),
    work: "Outdoor work",
  };

  const cache = appCache();
  const budget = new CreditBudget(SCREEN_COST + 200);

  // Try cache first with a client that cannot reach the network, so a repeat
  // question is provably free rather than merely cheap.
  try {
    const offlineClient = new FortyGuardClient({ budget, cache, offline: true });
    const cached = await triageSite(offlineClient, site, body.date || DEMO_DATE);
    return NextResponse.json({ ...cached, site: publicSite(site), creditsSpent: 0, cached: true });
  } catch {
    /* not cached — fall through to a live screen */
  }

  if (spentThisProcess + SCREEN_COST > SESSION_CEILING) {
    return NextResponse.json(
      {
        error:
          "Live screening is temporarily at its spend ceiling. Cached locations still work, and the " +
          "ceiling resets when the instance recycles.",
        ceiling: SESSION_CEILING,
        spent: spentThisProcess,
      },
      { status: 429 },
    );
  }

  try {
    const client = new FortyGuardClient({ budget, cache });
    const result = await triageSite(client, site, body.date || DEMO_DATE);
    spentThisProcess += budget.totalSpent;

    return NextResponse.json({
      ...result,
      site: publicSite(site),
      creditsSpent: budget.totalSpent,
      cached: false,
    });
  } catch (err) {
    // Failed tasks cost nothing, so nothing is charged here.
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

function publicSite(s: Worksite) {
  return { id: s.id, name: s.name, lat: s.lat, lon: s.lon, shift: s.shift, crewSize: s.crewSize };
}

export async function GET() {
  return NextResponse.json({
    costPerScreen: SCREEN_COST,
    ceiling: SESSION_CEILING,
    spent: spentThisProcess,
    remaining: Math.max(0, SESSION_CEILING - spentThisProcess),
  });
}
