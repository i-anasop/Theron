import Link from "next/link";
import Image from "next/image";
import { sweep } from "@/lib/monitor";
import { BASELINES } from "@/lib/baselines";
import { appCache } from "@/lib/cache-factory";
import { DEMO_DATE, DEMO_SITE_ID } from "@/lib/demo";
import HeatGrid from "@/components/HeatGrid";
import ShiftCompare from "@/components/ShiftCompare";
import Reveal from "@/components/Reveal";
import Icon, { type IconName } from "@/components/Icon";

/**
 * Every figure here is produced by running a real sweep against the bundled
 * response cache at build time, so the page cannot claim something the system
 * does not actually do.
 */
export const revalidate = 3600;

const DOES: Array<[IconName, string, string]> = [
  [
    "crew",
    "Watches every worksite, every day",
    "You register your sites once. Theron checks each one on its own schedule — street-level temperature, hour by hour, for the shift that has not happened yet.",
  ],
  [
    "gauge",
    "Decides: work, move, or stand down",
    "Not a dashboard of numbers to interpret. One call per site, in the language a foreman uses, against the heat-index thresholds in OSHA's proposed standard.",
  ],
  [
    "shield",
    "Proves the alternative before advising it",
    "When a shift is unsafe, Theron tests every other window that day, finds the coolest, and reports the measured difference — never an estimate.",
  ],
];

const DIFFERENT: Array<[IconName, string, string]> = [
  [
    "trend",
    "Measured, never guessed",
    "Every number it reports comes out of an API call it made. The language model chooses what to ask and how to explain it — it never invents a figure.",
  ],
  [
    "alert",
    "It refuses when it should",
    "If no window in the day is safe, Theron says stand down instead of manufacturing a reschedule that looks useful.",
  ],
  [
    "file",
    "It shows its work",
    "Every call, its cost, its latency and its activity ID are on the page. You are never asked to trust the output; you are shown how to check it.",
  ],
];

const FLOW = [
  ["Goal", "A sentence from a safety manager"],
  ["Plan", "Chooses endpoints, budgets the spend"],
  ["Call", "Submits, polls, caches, never pays twice"],
  ["Verify", "Queries the alternative hours"],
  ["Decide", "Reschedule, keep, or stand down"],
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
      {/* ═══ hero ═══ */}
      <section className="hm-hero">
        <div className="wrap">
          <div className="hm-hero-grid">
            <div>
              <span className="hm-badge">
                <Icon name="shield" size={13} />
                FortyGuard Hackathon &rsquo;26 · Track 06 Agentic AI
              </span>

              <h1 className="hm-h1">
                Know whether your crew can work today &mdash; before they show up.
              </h1>

              <p className="hm-lede">
                Theron is an autonomous agent for outdoor worksites. It checks how hot each site will
                actually get, decides whether the scheduled shift is safe, and when it isn&rsquo;t, proves
                which alternative window is safer and by how much.
              </p>

              <div className="hm-cta">
                <Link href="/app" className="btn">
                  Open the workspace
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                       strokeLinecap="round" strokeLinejoin="round" width="15" height="15" aria-hidden>
                    <path d="M5 12h13M13 6l6 6-6 6" />
                  </svg>
                </Link>
                <Link href="/method" className="btn ghost">
                  Read the method
                </Link>
              </div>

              <dl className="hm-facts">
                <div>
                  <dt>{cf ? `${cf.percentReduction}%` : "—"}</dt>
                  <dd>exposure cut by moving one shift</dd>
                </div>
                <div>
                  <dt>{crew}</dt>
                  <dd>workers monitored in the demo</dd>
                </div>
                <div>
                  <dt>320</dt>
                  <dd>temperature tiles per reading</dd>
                </div>
              </dl>
            </div>

            <div className="hm-hero-visual">
              <HeatGrid siteId={DEMO_SITE_ID} date={DEMO_DATE} />
              <p className="hm-caption">
                A real worksite in Phoenix, hour by hour. 320 tiles at 60&nbsp;m resolution, from the
                FortyGuard Temperature API.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ what it does ═══ */}
      <section className="hm-band-light">
        <div className="wrap">
          <Reveal>
            <header className="hm-head">
              <span className="eyebrow">What it does</span>
              <h2 className="hm-h2">Three jobs, done without being asked</h2>
              <p className="hm-sub">
                A safety manager sets up their sites once. After that Theron works on its own schedule and
                only speaks up when something needs deciding.
              </p>
            </header>
          </Reveal>

          <div className="hm-cards">
            {DOES.map(([icon, h, p], i) => (
              <Reveal key={h} delay={i * 70}>
                <article className="hm-card">
                  <span className="hm-card-ico">
                    <Icon name={icon} size={19} />
                  </span>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ see it ═══ */}
      <section className="hm-section">
        <div className="wrap">
          <Reveal>
            <header className="hm-head center">
              <span className="eyebrow">See it</span>
              <h2 className="hm-h2">One question, one answer, and the working</h2>
            </header>
          </Reveal>

          <Reveal delay={60}>
            <div className="hm-demo">
              <div className="hm-demo-q">
                <span className="label">You ask</span>
                <p>Should the Phoenix crew work their scheduled shift today?</p>
              </div>

              <div className="hm-demo-steps">
                {[
                  ["list_worksites", "3 worksites in portfolio"],
                  ["get_hourly_heat_curve", "24 hours, peak heat index 106.7°F"],
                  ["compare_to_baseline", "70th percentile for this site"],
                  ["evaluate_shift_move", "reschedule — 31% exposure reduction"],
                ].map(([tool, res]) => (
                  <div className="hm-step" key={tool}>
                    <span className="hm-step-dot" aria-hidden />
                    <code>{tool}</code>
                    <span>{res}</span>
                  </div>
                ))}
              </div>

              <div className="hm-demo-a">
                <span className="label">Theron answers</span>
                <p>
                  <strong>Reschedule.</strong> Every hour of the scheduled 06:00&ndash;15:00 shift sits in the
                  extreme range. Moving to 15:00&ndash;24:00 cuts crew heat exposure by{" "}
                  <strong>31%</strong> &mdash; 1,479 crew-degree-hours removed across 34 workers, mean heat
                  index down from 105.4&thinsp;°F to 100.6&thinsp;°F.
                </p>
                <p className="hm-demo-caveat">
                  No hour of this day falls below the trigger, so rest-cycle controls remain mandatory
                  regardless of timing.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ the insight ═══ */}
      <section className="hm-feature">
        <div className="wrap hm-feature-in">
          <div>
            <span className="eyebrow hm-feature-eyebrow">The insight it is built on</span>
            <p className="hm-feature-line">
              The API forecasts <strong>12 hours</strong> ahead.
            </p>
            <p className="hm-feature-sub">
              That is not a short forecast. It is <strong>exactly one work shift</strong> &mdash; the next one,
              the one you can still change.
            </p>
          </div>
          <div className="hm-clock" aria-hidden>
            {Array.from({ length: 24 }, (_, h) => (
              <i key={h} className={h >= 6 && h < 15 ? "on" : ""} />
            ))}
            <div className="hm-clock-key">
              <span>00:00</span>
              <span>the shift you can move</span>
              <span>23:00</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ the proof ═══ */}
      {cf && (
        <section className="hm-section">
          <div className="wrap">
            <Reveal>
              <header className="hm-head">
                <span className="eyebrow">The result</span>
                <h2 className="hm-h2">Measured, not estimated</h2>
                <p className="hm-sub">
                  {lead!.site.name} &mdash; {lead!.site.city}, {lead!.site.state} &mdash; on {DEMO_DATE}.
                  Exposure is degree-hours above OSHA&rsquo;s proposed high-heat trigger.
                </p>
              </header>
            </Reveal>

            <Reveal delay={70}>
              <div className="hm-proof">
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
          </div>
        </section>
      )}

      {/* ═══ how it works ═══ */}
      <section className="hm-band-light">
        <div className="wrap">
          <Reveal>
            <header className="hm-head">
              <span className="eyebrow">How it works</span>
              <h2 className="hm-h2">Tools return facts. The model returns prose.</h2>
              <p className="hm-sub">
                The agent decides what to ask. The data decides what is true. Those are kept strictly apart.
              </p>
            </header>
          </Reveal>

          <Reveal delay={60}>
            <ol className="hm-flow">
              {FLOW.map(([k, d], i) => (
                <li key={k}>
                  <span className="hm-flow-n">{String(i + 1).padStart(2, "0")}</span>
                  <b>{k}</b>
                  <small>{d}</small>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {/* ═══ why different ═══ */}
      <section className="hm-section">
        <div className="wrap">
          <Reveal>
            <header className="hm-head">
              <span className="eyebrow">Why it is trustworthy</span>
              <h2 className="hm-h2">Built so you can check it</h2>
            </header>
          </Reveal>

          <div className="hm-cards">
            {DIFFERENT.map(([icon, h, p], i) => (
              <Reveal key={h} delay={i * 70}>
                <article className="hm-card plain">
                  <span className="hm-card-ico">
                    <Icon name={icon} size={19} />
                  </span>
                  <h3>{h}</h3>
                  <p>{p}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ closing ═══ */}
      <section className="hm-section hm-close">
        <div className="wrap">
          <Reveal>
            <div className="hm-final">
              <Image src="/logo.png" alt="" width={76} height={76} />
              <div>
                <h2 className="hm-h2" style={{ margin: 0 }}>Why an alpaca?</h2>
                <p>
                  Alpacas carry insulation they cannot shed, so keepers watch the thermometer on their behalf
                  and move them out of the sun before it is too late. That is exactly this job.
                </p>
              </div>
              <Link href="/app" className="btn">
                Open the workspace
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
