import Link from "next/link";
import Image from "next/image";
import { sweep } from "@/lib/monitor";
import { BASELINES } from "@/lib/baselines";
import { appCache } from "@/lib/cache-factory";
import { DEMO_DATE, DEMO_SITE_ID } from "@/lib/demo";
import HeatChart from "@/components/HeatChart";
import HeatGrid from "@/components/HeatGrid";

/**
 * The landing page runs a real sweep against the bundled response cache, so
 * the headline numbers are computed rather than typed and cannot drift from
 * what the system actually produces.
 */
export const revalidate = 3600;

export default async function Home() {
  const result = await sweep({
    date: DEMO_DATE,
    baselines: BASELINES,
    cache: appCache(),
    offline: true,
    allowance: 400_000,
  });

  const lead = result.assessments.find((a) => a.counterfactual?.verdict === "reschedule");
  const cf = lead?.counterfactual;
  const crew = result.assessments.reduce((n, a) => n + a.site.crewSize, 0);

  const hours = cf
    ? [...cf.current.hours, ...cf.proposed.hours]
        .filter((h, i, arr) => arr.findIndex((x) => x.hourIndex === h.hourIndex) === i)
        .sort((a, b) => a.hourIndex - b.hourIndex)
    : [];

  return (
    <>
      <div className="wrap hero">
        <div className="eyebrow">FortyGuard Hackathon &rsquo;26 · Track 06 Agentic AI</div>
        <h1>
          It doesn&rsquo;t recommend a shift change. It <em>proves</em> one.
        </h1>
        <p className="lede">
          An autonomous agent for crews working outdoors in extreme heat. It tests every shift window in the
          day, finds the safest, and shows the measured difference.
        </p>
        <div className="hero-actions">
          <Link href="/console" className="btn">
            Open live console
          </Link>
          <Link href="/method" className="btn ghost">
            What we found in the API
          </Link>
        </div>
      </div>

      {/* the thermal field, front and centre */}
      <div className="wrap">
        <div className="showcase">
          <HeatGrid siteId={DEMO_SITE_ID} date={DEMO_DATE} />

          <div className="showcase-side">
            {cf && (
              <>
                <div className="big-stat">
                  <span className="label">Exposure avoided by moving one shift</span>
                  <div className="big-v">
                    {cf.percentReduction}
                    <small>%</small>
                  </div>
                  <p className="big-sub">
                    {cf.current.label} &rarr; {cf.proposed.label} · {cf.crewDegreeHoursAvoided.toLocaleString()}{" "}
                    crew-degree-hours removed
                  </p>
                </div>

                <HeatChart
                  id="hero"
                  hours={hours}
                  shiftStart={cf.current.startHour}
                  shiftEnd={cf.current.endHour}
                  proposedStart={cf.proposed.startHour}
                  proposedEnd={cf.proposed.endHour}
                  height={112}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* numbers */}
      <div className="wrap" style={{ marginTop: 16 }}>
        <div className="stats">
          <div className="stat">
            <span className="label">Peak heat index</span>
            <div className="v" style={{ color: "var(--high)" }}>
              {cf?.current.peakHeatIndexF ?? "—"}
              <small>°F</small>
            </div>
            <div className="foot">worst hour of the scheduled shift</div>
          </div>
          <div className="stat">
            <span className="label">Workers covered</span>
            <div className="v">{crew}</div>
            <div className="foot">{result.assessments.length} monitored worksites</div>
          </div>
          <div className="stat">
            <span className="label">Tiles per reading</span>
            <div className="v">320</div>
            <div className="foot">60 m resolution across the site</div>
          </div>
          <div className="stat lead">
            <span className="label">Credits to run this page</span>
            <div className="v">{result.creditsSpent}</div>
            <div className="foot">{result.trail.length} calls, all served from cache</div>
          </div>
        </div>
      </div>

      {/* the thesis — one line, not a paragraph */}
      <section className="wrap">
        <div className="thesis">
          <div className="eyebrow">The insight</div>
          <p>
            The API forecasts <strong>12 hours</strong> ahead. Read as weather, that&rsquo;s a limitation. Read
            as operations, it is <strong>exactly one work shift</strong> &mdash; the next one, the one you can
            still change.
          </p>
        </div>
      </section>

      {/* how it works — terse */}
      <section className="wrap" style={{ paddingTop: 0 }}>
        <div className="sec-head">
          <div className="eyebrow">How it works</div>
          <h2>Tools return facts. The model returns prose.</h2>
        </div>

        <div className="grid-3">
          {[
            ["Plans, then spends", "Checks its credit budget before choosing endpoints. The budget refuses a call before it happens."],
            ["Compares like with like", "Ranks today against this site's own history since 2022, because crews acclimatise."],
            ["Verifies before advising", "Queries the alternative hours and measures the difference. No measurement, no recommendation."],
            ["Refuses when it should", "When every hour is over the trigger, it says stand down instead of inventing a reschedule."],
            ["Screens before drilling", "Triage costs 2 API calls. The full curve costs 24. Only flagged sites get the expensive one."],
            ["Shows its work", "Every call, cost, latency and activity ID rendered on the page."],
          ].map(([h, p], i) => (
            <div key={h} className="card feature">
              <div className="n">{String(i + 1).padStart(2, "0")}</div>
              <h3>{h}</h3>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* mark */}
      <section className="wrap" style={{ paddingTop: 0 }}>
        <div className="card alpaca">
          <Image src="/logo.png" alt="" width={80} height={80} />
          <div>
            <h2>Why an alpaca?</h2>
            <p>
              Alpacas carry insulation they cannot shed, so keepers watch the thermometer on their behalf and
              move them out of the sun before it is too late. That is exactly this job.
            </p>
          </div>
          <Link href="/console" className="btn">
            See it run
          </Link>
        </div>
      </section>
    </>
  );
}
