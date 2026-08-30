import type { Counterfactual } from "@/lib/analysis/counterfactual";
import type { HourReading } from "@/lib/analysis/hourly";

/**
 * The hero visual: Theron's own decision screen, framed.
 *
 * Rendered on the server from the same sweep that drives the rest of the page,
 * so it is the product rather than a picture of one — the verdict, the windows
 * and every figure are the real output for that worksite on that date.
 *
 * Deliberately still. The two ambient animations that preceded this one moved
 * without telling anyone anything; a landing hero has about two seconds to
 * answer "what is this", and a screenshot of the working product answers it
 * faster than any motion can.
 */

const RISK_CLASS: Record<string, string> = {
  safe: "pw-safe",
  caution: "pw-caution",
  high: "pw-high",
  extreme: "pw-extreme",
};

const VERDICT_TEXT: Record<string, string> = {
  reschedule: "Move the shift",
  stand_down: "Stand down",
  keep: "Safe as scheduled",
};

export default function ProductWindow({
  siteName,
  city,
  state,
  crewSize,
  cf,
  hours,
}: {
  siteName: string;
  city: string;
  state: string;
  crewSize: number;
  cf: Counterfactual;
  hours: HourReading[];
}) {
  const peak = Math.max(...hours.map((h) => h.heatIndexF));
  const floor = Math.min(...hours.map((h) => h.heatIndexF));
  const span = Math.max(1, peak - floor);

  return (
    <div className="pw" aria-label="Theron decision screen">
      {/* window chrome */}
      <div className="pw-bar">
        <span className="pw-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="pw-url">theron-ops.vercel.app/app</span>
      </div>

      <div className="pw-body">
        {/* site header */}
        <div className="pw-site">
          <div>
            <h3>{siteName}</h3>
            <p>
              {city}, {state} · {crewSize} crew · shift {cf.current.label}
            </p>
          </div>
          <span className="pw-live" aria-hidden>
            <i />
            monitoring
          </span>
        </div>

        {/* the decision */}
        <div className={`pw-verdict pw-v-${cf.verdict}`}>
          <span className="pw-verdict-label">Decision</span>
          <strong>{VERDICT_TEXT[cf.verdict] ?? cf.verdict}</strong>
          {cf.verdict === "reschedule" && (
            <span className="pw-move">
              {cf.current.label}
              <em aria-hidden>→</em>
              <b>{cf.proposed.label}</b>
            </span>
          )}
        </div>

        {/* hourly strip */}
        <div className="pw-strip" aria-hidden>
          {hours.map((h) => {
            const inShift = h.hourIndex >= cf.current.startHour && h.hourIndex < cf.current.endHour;
            const inNew = h.hourIndex >= cf.proposed.startHour && h.hourIndex < cf.proposed.endHour;
            const pct = 26 + ((h.heatIndexF - floor) / span) * 74;
            return (
              <span key={h.hourIndex} className="pw-hr" title={`${h.hour} — ${h.heatIndexF}°F`}>
                <i className={RISK_CLASS[h.risk] ?? "pw-safe"} style={{ height: `${pct}%` }} />
                <u className={inNew ? "new" : inShift ? "old" : ""} />
              </span>
            );
          })}
        </div>
        <div className="pw-strip-key">
          <span>00:00</span>
          <span>hourly heat index</span>
          <span>23:00</span>
        </div>

        {/* numbers */}
        <div className="pw-metrics">
          <div>
            <span>Peak</span>
            <b className="hot">{cf.current.peakHeatIndexF}&deg;F</b>
          </div>
          <div>
            <span>Exposure now</span>
            <b>{cf.current.degreeHoursOverTrigger}</b>
          </div>
          <div>
            <span>If moved</span>
            <b className="good">{cf.proposed.degreeHoursOverTrigger}</b>
          </div>
          <div className="lead">
            <span>Reduction</span>
            <b>&minus;{cf.percentReduction}%</b>
          </div>
        </div>
      </div>
    </div>
  );
}
