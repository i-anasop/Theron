"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

/**
 * Turns measured heat exposure into the language a safety manager budgets in.
 *
 * The honest split matters here: Theron supplies the PHYSICAL quantity it
 * actually measured (degree-hours and exposure hours above the OSHA trigger,
 * from real API calls). The reader supplies the ECONOMICS, because loaded
 * labour rates, incident costs and productivity impacts are specific to a
 * business and we will not invent them.
 *
 * Every assumption below is visible and editable rather than baked into a
 * headline. A model whose inputs you cannot see is a model you cannot defend
 * to a CFO.
 */

/* Measured at Roosevelt Row, Phoenix AZ, 2026-08-28 — see /method. */
const MEASURED = {
  site: "Roosevelt Row Mixed-Use, Phoenix AZ",
  crewSize: 34,
  shiftHours: 9,
  exposureHoursNow: 9,
  degreeHoursNow: 138.5,
  degreeHoursMoved: 95,
  percentReduction: 31,
};

function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function Impact() {
  const [crew, setCrew] = useState(MEASURED.crewSize);
  const [rate, setRate] = useState(48);
  const [days, setDays] = useState(60);
  const [lossPct, setLossPct] = useState(18);
  const [incidentRate, setIncidentRate] = useState(1.2);
  const [incidentCost, setIncidentCost] = useState(42000);

  const calc = useMemo(() => {
    const reduction = 1 - MEASURED.degreeHoursMoved / MEASURED.degreeHoursNow;

    // Productivity: crew-hours worked above the trigger, discounted by the
    // assumed output loss while working in high heat.
    const crewHoursNow = MEASURED.exposureHoursNow * crew * days;
    const productivityLossNow = crewHoursNow * rate * (lossPct / 100);
    const productivitySaved = productivityLossNow * reduction;

    // Incident exposure: scaled by crew-hours above the trigger.
    const incidentsNow = (crewHoursNow / 1000) * (incidentRate / 100);
    const incidentCostNow = incidentsNow * incidentCost;
    const incidentSaved = incidentCostNow * reduction;

    return {
      reduction,
      crewHoursNow,
      productivityLossNow,
      productivitySaved,
      incidentsNow,
      incidentCostNow,
      incidentSaved,
      total: productivitySaved + incidentSaved,
    };
  }, [crew, rate, days, lossPct, incidentRate, incidentCost]);

  const field = (
    label: string,
    value: number,
    setter: (n: number) => void,
    opts: { min: number; max: number; step: number; prefix?: string; suffix?: string; help: string },
  ) => (
    <div className="card" style={{ padding: "16px 18px" }}>
      <label className="label" style={{ display: "block" }}>
        {label}
      </label>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
        {opts.prefix && <span style={{ color: "var(--ink-3)", fontSize: ".95rem" }}>{opts.prefix}</span>}
        <input
          type="number"
          value={value}
          min={opts.min}
          max={opts.max}
          step={opts.step}
          onChange={(e) => setter(Number(e.target.value))}
          style={{
            width: "100%",
            border: 0,
            background: "transparent",
            color: "var(--ink)",
            fontSize: "1.5rem",
            fontWeight: 650,
            letterSpacing: "-.035em",
            fontVariantNumeric: "tabular-nums",
            padding: 0,
            fontFamily: "inherit",
          }}
        />
        {opts.suffix && <span style={{ color: "var(--ink-3)", fontSize: ".9rem" }}>{opts.suffix}</span>}
      </div>
      <input
        type="range"
        value={value}
        min={opts.min}
        max={opts.max}
        step={opts.step}
        onChange={(e) => setter(Number(e.target.value))}
        style={{ width: "100%", marginTop: 10, accentColor: "var(--cobalt)" }}
        aria-label={label}
      />
      <p style={{ margin: "8px 0 0", fontSize: ".78rem", color: "var(--ink-3)", lineHeight: 1.5 }}>{opts.help}</p>
    </div>
  );

  return (
    <div className="wrap" style={{ paddingTop: 52 }}>
      <div className="narrow">
        <div className="eyebrow">Impact</div>
        <h1
          style={{
            margin: "14px 0 0",
            fontSize: "2.2rem",
            fontWeight: 670,
            letterSpacing: "-.038em",
            lineHeight: 1.1,
          }}
        >
          What one rescheduled shift is worth
        </h1>
        <p style={{ margin: "18px 0 0", fontSize: "1.04rem", color: "var(--ink-2)", lineHeight: 1.68 }}>
          Theron measures the physical quantity: how far over the OSHA high-heat trigger a crew sits, and for
          how long. What that exposure <em>costs</em> depends on your business, so those numbers are yours to
          set. Everything below recalculates live.
        </p>
      </div>

      <div className="callout" style={{ marginTop: 30 }}>
        <b>Measured input, fixed.</b> At {MEASURED.site}, Theron measured{" "}
        <b>{MEASURED.degreeHoursNow} °F·hours</b> of exposure above the trigger across the scheduled{" "}
        {MEASURED.shiftHours}-hour shift, falling to <b>{MEASURED.degreeHoursMoved}</b> in the best alternative
        window — a <b>{MEASURED.percentReduction}% reduction</b>. That figure came from the API and is not
        adjustable here. <Link href="/method">See how it was measured →</Link>
      </div>

      <section style={{ paddingBottom: 24 }}>
        <div className="sec-head">
          <h2>Your assumptions</h2>
          <p>Defaults are placeholders, not claims. Replace them with your own figures.</p>
        </div>

        <div className="grid-3">
          {field("Crew size", crew, setCrew, {
            min: 1,
            max: 500,
            step: 1,
            suffix: "workers",
            help: "Workers exposed during the shift at this site.",
          })}
          {field("Loaded hourly cost", rate, setRate, {
            min: 15,
            max: 200,
            step: 1,
            prefix: "$",
            suffix: "/hr",
            help: "Wage plus burden — insurance, equipment, overhead.",
          })}
          {field("High-heat days per season", days, setDays, {
            min: 1,
            max: 200,
            step: 1,
            suffix: "days",
            help: "Days this site crosses the trigger. Phoenix runs far higher than most.",
          })}
          {field("Output loss in high heat", lossPct, setLossPct, {
            min: 0,
            max: 60,
            step: 1,
            suffix: "%",
            help: "Productivity lost while working above the trigger. Set from your own records.",
          })}
          {field("Heat incidents per 1,000 crew-hours", incidentRate, setIncidentRate, {
            min: 0,
            max: 10,
            step: 0.1,
            suffix: "%",
            help: "Your recordable heat-illness rate for exposed hours.",
          })}
          {field("Cost per heat incident", incidentCost, setIncidentCost, {
            min: 0,
            max: 500000,
            step: 1000,
            prefix: "$",
            help: "Claim, lost time, investigation, and citation exposure combined.",
          })}
        </div>
      </section>

      <section style={{ paddingTop: 0 }}>
        <div className="sec-head">
          <h2>What Theron recovers</h2>
          <p>
            Applying the measured {MEASURED.percentReduction}% exposure reduction to your figures, across one
            season at one site.
          </p>
        </div>

        <div className="stats">
          <div className="stat">
            <span className="label">Crew-hours above trigger</span>
            <div className="v">{Math.round(calc.crewHoursNow).toLocaleString()}</div>
            <div className="foot">as currently scheduled, per season</div>
          </div>
          <div className="stat">
            <span className="label">Productivity recovered</span>
            <div className="v">{money(calc.productivitySaved)}</div>
            <div className="foot">of {money(calc.productivityLossNow)} lost to heat today</div>
          </div>
          <div className="stat">
            <span className="label">Incident exposure avoided</span>
            <div className="v">{money(calc.incidentSaved)}</div>
            <div className="foot">
              {calc.incidentsNow.toFixed(1)} expected incidents at current scheduling
            </div>
          </div>
          <div className="stat lead">
            <span className="label">Total, one site, one season</span>
            <div className="v">{money(calc.total)}</div>
            <div className="foot">from moving shifts Theron already identified</div>
          </div>
        </div>

        <div className="callout" style={{ marginTop: 22 }}>
          <b>What this is not.</b> This is a transparent arithmetic model, not a study. It multiplies one
          measured physical quantity by assumptions you supplied. Its value is that the measured half is real
          and auditable — most heat-risk tools cannot show you even that much, and none of the numbers here
          are hidden inside a black box.
        </div>
      </section>

      <section style={{ paddingTop: 0 }}>
        <div className="sec-head">
          <h2>Why a safety manager buys this</h2>
        </div>
        <div className="grid-3">
          <div className="card feature">
            <div className="n">01</div>
            <h3>The obligation is arriving</h3>
            <p>
              OSHA&rsquo;s proposed heat injury and illness prevention standard sets explicit heat-index
              triggers. Several state plans already enforce comparable or stricter limits. This is a
              compliance requirement forming in real time, not a hypothetical.
            </p>
          </div>
          <div className="card feature">
            <div className="n">02</div>
            <h3>Defensibility is the product</h3>
            <p>
              After an incident, the question is what you knew and when. Theron produces a timestamped record
              of the conditions, the decision, and the data behind it — automatically, for every site, every
              day.
            </p>
          </div>
          <div className="card feature">
            <div className="n">03</div>
            <h3>It costs almost nothing to run</h3>
            <p>
              Two-stage triage screens a site for two API calls. A daily portfolio sweep is cheaper than a
              single hour of the crew&rsquo;s time — and cached results mean re-asking never costs anything.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
