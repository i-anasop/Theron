import Link from "next/link";
import Image from "next/image";
import { sweep } from "@/lib/monitor";
import { BASELINES } from "@/lib/baselines";
import { appCache } from "@/lib/cache-factory";
import { DEMO_DATE } from "@/lib/demo";
import HeatChart from "@/components/HeatChart";

/**
 * The landing page runs a real sweep against the bundled response cache. The
 * numbers below are computed at build time from verbatim API responses — not
 * copy typed into the markup — so the headline can never drift away from what
 * the system actually produces.
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
          Theron is an autonomous agent that watches outdoor worksites for dangerous heat. When a crew&rsquo;s
          shift is unsafe it doesn&rsquo;t just warn you &mdash; it tests every other window in the day, finds
          the safest one, and reports the measured difference. Every figure traces back to an API call you can
          inspect.
        </p>
        <div className="hero-actions">
          <Link href="/console" className="btn">
            Open the live console
          </Link>
          <Link href="/method" className="btn ghost">
            How it works
          </Link>
        </div>
      </div>

      <div className="wrap">
        <div className="stats">
          <div className="stat lead">
            <span className="label">Exposure avoided</span>
            <div className="v">
              {cf?.percentReduction ?? "—"}
              <small>%</small>
            </div>
            <div className="foot">by moving one shift at one site</div>
          </div>
          <div className="stat">
            <span className="label">Crew hours removed</span>
            <div className="v">{cf ? cf.crewDegreeHoursAvoided.toLocaleString() : "—"}</div>
            <div className="foot">crew-degree-hours above the OSHA trigger</div>
          </div>
          <div className="stat">
            <span className="label">Workers covered</span>
            <div className="v">{crew}</div>
            <div className="foot">across {result.assessments.length} monitored worksites</div>
          </div>
          <div className="stat">
            <span className="label">Credits to run this</span>
            <div className="v">{result.creditsSpent}</div>
            <div className="foot">{result.trail.length} calls, every one served from cache</div>
          </div>
        </div>
      </div>

      {/* ── the thesis ── */}
      <section className="wrap">
        <div className="sec-head narrow">
          <div className="eyebrow">The insight</div>
          <h2>Twelve hours is not a short forecast. It is exactly one work shift.</h2>
          <p>
            The Temperature API forecasts twelve hours ahead. Read as weather, that&rsquo;s a limitation. Read
            as operations, it is precisely the planning horizon a safety manager works in &mdash; the next
            shift, the one they can still change. Theron is built for that horizon rather than apologising for
            it.
          </p>
        </div>

        {cf && (
          <div className="card" style={{ padding: 24 }}>
            <div className="sec-row" style={{ marginBottom: 18 }}>
              <div>
                <div className="label">{lead!.site.name} · {lead!.site.city}, {lead!.site.state}</div>
                <p style={{ margin: "8px 0 0", fontSize: "1.02rem", fontWeight: 600, letterSpacing: "-.02em" }}>
                  {cf.current.label} &rarr; {cf.proposed.label}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="label">Peak heat index</div>
                <div className="num" style={{ fontSize: "1.5rem", fontWeight: 660, color: "var(--high)" }}>
                  {cf.current.peakHeatIndexF}&deg;F
                </div>
              </div>
            </div>

            <HeatChart
              id="hero"
              hours={hours}
              shiftStart={cf.current.startHour}
              shiftEnd={cf.current.endHour}
              proposedStart={cf.proposed.startHour}
              proposedEnd={cf.proposed.endHour}
              height={170}
            />

            <p className="verdict" style={{ marginTop: 18 }}>
              {cf.headline}
            </p>
          </div>
        )}
      </section>

      {/* ── how it works ── */}
      <section className="wrap">
        <div className="sec-head">
          <div className="eyebrow">How it works</div>
          <h2>Tools return facts. The model returns prose.</h2>
          <p>
            Theron&rsquo;s language model chooses what to ask and how to explain it. It never computes a
            number, cites a regulation, or invents a control measure &mdash; those constraints live in the tool
            layer, not in a prompt asking nicely.
          </p>
        </div>

        <div className="grid-3">
          {[
            {
              n: "01",
              h: "It plans, then spends",
              p: "The agent checks its credit budget before choosing endpoints, and the budget refuses a call before it happens rather than after. Analysis costs real money; Theron treats that as a design constraint.",
            },
            {
              n: "02",
              h: "It compares like with like",
              p: "A 104°F day means something different in Phoenix than in Seattle, because crews acclimatise. Theron ranks today against the same site's own sampled history since 2022, not an absolute threshold.",
            },
            {
              n: "03",
              h: "It verifies before advising",
              p: "To claim a shift move helps, Theron queries the alternative hours and measures the difference in degree-hours above the trigger. A recommendation without that behind it never leaves the system.",
            },
            {
              n: "04",
              h: "It refuses when it should",
              p: "When every hour of a day sits above the trigger, no reschedule is safe. Theron returns a stand-down verdict and says so, instead of manufacturing a recommendation to look useful.",
            },
            {
              n: "05",
              h: "It screens before it drills",
              p: "A full hourly curve costs 24 API calls. Triage screens a site with 2. Only sites that triage flags get the expensive analysis — a 92% reduction in the cost of watching a portfolio.",
            },
            {
              n: "06",
              h: "It shows its work",
              p: "Every call, its cost, its latency and its activity ID are rendered on the page. You are never asked to trust the output; you are shown how to check it.",
            },
          ].map((f) => (
            <div key={f.n} className="card feature">
              <div className="n">{f.n}</div>
              <h3>{f.h}</h3>
              <p>{f.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── closing ── */}
      <section className="wrap">
        <div
          className="card"
          style={{ padding: "34px 30px", display: "flex", gap: 26, alignItems: "center", flexWrap: "wrap" }}
        >
          <Image src="/logo.png" alt="" width={72} height={72} style={{ borderRadius: 14, flex: "none" }} />
          <div style={{ flex: 1, minWidth: 260 }}>
            <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 650, letterSpacing: "-.028em" }}>
              Why an alpaca?
            </h2>
            <p style={{ margin: "10px 0 0", color: "var(--ink-2)", fontSize: ".95rem", maxWidth: "56ch" }}>
              Alpacas are among the most heat-vulnerable animals people work with &mdash; they carry their own
              insulation and cannot shed it, so keepers watch the thermometer on their behalf and move them out
              of the sun before it is too late. That is exactly this job.
            </p>
          </div>
          <Link href="/console" className="btn" style={{ flex: "none" }}>
            See it run
          </Link>
        </div>
      </section>
    </>
  );
}
