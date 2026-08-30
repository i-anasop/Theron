/**
 * The agent, streamed.
 *
 * A twenty-second spinner tells a viewer nothing about whether the system is
 * reasoning or hung. This emits each step as it happens — the model turn, the
 * tool it chose, what that tool established, what it cost — so watching the
 * agent work is itself the demonstration that it is planning rather than
 * pattern-matching a canned answer.
 */

import { runAgent } from "@/lib/agent/agent";
import { BASELINES } from "@/lib/baselines";
import { appCache } from "@/lib/cache-factory";
import { DEMO_DATE, PUBLIC_ROUTES_OFFLINE } from "@/lib/demo";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    goal?: string;
    date?: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };
  const goal = body.goal?.trim();

  if (!goal) {
    return new Response(JSON.stringify({ error: "Provide a goal." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
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
        send("start", { goal });

        const result = await runAgent({
          goal,
          // Only the last few turns: enough for "what about Houston?" to resolve,
          // without dragging an entire session into every request.
          history: (body.history ?? []).slice(-6),
          baselines: BASELINES,
          allowance: 400_000,
          cache: appCache(),
          offline: PUBLIC_ROUTES_OFFLINE,
          operatingDate: body.date ?? DEMO_DATE,
          onThinking: (i) => send("thinking", { iteration: i }),
          onToolCall: (name, input) => send("tool", { name, input }),
          onToolResult: (r) => send("tool_done", r),
          onRetry: (s) => send("retry", { seconds: s }),
        });

        send("answer", { answer: result.answer });
        send("done", {
          creditsSpent: result.creditsSpent,
          iterations: result.iterations,
          provider: result.provider,
          model: result.model,
          trail: result.trail,
          toolCalls: result.toolCalls.length,
        });
      } catch (err) {
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
