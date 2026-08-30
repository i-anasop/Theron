/**
 * The single place where a public request is allowed to spend credits.
 *
 * The demo is a public URL. Anything on it that can reach the paid API needs a
 * ceiling that is enforced, not intended — a mis-set allowance already cost
 * this project 149,000 credits in one request, and that was with a developer
 * watching. A stranger clicking a "live" toggle deserves a harder guarantee.
 *
 * Three limits, deliberately layered:
 *
 *   perRun   — what a single request may spend, no matter what it asks for.
 *   ceiling  — what every live request together may spend for the life of this
 *              process. Resets when the instance recycles, which is fine: the
 *              point is to bound a burst, not to meter a month.
 *   cooldown — a floor on the gap between live requests, so a held-down button
 *              cannot drain the ceiling in a few seconds.
 *
 * Cached answers never touch any of this. Asking the same question twice is
 * free, so the guard only ever sees genuinely new work.
 */

export interface LiveQuota {
  /** Credits one request may spend. */
  perRun: number;
  /** Credits every live request may spend, together, for this process. */
  ceiling: number;
  spent: number;
  remaining: number;
  /** Milliseconds until another live request is permitted. */
  cooldownMs: number;
  available: boolean;
}

const CEILING = Number(process.env.LIVE_CEILING ?? 100_000);
const PER_RUN = Number(process.env.LIVE_PER_RUN ?? 40_000);
const COOLDOWN_MS = Number(process.env.LIVE_COOLDOWN_MS ?? 20_000);

let spent = 0;
let lastStartedAt = 0;

export function liveQuota(): LiveQuota {
  const since = Date.now() - lastStartedAt;
  const cooldownMs = Math.max(0, COOLDOWN_MS - since);
  const remaining = Math.max(0, CEILING - spent);
  return {
    perRun: PER_RUN,
    ceiling: CEILING,
    spent,
    remaining,
    cooldownMs,
    available: remaining >= PER_RUN && cooldownMs === 0,
  };
}

/**
 * Claims permission to run live. Returns the allowance for this request, or a
 * reason it was refused.
 *
 * The claim is taken BEFORE the work starts, so two requests arriving together
 * cannot both see a full ceiling.
 */
export function claimLiveRun(): { ok: true; allowance: number } | { ok: false; reason: string } {
  const q = liveQuota();

  if (q.cooldownMs > 0) {
    return {
      ok: false,
      reason: `Live analysis is cooling down. Try again in ${Math.ceil(q.cooldownMs / 1000)}s, or ask against cached data.`,
    };
  }
  if (q.remaining < PER_RUN) {
    return {
      ok: false,
      reason:
        `Live analysis has reached this session's spend ceiling (${CEILING.toLocaleString()} credits). ` +
        `Cached questions still work and cost nothing.`,
    };
  }

  lastStartedAt = Date.now();
  // Reserve the full per-run allowance up front; settle to the true figure after.
  spent += PER_RUN;
  return { ok: true, allowance: PER_RUN };
}

/** Replaces the reservation with what the run actually spent. */
export function settleLiveRun(actual: number): void {
  spent = Math.max(0, spent - PER_RUN + Math.max(0, actual));
}
