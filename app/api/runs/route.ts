/**
 * The autonomous run history.
 *
 * Public and unauthenticated: the whole point is that a reader can check the
 * scheduler actually fires, rather than being asked to trust a config file.
 */

import { NextResponse } from "next/server";
import { getRuns } from "@/lib/runlog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = Math.min(25, Number(new URL(request.url).searchParams.get("limit") ?? 8));
  const history = await getRuns(limit);
  return NextResponse.json(history, { headers: { "Cache-Control": "no-store" } });
}
