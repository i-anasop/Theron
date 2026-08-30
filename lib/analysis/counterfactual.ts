/**
 * The counterfactual: don't recommend a shift change, prove one.
 *
 * Theron never asks a language model whether moving a shift would help. It
 * queries the alternative hours, computes the exposure both ways, and reports
 * the measured difference. The model's job is to decide what to ask and how
 * to explain the answer — never to invent the number.
 *
 * WHY DEGREE-HOURS
 * ----------------
 * Counting hours above the OSHA trigger is the obvious metric and it fails on
 * exactly the days that matter most. Measured at a Phoenix site in late
 * August, all 24 hours sat above the high-heat trigger — so every candidate
 * window scored an identical 9 exposure hours and the metric said "nothing
 * helps", while the actual mean heat index between the best and worst windows
 * differed by nearly 5 degF.
 *
 * Degree-hours — the integral of (heat index - threshold) across the shift —
 * measures how far over the line the crew is and for how long. It keeps
 * discriminating when the whole day is dangerous, and it is the shape of
 * exposure metric occupational hygiene already uses.
 */

import { OSHA_HEAT_INDEX_F } from "../heat/heatIndex";
import type { HourlyCurve, HourReading } from "./hourly";
import type { Worksite } from "../sites";

export interface ShiftWindow {
  startHour: number;
  endHour: number;
  label: string;
  meanHeatIndexF: number;
  peakHeatIndexF: number;
  /** Hours at or above the OSHA high-heat trigger. */
  exposureHours: number;
  /** Sum of (heat index - trigger) over the window, in degF-hours. */
  degreeHoursOverTrigger: number;
  hours: HourReading[];
}

export type Verdict = "reschedule" | "keep" | "stand_down";

export interface Counterfactual {
  site: string;
  date: string;
  current: ShiftWindow;
  proposed: ShiftWindow;
  verdict: Verdict;
  deltaPeakF: number;
  deltaMeanF: number;
  /** Positive means the proposal removes exposure. */
  degreeHoursAvoided: number;
  percentReduction: number;
  exposureHoursAvoided: number;
  /** Degree-hours avoided multiplied across the crew. */
  crewDegreeHoursAvoided: number;
  /** True when no window in the day drops below the trigger at any hour. */
  noSafeWindowExists: boolean;
  headline: string;
}

function windowOf(
  readings: HourReading[],
  start: number,
  length: number,
  threshold: number,
): ShiftWindow | null {
  const hours = readings.filter((r) => r.hourIndex >= start && r.hourIndex < start + length);
  if (hours.length < length) return null; // incomplete data — don't guess

  const his = hours.map((h) => h.heatIndexF);
  return {
    startHour: start,
    endHour: start + length,
    label: `${pad(start)}:00-${pad(start + length)}:00`,
    meanHeatIndexF: round1(his.reduce((a, b) => a + b, 0) / his.length),
    peakHeatIndexF: round1(Math.max(...his)),
    exposureHours: his.filter((h) => h >= threshold).length,
    degreeHoursOverTrigger: round1(his.reduce((sum, h) => sum + Math.max(0, h - threshold), 0)),
    hours,
  };
}

/**
 * Finds the least-exposed same-length window in the day's curve and compares
 * it against the shift as scheduled.
 */
export function findBestShift(
  curve: HourlyCurve,
  site: Worksite,
  options: { threshold?: number; minReductionPct?: number } = {},
): Counterfactual | null {
  const threshold = options.threshold ?? OSHA_HEAT_INDEX_F.high;
  const minReductionPct = options.minReductionPct ?? 10;

  const scheduledStart = Number(site.shift.start.slice(0, 2));
  const scheduledEnd = Number(site.shift.end.slice(0, 2));
  const length = scheduledEnd - scheduledStart;

  const current = windowOf(curve.readings, scheduledStart, length, threshold);
  if (!current) return null;

  const earliest = Math.min(...curve.readings.map((r) => r.hourIndex));
  const latest = Math.max(...curve.readings.map((r) => r.hourIndex)) + 1;

  let best = current;
  for (let start = earliest; start + length <= latest; start++) {
    const w = windowOf(curve.readings, start, length, threshold);
    if (w && w.degreeHoursOverTrigger < best.degreeHoursOverTrigger) best = w;
  }

  const degreeHoursAvoided = round1(current.degreeHoursOverTrigger - best.degreeHoursOverTrigger);
  const percentReduction =
    current.degreeHoursOverTrigger > 0
      ? Math.round((degreeHoursAvoided / current.degreeHoursOverTrigger) * 100)
      : 0;

  // If no hour anywhere in the day drops below the trigger, rescheduling can
  // reduce severity but cannot produce a safe shift. That is a different
  // recommendation, and saying so is the honest answer.
  const noSafeWindowExists = curve.readings.every((r) => r.heatIndexF >= threshold);

  const moved = best.startHour !== current.startHour;
  const materially = percentReduction >= minReductionPct && degreeHoursAvoided > 0;

  let verdict: Verdict;
  if (noSafeWindowExists && !materially) verdict = "stand_down";
  else if (moved && materially) verdict = "reschedule";
  else verdict = "keep";

  const crewDegreeHoursAvoided = Math.round(degreeHoursAvoided * site.crewSize);

  const headline =
    verdict === "reschedule"
      ? `Move the ${site.city} shift from ${current.label} to ${best.label}. Crew heat exposure falls from ` +
        `${current.degreeHoursOverTrigger} to ${best.degreeHoursOverTrigger} degF-hours above OSHA's proposed ` +
        `high-heat trigger — a ${percentReduction}% reduction, ${crewDegreeHoursAvoided} crew-degF-hours removed across ` +
        `${site.crewSize} workers. Mean heat index ${current.meanHeatIndexF} to ${best.meanHeatIndexF} degF.` +
        (noSafeWindowExists
          ? " Note: no hour of this day falls below the trigger, so rest-cycle controls remain mandatory."
          : "")
      : verdict === "stand_down"
        ? `No safe window exists at ${site.city} on ${curve.date}. Every hour of the day sits above OSHA's ` +
          `proposed high-heat trigger (best available window still carries ${best.degreeHoursOverTrigger} degF-hours of ` +
          `exposure). Rescheduling cannot fix this — escalate to mandatory rest cycles, crew rotation, or a ` +
          `stand-down for the ${site.crewSize}-worker crew.`
        : `Keep the ${site.city} shift at ${current.label}. The best alternative window saves only ` +
          `${degreeHoursAvoided} degF-hours (${percentReduction}%), below the threshold that justifies ` +
          `disrupting the schedule.`;

  return {
    site: site.id,
    date: curve.date,
    current,
    proposed: best,
    verdict,
    deltaPeakF: round1(best.peakHeatIndexF - current.peakHeatIndexF),
    deltaMeanF: round1(best.meanHeatIndexF - current.meanHeatIndexF),
    degreeHoursAvoided,
    percentReduction,
    exposureHoursAvoided: current.exposureHours - best.exposureHours,
    crewDegreeHoursAvoided,
    noSafeWindowExists,
    headline,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const round1 = (n: number) => Math.round(n * 10) / 10;
