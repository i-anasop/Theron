/**
 * The heat index is the number a crew's safety is decided on, so it gets the
 * most scrutiny in the suite.
 *
 * Two of these tests are regressions for bugs that reached running code. Both
 * were the same mistake in different clothes — combining values measured at
 * different moments — and both produced results that were wrong by tens of
 * degrees while looking perfectly well-formed.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { assessRisk, cToF, exposureHours, fToC, heatIndexC, heatIndexF, OSHA_HEAT_INDEX_F } from "../lib/heat/heatIndex";

describe("heat index — NWS Rothfusz", () => {
  it("matches the FortyGuard API to the decimal on the cross-validation case", () => {
    // Phoenix, 2026-08-28 14:00. The API returned a heat index of 108.0 degF
    // for 39.92 degC air at 28.2% humidity; we computed 108.0 independently.
    // This equality is the entire justification for computing it ourselves,
    // so if it ever drifts the project's central claim is void.
    const tempF = cToF(39.9189);
    assert.equal(heatIndexF(tempF, 28.2), 108.0);
  });

  it("reproduces the Rothfusz regression at known points", () => {
    // Hand-computed from the published NWS equation. These differ by a degree
    // or two from the NOAA lookup chart, which is a rounded table rather than
    // the equation — the equation is what the agency publishes as canonical
    // and what we implement.
    const cases: Array<[number, number, number]> = [
      [90, 40, 90.7],
      [90, 70, 105.9],
      [96, 45, 104.0],
      [100, 40, 109.3],
      [104, 30, 109.6],
    ];
    for (const [t, rh, expected] of cases) {
      const got = heatIndexF(t, rh);
      assert.ok(
        Math.abs(got - expected) <= 0.15,
        `heatIndexF(${t}, ${rh}) = ${got}, expected ${expected}`,
      );
    }
  });

  it("uses the simple form below 80 degF rather than extrapolating Rothfusz", () => {
    // Rothfusz is undefined in this range and produces nonsense if applied.
    const cool = heatIndexF(70, 50);
    assert.ok(cool > 60 && cool < 80, `expected a plausible cool-weather index, got ${cool}`);
  });

  it("applies the dry-air adjustment downward", () => {
    // At very low humidity the index should sit below the raw temperature.
    assert.ok(heatIndexF(100, 8) < 100);
  });

  it("applies the humid-air adjustment upward", () => {
    assert.ok(heatIndexF(86, 95) > 86);
  });

  it("rises monotonically with temperature at fixed humidity", () => {
    let prev = -Infinity;
    for (let t = 80; t <= 115; t += 5) {
      const hi = heatIndexF(t, 40);
      assert.ok(hi > prev, `heat index fell from ${prev} to ${hi} at ${t} degF`);
      prev = hi;
    }
  });

  it("rises monotonically with humidity at fixed temperature", () => {
    let prev = -Infinity;
    for (let rh = 20; rh <= 90; rh += 10) {
      const hi = heatIndexF(95, rh);
      assert.ok(hi > prev, `heat index fell from ${prev} to ${hi} at ${rh}% RH`);
      prev = hi;
    }
  });

  it("round-trips Celsius and Fahrenheit", () => {
    for (const c of [0, 21.5, 37, 41.45]) {
      assert.ok(Math.abs(fToC(cToF(c)) - c) < 1e-9);
    }
    assert.equal(Math.round(heatIndexC(40, 20)), Math.round(fToC(heatIndexF(cToF(40), 20))));
  });
});

describe("regression: the inverted day (env_params constant-temperature trap)", () => {
  /*
   * env_params takes `temperature` as an INPUT. Asking it for a whole day with
   * one scalar applied that peak temperature to all 24 hours, pairing 40.3 degC
   * afternoon heat with pre-dawn humidity. It returned a 167 degF heat index at
   * midnight and its daily MINIMUM at 5pm — an upside-down day.
   *
   * These lock in that our own computation, fed real per-hour pairs, produces a
   * day shaped the way physics requires.
   */

  // Real captures from Phoenix, 2026-08-28: [hour, tempF, humidity%].
  const DAY: Array<[number, number, number]> = [
    [0, 100.1, 19.1],
    [3, 95.0, 20.4],
    [6, 94.9, 50.2],
    [9, 102.5, 26.5],
    [12, 106.2, 20.9],
    [15, 106.6, 15.8],
    [18, 104.8, 17.5],
    [21, 100.0, 20.1],
  ];

  const curve = DAY.map(([h, t, rh]) => ({ hour: h, hi: heatIndexF(t, rh) }));

  it("never produces a physically impossible index from real pairs", () => {
    for (const { hour, hi } of curve) {
      assert.ok(hi < 130, `hour ${hour} produced ${hi} degF, which is off the NWS chart entirely`);
    }
  });

  it("does not peak in the small hours", () => {
    const hottest = curve.reduce((a, b) => (b.hi > a.hi ? b : a));
    assert.ok(
      hottest.hour >= 6 && hottest.hour <= 20,
      `day peaked at ${hottest.hour}:00, which is the inverted-curve bug returning`,
    );
  });

  it("is cooler before dawn than at midday", () => {
    const preDawn = curve.find((c) => c.hour === 3)!;
    const midday = curve.find((c) => c.hour === 12)!;
    assert.ok(preDawn.hi < midday.hi, "pre-dawn is not cooler than midday — the curve is inverted");
  });
});

describe("regression: mismatched maxima (triage pairing bug)", () => {
  /*
   * Portfolio triage paired a shift's PEAK temperature with its PEAK humidity.
   * Those occur hours apart — humidity peaks before dawn, temperature
   * mid-afternoon — so the combination describes an hour that never existed.
   * At the Houston site it yielded 161 degF from 98.1 degF and 88.3% RH, an
   * implied dew point that would be a world record.
   */

  it("the impossible pairing is exactly as bad as recorded", () => {
    // Pinned so nobody reintroduces it believing it looked reasonable.
    assert.ok(heatIndexF(98.1, 88.3) > 150, "the bad pairing should still be recognisably absurd");
  });

  it("pairing the shift MEAN with the worst humidity stays on the chart", () => {
    // Houston's shift mean was 89.6 degF; this is what triage computes now.
    const screening = heatIndexF(89.6, 88.3);
    assert.ok(screening < 135, `screening index ${screening} degF is implausibly high`);
    assert.ok(screening > 89.6, "a humid day should still read hotter than the dry-bulb temperature");
  });
});

describe("OSHA thresholds", () => {
  it("classifies against the proposed initial and high-heat triggers", () => {
    assert.equal(assessRisk(75, 30).level, "safe");
    assert.equal(assessRisk(75, 30).trigger, "none");

    const caution = assessRisk(84, 45);
    assert.equal(caution.level, "caution");
    assert.equal(caution.trigger, "initial");
    assert.ok(caution.heatIndexF >= OSHA_HEAT_INDEX_F.initial);

    const high = assessRisk(92, 45);
    assert.equal(high.trigger, "high");
    assert.ok(high.heatIndexF >= OSHA_HEAT_INDEX_F.high);

    assert.equal(assessRisk(105, 40).level, "extreme");
  });

  it("never returns guidance without a level to justify it", () => {
    for (const [t, rh] of [[70, 20], [85, 50], [95, 50], [110, 30]] as Array<[number, number]>) {
      const r = assessRisk(t, rh);
      assert.ok(r.guidance.length > 20, "guidance should be actionable, not a stub");
      assert.ok(["safe", "caution", "high", "extreme"].includes(r.level));
    }
  });

  it("counts exposure hours at or above the high trigger only", () => {
    const hours = [
      { tempF: 70, rhPct: 30 }, // well under
      { tempF: 95, rhPct: 45 }, // over
      { tempF: 100, rhPct: 40 }, // over
      { tempF: 78, rhPct: 30 }, // under
    ];
    assert.equal(exposureHours(hours), 2);
    assert.equal(exposureHours(hours, 200), 0, "an unreachable threshold should count nothing");
  });
});
