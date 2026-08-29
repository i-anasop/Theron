/**
 * Runs cheap triage across the portfolio and caches the result.
 *
 *   npm run triage -- --date 2026-08-28
 *   npm run triage -- --date 2026-08-28 --sites hou-shipchannel,lv-sunsetpark
 *
 * Two calls per site (7,120 credits) versus ~100,000 for a full hourly curve.
 */

import "dotenv/config";
import { FortyGuardClient } from "../lib/fortyguard/client";
import { CreditBudget, CREDIT_COST } from "../lib/fortyguard/cost";
import { FileCache } from "../lib/fortyguard/cache";
import { triageSite } from "../lib/analysis/triage";
import { WORKSITES } from "../lib/sites";
import { DEMO_DATE } from "../lib/demo";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const date = arg("date", DEMO_DATE);
  const only = arg("sites", "");
  const sites = only
    ? only.split(",").map((id) => WORKSITES.find((s) => s.id === id)!).filter(Boolean)
    : WORKSITES;

  const perSite = CREDIT_COST.heatmap + CREDIT_COST.env_params;
  const budget = new CreditBudget(sites.length * perSite + 1000);
  const client = new FortyGuardClient({ budget, cache: new FileCache() });

  console.log(`Theron — portfolio triage · ${date}`);
  console.log(`  sites    : ${sites.map((s) => s.id).join(", ")}`);
  console.log(`  max cost : ${(sites.length * perSite).toLocaleString()} credits (${perSite} per site)`);
  console.log(`  account  : ${(await client.remainingCredits()).toLocaleString()} credits\n`);

  for (const site of sites) {
    try {
      const t = await triageSite(client, site, date);
      console.log(
        `  ${site.id.padEnd(18)} peak ${String(t.shiftPeakF).padStart(6)} F  RH ${String(t.humidityPct).padStart(5)}%  ` +
          `HI~ ${String(t.screeningHeatIndexF).padStart(6)} F  ${t.risk.toUpperCase().padEnd(8)}` +
          `${t.needsDeepAnalysis ? " → deep analysis warranted" : ""}`,
      );
    } catch (err) {
      console.log(`  ${site.id.padEnd(18)} FAILED: ${(err as Error).message.slice(0, 90)}`);
    }
  }

  console.log(`\n  spent this run : ${budget.totalSpent.toLocaleString()} credits`);
  console.log(`  account now    : ${(await client.remainingCredits()).toLocaleString()}\n`);
}

main().catch((err) => {
  console.error("\nTRIAGE FAILED:", err);
  process.exit(1);
});
