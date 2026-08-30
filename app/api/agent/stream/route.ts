/**
 * The agent, streamed.
 *
 * A twenty-second spinner tells a viewer nothing about whether the system is
 * reasoning or hung. This emits each step as it happens — the model turn, the
 * tool it chose, what that tool established, what it cost — so watching the
 * agent work is itself the demonstration that it is planning rather than
 * pattern-matching a canned answer.
 *
 * Live mode is opt-in per request and passes through the shared spend guard.
 * Cached mode is the default and cannot spend anything at all.
 */

import { runAgent } from "@/lib/agent/agent";
import { BASELINES } from "@/lib/baselines";
import { appCache } from "@/lib/cache-factory";
import { DEMO_DATE, PUBLIC_ROUTES_OFFLINE } from "@/lib/demo";
import { claimLiveRun, liveQuota, settleLiveRun } from "@/lib/live-guard";
import { isInsideUS, toWorksite } from "@/lib/sites";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET() {
  // Lets the UI show the live allowance before offering the toggle.
  return Response.json(liveQuota());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    goal?: string;
    date?: string;
    live?: boolean;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
    sites?: Array<Record<string, unknown>>;
  };
  const goal = body.goal?.trim();

  if (!goal) {
    return new Response(JSON.stringify({ error: "Provide a goal." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  /*
   * Default to cached. `offline: true` means the client cannot reach the
   * network at all, so the common path is structurally incapable of spending
   * rather than merely budgeted against.
   */
  let offline = PUBLIC_ROUTES_OFFLINE;
  let allowance = 400_000; // generous, but meaningless while offline
  let liveDenied: string | null = null;

  if (body.live) {
    const claim = claimLiveRun();
    if (claim.ok) {
      offline = false;
      allowance = claim.allowance;
    } else {
      liveDenied = claim.reason;
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* client disconnected */
        }
      };

      try {
        send("start", { goal, live: !offline, allowance: offline ? 0 : allowance });
        if (liveDenied) send("notice", { message: liveDenied });

        const result = await runAgent({
          goal,
          // Only the last few turns: enough for "what about Houston?" to resolve,
          // without dragging an entire session into every request.
          history: (body.history ?? []).slice(-6),
          // Sites the person added in their browser. Validated here rather than
          // trusted: a client can send anything, and an out-of-coverage point
          // would only waste a call to discover.
          userSites: (body.sites ?? [])
            .slice(0, 25)
            .map((raw) => toWorksite(raw as never))
            .filter((s) => isInsideUS(s.lat, s.lon)),
          baselines: BASELINES,
          allowance,
          cache: appCache(),
          offline,
          // Live runs work against today; cached runs against the snapshot date,
          // because that is the day the cache actually holds.
          operatingDate: body.date ?? (offline ? DEMO_DATE : new Date().toISOString().slice(0, 10)),
          onThinking: (i) => send("thinking", { iteration: i }),
          onToolCall: (name, input) => send("tool", { name, input }),
          onToolResult: (r) => send("tool_done", r),
          onRetry: (s) => send("retry", { seconds: s }),
        });

        if (!offline) settleLiveRun(result.creditsSpent);

        send("answer", { answer: result.answer });
        send("done", {
          creditsSpent: result.creditsSpent,
          iterations: result.iterations,
          provider: result.provider,
          model: result.model,
          trail: result.trail,
          toolCalls: result.toolCalls.length,
          live: !offline,
          quota: liveQuota(),
        });
      } catch (err) {
        if (!offline) settleLiveRun(0);
        send("error", { message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
