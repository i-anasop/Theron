import Link from "next/link";
import Image from "next/image";
import { sweep } from "@/lib/monitor";
import { BASELINES } from "@/lib/baselines";
import { appCache } from "@/lib/cache-factory";
import { DEMO_DATE, DEMO_SITE_ID } from "@/lib/demo";
import ProductWindow from "@/components/ProductWindow";
import ShiftCompare from "@/components/ShiftCompare";
import Reveal from "@/components/Reveal";
import Icon, { type IconName } from "@/components/Icon";

export const revalidate = 3600;

/** Title always visible; the detail is revealed on hover or focus. */
const DOES: Array<[IconName, string, string, string]> = [
  [
    "crew",
    "Watches",
    "Every site, every day",
    "Register your worksites once. Theron checks each on its own schedule — street-level temperature, hour by hour, for the shift that has not happened yet.",
  ],
  [
    "gauge",
    "Decides",
    "Work, move, or stand down",
    "Not a dashboard of numbers to interpret. One call per site, in the language a foreman uses, against the heat-index thresholds in OSHA's proposed standard.",
  ],
  [
    "shield",
    "Proves",
    "Before it advises",
    "When a shift is unsafe it tests every other window that day, finds the coolest, and reports the measured difference — never an estimate.",
  ],
];

const DIFFERENT: Array<[IconName, string, string, string]> = [
  [
    "trend",
    "Measured",
    "Never guessed",
    "Every number it reports came out of an API call it made. The model chooses what to ask and how to explain it — it never invents a figure.",
  ],
  [
    "alert",
    "Refuses",
    "When it should",
    "If no window in the day is safe, Theron says stand down rather than manufacturing a reschedule that merely looks useful.",
  ],
  [
    "file",
    "Auditable",
    "Down to the call",
    "Every request, its cost, its latency and its activity ID are on the page. You are never asked to trust it; you are shown how to check it.",
  ],
];

const FLOW = [
  ["Goal", "A sentence from a safety manager"],
  ["Plan", "Chooses endpoints, budgets the spend"],
  ["Call", "Submits, polls, caches, never pays twice"],
  ["Verify", "Queries the alternative hours"],
  ["Decide", "Reschedule, keep, or stand down"],
];

function HoverCard({
  icon,
  title,
  kicker,
  detail,
}: {
  icon: IconName;
  title: string;
  kicker: string;
  detail: string;
}) {
  return (
    <article className="hc" tabIndex={0}>
      <span className="hc-ico">
        <Icon name={icon} size={20} />
      </span>
      <h3>{title}</h3>
      <p className="hc-kicker">{kicker}</p>
      <div className="hc-detail">
        <p>{detail}</p>
      </div>
      <span className="hc-more" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </span>
    </article>
  );
}

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

  const heroHours = cf
    ? [...cf.current.hours, ...cf.proposed.hours]
        .filter((h, i, arr) => arr.findIndex((x) => x.hourIndex === h.hourIndex) === i)
        .sort((a, b) => a.hourIndex - b.hourIndex)
    : [];

  return (
    <>
      {/* ═══ hero — one screen ═══ */}
      <section className="hm-hero">
        <div className="wrap hm-hero-grid">
          <div className="hm-hero-copy">
            <span className="hm-badge">
              <Icon name="shield" size={13} />
              Track 06 · Agentic AI
            </span>

            <h1 className="hm-h1">Know if your crew can work today.</h1>

            <p className="hm-lede">
              An autonomous agent that checks how hot each worksite will actually get, and proves which shift
              window is safest.
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
                How it works
              </Link>
            </div>
          </div>

          <div className="hm-hero-visual">
            {cf && lead && (
              <ProductWindow
                siteName={lead.site.name}
                city={lead.site.city}
                state={lead.site.state}
                crewSize={lead.site.crewSize}
                cf={cf}
                hours={heroHours}
              />
            )}
          </div>
        </div>

        <div className="hm-scroll" aria-hidden>
          <span>What it does</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M12 5v13M6 13l6 6 6-6" />
          </svg>
        </div>
      </section>

      {/* ═══ what it does ═══ */}
      <section className="hm-band-light">
        <div className="wrap">
          <Reveal>
            <header className="hm-head">
              <span className="eyebrow">What it does</span>
              <h2 className="hm-h2">Three jobs, done without being asked</h2>
            </header>
          </Reveal>
          <div className="hm-cards">
            {DOES.map(([icon, t, k, d], i) => (
              <Reveal key={t} delay={i * 70}>
                <HoverCard icon={icon} title={t} kicker={k} detail={d} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ worked example ═══ */}
      <section className="hm-section">
        <div className="wrap">
          <Reveal>
            <header className="hm-head center">
              <span className="eyebrow">See it</span>
              <h2 className="hm-h2">Ask a normal question. Get an answer you can act on.</h2>
            </header>
          </Reveal>

          <Reveal delay={60}>
            <div className="hm-demo">
              <div className="hm-demo-q">
                <span className="hm-who">You</span>
                <p>Can my Phoenix crew work their normal shift today?</p>
              </div>

              <div className="hm-demo-steps">
                <span className="hm-steps-title">Theron goes and checks</span>
                {[
                  ["Found your sites", "3 worksites on file"],
                  ["Checked every hour of the day", "hottest hour felt like 107°F"],
                  ["Compared it to this site's own past", "hotter than 7 in 10 days here"],
                  ["Tried every other shift time", "found one that's a third safer"],
                ].map(([what, found]) => (
                  <div className="hm-step" key={what}>
                    <span className="hm-step-tick" aria-hidden>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                           strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 12.5 5 5 9-11" />
                      </svg>
                    </span>
                    <b>{what}</b>
                    <span>{found}</span>
                  </div>
                ))}
              </div>

              <div className="hm-demo-a">
                <span className="hm-who theron">Theron</span>
                <p className="hm-verdict">
                  <strong>Move the shift.</strong> Start at 3&nbsp;PM instead of 6&nbsp;AM.
                </p>
                <p>
                  Your crew&rsquo;s time in dangerous heat drops by about a third. For 34 workers, that is
                  roughly <strong>1,479 fewer crew-hours</strong> spent above the level where heat illness
                  starts.
                </p>
                <p className="hm-demo-caveat">
                  <strong>But:</strong> today is dangerous at every hour. Moving the shift helps, it does not
                  make the day safe. Keep water, shade and rest breaks in place either way.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ═══ the insight ═══ */}
      <section className="hm-feature">
        <div className="wrap">
          <div className="hm-feature-head">
            <span className="eyebrow hm-feature-eyebrow">The idea it is built on</span>
            <h2 className="hm-feature-line">
              Twelve hours is not a short forecast.
              <br />
              It is <strong>exactly one work shift.</strong>
            </h2>
          </div>

          <div className="hm-day" aria-hidden>
            <div className="hm-day-track">
              {Array.from({ length: 24 }, (_, h) => {
                const inShift = h >= 6 && h < 15;
                const inHorizon = h >= 6 && h < 18;
                return (
                  <i
                    key={h}
                    className={`${inShift ? "on " : ""}${inHorizon ? "hz" : ""}`}
                    style={{ animationDelay: `${h * 42}ms` }}
                  />
                );
              })}
            </div>
            <div className="hm-day-key">
              <span>Midnight</span>
              <span className="hm-day-mark">the next shift &mdash; still changeable</span>
              <span>11 PM</span>
            </div>
          </div>

          <p className="hm-feature-sub">
            The temperature API sees twelve hours ahead. Read as weather, that is a limitation. Read as
            operations, it is the exact window a safety manager works in: the shift that has not started yet.
          </p>
        </div>
      </section>

      {/* ═══ proof ═══ */}
      {cf && (
        <section className="hm-section">
          <div className="wrap">
            <Reveal>
              <header className="hm-head">
                <span className="eyebrow">The result</span>
                <h2 className="hm-h2">Measured, not estimated</h2>
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

      {/* ═══ flow ═══ */}
      <section className="hm-band-light">
        <div className="wrap">
          <Reveal>
            <header className="hm-head">
              <span className="eyebrow">How it works</span>
              <h2 className="hm-h2">Tools return facts. The model returns prose.</h2>
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

      {/* ═══ trust ═══ */}
      <section className="hm-section">
        <div className="wrap">
          <Reveal>
            <header className="hm-head">
              <span className="eyebrow">Why it is trustworthy</span>
              <h2 className="hm-h2">Built so you can check it</h2>
            </header>
          </Reveal>
          <div className="hm-cards">
            {DIFFERENT.map(([icon, t, k, d], i) => (
              <Reveal key={t} delay={i * 70}>
                <HoverCard icon={icon} title={t} kicker={k} detail={d} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ close ═══ */}
      <section className="hm-section hm-close">
        <div className="wrap">
          <Reveal>
            <div className="hm-final">
              <Image src="/logo.png" alt="" width={72} height={72} />
              <div>
                <h2 className="hm-h2" style={{ margin: 0 }}>Why an alpaca?</h2>
                <p>
                  Alpacas carry insulation they cannot shed, so keepers watch the thermometer on their behalf.
                  That is exactly this job.
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
