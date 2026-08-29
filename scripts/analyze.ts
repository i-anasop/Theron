/**
 * The deterministic core, with no language model involved.
 *
 * This is the pipeline the agent drives: build the real hourly curve, rank the
 * day against the site's own history, then search every alternative shift
 * window and report the measured difference. Running it standalone proves the
 * numbers are the API's, not the model's.
 *
 *   npm run analyze -- --site phx-roosevelt --date 2026-08-28
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { FortyGuardClient } from "../lib/fortyguard/client";
import { CreditBudget } from "../lib/fortyguard/cost";
import { getSite } from "../lib/sites";
import { buildHourlyCurve } from "../lib/analysis/hourly";
import { findBestShift } from "../lib/analysis/counterfactual";
import { compareToBaseline } from "../lib/analysis/percentile";
import { fToC } from "../lib/heat/heatIndex";
import type { SiteBaseline } from "./baseline";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const siteId = arg("site", "phx-roosevelt");
  const date = arg("date", new Date(Date.now() - 86_400_000).toISOString().slice(0, 10));
  const from = Number(arg("from", "4"));
  const to = Number(arg("to", "17"));

  const site = getSite(siteId);
  const budget = new CreditBudget(200_000);
  const client = new FortyGuardClient({ budget });

  console.log(`Theron — deterministic analysis`);
  console.log(`  site : ${site.name} (${site.city}, ${site.state})`);
  console.log(`  crew : ${site.crewSize}   scheduled shift ${site.shift.start}-${site.shift.end}`);
  console.log(`  date : ${date}   searching hours ${from}:00-${to}:00\n`);

  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const curve = await buildHourlyCurve(client, site, date, hours);

  console.log("  hour   temp F   RH%    heat idx F   risk");
  for (const r of curve.readings) {
    console.log(
      `  ${r.hour}  ${String(r.tempF).padStart(6)}  ${String(r.humidityPct).padStart(5)}  ` +
        `${String(r.heatIndexF).padStart(10)}   ${r.risk}`,
    );
  }

  // Rank today against the site's own sampled history.
  try {
    const baselines: SiteBaseline[] = JSON.parse(await readFile("data/baselines.json", "utf8"));
    const b = baselines.find((x) => x.siteId === siteId);
    if (b) {
      const peakF = Math.max(...curve.readings.map((r) => r.peakTempF));
      console.log(`\n  BASELINE\n  ${compareToBaseline(b, fToC(peakF)).summary}`);
    }
  } catch {
    console.log("\n  (no baseline available for site-relative ranking)");
  }

  const cf = findBestShift(curve, site);
  if (!cf) {
    console.log("\n  Not enough hourly data to evaluate a shift move.");
  } else {
    console.log(`\n  COUNTERFACTUAL   verdict: ${cf.verdict.toUpperCase()}`);
    console.log(
      `  scheduled ${cf.current.label}  peak ${cf.current.peakHeatIndexF} F  mean ${cf.current.meanHeatIndexF} F  ` +
        `${cf.current.degreeHoursOverTrigger} degF-h over trigger`,
    );
    console.log(
      `  proposed  ${cf.proposed.label}  peak ${cf.proposed.peakHeatIndexF} F  mean ${cf.proposed.meanHeatIndexF} F  ` +
        `${cf.proposed.degreeHoursOverTrigger} degF-h over trigger`,
    );
    console.log(
      `  delta     ${cf.degreeHoursAvoided} degF-h avoided (${cf.percentReduction}%)  ` +
        `= ${cf.crewDegreeHoursAvoided} crew-degF-hours`,
    );
    console.log(`\n  ${cf.headline}`);
  }

  console.log(`\n  credits spent: ${budget.totalSpent.toLocaleString()}`);
  console.log(`  account left : ${(await client.remainingCredits()).toLocaleString()}\n`);
}

main().catch((err) => {
  console.error("\nANALYZE FAILED:", err);
  process.exit(1);
});
