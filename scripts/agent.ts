/**
 * Run Theron against a plain-language goal.
 *
 *   npm run agent -- "Should the Phoenix crew work their scheduled shift tomorrow?"
 *   npm run agent -- --budget 120000 "Sweep the portfolio and flag any site over the OSHA trigger"
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { runAgent } from "../lib/agent/agent";
import type { SiteBaseline } from "./baseline";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const allowance = Number(arg("budget", "150000"));
  const goal = process.argv.filter((a, i) => i >= 2 && !a.startsWith("--") && process.argv[i - 1] !== "--budget").join(" ");

  if (!goal) {
    console.error('Usage: npm run agent -- "your goal here"');
    process.exit(1);
  }

  let baselines: SiteBaseline[] = [];
  try {
    baselines = JSON.parse(await readFile("data/baselines.json", "utf8"));
  } catch {
    console.log("(no baselines found — run `npm run baseline` for site-relative comparison)\n");
  }

  console.log(`GOAL: ${goal}`);
  console.log(`BUDGET: ${allowance.toLocaleString()} credits\n${"─".repeat(72)}\n`);
  process.on("uncaughtException", (e) => {
    console.error(String(e));
    process.exit(1);
  });

  const result = await runAgent({
    goal,
    baselines,
    allowance,
    onToolCall: (name, input) => {
      const summary = JSON.stringify(input);
      console.log(`  → ${name}${summary === "{}" ? "" : ` ${summary.slice(0, 110)}`}`);
    },
    onRetry: (s) => console.log(`  … provider rate limit, waiting ${s}s`),
  });

  console.log(`\n${"─".repeat(72)}\n`);
  console.log(result.answer);

  console.log(`\n${"─".repeat(72)}`);
  console.log("AUDIT TRAIL");
  for (const c of result.trail) {
    console.log(
      `  ${c.cached ? "cache" : "live "}  ${c.endpoint.padEnd(11)}${String(c.credits).padStart(6)} cr  ` +
        `${String(c.durationMs).padStart(6)} ms  ${c.note ?? ""}`,
    );
  }
  console.log(
    `\n  ${result.toolCalls.length} tool calls · ${result.trail.length} API calls · ` +
      `${result.trail.filter((c) => c.cached).length} served from cache · ` +
      `${result.creditsSpent.toLocaleString()} credits spent`,
  );
  console.log(`  reasoning: ${result.provider} / ${result.model} · ${result.iterations} iterations\n`);
}

main().catch((err) => {
  console.error("\nAGENT FAILED:", err);
  process.exit(1);
});
