/**
 * Serves the spatial tile grid for one worksite and date.
 *
 * Cached-only: this endpoint never spends credits, so the animation can be
 * scrubbed, replayed, and left running without cost.
 */

import { NextResponse } from "next/server";
import { getSite, WORKSITES } from "@/lib/sites";
import { buildTileGrid } from "@/lib/analysis/tiles";
import { FortyGuardClient } from "@/lib/fortyguard/client";
import { CreditBudget } from "@/lib/fortyguard/cost";
import { appCache } from "@/lib/cache-factory";
import { DEMO_DATE } from "@/lib/demo";

export const revalidate = 3600;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site") ?? WORKSITES[0].id;
  const date = url.searchParams.get("date") ?? DEMO_DATE;

  if (!WORKSITES.some((s) => s.id === siteId)) {
    return NextResponse.json({ error: `Unknown site "${siteId}"` }, { status: 404 });
  }

  const client = new FortyGuardClient({
    budget: new CreditBudget(400_000),
    cache: appCache(),
    offline: true,
  });

  const grid = await buildTileGrid(
    client,
    getSite(siteId),
    date,
    Array.from({ length: 24 }, (_, i) => i),
  );

  if (!grid) {
    return NextResponse.json({ error: "No cached spatial data for this site and date." }, { status: 404 });
  }

  return NextResponse.json(grid, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
