/**
 * Cheap portfolio triage.
 *
 * A full hourly curve costs one heatmap call per hour — around 100,000 credits
 * for a 24-hour day. Running that across a whole portfolio on every sweep is
 * how you drain an account.
 *
 * But the API charges per call regardless of how wide the requested window is,
 * and a shift-length window returns min/avg/max across exactly the hours the
 * crew is exposed. So one call answers "is this site worth looking at?" for
 * 4,220 credits instead of 38,000.
 *
 * Theron sweeps in two stages: triage every site cheaply, then spend the
 * hourly budget only on the sites triage flags. This is the credit-aware
 * planning principle applied to the system's own architecture, not just to
 * the agent's choices.
 */

import type { FortyGuardClient } from "../fortyguard/client";
import { FilterType } from "../fortyguard/types";
import { siteAOI, type Worksite } from "../sites";
import { assessRisk, cToF, type RiskLevel } from "../heat/heatIndex";

export interface TriageResult {
  siteId: string;
  date: string;
  /** Mean temperature across the scheduled shift. */
  shiftMeanF: number;
  /** Hottest tile during the shift — where the crew is worst off. */
  shiftPeakF: number;
  humidityPct: number;
  /**
   * SCREENING heat index — the shift's mean temperature against the worst
   * hourly humidity in the window. Deliberately not a measurement: it exists
   * only to decide whether to buy the hourly curve. Never quote it as fact.
   */
  screeningHeatIndexF: number;
  risk: RiskLevel;
  /** True when the site warrants the full hourly analysis. */
  needsDeepAnalysis: boolean;
  guidance: string;
}

/**
 * Two calls per site: one heatmap over the shift window, one env_params for
 * the day's humidity. 7,120 credits total, versus ~100,000 for a full curve.
 */
export async function triageSite(
  client: FortyGuardClient,
  site: Worksite,
  date: string,
): Promise<TriageResult> {
  const startHour = Number(site.shift.start.slice(0, 2));
  const endHour = Number(site.shift.end.slice(0, 2));

  const map = await client.heatmap(
    {
      polygon_aoi: siteAOI(site),
      date_time: {
        start_date: date,
        start_time: site.shift.start,
        end_time: site.shift.end,
        filter_type: FilterType.HourRange,
      },
      granularity: 60,
    },
    `triage ${site.id} ${date} shift window`,
  );

  const env = await client.envParams(
    {
      latitude: site.lat,
      longitude: site.lon,
      temperature: map.stats_data.temperature_stats.mean,
      date_time: { start_date: date, start_time: "00:00", filter_type: FilterType.EntireDay },
    },
    `triage humidity ${site.id} ${date}`,
  );

  const rhSeries = env.locations[0].parameters.relative_humidity_percent;
  const shiftHumidities = env.metadata.timestamps
    .map((ts, i) => ({ hour: Number(ts.slice(11, 13)), rh: rhSeries[i] }))
    .filter((x) => x.hour >= startHour && x.hour < endHour);

  const shiftPeakF = cToF(Math.max(...map.map_data.features.map((f) => f.properties.max_temperature)));
  const shiftMeanF = cToF(map.stats_data.temperature_stats.mean);

  /*
   * Pair each hour's real humidity with the shift's MEAN temperature, then
   * take the worst resulting hour.
   *
   * The tempting shortcut — peak temperature with peak humidity — is wrong,
   * and dangerously so. Those two maxima occur at different hours: humidity
   * peaks before dawn, temperature peaks mid-afternoon. Combining them
   * invents an hour that never existed. At the Houston site it produced a
   * 161 degF heat index from 98 degF and 88% RH, a pairing whose implied dew
   * point would be a world record.
   *
   * Triage cannot do better than this without hourly temperature, which is
   * precisely the thing it exists to avoid buying. So it is explicitly a
   * SCREENING value: good enough to decide whether a site deserves the full
   * hourly analysis, never quoted as a measurement.
   */
  const screeningHeatIndexF = shiftHumidities.length
    ? Math.max(...shiftHumidities.map((x) => assessRisk(shiftMeanF, x.rh).heatIndexF))
    : assessRisk(shiftMeanF, rhSeries[0] ?? 30).heatIndexF;

  const humidityPct = shiftHumidities.length
    ? Math.max(...shiftHumidities.map((x) => x.rh))
    : (rhSeries[0] ?? 30);

  const assessment = assessRisk(shiftMeanF, humidityPct);

  return {
    siteId: site.id,
    date,
    shiftMeanF: round1(shiftMeanF),
    shiftPeakF: round1(shiftPeakF),
    humidityPct: round1(humidityPct),
    screeningHeatIndexF: round1(screeningHeatIndexF),
    risk: assessment.level,
    // Only an hourly curve can tell you whether a better window exists, so
    // that is the question triage is deciding whether to pay to answer.
    needsDeepAnalysis: assessment.level === "high" || assessment.level === "extreme",
    guidance: assessment.guidance,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
