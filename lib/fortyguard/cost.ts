/**
 * Measured cost model for the FortyGuard API.
 *
 * Every figure here was measured empirically against a live Hackathon-plan
 * key by reading cycle_remaining_credits before and after each call, not
 * taken from documentation. See /probes for the raw captures.
 *
 * THE CENTRAL FINDING
 * -------------------
 * Cost is charged per CALL, not per unit of data returned. A single-hour
 * heatmap, a twelve-hour range, a full day and a full month of days all cost
 * exactly 4,220 credits over the same polygon.
 *
 * The planner exploits this directly: never split a window into several
 * calls when one wider call answers the same question. The only reason to
 * issue N calls is that you genuinely need N distinct hourly values, because
 * the API collapses the time dimension into min/avg/max before returning.
 */

export const CREDIT_COST = {
  /** Any filter_type, any granularity, any polygon within the area cap. */
  heatmap: 4_220,
  /** Any filter_type. Returns an hourly series for whole-day requests. */
  env_params: 2_900,
  /** Free — account metadata, not an analysis task. */
  usage: 0,
} as const;

export type CostedEndpoint = keyof typeof CREDIT_COST;

/** Failed tasks are never charged, so only successes count against budget. */
export const FAILED_TASKS_ARE_FREE = true;

/**
 * Granularity does not affect price, so there is never a reason to request a
 * coarser grid than you want. 60 m gives ~2.8x the tiles of 100 m for the
 * same credits.
 */
export const GRANULARITY_AFFECTS_COST = false;

export interface BudgetState {
  /** Credits the agent is permitted to spend on this run. */
  allowance: number;
  spent: number;
}

/**
 * Tracks spend across an agent run and refuses calls that would exceed the
 * allowance. The agent consults this BEFORE issuing a call, which is what
 * makes its planning credit-aware rather than credit-oblivious.
 */
export class CreditBudget {
  private spent = 0;
  private readonly ledger: Array<{ endpoint: CostedEndpoint; cost: number; note: string }> = [];

  constructor(readonly allowance: number) {}

  get remaining(): number {
    return this.allowance - this.spent;
  }

  get totalSpent(): number {
    return this.spent;
  }

  /** True when the budget can absorb `count` calls to `endpoint`. */
  canAfford(endpoint: CostedEndpoint, count = 1): boolean {
    return CREDIT_COST[endpoint] * count <= this.remaining;
  }

  /** How many calls to `endpoint` the remaining budget allows. */
  affordableCalls(endpoint: CostedEndpoint): number {
    const unit = CREDIT_COST[endpoint];
    return unit === 0 ? Infinity : Math.floor(this.remaining / unit);
  }

  /** Records a successful call. Throws if it would breach the allowance. */
  charge(endpoint: CostedEndpoint, note = ""): number {
    const cost = CREDIT_COST[endpoint];
    if (cost > this.remaining) {
      throw new Error(
        `Budget exhausted: ${endpoint} costs ${cost} but only ${this.remaining} credits remain ` +
          `of a ${this.allowance} allowance.`,
      );
    }
    this.spent += cost;
    this.ledger.push({ endpoint, cost, note });
    return cost;
  }

  /** The full spend record, for the audit trail. */
  entries(): ReadonlyArray<{ endpoint: CostedEndpoint; cost: number; note: string }> {
    return this.ledger;
  }
}

/**
 * Estimates what a plan costs before any of it runs, so the agent can
 * present the price to the user (or trim the plan) up front.
 */
export function estimatePlanCost(calls: Array<{ endpoint: CostedEndpoint }>): number {
  return calls.reduce((sum, c) => sum + CREDIT_COST[c.endpoint], 0);
}
