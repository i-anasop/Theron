/**
 * Loads the pre-built historical baselines.
 *
 * Bundled as a static import rather than read from disk at runtime, so the
 * data ships with the deployment and the serverless functions have no
 * filesystem dependency.
 */

import type { SiteBaseline } from "../scripts/baseline";
import data from "../data/baselines.json";

export const BASELINES = data as unknown as SiteBaseline[];

export function baselineFor(siteId: string): SiteBaseline | undefined {
  return BASELINES.find((b) => b.siteId === siteId);
}
