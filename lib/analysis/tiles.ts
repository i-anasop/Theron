/**
 * The spatial grid: what the API actually sells.
 *
 * FortyGuard's differentiator is resolution — a few hundred tiles across one
 * worksite, each with its own temperature, rather than a single city-wide
 * number. Reducing that to a line chart throws away the whole point, so this
 * assembles the tile geometry and the per-hour temperature field for a site
 * and hands it to the client to animate.
 *
 * The payload is built so geometry ships ONCE. Tile boundaries are identical
 * across every hour of the day, so sending them 24 times would multiply the
 * response for no information. Temperatures ride along as flat arrays aligned
 * to the tile order.
 */

import type { FortyGuardClient } from "../fortyguard/client";
import { FilterType } from "../fortyguard/types";
import { siteAOI, type Worksite } from "../sites";
import { cToF, heatIndexF, assessRisk, type RiskLevel } from "../heat/heatIndex";

export interface TileGrid {
  siteId: string;
  date: string;
  bounds: { minLon: number; maxLon: number; minLat: number; maxLat: number };
  /** Tile outlines, in [lon, lat] pairs. Sent once; shared by every hour. */
  tiles: Array<{ id: number; ring: [number, number][] }>;
  hours: Array<{
    hour: number;
    label: string;
    /** Air temperature in °F, one per tile, in the same order as `tiles`. */
    tempsF: number[];
    meanF: number;
    peakF: number;
    humidityPct: number;
    heatIndexF: number;
    risk: RiskLevel;
  }>;
  /** Min and max across every tile and hour, so the colour scale is stable. */
  scale: { minF: number; maxF: number };
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const round1 = (n: number) => Math.round(n * 10) / 10;

export async function buildTileGrid(
  client: FortyGuardClient,
  site: Worksite,
  date: string,
  hours: number[],
): Promise<TileGrid | null> {
  const aoi = siteAOI(site);

  // Humidity comes from one whole-day call; see hourly.ts for why the heat
  // index is computed locally rather than read from the response.
  const humidityByHour = new Map<number, number>();
  try {
    const env = await client.envParams(
      {
        latitude: site.lat,
        longitude: site.lon,
        temperature: 35,
        date_time: { start_date: date, start_time: "00:00", filter_type: FilterType.EntireDay },
      },
      `humidity series ${site.id} ${date}`,
    );
    env.metadata.timestamps.forEach((ts, i) => {
      humidityByHour.set(
        Number(ts.slice(11, 13)),
        env.locations[0].parameters.relative_humidity_percent[i],
      );
    });
  } catch {
    return null;
  }

  let tiles: TileGrid["tiles"] | null = null;
  const out: TileGrid["hours"] = [];
  let minF = Infinity;
  let maxF = -Infinity;

  for (const h of hours) {
    const hh = `${String(h).padStart(2, "0")}:00`;
    let map;
    try {
      map = await client.heatmap(
        {
          polygon_aoi: aoi,
          date_time: { start_date: date, start_time: hh, filter_type: FilterType.SingleHour },
          granularity: 60,
        },
        `hourly ${site.id} ${date} ${hh}`,
      );
    } catch {
      continue; // a gap in the day is better than a fabricated hour
    }

    const features = map.map_data.features;
    if (!features.length) continue;

    // Geometry is identical every hour, so capture it from the first success.
    if (!tiles) {
      tiles = features.map((f, i) => ({
        id: f.properties.tile_id ?? i,
        ring: (f.geometry.coordinates[0] as unknown as number[][]).map(
          (c) => [round5(c[0]), round5(c[1])] as [number, number],
        ),
      }));
    }

    const tempsF = features.map((f) => round1(cToF(f.properties.average_temperature)));
    for (const t of tempsF) {
      if (t < minF) minF = t;
      if (t > maxF) maxF = t;
    }

    const meanF = cToF(map.stats_data.temperature_stats.mean);
    const peakF = Math.max(...tempsF);
    const rh = humidityByHour.get(h) ?? 30;

    out.push({
      hour: h,
      label: hh,
      tempsF,
      meanF: round1(meanF),
      peakF: round1(peakF),
      humidityPct: round1(rh),
      heatIndexF: heatIndexF(meanF, rh),
      risk: assessRisk(meanF, rh).level,
    });
  }

  if (!tiles || !out.length) return null;

  const all = tiles.flatMap((t) => t.ring);
  return {
    siteId: site.id,
    date,
    bounds: {
      minLon: Math.min(...all.map((c) => c[0])),
      maxLon: Math.max(...all.map((c) => c[0])),
      minLat: Math.min(...all.map((c) => c[1])),
      maxLat: Math.max(...all.map((c) => c[1])),
    },
    tiles,
    hours: out.sort((a, b) => a.hour - b.hour),
    scale: { minF: Math.floor(minF), maxF: Math.ceil(maxF) },
  };
}
