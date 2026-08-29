/**
 * Phase 02: build each worksite's own historical heat baseline.
 *
 * WHY THIS SHAPE
 * --------------
 * A heatmap call costs 4,220 credits regardless of how wide its time window
 * is, and the API collapses that window into min/avg/max per tile. So one
 * call buys exactly one aggregate — and a distribution of daily peaks costs
 * one call per day.
 *
 * That makes a full multi-year daily history unaffordable (roughly 460 calls
 * per site-summer, ~1.9M credits). Instead we sample a MATCHED WINDOW: the
 * same calendar days in the same weeks, across every year back to 2021. That
 * answers the question the product actually asks — "is today hot for this
 * site at this time of year?" — at a fraction of the spend.
 *
 *   npm run baseline -- --budget 600000
 *   npm run baseline -- --sites phx-roosevelt --days 9 --years 5
 *
 * The run is resumable: every response is cached content-addressed, so a
 * re-run after a crash costs nothing for work already done.
 */

import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { FortyGuardClient } from "../lib/fortyguard/client";
import { CreditBudget, CREDIT_COST } from "../lib/fortyguard/cost";
import { FilterType } from "../lib/fortyguard/types";
import { siteAOI, WORKSITES, type Worksite } from "../lib/sites";
import { cToF } from "../lib/heat/heatIndex";

interface DailyPeak {
  date: string;
  year: number;
  /** Hottest tile's max temperature across the day, Celsius. */
  peakC: number;
  /** Site-wide mean across the day, Celsius. */
  meanC: number;
}

export interface SiteBaseline {
  siteId: string;
  siteName: string;
  city: string;
  /** Days sampled, most recent first. */
  samples: DailyPeak[];
  stats: {
    count: number;
    meanPeakC: number;
    medianPeakC: number;
    maxPeakC: number;
    minPeakC: number;
    stdDevC: number;
  };
  builtAt: string;
  creditsSpent: number;
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/**
 * Matched-window sample dates: the same span of the calendar, once per year.
 * Anchored on today so the baseline always compares like with like.
 */
function sampleDates(daysPerYear: number, years: number, anchor = new Date()): string[] {
  const dates: string[] = [];
  const month = anchor.getUTCMonth();
  const day = anchor.getUTCDate();

  for (let y = 1; y <= years; y++) {
    const year = anchor.getUTCFullYear() - y;
    // Spread samples backward from the anchor date, every third day.
    for (let d = 0; d < daysPerYear; d++) {
      const dt = new Date(Date.UTC(year, month, day - d * 3));
      if (dt.getUTCFullYear() < 2021) continue; // API floor
      dates.push(dt.toISOString().slice(0, 10));
    }
  }
  return dates;
}

/** Runs tasks with bounded concurrency, so we neither crawl nor hammer. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function buildBaseline(
  client: FortyGuardClient,
  site: Worksite,
  dates: string[],
  budget: CreditBudget,
): Promise<SiteBaseline> {
  const aoi = siteAOI(site);
  const spentBefore = budget.totalSpent;

  console.log(`\n── ${site.name} (${site.city}, ${site.state}) — ${dates.length} days`);

  const settled = await pool(dates, 5, async (date) => {
    if (!budget.canAfford("heatmap")) return null;
    try {
      const map = await client.heatmap(
        {
          polygon_aoi: aoi,
          date_time: { start_date: date, start_time: "00:00", filter_type: FilterType.EntireDay },
          granularity: 100,
        },
        `baseline ${site.id} ${date}`,
      );
      const peakC = Math.max(...map.map_data.features.map((f) => f.properties.max_temperature));
      return { date, year: Number(date.slice(0, 4)), peakC, meanC: map.stats_data.temperature_stats.mean };
    } catch (err) {
      // Failed tasks are free — log and carry on rather than aborting the run.
      console.log(`   ! ${date}: ${(err as Error).message.slice(0, 80)}`);
      return null;
    }
  });

  const samples = settled.filter((s): s is DailyPeak => s !== null).sort((a, b) => b.date.localeCompare(a.date));

  const peaks = samples.map((s) => s.peakC).sort((a, b) => a - b);
  const mean = peaks.reduce((a, b) => a + b, 0) / (peaks.length || 1);
  const variance = peaks.reduce((a, b) => a + (b - mean) ** 2, 0) / (peaks.length || 1);

  const baseline: SiteBaseline = {
    siteId: site.id,
    siteName: site.name,
    city: site.city,
    samples,
    stats: {
      count: peaks.length,
      meanPeakC: round2(mean),
      medianPeakC: round2(peaks[Math.floor(peaks.length / 2)] ?? 0),
      maxPeakC: round2(peaks.at(-1) ?? 0),
      minPeakC: round2(peaks[0] ?? 0),
      stdDevC: round2(Math.sqrt(variance)),
    },
    builtAt: new Date().toISOString(),
    creditsSpent: budget.totalSpent - spentBefore,
  };

  console.log(
    `   ${baseline.stats.count} days  mean peak ${baseline.stats.meanPeakC} C ` +
      `(${cToF(baseline.stats.meanPeakC).toFixed(1)} F)  ` +
      `range ${baseline.stats.minPeakC}-${baseline.stats.maxPeakC} C  ` +
      `sd ${baseline.stats.stdDevC}  ${baseline.creditsSpent.toLocaleString()} cr`,
  );
  return baseline;
}

async function main() {
  const budgetCap = Number(arg("budget", "600000"));
  const daysPerYear = Number(arg("days", "9"));
  const years = Number(arg("years", "5"));
  const only = arg("sites", "");
  const sites = only ? only.split(",").map((id) => WORKSITES.find((s) => s.id === id)!) : WORKSITES;

  const dates = sampleDates(daysPerYear, years);
  const projected = sites.length * dates.length * CREDIT_COST.heatmap;

  console.log("Theron — historical baseline builder");
  console.log(`  sites     : ${sites.map((s) => s.id).join(", ")}`);
  console.log(`  sampling  : ${daysPerYear} days/year x ${years} years = ${dates.length} days per site`);
  console.log(`  projected : ${projected.toLocaleString()} credits (cache hits cost nothing)`);
  console.log(`  allowance : ${budgetCap.toLocaleString()} credits`);

  const budget = new CreditBudget(budgetCap);
  const client = new FortyGuardClient({ budget });

  const before = await client.remainingCredits();
  console.log(`  account   : ${before.toLocaleString()} credits available\n`);

  if (projected > budgetCap) {
    console.log(`  NOTE: projection exceeds allowance; the run will stop cleanly when the budget is reached.\n`);
  }

  const baselines: SiteBaseline[] = [];
  for (const site of sites) {
    baselines.push(await buildBaseline(client, site, dates, budget));
  }

  await mkdir("data", { recursive: true });
  await writeFile("data/baselines.json", JSON.stringify(baselines, null, 2), "utf8");

  const after = await client.remainingCredits();
  console.log(`\nWrote data/baselines.json`);
  console.log(`  spent this run : ${budget.totalSpent.toLocaleString()} credits`);
  console.log(`  account now    : ${after.toLocaleString()} credits\n`);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

main().catch((err) => {
  console.error("\nBASELINE FAILED:", err);
  process.exit(1);
});
