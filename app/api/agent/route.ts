/**
 * Runs the agent against a plain-language goal and returns the answer with
 * its full audit trail.
 *
 * The trail is returned unconditionally, not behind a debug flag: being able
 * to check the working is the product, not a developer convenience.
 */

import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent/agent";
import { BASELINES } from "@/lib/baselines";
import { appCache } from "@/lib/cache-factory";
import { DEMO_DATE, PUBLIC_ROUTES_OFFLINE } from "@/lib/demo";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { goal?: string; allowance?: number; date?: string };
  const goal = body.goal?.trim();

  if (!goal) {
    return NextResponse.json({ error: "Provide a goal." }, { status: 400 });
  }

  try {
    const result = await runAgent({
      goal,
      baselines: BASELINES,
      allowance: body.allowance ?? 400_000,
      cache: appCache(),
      // Public route: cached data only, so no visitor can spend credits.
      offline: PUBLIC_ROUTES_OFFLINE,
      operatingDate: body.date ?? DEMO_DATE,
    });

    return NextResponse.json({
      answer: result.answer,
      trail: result.trail,
      toolCalls: result.toolCalls,
      creditsSpent: result.creditsSpent,
      iterations: result.iterations,
      provider: result.provider,
      model: result.model,
    });
  } catch (err) {
    // Surface the real reason: a missing provider key and a rate limit need
    // very different responses from whoever is watching.
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
