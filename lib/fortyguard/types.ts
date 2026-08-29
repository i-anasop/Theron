/**
 * Types for the FortyGuard Temperature API.
 *
 * These are derived from live responses captured during Phase 01 probing
 * (see /probes), not from the docs — several documented details are wrong.
 * Notably: filter_type 5 ("single month") does not exist; the API accepts
 * only 1-4.
 */

export const BASE_URL = "https://api.fortyguard.com";

/** Time-window selector for an analysis request. */
export enum FilterType {
  /** Single hour. Requires start_time. */
  SingleHour = 1,
  /** Range of hours within one day. Requires start_time and end_time. */
  HourRange = 2,
  /** Entire day. Returns values aggregated across all 24 hours. */
  EntireDay = 3,
  /** Range of days. Requires end_date. Aggregated across the range. */
  DayRange = 4,
}

/** Output grid detail in metres. Smaller is finer — and costs the same. */
export type Granularity = 60 | 80 | 100;

export interface DateTimeSpec {
  /** YYYY-MM-DD. Valid from 2021-01-01 onward. */
  start_date: string;
  /** HH:MM, 24-hour. */
  start_time?: string;
  /** HH:MM. Required when filter_type is HourRange. */
  end_time?: string;
  /** YYYY-MM-DD. Required when filter_type is DayRange. */
  end_date?: string;
  filter_type: FilterType;
}

/** GeoJSON polygon area of interest. Coordinates are [longitude, latitude]. */
export interface PolygonAOI {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: {
      type: "Polygon";
      /** Ring must be closed: first coordinate pair equals the last. */
      coordinates: Array<Array<[number, number]>>;
    };
  }>;
}

/* ------------------------------------------------------------------ */
/* Envelope                                                            */
/* ------------------------------------------------------------------ */

/** Every response is wrapped in this envelope, successes and errors alike. */
export interface Envelope<T> {
  error: boolean;
  status_code: number;
  message: string;
  data: T;
}

export interface SubmitData {
  activity_id: string;
}

/**
 * Terminal states are "Completed" and "Failed". The API returns capitalised
 * words; we compare case-insensitively because the handbook documents them
 * in lowercase and the two sources disagree.
 */
export type TaskStatus = "Processing" | "Completed" | "Failed" | (string & {});

export interface StatusData<T> {
  activity_id: string;
  status: TaskStatus;
  result: T;
}

/* ------------------------------------------------------------------ */
/* Heatmap                                                             */
/* ------------------------------------------------------------------ */

export interface HeatmapRequest {
  polygon_aoi: PolygonAOI;
  date_time: DateTimeSpec;
  granularity: Granularity;
}

/**
 * One grid tile. When the request covers more than a single hour these are
 * aggregates over the whole window, not a time series — the API collapses
 * the time dimension before returning.
 */
export interface HeatmapTileProperties {
  tile_id: number;
  average_temperature: number;
  min_temperature: number;
  max_temperature: number;
}

export interface HeatmapResult {
  map_data: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      properties: HeatmapTileProperties;
      geometry: { type: "Polygon"; coordinates: number[][][] };
    }>;
  };
  stats_data: {
    temperature_stats: {
      minimum: number;
      maximum: number;
      mean: number;
      standard_deviation: number;
    };
    overall_temperature_distribution: unknown[];
    normal_temperature_distribution: unknown;
    temperature_frequency: { x_axis: number[]; y_axis: number[] };
  };
}

/* ------------------------------------------------------------------ */
/* Environmental parameters                                            */
/* ------------------------------------------------------------------ */

/**
 * IMPORTANT: `temperature` is an INPUT, not an output. The endpoint derives
 * heat index and apparent temperature from the temperature you supply,
 * combined with its own humidity model.
 *
 * Passing a single scalar temperature with a multi-hour filter_type applies
 * that one temperature to every hour, which produces physically impossible
 * results (peak-afternoon heat paired with 3 a.m. humidity). Supply an
 * hourly temperature per hour, or derive the heat index locally instead —
 * see lib/heat/heatIndex.ts.
 */
export interface EnvParamsRequest {
  latitude: number;
  longitude: number;
  /** Ambient air temperature in Celsius at this point and time. */
  temperature: number;
  date_time: DateTimeSpec;
}

/** Parameters are parallel arrays aligned to `metadata.timestamps`. */
export interface EnvParameters {
  heat_index_celsius: number[];
  apparent_temperature_celsius: number[];
  relative_humidity_percent: number[];
  precipitation_mm: number[];
  cloud_cover_octas: number[];
  wet_bulb_temperature_celsius: number[];
  "air_quality:idx": number[];
  "air_quality_pm2p5:idx": number[];
  "air_quality_pm10:idx": number[];
  "air_quality_no2:idx": number[];
  aqi_us_co: number[];
  "air_quality_o3:idx": number[];
  "air_quality_so2:idx": number[];
  methane_ppb: number[];
  co2_ppm: number[];
}

export interface EnvParamsResult {
  metadata: {
    timezone: string;
    timezone_offset_hours: number;
    time_range: { start: string; end: string; interval: string; count: number };
    /** ISO timestamps with local offset, one per index in every parameter array. */
    timestamps: string[];
  };
  locations: Array<{
    lat: number;
    lon: number;
    elevation: number;
    temperature: number;
    parameters: EnvParameters;
    solar_irradiance: {
      clear_sky: { ghi: number; dni: number; dhi: number };
      description: string;
    };
  }>;
}

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

export interface UsageResult {
  subscription_id: string;
  plan_details: {
    plan_type: string;
    cycle_type: string;
    subscription_start_date: string;
    billing_period: string;
    active: boolean;
    credits_reset_date: string;
  };
  api_key_details: {
    status: string;
    valid: boolean;
    expiry_date: string;
    api_access_available: boolean;
  };
  credit_summary: {
    total_available_credits: number;
    cycle_credits_used: number;
    cycle_remaining_credits: number;
    cycle_usage_percentage: number;
    total_credits_used: number;
    total_remaining_credits: number;
  };
  activity_breakdown: Array<{
    name: string;
    credits: number;
    count: number;
    percentage: number;
  }>;
}

/** Thrown for non-2xx responses and for tasks that reach a Failed state. */
export class FortyGuardError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly body?: unknown,
    readonly activityId?: string,
  ) {
    super(message);
    this.name = "FortyGuardError";
  }
}
