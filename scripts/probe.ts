/**
 * Phase 01 checkpoint: proves the client works end to end against the live
 * API, and that the cache actually prevents a second charge.
 *
 *   npm run probe
 */

import "dotenv/config";
import { FortyGuardClient } from "../lib/fortyguard/client";
import { CreditBudget } from "../lib/fortyguard/cost";
import { FilterType, type PolygonAOI } from "../lib/fortyguard/types";
import { assessRisk, cToF } from "../lib/heat/heatIndex";

/** ~1.3 km square over downtown Phoenix. Well inside the 130 km² cap. */
const PHOENIX_DOWNTOWN: PolygonAOI = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-112.08, 33.443],
            [-112.068, 33.443],
            [-112.068, 33.453],
            [-112.08, 33.453],
            [-112.08, 33.443],
          ],
        ],
      },
    },
  ],
};

async function main() {
  const budget = new CreditBudget(50_000);
  const client = new FortyGuardClient({
    budget,
    onCall: (r) =>
      console.log(
        `  [call] ${r.endpoint.padEnd(10)} ${r.cached ? "CACHE HIT " : "live      "}` +
          `${String(r.credits).padStart(5)} cr  ${String(r.durationMs).padStart(6)} ms` +
          `${r.activityId ? `  ${r.activityId.slice(0, 8)}` : ""}`,
      ),
  });

  console.log("\n=== account ===");
  const usage = await client.usage();
  console.log(`  plan       : ${usage.plan_details.plan_type}`);
  console.log(`  key valid  : ${usage.api_key_details.valid}`);
  console.log(`  remaining  : ${usage.credit_summary.cycle_remaining_credits.toLocaleString()} credits`);

  console.log("\n=== heatmap: Phoenix downtown, 2026-08-20 14:00 ===");
  const map = await client.heatmap(
    {
      polygon_aoi: PHOENIX_DOWNTOWN,
      date_time: { start_date: "2026-08-20", start_time: "14:00", filter_type: FilterType.SingleHour },
      granularity: 100,
    },
    "probe: peak hour",
  );
  const stats = map.stats_data.temperature_stats;
  const tiles = map.map_data.features;
  const hottest = tiles.reduce((a, b) =>
    a.properties.max_temperature > b.properties.max_temperature ? a : b,
  );
  console.log(`  tiles      : ${tiles.length}`);
  console.log(`  mean       : ${stats.mean.toFixed(2)} C  (${cToF(stats.mean).toFixed(1)} F)`);
  console.log(
    `  hottest    : tile ${hottest.properties.tile_id} at ${hottest.properties.max_temperature.toFixed(2)} C ` +
      `(${cToF(hottest.properties.max_temperature).toFixed(1)} F)`,
  );

  console.log("\n=== cache check: identical request must not spend credits ===");
  const spentBefore = budget.totalSpent;
  await client.heatmap(
    {
      polygon_aoi: PHOENIX_DOWNTOWN,
      date_time: { start_date: "2026-08-20", start_time: "14:00", filter_type: FilterType.SingleHour },
      granularity: 100,
    },
    "probe: repeat",
  );
  const delta = budget.totalSpent - spentBefore;
  console.log(delta === 0 ? "  PASS — repeat cost 0 credits" : `  FAIL — repeat cost ${delta} credits`);

  console.log("\n=== env_params + locally computed risk ===");
  const env = await client.envParams(
    {
      latitude: 33.4484,
      longitude: -112.074,
      temperature: stats.mean,
      date_time: { start_date: "2026-08-20", start_time: "14:00", filter_type: FilterType.SingleHour },
    },
    "probe: humidity at peak hour",
  );
  const rh = env.locations[0].parameters.relative_humidity_percent[0];
  const apiHeatIndexC = env.locations[0].parameters.heat_index_celsius[0];
  const risk = assessRisk(cToF(stats.mean), rh);

  console.log(`  humidity   : ${rh}%`);
  console.log(`  API heat index : ${cToF(apiHeatIndexC).toFixed(1)} F`);
  console.log(`  our heat index : ${risk.heatIndexF.toFixed(1)} F  (NWS Rothfusz, computed locally)`);
  console.log(`  risk level : ${risk.level.toUpperCase()}  (OSHA trigger: ${risk.trigger})`);
  console.log(`  guidance   : ${risk.guidance}`);

  console.log("\n=== budget ledger ===");
  for (const e of budget.entries()) {
    console.log(`  ${String(e.cost).padStart(5)} cr  ${e.endpoint.padEnd(10)} ${e.note}`);
  }
  console.log(`  ${String(budget.totalSpent).padStart(5)} cr  TOTAL this run`);
  console.log(`  account remaining: ${(await client.remainingCredits()).toLocaleString()}\n`);
}

main().catch((err) => {
  console.error("\nPROBE FAILED:", err);
  process.exit(1);
});
