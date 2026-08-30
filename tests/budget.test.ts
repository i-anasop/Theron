/**
 * Credits are real money and the budget is the only thing standing between a
 * loop and an empty account.
 *
 * One test here is a regression for an incident: a route was given a 400,000
 * allowance and ran live against uncached sites, spending 149,280 credits in a
 * single request and persisting none of it. The guard must refuse BEFORE the
 * call, and an offline client must not be able to reach the network at all.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { CREDIT_COST, CreditBudget, estimatePlanCost } from "../lib/fortyguard/cost";
import { cacheKey, FileCache, LayeredCache, NullCache, SnapshotCache, snapshotKey } from "../lib/fortyguard/cache";
import { CacheMissError, FortyGuardClient } from "../lib/fortyguard/client";
import { FilterType, type PolygonAOI } from "../lib/fortyguard/types";

describe("credit budget", () => {
  it("refuses a call it cannot afford, before spending", () => {
    const b = new CreditBudget(5_000);
    assert.equal(b.canAfford("heatmap"), true, "one 4,220 call fits a 5,000 allowance");
    b.charge("heatmap");
    assert.equal(b.remaining, 780);
    assert.equal(b.canAfford("heatmap"), false, "a second call must be refused before it happens");
    assert.throws(() => b.charge("heatmap"), /Budget exhausted/);
    assert.equal(b.totalSpent, 4_220, "a refused call must not move the ledger");
  });

  it("reports what the remaining allowance actually buys", () => {
    const b = new CreditBudget(CREDIT_COST.heatmap * 3);
    assert.equal(b.affordableCalls("heatmap"), 3);
    b.charge("heatmap");
    assert.equal(b.affordableCalls("heatmap"), 2);
    assert.equal(b.remaining, CREDIT_COST.heatmap * 2);
  });

  it("keeps a ledger for the audit trail", () => {
    const b = new CreditBudget(50_000);
    b.charge("heatmap", "hour 14");
    b.charge("env_params", "humidity");
    const entries = b.entries();
    assert.equal(entries.length, 2);
    assert.equal(entries[0].note, "hour 14");
    assert.equal(b.totalSpent, CREDIT_COST.heatmap + CREDIT_COST.env_params);
  });

  it("prices a plan before any of it runs", () => {
    const cost = estimatePlanCost([{ endpoint: "heatmap" }, { endpoint: "heatmap" }, { endpoint: "env_params" }]);
    assert.equal(cost, CREDIT_COST.heatmap * 2 + CREDIT_COST.env_params);
  });

  it("encodes the measured cost model, not a guessed one", () => {
    // Measured against a live Hackathon-plan key; see /method.
    assert.equal(CREDIT_COST.heatmap, 4_220);
    assert.equal(CREDIT_COST.env_params, 2_900);
    assert.equal(CREDIT_COST.usage, 0);
  });
});

describe("regression: offline mode cannot reach the network", () => {
  const AOI: PolygonAOI = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [[[-112.08, 33.44], [-112.07, 33.44], [-112.07, 33.45], [-112.08, 33.45], [-112.08, 33.44]]],
        },
      },
    ],
  };

  it("throws CacheMissError instead of calling out", async () => {
    const client = new FortyGuardClient({
      apiKey: "test-key-not-used",
      cache: new NullCache(),
      budget: new CreditBudget(1_000_000), // deliberately generous
      offline: true,
    });

    await assert.rejects(
      () =>
        client.heatmap({
          polygon_aoi: AOI,
          date_time: { start_date: "2026-08-28", start_time: "14:00", filter_type: FilterType.SingleHour },
          granularity: 100,
        }),
      (err: Error) => {
        assert.equal(err.name, "CacheMissError");
        assert.ok(err instanceof CacheMissError);
        return true;
      },
      "an offline client with a large budget must still refuse to spend",
    );
  });

  it("spends nothing when it refuses", async () => {
    const budget = new CreditBudget(1_000_000);
    const client = new FortyGuardClient({
      apiKey: "test-key-not-used",
      cache: new NullCache(),
      budget,
      offline: true,
    });
    await client
      .heatmap({
        polygon_aoi: AOI,
        date_time: { start_date: "2026-08-28", start_time: "14:00", filter_type: FilterType.SingleHour },
        granularity: 100,
      })
      .catch(() => {});
    assert.equal(budget.totalSpent, 0);
  });
});

describe("cache", () => {
  it("keys identically regardless of object key order", () => {
    const a = cacheKey("heatmap", { b: 2, a: 1, nested: { y: 2, x: 1 } });
    const b = cacheKey("heatmap", { a: 1, b: 2, nested: { x: 1, y: 2 } });
    assert.equal(a, b, "key order must not change the cache key, or we pay twice for one question");
  });

  it("keys differently for different requests", () => {
    assert.notEqual(cacheKey("heatmap", { hour: 14 }), cacheKey("heatmap", { hour: 15 }));
    assert.notEqual(cacheKey("heatmap", { hour: 14 }), cacheKey("env_params", { hour: 14 }));
  });

  it("ignores undefined fields rather than treating them as distinct", () => {
    assert.equal(cacheKey("heatmap", { a: 1, b: undefined }), cacheKey("heatmap", { a: 1 }));
  });

  it("serves a snapshot entry through the same key the client would use", async () => {
    const key = cacheKey("heatmap", { hour: 14 });
    const snap = new SnapshotCache({ [snapshotKey(key)]: { hit: true } });
    assert.deepEqual(await snap.get(key), { hit: true });
    assert.equal(await snap.get("fg:heatmap:absent"), null);
  });

  it("reads through layers in order and writes to the writable ones", async () => {
    const key = cacheKey("heatmap", { hour: 9 });
    const snap = new SnapshotCache({ [snapshotKey(key)]: { from: "snapshot" } });
    const layered = new LayeredCache([snap, new NullCache()]);
    assert.deepEqual(await layered.get(key), { from: "snapshot" });
    // A snapshot is immutable; writing must not throw.
    await layered.set(key, { from: "write" });
  });

  it("round-trips through the disk cache", async () => {
    const dir = `${process.cwd()}/.cache-test`;
    const fc = new FileCache(dir);
    const key = cacheKey("heatmap", { test: Date.now() });
    assert.equal(await fc.get(key), null);
    await fc.set(key, { value: 42 });
    assert.deepEqual(await fc.get(key), { value: 42 });
    await (await import("node:fs/promises")).rm(dir, { recursive: true, force: true });
  });
});
