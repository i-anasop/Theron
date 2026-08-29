/**
 * Typed client for the FortyGuard Temperature API.
 *
 * Two deliberate design rules:
 *
 * 1. `submit` and `getStatus` are separate public methods. Analysis tasks
 *    take 25-45 seconds, and serverless request handlers cap out well before
 *    a slow one finishes. Request handlers submit and return; a later cron
 *    tick collects. `runAndWait` exists only for scripts and cron jobs that
 *    genuinely own their process.
 *
 * 2. Every call goes through the cache first. A cache miss is the only event
 *    that spends credits.
 */

import {
  BASE_URL,
  type EnvParamsRequest,
  type EnvParamsResult,
  type Envelope,
  FortyGuardError,
  type HeatmapRequest,
  type HeatmapResult,
  type StatusData,
  type SubmitData,
  type TaskStatus,
  type UsageResult,
} from "./types";
import { cacheKey, type CacheStore, FileCache } from "./cache";
import { type CostedEndpoint, CreditBudget } from "./cost";

/** One entry in the audit trail. This is what the Auditor renders. */
export interface CallRecord {
  endpoint: string;
  activityId: string | null;
  cached: boolean;
  credits: number;
  durationMs: number;
  startedAt: string;
  status: TaskStatus | "cache-hit";
  note?: string;
}

/**
 * Thrown when an offline client is asked for something the cache does not
 * hold. Distinct from FortyGuardError so callers can treat "not cached" as a
 * data gap rather than an API failure.
 */
export class CacheMissError extends Error {
  constructor(readonly endpoint: string, readonly note?: string) {
    super(`Not in cache: ${endpoint}${note ? ` (${note})` : ""}`);
    this.name = "CacheMissError";
  }
}

export interface ClientOptions {
  apiKey?: string;
  cache?: CacheStore;
  budget?: CreditBudget;
  /**
   * Refuse to make live API calls; serve only what the cache already holds.
   *
   * The public demo runs offline. A budget alone is not enough protection —
   * it caps the damage but still permits spend, and a mis-set allowance is
   * exactly how this project once burned 149,000 credits in one request.
   * This makes accidental spending structurally impossible rather than
   * merely bounded.
   */
  offline?: boolean;
  /** Called after every call, cached or not. Powers the audit trail. */
  onCall?: (record: CallRecord) => void;
  /** Milliseconds between status polls. Backs off, then holds. */
  pollSchedule?: number[];
  /** Give up on a task after this long. */
  timeoutMs?: number;
}

const DEFAULT_POLL_SCHEDULE = [3_000, 6_000, 12_000];
const TERMINAL_OK = /^(completed|succeeded|success)$/i;
const TERMINAL_FAIL = /^(failed|error)$/i;

export class FortyGuardClient {
  private readonly apiKey: string;
  private readonly cache: CacheStore;
  private readonly budget?: CreditBudget;
  private readonly onCall?: (record: CallRecord) => void;
  private readonly pollSchedule: number[];
  private readonly timeoutMs: number;
  readonly offline: boolean;

  constructor(opts: ClientOptions = {}) {
    this.offline = opts.offline ?? false;
    // The provisioned .env uses FORTYGUARD_API; the handbook documents
    // FORTYGUARD_API_KEY. Accept either so neither trips anyone up.
    const key = opts.apiKey ?? process.env.FORTYGUARD_API_KEY ?? process.env.FORTYGUARD_API;
    if (!key) {
      throw new Error(
        "No API key. Set FORTYGUARD_API_KEY (or FORTYGUARD_API) in .env, or pass apiKey to the client.",
      );
    }
    this.apiKey = key.trim();
    this.cache = opts.cache ?? new FileCache();
    this.budget = opts.budget;
    this.onCall = opts.onCall;
    this.pollSchedule = opts.pollSchedule ?? DEFAULT_POLL_SCHEDULE;
    this.timeoutMs = opts.timeoutMs ?? 5 * 60_000;
  }

  /* ---------------------------------------------------------------- */
  /* Transport                                                         */
  /* ---------------------------------------------------------------- */

  private async request<T>(path: string, init: RequestInit): Promise<Envelope<T>> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "api-key": this.apiKey,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new FortyGuardError(`Non-JSON response from ${path}: ${text.slice(0, 200)}`, res.status);
    }

    if (!res.ok) {
      const body = parsed as { message?: string };
      throw new FortyGuardError(body?.message ?? `${path} failed`, res.status, parsed);
    }
    return parsed as Envelope<T>;
  }

  /* ---------------------------------------------------------------- */
  /* Task lifecycle                                                    */
  /* ---------------------------------------------------------------- */

  /** Submits an analysis task and returns its activity_id immediately. */
  async submit(endpoint: "heatmap" | "env_params", body: unknown): Promise<string> {
    const env = await this.request<SubmitData>(`/v1/${endpoint}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const id = env.data?.activity_id;
    if (!id) {
      throw new FortyGuardError(`No activity_id returned by ${endpoint}`, env.status_code, env);
    }
    return id;
  }

  /** Reads a task's current state. Safe to call from a request handler. */
  async getStatus<T>(activityId: string): Promise<StatusData<T>> {
    const env = await this.request<StatusData<T>>(`/v1/status/${activityId}`, { method: "GET" });
    return env.data;
  }

  /**
   * Polls until terminal. For scripts and cron only — never call this from a
   * serverless request handler.
   */
  async waitFor<T>(activityId: string): Promise<T> {
    const deadline = Date.now() + this.timeoutMs;
    let attempt = 0;

    while (Date.now() < deadline) {
      const delay = this.pollSchedule[Math.min(attempt, this.pollSchedule.length - 1)];
      await sleep(delay);
      attempt++;

      const state = await this.getStatus<T>(activityId);
      if (TERMINAL_OK.test(state.status)) return state.result;
      if (TERMINAL_FAIL.test(state.status)) {
        throw new FortyGuardError(
          `Task ${activityId} failed with status "${state.status}"`,
          200,
          state,
          activityId,
        );
      }
    }
    throw new FortyGuardError(
      `Task ${activityId} did not finish within ${Math.round(this.timeoutMs / 1000)}s`,
      408,
      undefined,
      activityId,
    );
  }

  /**
   * Cache-aware submit-poll-return. The whole path from request to result,
   * charged to the budget only when it actually spends credits.
   */
  private async run<T>(
    endpoint: "heatmap" | "env_params",
    costKey: CostedEndpoint,
    body: unknown,
    note?: string,
  ): Promise<T> {
    const key = cacheKey(endpoint, body);
    const startedAt = new Date().toISOString();
    const t0 = Date.now();

    const hit = await this.cache.get<T>(key);
    if (hit) {
      this.onCall?.({
        endpoint,
        activityId: null,
        cached: true,
        credits: 0,
        durationMs: Date.now() - t0,
        startedAt,
        status: "cache-hit",
        note,
      });
      return hit;
    }

    // An offline client never reaches the network. This is checked after the
    // cache lookup and before anything that could spend.
    if (this.offline) {
      throw new CacheMissError(endpoint, note);
    }

    // Check the budget before spending, not after.
    if (this.budget && !this.budget.canAfford(costKey)) {
      throw new Error(
        `Refusing ${endpoint}: costs ${costKey} credits but only ${this.budget.remaining} remain in this run's allowance.`,
      );
    }

    const activityId = await this.submit(endpoint, body);
    const result = await this.waitFor<T>(activityId);

    // Charge only on success — failed tasks are free.
    const credits = this.budget?.charge(costKey, note ?? endpoint) ?? 0;
    await this.cache.set(key, result);

    this.onCall?.({
      endpoint,
      activityId,
      cached: false,
      credits,
      durationMs: Date.now() - t0,
      startedAt,
      status: "Completed",
      note,
    });
    return result;
  }

  /* ---------------------------------------------------------------- */
  /* Endpoints                                                         */
  /* ---------------------------------------------------------------- */

  /** Tile-by-tile thermal map over a polygon. Costs 4,220 credits. */
  heatmap(req: HeatmapRequest, note?: string): Promise<HeatmapResult> {
    return this.run<HeatmapResult>("heatmap", "heatmap", req, note);
  }

  /**
   * Heat index, humidity, air quality and solar irradiance at a point.
   * Costs 2,900 credits.
   *
   * Remember that `temperature` is an input. With a whole-day filter_type
   * this returns 24 hourly readings, but every one of them is computed from
   * the single temperature you passed — see the note in types.ts.
   */
  envParams(req: EnvParamsRequest, note?: string): Promise<EnvParamsResult> {
    return this.run<EnvParamsResult>("env_params", "env_params", req, note);
  }

  /**
   * Credit balance and plan details. Free, and never cached.
   *
   * Two quirks, both confirmed against the live API: this endpoint requires
   * the key in the body as well as the header, and — unlike every analysis
   * endpoint — it returns its payload unwrapped rather than inside the
   * standard { error, status_code, message, data } envelope.
   */
  async usage(): Promise<UsageResult> {
    const raw = await this.request<UsageResult>("/v1/system/fetch-api-key-usage", {
      method: "POST",
      body: JSON.stringify({ api_key: this.apiKey }),
    });
    const unwrapped = (raw as unknown as { data?: UsageResult }).data ?? (raw as unknown as UsageResult);
    if (!unwrapped?.credit_summary) {
      throw new FortyGuardError("Unrecognised usage response shape", 200, raw);
    }
    return unwrapped;
  }

  /** Remaining credits on the account, as opposed to this run's allowance. */
  async remainingCredits(): Promise<number> {
    return (await this.usage()).credit_summary.cycle_remaining_credits;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
