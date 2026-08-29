/**
 * Builds the hourly heat curve for one worksite on one day.
 *
 * THE CHEAP-AND-CORRECT PATH
 * --------------------------
 * The API will not sell an hourly temperature series: any window wider than
 * an hour comes back collapsed into min/avg/max. So a real hourly curve costs
 * one heatmap call per hour.
 *
 * Humidity is the opposite — a single whole-day env_params call returns a
 * genuinely hourly humidity series for 2,900 credits. And because our local
 * Rothfusz heat index was verified to match the API's own output exactly
 * (108.0 degF vs 108.0 degF during Phase 01), we can pair real per-hour
 * temperature with real per-hour humidity and derive the index ourselves.
 *
 * Net effect: an accurate 12-hour curve costs 12 heatmap calls plus ONE
 * env_params call, instead of 12 of each.
 */

import type { FortyGuardClient } from "../fortyguard/client";
import { FilterType } from "../fortyguard/types";
import { siteAOI, type Worksite } from "../sites";
import { assessRisk, cToF, heatIndexF, type RiskLevel } from "../heat/heatIndex";

export interface HourReading {
  /** Local hour at the site, "HH:MM". */
  hour: string;
  hourIndex: number;
  tempC: number;
  tempF: number;
  /** Hottest tile in the AOI at this hour — where the crew is worst off. */
  peakTempF: number;
  humidityPct: number;
  heatIndexF: number;
  risk: RiskLevel;
}

export interface HourlyCurve {
  siteId: string;
  date: string;
  readings: HourReading[];
  creditsSpent: number;
}

/**
 * Fetches the curve for the given local hours. Hours already cached cost
 * nothing, so re-running an analysis is free.
 */
export async function buildHourlyCurve(
  client: FortyGuardClient,
  site: Worksite,
  date: string,
  hours: number[],
): Promise<HourlyCurve> {
  const aoi = siteAOI(site);

  // One call buys the whole day's humidity series. The temperature we pass is
  // irrelevant to the humidity output, so any plausible value works — we
  // never read the heat index this response returns.
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
    const series = env.locations[0];
    env.metadata.timestamps.forEach((ts, i) => {
      humidityByHour.set(Number(ts.slice(11, 13)), series.parameters.relative_humidity_percent[i]);
    });
  } catch (err) {
    // Offline with no cached humidity means we cannot compute a defensible
    // heat index, so return an empty curve rather than one built on a guess.
    if ((err as Error).name === "CacheMissError") {
      return { siteId: site.id, date, readings: [], creditsSpent: 0 };
    }
    throw err;
  }

  // One heatmap call per hour, run with bounded concurrency.
  const readings = await mapWithLimit(hours, 4, async (h): Promise<HourReading | null> => {
    const hh = `${String(h).padStart(2, "0")}:00`;
    try {
      const map = await client.heatmap(
        {
          polygon_aoi: aoi,
          date_time: { start_date: date, start_time: hh, filter_type: FilterType.SingleHour },
          granularity: 60,
        },
        `hourly ${site.id} ${date} ${hh}`,
      );

      const tempC = map.stats_data.temperature_stats.mean;
      const peakC = Math.max(...map.map_data.features.map((f) => f.properties.max_temperature));
      const rh = humidityByHour.get(h) ?? 30;
      const tempF = cToF(tempC);

      return {
        hour: hh,
        hourIndex: h,
        tempC: round2(tempC),
        tempF: round1(tempF),
        peakTempF: round1(cToF(peakC)),
        humidityPct: round1(rh),
        heatIndexF: heatIndexF(tempF, rh),
        risk: assessRisk(tempF, rh).level,
      };
    } catch {
      // Failed tasks are free; a hole in the curve is better than a dead run.
      return null;
    }
  });

  return {
    siteId: site.id,
    date,
    readings: readings.filter((r): r is HourReading => r !== null).sort((a, b) => a.hourIndex - b.hourIndex),
    creditsSpent: 0, // populated by the caller's budget ledger
  };
}

async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]);
    }),
  );
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
