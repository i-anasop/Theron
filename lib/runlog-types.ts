/**
 * Shapes and pure helpers for the run log.
 *
 * Kept separate from the store because the store touches the filesystem and
 * Redis, and the browser needs these types. Importing the store into a client
 * component drags `node:fs` into the bundle and fails the build — which is a
 * useful reminder that a module doing I/O should not also be the module
 * everything imports its types from.
 */

export type RunTrigger = "schedule" | "manual" | "local";

export interface SiteOutcome {
  siteId: string;
  city: string;
  verdict: string;
  peakHeatIndexF?: number;
  alerted: boolean;
  note?: string;
}

export interface RunRecord {
  id: string;
  /** ISO timestamp of when the sweep started. */
  ranAt: string;
  /** The date the sweep assessed. */
  date: string;
  trigger: RunTrigger;
  durationMs: number;
  sitesChecked: number;
  sitesFlagged: number;
  alertsSent: number;
  creditsSpent: number;
  apiCalls: number;
  cacheHits: number;
  outcomes: SiteOutcome[];
  error?: string;
}

export interface RunHistory {
  runs: RunRecord[];
  /** Where the newest entries came from, so the UI can be honest about it. */
  source: "redis" | "memory" | "bundled";
  durable: boolean;
}

/** Human phrasing for "when", without dragging in a date library. */
export function describeAge(iso: string, now = Date.now()): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "unknown";
  const mins = Math.max(0, Math.round((now - then) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
