/**
 * Heat index and occupational heat risk.
 *
 * WHY THIS EXISTS
 * ---------------
 * The API's env_params endpoint returns a heat index, but it computes it from
 * a `temperature` value that the caller supplies. Ask it for a whole day and
 * it applies your single temperature to all 24 hours, pairing peak-afternoon
 * heat with pre-dawn humidity and producing impossible numbers (we measured a
 * 167 degF heat index at midnight in Phoenix this way).
 *
 * So Theron takes the humidity series from env_params — which IS genuinely
 * hourly and correct — and pairs it with a real per-hour temperature from the
 * heatmap endpoint, then computes the heat index itself using the NWS
 * Rothfusz regression. That is the published, auditable method a safety
 * officer would recognise, and it costs nothing extra.
 */

export const cToF = (c: number): number => (c * 9) / 5 + 32;
export const fToC = (f: number): number => ((f - 32) * 5) / 9;

/**
 * NWS heat index in degrees Fahrenheit.
 *
 * Uses Steadman's simple form below 80 degF and the Rothfusz regression above
 * it, with the standard low- and high-humidity adjustments.
 *
 * @param tempF   Ambient air temperature, degrees Fahrenheit
 * @param rhPct   Relative humidity, 0-100
 */
export function heatIndexF(tempF: number, rhPct: number): number {
  const T = tempF;
  const RH = Math.min(100, Math.max(0, rhPct));

  // Steadman's approximation, averaged with the dry-bulb temperature.
  const simple = 0.5 * (T + 61.0 + (T - 68.0) * 1.2 + RH * 0.094);
  if ((simple + T) / 2 < 80) return round1(simple);

  let hi =
    -42.379 +
    2.04901523 * T +
    10.14333127 * RH -
    0.22475541 * T * RH -
    0.00683783 * T * T -
    0.05481717 * RH * RH +
    0.00122874 * T * T * RH +
    0.00085282 * T * RH * RH -
    0.00000199 * T * T * RH * RH;

  // Dry-air adjustment.
  if (RH < 13 && T >= 80 && T <= 112) {
    hi -= ((13 - RH) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
  }
  // Humid-air adjustment.
  if (RH > 85 && T >= 80 && T <= 87) {
    hi += ((RH - 85) / 10) * ((87 - T) / 5);
  }
  return round1(hi);
}

/** Convenience wrapper for Celsius inputs, returning Celsius. */
export function heatIndexC(tempC: number, rhPct: number): number {
  return round1(fToC(heatIndexF(cToF(tempC), rhPct)));
}

/* ------------------------------------------------------------------ */
/* Occupational thresholds                                             */
/* ------------------------------------------------------------------ */

/**
 * Trigger points from OSHA's proposed Heat Injury and Illness Prevention in
 * Outdoor and Indoor Work Settings rulemaking.
 *
 * No Federal Register or CFR citation appears here deliberately. We hold the
 * agent to never citing one because it has no tool that returns them, and the
 * same standard applies to the code: these thresholds were taken from the
 * rulemaking's published heat-index triggers, and an operator deploying this
 * should confirm them against the current text rather than trust a constant.
 *
 * This is a PROPOSED standard, not a finalised one. Theron cites it as the
 * operational basis for its thresholds and says so plainly — several state
 * plans (CA, OR, WA, MD) already enforce comparable or stricter limits.
 */
export const OSHA_HEAT_INDEX_F = {
  /** Water, shade, rest breaks and acclimatisation protocols required. */
  initial: 80,
  /** Mandatory rest breaks, monitoring and a heat emergency plan. */
  high: 90,
} as const;

export type RiskLevel = "safe" | "caution" | "high" | "extreme";

export interface RiskAssessment {
  level: RiskLevel;
  heatIndexF: number;
  /** The OSHA trigger crossed, if any. */
  trigger: "none" | "initial" | "high";
  /** One line a safety officer can act on without reading anything else. */
  guidance: string;
}

export function assessRisk(tempF: number, rhPct: number): RiskAssessment {
  const hi = heatIndexF(tempF, rhPct);

  if (hi >= 103) {
    return {
      level: "extreme",
      heatIndexF: hi,
      trigger: "high",
      guidance:
        "Extreme risk under OSHA's proposed heat standard (a proposed rule, not settled law). Heat stroke " +
        "is likely with prolonged exertion: suspend non-essential outdoor work, enforce shaded rest " +
        "breaks every hour, and monitor every worker actively.",
    };
  }
  if (hi >= OSHA_HEAT_INDEX_F.high) {
    return {
      level: "high",
      heatIndexF: hi,
      trigger: "high",
      guidance:
        "Above the high-heat trigger in OSHA's proposed heat standard (a proposed rule, not settled law). " +
        "Paid rest breaks, buddy-system monitoring, and a heat emergency plan apply.",
    };
  }
  if (hi >= OSHA_HEAT_INDEX_F.initial) {
    return {
      level: "caution",
      heatIndexF: hi,
      trigger: "initial",
      guidance:
        "Above the initial trigger in OSHA's proposed heat standard (a proposed rule, not settled law). " +
        "Provide cool drinking water, shaded break areas, and acclimatisation for new or returning workers.",
    };
  }
  return {
    level: "safe",
    heatIndexF: hi,
    trigger: "none",
    guidance: "Below the trigger thresholds in OSHA's proposed heat standard (a proposed rule, not settled law). " +
      "Standard precautions apply.",
  };
}

/**
 * Hours during which the heat index sits at or above a trigger — the figure
 * Theron reports as "exposure hours avoided" when it moves a shift.
 */
export function exposureHours(
  hourly: Array<{ tempF: number; rhPct: number }>,
  threshold: number = OSHA_HEAT_INDEX_F.high,
): number {
  return hourly.filter((h) => heatIndexF(h.tempF, h.rhPct) >= threshold).length;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
