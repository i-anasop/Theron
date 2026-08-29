/**
 * Bundles the local response cache into the deployment.
 *
 * The deployed app has no writable filesystem and may have no Redis, so the
 * already-paid-for API responses ship with the build. These are verbatim
 * FortyGuard responses captured by the same client and replayed through the
 * same code path — the demo is not mocked, it is cached.
 *
 *   npm run snapshot
 */

import "dotenv/config";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
  const root = join(process.cwd(), ".cache");
  let files: string[];
  try {
    files = (await readdir(root)).filter((f) => f.endsWith(".json"));
  } catch {
    console.error("No .cache directory. Run `npm run analyze` first to populate it.");
    process.exit(1);
  }

  const entries: Record<string, unknown> = {};
  let bytes = 0;

  for (const file of files) {
    const raw = await readFile(join(root, file), "utf8");
    entries[file.replace(/\.json$/, "")] = JSON.parse(raw);
    bytes += raw.length;
  }

  await mkdir("data", { recursive: true });
  const out = JSON.stringify(entries);
  await writeFile("data/demo-snapshot.json", out, "utf8");

  console.log(`Wrote data/demo-snapshot.json`);
  console.log(`  ${files.length} cached responses · ${(out.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  source: ${(bytes / 1024 / 1024).toFixed(2)} MB across .cache/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
