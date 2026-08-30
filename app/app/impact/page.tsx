"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Icon, { type IconName } from "@/components/Icon";

/**
 * Turns measured heat exposure into the language a safety manager budgets in.
 *
 * The split is the honest part: Theron supplies the PHYSICAL quantity it
 * measured — degree-hours above the OSHA trigger, from real API calls — and
 * the reader supplies the ECONOMICS, because loaded labour rates and incident
 * costs are specific to a business and we will not invent them.
 *
 * Every assumption is a visible control rather than a constant buried in a
 * headline. A model whose inputs you cannot see is a model you cannot defend.
 */

/* Measured at Roosevelt Row, Phoenix AZ, 2026-08-28. See /method. */
const MEASURED = {
  site: "Roosevelt Row Mixed-Use, Phoenix AZ",
  exposureHours: 9,
  degreeHoursNow: 138.5,
  degreeHoursMoved: 95,
  percentReduction: 31,
};

const REDUCTION = 1 - MEASURED.degreeHoursMoved / MEASURED.degreeHoursNow;

interface Input {
  key: string;
  label: string;
  icon: IconName;
  value: number;
  set: (n: number) => void;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
}

const money0 = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function Impact() {
  const [crew, setCrew] = useState(34);
  const [rate, setRate] = useState(48);
  const [days, setDays] = useState(60);
  const [lossPct, setLossPct] = useState(18);
  const [incidentRate, setIncidentRate] = useState(1.2);
  const [incidentCost, setIncidentCost] = useState(42000);

  const inputs: Input[] = [
    { key: "crew", label: "Crew size", icon: "crew", value: crew, set: setCrew, min: 1, max: 400, step: 1, suffix: "workers" },
    { key: "rate", label: "Loaded hourly cost", icon: "wage", value: rate, set: setRate, min: 15, max: 200, step: 1, prefix: "$", suffix: "/hr" },
    { key: "days", label: "High-heat days", icon: "calendar", value: days, set: setDays, min: 1, max: 180, step: 1, suffix: "per season" },
    { key: "loss", label: "Output loss in heat", icon: "gauge", value: lossPct, set: setLossPct, min: 0, max: 60, step: 1, suffix: "%" },
    { key: "rate2", label: "Incidents / 1,000 crew-hrs", icon: "alert", value: incidentRate, set: setIncidentRate, min: 0, max: 10, step: 0.1, suffix: "%" },
    { key: "cost", label: "Cost per incident", icon: "receipt", value: incidentCost, set: setIncidentCost, min: 0, max: 300000, step: 1000, prefix: "$" },
  ];

  const calc = useMemo(() => {
    const crewHoursPerDay = MEASURED.exposureHours * crew;
    const crewHours = crewHoursPerDay * days;

    const prodNow = crewHours * rate * (lossPct / 100);
    const prodSaved = prodNow * REDUCTION;

    const incidents = (crewHours / 1000) * (incidentRate / 100);
    const incNow = incidents * incidentCost;
    const incSaved = incNow * REDUCTION;

    // Cumulative curve across the season, for the chart.
    const perDayNow = (prodNow + incNow) / Math.max(1, days);
    const perDayNew = perDayNow * (1 - REDUCTION);
    const series = Array.from({ length: days + 1 }, (_, d) => ({
      d,
      now: perDayNow * d,
      next: perDayNew * d,
    }));

    return {
      crewHours,
      prodNow,
      prodSaved,
      incNow,
      incSaved,
      incidents,
      totalNow: prodNow + incNow,
      totalSaved: prodSaved + incSaved,
      series,
    };
  }, [crew, rate, days, lossPct, incidentRate, incidentCost]);

  /* chart geometry */
  const W = 520;
  const H = 190;
  const maxY = Math.max(1, calc.series[calc.series.length - 1].now);
  const px = (d: number) => (d / Math.max(1, days)) * W;
  const py = (v: number) => H - (v / maxY) * H;

  const lineNow = calc.series.map((p, i) => `${i ? "L" : "M"}${px(p.d).toFixed(1)},${py(p.now).toFixed(1)}`).join(" ");
  const lineNew = calc.series.map((p, i) => `${i ? "L" : "M"}${px(p.d).toFixed(1)},${py(p.next).toFixed(1)}`).join(" ");
  const gap = `${lineNow} L${px(days).toFixed(1)},${py(calc.series[days].next).toFixed(1)} ${calc.series
    .slice()
    .reverse()
    .map((p) => `L${px(p.d).toFixed(1)},${py(p.next).toFixed(1)}`)
    .join(" ")} Z`;

  return (
    <div className="wrap" style={{ paddingTop: 46, paddingBottom: 24 }}>
      <div className="narrow">
        <div className="eyebrow">Impact</div>
        <h1 className="page-h1">What one rescheduled shift is worth</h1>
        <p className="page-lede">
          Theron measures the exposure. You supply the economics. Every assumption below is yours to change.
        </p>
      </div>

      <div className="impact-grid">
        {/* ── controls ── */}
        <aside className="panel">
          <div className="panel-head">
            <span className="label">Your assumptions</span>
          </div>
          <div className="fields">
            {inputs.map((f) => (
              <div className="field" key={f.key}>
                <div className="field-top">
                  <span className="field-label">
                    <Icon name={f.icon} size={15} />
                    {f.label}
                  </span>
                  <span className="field-val">
                    {f.prefix}
                    {f.value.toLocaleString()}
                    {f.suffix && <small>{f.suffix}</small>}
                  </span>
                </div>
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={f.value}
                  onChange={(e) => f.set(Number(e.target.value))}
                  aria-label={f.label}
                />
              </div>
            ))}
          </div>
        </aside>

        {/* ── results ── */}
        <div className="results">
          <div className="headline-card">
            <div>
              <span className="label">Recovered per season, one site</span>
              <div className="headline-v">{money0(calc.totalSaved)}</div>
              <p className="headline-sub">
                from {money0(calc.totalNow)} that heat currently costs at this site
              </p>
            </div>
            <div className="headline-badge">
              <Icon name="trend" size={18} />
              &minus;{MEASURED.percentReduction}%
            </div>
          </div>

          <div className="panel chart-card">
            <div className="panel-head">
              <span className="label">Cumulative cost across the season</span>
              <span className="chart-key-inline">
                <i className="k now" /> as scheduled
                <i className="k next" /> with Theron
              </span>
            </div>
            <div className="chart-body">
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
                   aria-label={`Cumulative heat cost over ${days} days`}>
                <defs>
                  <linearGradient id="gapfill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--cobalt)" stopOpacity=".22" />
                    <stop offset="100%" stopColor="var(--cobalt)" stopOpacity=".04" />
                  </linearGradient>
                </defs>
                {[0.25, 0.5, 0.75].map((t) => (
                  <line key={t} x1="0" y1={H * t} x2={W} y2={H * t}
                        stroke="var(--rule)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                ))}
                <path d={gap} fill="url(#gapfill)" />
                <path d={lineNow} fill="none" stroke="var(--extreme)" strokeWidth="2"
                      vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                <path d={lineNew} fill="none" stroke="var(--cobalt)" strokeWidth="2"
                      vectorEffect="non-scaling-stroke" strokeLinecap="round" />
              </svg>
              <div className="chart-axis">
                <span>day 1</span>
                <span className="chart-gap-label">{money0(calc.totalSaved)} gap</span>
                <span>day {days}</span>
              </div>
            </div>
          </div>

          <div className="split-cards">
            <div className="panel mini">
              <span className="label">
                <Icon name="gauge" size={14} /> Productivity
              </span>
              <div className="mini-v">{money0(calc.prodSaved)}</div>
              <p className="mini-sub">
                of {money0(calc.prodNow)} lost across{" "}
                {Math.round(calc.crewHours).toLocaleString()} crew-hours over the trigger
              </p>
            </div>
            <div className="panel mini">
              <span className="label">
                <Icon name="shield" size={14} /> Incident exposure
              </span>
              <div className="mini-v">{money0(calc.incSaved)}</div>
              <p className="mini-sub">
                {calc.incidents.toFixed(1)} expected incidents at current scheduling
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── the fixed half ── */}
      <div className="measured-strip">
        <div className="measured-item">
          <Icon name="clock" size={18} />
          <div>
            <span className="label">Measured exposure</span>
            <b>{MEASURED.degreeHoursNow} &deg;F&middot;h</b>
          </div>
        </div>
        <div className="measured-arrow" aria-hidden>&rarr;</div>
        <div className="measured-item">
          <Icon name="trend" size={18} />
          <div>
            <span className="label">Best window found</span>
            <b>{MEASURED.degreeHoursMoved} &deg;F&middot;h</b>
          </div>
        </div>
        <div className="measured-note">
          Fixed, not adjustable &mdash; these came from the API at {MEASURED.site}.{" "}
          <Link href="/method">How it was measured &rarr;</Link>
        </div>
      </div>

      {/* ── why buy ── */}
      <section style={{ paddingTop: 46 }}>
        <div className="sec-head">
          <div className="eyebrow">Why it gets bought</div>
          <h2>Three reasons a safety manager signs</h2>
        </div>
        <div className="grid-3">
          {(
            [
              ["file", "The obligation is arriving", "OSHA's proposed heat standard sets explicit heat-index triggers, and several state plans already enforce stricter limits."],
              ["shield", "Defensibility is the product", "After an incident the question is what you knew and when. Theron leaves a timestamped record of the conditions, the decision, and the data behind it."],
              ["receipt", "It costs almost nothing to run", "Triage screens a site for two API calls. A daily portfolio sweep costs less than an hour of one worker's time."],
            ] as Array<[IconName, string, string]>
          ).map(([icon, h, p]) => (
            <div key={h} className="card feature">
              <div className="n">
                <Icon name={icon} size={16} />
              </div>
              <h3>{h}</h3>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="callout" style={{ marginTop: 8 }}>
        <b>What this is not.</b> A transparent arithmetic model, not a study. It multiplies one measured
        physical quantity by assumptions you supplied. The value is that the measured half is real and
        auditable, and none of it is hidden.
      </div>
    </div>
  );
}
