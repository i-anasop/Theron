/**
 * The cache stack used by the deployed app.
 *
 * Reads try the bundled snapshot first, then Redis; writes go to Redis when
 * it is configured. This is why the live demo answers instantly and spends
 * nothing, while a request for a date outside the snapshot still runs against
 * the real API.
 */

import { type CacheStore, FileCache, LayeredCache, RedisCache, SnapshotCache } from "./fortyguard/cache";
import snapshot from "../data/demo-snapshot.json";

let cached: LayeredCache | null = null;

export function appCache(): LayeredCache {
  if (!cached) {
    const layers: CacheStore[] = [
      new SnapshotCache(snapshot as unknown as Record<string, unknown>),
      new RedisCache(),
    ];

    // Locally there is a writable filesystem, so add the disk cache. Without a
    // writable layer, a live call's result is thrown away the moment it is
    // returned — which is exactly how this project once paid 149,000 credits
    // for data it did not keep. Vercel's filesystem is read-only, so this
    // layer is local-only and Redis carries persistence in production.
    if (!process.env.VERCEL) layers.push(new FileCache());

    cached = new LayeredCache(layers);
  }
  return cached;
}
