/**
 * The record of what Theron did while nobody was watching.
 *
 * Autonomy is the central claim of this project and, until now, it rested on a
 * cron entry in a config file that a reader had to take on faith. A scheduled
 * job that leaves no trace is indistinguishable from one that never ran.
 *
 * Storage is layered, because the deployment target has no writable filesystem:
 *
 *   Redis      — durable across invocations; the real store in production.
 *   Bundled    — a seed of genuine past runs committed with the repo, so the
 *                history is never empty before Redis is configured.
 *   In-memory  — this instance only. Honest, but it evaporates, so anything
 *                served from here is labelled as such in the UI.
 *
 * Every record says how it was triggered. A run fired by the scheduler and a
 * run fired by a human pressing a button are different evidence, and conflating
 * them would defeat the point of keeping the log.
 *
 * Server-only: types and pure helpers live in runlog-types.ts so client
 * components can import them without pulling `node:fs` into the browser bundle.
 */

import "server-only";
import seed from "../data/run-log.json";
import type { RunHistory, RunRecord } from "./runlog-types";

export type { RunHistory, RunRecord, RunTrigger, SiteOutcome } from "./runlog-types";
export { describeAge } from "./runlog-types";

const KEY = "theron:runs";
const MAX = 50;

/** This instance's runs. Lost on recycle, which is why it is never the only store. */
const memory: RunRecord[] = [];

async function redis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = await import("@upstash/redis");
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

export async function recordRun(run: RunRecord): Promise<void> {
  memory.unshift(run);
  memory.length = Math.min(memory.length, MAX);

  const r = await redis();
  if (!r) return;
  try {
    await r.lpush(KEY, JSON.stringify(run));
    await r.ltrim(KEY, 0, MAX - 1);
  } catch {
    /* the sweep must not fail because its diary did */
  }
}

export async function getRuns(limit = 10): Promise<RunHistory> {
  const r = await redis();
  if (r) {
    try {
      const raw = (await r.lrange(KEY, 0, limit - 1)) as unknown[];
      const runs = raw
        .map((x) => (typeof x === "string" ? safeParse(x) : (x as RunRecord)))
        .filter((x): x is RunRecord => !!x);
      if (runs.length) return { runs, source: "redis", durable: true };
    } catch {
      /* fall through to the local stores */
    }
  }

  if (memory.length) {
    return { runs: memory.slice(0, limit), source: "memory", durable: false };
  }

  const bundled = (seed as unknown as { runs?: RunRecord[] })?.runs ?? [];
  return { runs: bundled.slice(0, limit), source: "bundled", durable: true };
}

function safeParse(s: string): RunRecord | null {
  try {
    return JSON.parse(s) as RunRecord;
  } catch {
    return null;
  }
}
