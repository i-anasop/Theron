/**
 * The counterfactual decides whether a crew is told to move, stay, or stop.
 *
 * The metric it ranks on was wrong once — counting hours above the trigger
 * saturated on exactly the days that matter, scoring every candidate window
 * identically and reporting "nothing helps" on a day where the best and worst
 * windows differed by nearly 5 degF. That failure is pinned below.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { findBestShift } from "../lib/analysis/counterfactual";
import type { HourlyCurve, HourReading } from "../lib/analysis/hourly";
import { heatIndexF, type RiskLevel } from "../lib/heat/heatIndex";
import type { Worksite } from "../lib/sites";

const SITE: Worksite = {
  id: "test-site",
  name: "Test Site",
  operator: "Test",
  city: "Phoenix",
  state: "AZ",
  lat: 33.45,
  lon: -112.07,
  timezone: "America/Phoenix",
  shift: { start: "06:00", end: "15:00" }, // 9 hours
  crewSize: 10,
  work: "Test",
};

function hour(h: number, tempF: number, rhPct: number): HourReading {
  const hi = heatIndexF(tempF, rhPct);
  return {
    hour: `${String(h).padStart(2, "0")}:00`,
    hourIndex: h,
    tempC: ((tempF - 32) * 5) / 9,
    tempF,
    peakTempF: tempF,
    humidityPct: rhPct,
    heatIndexF: hi,
    risk: hi >= 103 ? "extreme" : hi >= 90 ? "high" : hi >= 80 ? "caution" : "safe",
  };
}

function curveFrom(temps: number[], rh = 25): HourlyCurve {
  return {
    siteId: SITE.id,
    date: "2026-08-28",
    readings: temps.map((t, i) => hour(i, t, rh)),
    creditsSpent: 0,
  };
}

describe("counterfactual — window search", () => {
  it("recommends a move when a materially cooler window exists", () => {
    // Blazing morning, mild evening.
    const temps = Array.from({ length: 24 }, (_, h) => (h >= 6 && h < 15 ? 108 : 78));
    const cf = findBestShift(curveFrom(temps), SITE)!;

    assert.equal(cf.verdict, "reschedule");
    assert.ok(cf.proposed.startHour !== cf.current.startHour);
    assert.ok(cf.degreeHoursAvoided > 0);
    assert.ok(cf.percentReduction >= 10);
  });

  it("keeps the shift when the day is mild and flat", () => {
    // 82 degF at 25% RH indexes to 80.1 — under the high-heat trigger all day,
    // so there is nothing to avoid and nothing to escalate.
    const cf = findBestShift(curveFrom(new Array(24).fill(82)), SITE)!;
    assert.equal(cf.verdict, "keep");
    assert.equal(cf.degreeHoursAvoided, 0);
    assert.equal(cf.noSafeWindowExists, false);
  });

  it("stands the crew down on a flat day that is dangerous at every hour", () => {
    // 95 degF at 25% indexes to 92.7: over the trigger, with nowhere cooler to go.
    const cf = findBestShift(curveFrom(new Array(24).fill(95)), SITE)!;
    assert.equal(cf.noSafeWindowExists, true);
    assert.equal(cf.verdict, "stand_down");
  });

  it("scales crew impact by headcount rather than reporting per-worker figures twice", () => {
    const temps = Array.from({ length: 24 }, (_, h) => (h >= 6 && h < 15 ? 108 : 78));
    const cf = findBestShift(curveFrom(temps), SITE)!;
    assert.equal(cf.crewDegreeHoursAvoided, Math.round(cf.degreeHoursAvoided * SITE.crewSize));
  });

  it("refuses to evaluate a window it lacks data for", () => {
    // Only four hours: not enough for a nine-hour shift.
    const partial: HourlyCurve = {
      siteId: SITE.id,
      date: "2026-08-28",
      readings: [hour(6, 100, 25), hour(7, 101, 25), hour(8, 102, 25), hour(9, 103, 25)],
      creditsSpent: 0,
    };
    assert.equal(findBestShift(partial, SITE), null);
  });

  it("never proposes a window that is worse than the scheduled one", () => {
    const temps = Array.from({ length: 24 }, (_, h) => 80 + Math.sin(h / 3) * 20);
    const cf = findBestShift(curveFrom(temps), SITE)!;
    assert.ok(cf.proposed.degreeHoursOverTrigger <= cf.current.degreeHoursOverTrigger);
  });
});

describe("regression: the saturated day (exposure-hours metric)", () => {
  /*
   * Every hour of the real Phoenix day sat above the trigger. Counting hours
   * over the line gave every 9-hour window an identical score of 9, so the
   * metric reported that nothing helped — while the mean heat index between
   * the best and worst windows differed by almost 5 degF.
   *
   * Degree-hours keeps discriminating when the whole day is dangerous.
   */

  // Real captured heat indices for 2026-08-28, hours 0..23.
  const REAL = [
    97.2, 95.9, 93.6, 91.6, 92.4, 103.6, 105.2, 106.4, 106.5, 104.5, 102.7, 106.1,
    106.7, 105.7, 104.7, 104.0, 105.4, 104.4, 102.6, 100.5, 97.7, 97.5, 96.3, 96.6,
  ];

  /*
   * 04:00 is deliberately absent. That call failed on the day and the gap is
   * load-bearing: it blocks every window spanning it, which is part of why the
   * best available window is the evening one. Filling it in would quietly
   * change the answer the demo reports.
   */
  const curve: HourlyCurve = {
    siteId: SITE.id,
    date: "2026-08-28",
    readings: REAL.map((hi, h) => ({
      hour: `${String(h).padStart(2, "0")}:00`,
      hourIndex: h,
      tempC: 40,
      tempF: 104,
      peakTempF: 106,
      humidityPct: 20,
      heatIndexF: hi,
      risk: (hi >= 103 ? "extreme" : "high") as RiskLevel,
    })).filter((r) => r.hourIndex !== 4),
    creditsSpent: 0,
  };

  it("every hour is above the trigger, so hour-counting cannot discriminate", () => {
    assert.ok(REAL.every((hi) => hi >= 90), "test premise: this day is saturated");
    assert.equal(curve.readings.length, 23, "the 04:00 gap must survive, it changes the answer");
  });

  it("still finds a materially better window", () => {
    const cf = findBestShift(curve, SITE)!;
    assert.ok(
      cf.degreeHoursAvoided > 0,
      "the saturated-day bug is back: the metric can no longer separate windows",
    );
    assert.ok(cf.percentReduction >= 20, `expected a substantial reduction, got ${cf.percentReduction}%`);
  });

  it("reports the exposure figures that reached the demo", () => {
    const cf = findBestShift(curve, SITE)!;
    assert.equal(cf.current.label, "06:00-15:00");
    assert.equal(cf.current.degreeHoursOverTrigger, 138.5);
    assert.equal(cf.proposed.degreeHoursOverTrigger, 95);
    assert.equal(cf.percentReduction, 31);
  });

  it("flags that no safe window exists, so a percentage cannot imply safety", () => {
    const cf = findBestShift(curve, SITE)!;
    assert.equal(cf.noSafeWindowExists, true);
    assert.match(cf.headline, /rest-cycle|mandatory/i);
  });
});

describe("counterfactual — stand down", () => {
  it("says stand down when the day is dangerous and moving cannot help", () => {
    // Uniformly extreme: nothing to gain, and nothing safe.
    const cf = findBestShift(curveFrom(new Array(24).fill(112), 30), SITE)!;
    assert.equal(cf.noSafeWindowExists, true);
    assert.equal(cf.verdict, "stand_down");
    assert.match(cf.headline, /stand-down|rotation|rest/i);
  });

  it("does not say stand down merely because a day is hot", () => {
    // Hot but with a genuinely cooler window: that is a reschedule, not a stop.
    const temps = Array.from({ length: 24 }, (_, h) => (h >= 6 && h < 15 ? 110 : 92));
    const cf = findBestShift(curveFrom(temps, 30), SITE)!;
    assert.equal(cf.verdict, "reschedule");
  });
});
