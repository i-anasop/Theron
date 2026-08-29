/**
 * Self-baselining: is today hot *for this site*?
 *
 * An absolute threshold treats 104 degF in Phoenix the same as 104 degF in
 * Seattle, which is wrong operationally — crews acclimatise to their own
 * climate, and the Phoenix crew that works 104 degF every August is not in
 * the same danger as the Seattle crew meeting it for the first time.
 *
 * So Theron ranks today against the same site's own sampled history.
 */

import type { SiteBaseline } from "../../scripts/baseline";

export interface BaselineComparison {
  siteId: string;
  todayPeakC: number;
  /** 0-100. The share of historical sampled days this one is hotter than. */
  percentile: number;
  /** Standard deviations above the site's own mean. */
  zScore: number;
  meanPeakC: number;
  sampleCount: number;
  /** Rank among all sampled days, 1 = hottest ever sampled. */
  rank: number;
  summary: string;
}

export function compareToBaseline(baseline: SiteBaseline, todayPeakC: number): BaselineComparison {
  const peaks = baseline.samples.map((s) => s.peakC).sort((a, b) => a - b);
  const below = peaks.filter((p) => p < todayPeakC).length;
  const percentile = peaks.length ? Math.round((below / peaks.length) * 100) : 0;
  const rank = peaks.length - below;
  const { meanPeakC, stdDevC } = baseline.stats;
  const zScore = stdDevC > 0 ? round2((todayPeakC - meanPeakC) / stdDevC) : 0;

  const delta = round1(todayPeakC - meanPeakC);
  const direction = delta >= 0 ? "above" : "below";

  return {
    siteId: baseline.siteId,
    todayPeakC: round2(todayPeakC),
    percentile,
    zScore,
    meanPeakC,
    sampleCount: peaks.length,
    rank,
    summary:
      `${round2(todayPeakC)} C is ${Math.abs(delta)} C ${direction} this site's own mean for the season ` +
      `(${meanPeakC} C across ${peaks.length} comparable days since 2022) — ` +
      `the ${ordinal(percentile)} percentile, ranking ${ordinal(rank)} hottest of ${peaks.length} sampled.`,
  };
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
