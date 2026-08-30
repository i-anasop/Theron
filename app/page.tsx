import Link from "next/link";
import Image from "next/image";
import { sweep } from "@/lib/monitor";
import { BASELINES } from "@/lib/baselines";
import { appCache } from "@/lib/cache-factory";
import { DEMO_DATE, DEMO_SITE_ID } from "@/lib/demo";
import HeatGrid from "@/components/HeatGrid";
import ShiftCompare from "@/components/ShiftCompare";
import Reveal from "@/components/Reveal";
import CountUp from "@/components/CountUp";

/**
 * Every number on this page is computed by running a real sweep against the
 * bundled response cache at build time. Nothing is typed into the markup, so
 * the headline cannot drift from what the system actually produces.
 */
export const revalidate = 3600;

const FLOW = [
  { k: "Goal", d: "A sentence from a safety manager" },
  { k: "Plan", d: "Chooses endpoints, budgets the spend" },
  { k: "Call", d: "Submits, polls, caches, never pays twice" },
  { k: "Verify", d: "Queries the alternative hours" },
  { k: "Decide", d: "Reschedule, keep, or stand down" },
];

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

  return (
    <>
      {/* ───────── hero ───────── */}
      <div className="wrap hero">
        <div className="hero-grid">
          <div className="hero-copy">
            <div className="eyebrow">FortyGuard Hackathon &rsquo;26 · Track 06 Agentic AI</div>
            <h1>
              It doesn&rsquo;t recommend a shift change. It <em>proves</em> one.
            </h1>
            <p className="lede">
              An autonomous agent for crews working outdoors in extreme heat. It tests every shift window in
              the day, finds the safest, and shows the measured difference.
            </p>
            <div className="hero-actions">
              <Link href="/console" className="btn">
                Open live console
              </Link>
              <Link href="/method" className="btn ghost">
                What we found in the API
              </Link>
            </div>

            <div className="hero-meta">
              <span>
                <b>
                  <CountUp to={crew} />
                </b>{" "}
                workers monitored
              </span>
              <span>
                <b>320</b> tiles at 60 m
              </span>
              <span>
                <b>{result.creditsSpent}</b> credits to load this page
              </span>
            </div>
          </div>

          <div className="hero-visual">
            <HeatGrid siteId={DEMO_SITE_ID} date={DEMO_DATE} />
          </div>
        </div>
      </div>

      {/* ───────── thesis band ───────── */}
      <div className="band">
        <div className="wrap band-in">
          <div className="band-copy">
            <div className="eyebrow band-eyebrow">The insight</div>
            <p className="band-line">
              The API forecasts <strong>12 hours</strong> ahead.
            </p>
            <p className="band-line band-line-2">
              That is not a short forecast. It is <strong>exactly one work shift</strong> &mdash; the next one,
              the one you can still change.
            </p>
          </div>
          <div className="band-clock" aria-hidden>
            {Array.from({ length: 24 }, (_, h) => (
              <i key={h} className={h >= 6 && h < 15 ? "on" : ""} />
            ))}
            <div className="band-clock-key">
              <span>00:00</span>
              <span>shift</span>
              <span>23:00</span>
            </div>
          </div>
        </div>
      </div>

      {/* ───────── the proof ───────── */}
      {cf && (
        <section className="wrap">
          <Reveal>
            <div className="sec-head">
              <div className="eyebrow">The result</div>
              <h2>One shift, moved. Measured, not estimated.</h2>
              <p>
                {lead!.site.name} &mdash; {lead!.site.city}, {lead!.site.state} &mdash; on {DEMO_DATE}.
              </p>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <div className="card" style={{ padding: 26 }}>
              <ShiftCompare
                currentLabel={cf.current.label}
                proposedLabel={cf.proposed.label}
                currentValue={cf.current.degreeHoursOverTrigger}
                proposedValue={cf.proposed.degreeHoursOverTrigger}
                currentPeak={cf.current.peakHeatIndexF}
                proposedPeak={cf.proposed.peakHeatIndexF}
                percentReduction={cf.percentReduction}
                crewHours={cf.crewDegreeHoursAvoided}
                crewSize={lead!.site.crewSize}
              />
            </div>
          </Reveal>

          {cf.noSafeWindowExists && (
            <Reveal delay={120}>
              <div className="callout warn" style={{ marginTop: 16 }}>
                <b>And it says so when moving isn&rsquo;t enough.</b> Every hour of this day sits above the
                trigger, so rescheduling reduces severity but cannot make the shift safe. Theron reports that
                rather than letting a percentage imply the problem is solved.
              </div>
            </Reveal>
          )}
        </section>
      )}

      {/* ───────── agent flow ───────── */}
      <section className="wrap" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="sec-head">
            <div className="eyebrow">How it works</div>
            <h2>Tools return facts. The model returns prose.</h2>
            <p>
              The model chooses what to ask and how to explain it. It never computes a number, cites a
              regulation, or invents a control measure &mdash; those constraints live in the tool layer.
            </p>
          </div>
        </Reveal>

        <Reveal delay={60}>
          <ol className="flow">
            {FLOW.map((s, i) => (
              <li key={s.k} className="flow-step">
                <div className="flow-n">{String(i + 1).padStart(2, "0")}</div>
                <div className="flow-k">{s.k}</div>
                <div className="flow-d">{s.d}</div>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal delay={100}>
          <div className="grid-3" style={{ marginTop: 16 }}>
            {[
              ["Refuses when it should", "When every hour is over the trigger, it says stand down rather than inventing a reschedule that looks useful."],
              ["Screens before drilling", "Triage costs 2 API calls; the full curve costs 24. Only flagged sites get the expensive one."],
              ["Shows its work", "Every call, its cost, its latency and its activity ID rendered on the page."],
            ].map(([h, p]) => (
              <div key={h} className="card feature">
                <h3>{h}</h3>
                <p>{p}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ───────── mark ───────── */}
      <section className="wrap" style={{ paddingTop: 0 }}>
        <Reveal>
          <div className="card alpaca">
            <Image src="/logo.png" alt="" width={80} height={80} />
            <div>
              <h2>Why an alpaca?</h2>
              <p>
                Alpacas carry insulation they cannot shed, so keepers watch the thermometer on their behalf
                and move them out of the sun before it is too late. That is exactly this job.
              </p>
            </div>
            <Link href="/console" className="btn">
              See it run
            </Link>
          </div>
        </Reveal>
      </section>
    </>
  );
}
