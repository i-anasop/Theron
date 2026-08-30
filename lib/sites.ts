/**
 * The worksite portfolio Theron monitors.
 *
 * Coverage is U.S.-only, so every site is a real American location in a
 * high-heat metro. Polygons are kept around 1-2 km² — far under the ~130 km²
 * cap, and tight enough that the tile grid describes one actual worksite
 * rather than an averaged-out neighbourhood.
 */

import type { PolygonAOI } from "./fortyguard/types";

export interface Worksite {
  id: string;
  name: string;
  /** The organisation that would own this site in the product's story. */
  operator: string;
  city: string;
  state: string;
  /** Centre point, used for env_params queries. */
  lat: number;
  lon: number;
  /** Local IANA timezone, for turning shift hours into API timestamps. */
  timezone: string;
  /** Typical shift window in local time, 24-hour. */
  shift: { start: string; end: string };
  /** Crew size — scales the impact figures in the action brief. */
  crewSize: number;
  work: string;
}

/** Builds a closed rectangular ring around a centre point. */
function box(lat: number, lon: number, halfKm = 0.6): PolygonAOI {
  const dLat = halfKm / 111.32;
  const dLon = halfKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const ring: Array<[number, number]> = [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
    [lon - dLon, lat - dLat], // closes the ring
  ];
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }],
  };
}

export const WORKSITES: Worksite[] = [
  {
    id: "phx-roosevelt",
    name: "Roosevelt Row Mixed-Use",
    operator: "Sonoran Ridge Construction",
    city: "Phoenix",
    state: "AZ",
    lat: 33.4584,
    lon: -112.0736,
    timezone: "America/Phoenix",
    shift: { start: "06:00", end: "15:00" },
    crewSize: 34,
    work: "Concrete pours, steel erection, exterior finishing",
  },
  {
    id: "hou-shipchannel",
    name: "Ship Channel Terminal Expansion",
    operator: "Gulf Coast Industrial",
    city: "Houston",
    state: "TX",
    lat: 29.7355,
    lon: -95.2649,
    timezone: "America/Chicago",
    shift: { start: "07:00", end: "16:00" },
    crewSize: 52,
    work: "Terminal civils, pipe racks, tank maintenance",
  },
  {
    id: "lv-sunsetpark",
    name: "Sunset Park Logistics Hub",
    operator: "Desert Line Logistics",
    city: "Las Vegas",
    state: "NV",
    lat: 36.0637,
    lon: -115.1219,
    timezone: "America/Los_Angeles",
    shift: { start: "06:00", end: "14:00" },
    crewSize: 28,
    work: "Yard operations, trailer loading, last-mile dispatch",
  },
];

export function siteAOI(site: Worksite, halfKm = 0.6): PolygonAOI {
  return box(site.lat, site.lon, halfKm);
}

export function getSite(id: string): Worksite {
  const site = WORKSITES.find((s) => s.id === id);
  if (!site) throw new Error(`Unknown worksite "${id}". Known: ${WORKSITES.map((s) => s.id).join(", ")}`);
  return site;
}

/* ------------------------------------------------------------------ */
/* User-defined sites                                                  */
/* ------------------------------------------------------------------ */

/** What a person actually types when adding their own worksite. */
export interface UserSiteInput {
  id?: string;
  name: string;
  lat: number;
  lon: number;
  crewSize?: number;
  shiftStart?: string;
  shiftEnd?: string;
  work?: string;
}

/** Rough continental U.S. plus Alaska and Hawaii. */
export const US_BOUNDS = { minLat: 18.0, maxLat: 71.5, minLon: -179.5, maxLon: -66.0 };

export function isInsideUS(lat: number, lon: number): boolean {
  return (
    lat >= US_BOUNDS.minLat && lat <= US_BOUNDS.maxLat &&
    lon >= US_BOUNDS.minLon && lon <= US_BOUNDS.maxLon
  );
}

/**
 * Turns user input into a Worksite the rest of the system can treat exactly
 * like a built-in one. Defaults are conservative rather than clever: a missing
 * crew size should under-state impact, not invent a big number.
 */
export function toWorksite(input: UserSiteInput): Worksite {
  const lat = Number(input.lat);
  const lon = Number(input.lon);
  return {
    id: input.id || `user-${lat.toFixed(3)}_${lon.toFixed(3)}`,
    name: (input.name || "My worksite").slice(0, 80),
    operator: "Added by you",
    city: (input.name || "My worksite").slice(0, 40),
    state: "US",
    lat,
    lon,
    timezone: "UTC",
    shift: { start: input.shiftStart || "06:00", end: input.shiftEnd || "15:00" },
    crewSize: Math.max(1, Math.min(5000, Number(input.crewSize) || 10)),
    work: input.work || "Outdoor work",
  };
}
