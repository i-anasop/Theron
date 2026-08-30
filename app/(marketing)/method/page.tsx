import type { Metadata } from "next";
import Link from "next/link";
import { CREDIT_COST } from "@/lib/fortyguard/cost";
import DocsNav, { type DocsSection } from "@/components/DocsNav";
import CurveCompare from "@/components/CurveCompare";
import Icon from "@/components/Icon";

export const metadata: Metadata = {
  title: "Method",
  description:
    "What we measured about the FortyGuard Temperature API, the physics bug we caught in its heat index, " +
    "and how Theron's cost model was derived from live calls rather than documentation.",
};

const SECTIONS: DocsSection[] = [
  { id: "cost", label: "Cost is per call" },
  { id: "filter", label: "A documented mode that doesn't exist" },
  { id: "trap", label: "The heat-index trap" },
  { id: "fix", label: "The fix, cross-validated" },
  { id: "again", label: "The same bug, twice" },
  { id: "triage", label: "Two-stage sweeping" },
  { id: "wrong", label: "What we got wrong" },
];

export default function Method() {
  return (
    <div className="docs">
      <aside className="docs-side">
        <DocsNav sections={SECTIONS} />
      </aside>

      <article className="docs-body">
        <header className="docs-head">
          <div className="eyebrow">Method</div>
          <h1 className="page-h1">What we measured, and what we found wrong</h1>
          <p className="page-lede">
            Every figure in Theron&rsquo;s cost model came from reading the credit balance before and after a
            live call &mdash; not from documentation. That investigation cost about 30,000 credits and changed
            the architecture three times.
          </p>

          <div className="docs-meta">
            <span>
              <Icon name="receipt" size={15} /> ~30,000 credits spent probing
            </span>
            <span>
              <Icon name="alert" size={15} /> 2 silent bugs caught
            </span>
            <span>
              <Icon name="file" size={15} /> raw captures in <code>probes/</code>
            </span>
          </div>
        </header>

        {/* ── 1 ── */}
        <section id="cost" className="docs-sec">
          <span className="docs-n">01</span>
          <h2>Cost is charged per call, not per unit of data</h2>
          <p>
            A single-hour heatmap, a twelve-hour range, a full day, and a full month of days all cost{" "}
            <strong>exactly {CREDIT_COST.heatmap.toLocaleString()} credits</strong> over the same polygon. We
            measured all four. Granularity is free too &mdash; a 60&nbsp;m grid costs the same as 100&nbsp;m.
          </p>

          <div className="tablewrap" style={{ marginTop: 18 }}>
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>filter_type</th>
                  <th>Window</th>
                  <th>Credits</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Single hour", "1", "14:00"],
                  ["Hour range", "2", "06:00–18:00"],
                  ["Entire day", "3", "24 hours"],
                  ["Day range", "4", "1–31 July"],
                ].map(([a, b, c]) => (
                  <tr key={b}>
                    <td>{a}</td>
                    <td className="m">{b}</td>
                    <td className="m">{c}</td>
                    <td className="m">
                      <strong>4,220</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="callout" style={{ marginTop: 16 }}>
            This drives the whole planning strategy: never split a window one call could answer, and never buy
            finer time resolution than the question needs.
          </div>
        </section>

        {/* ── 2 ── */}
        <section id="filter" className="docs-sec">
          <span className="docs-n">02</span>
          <h2>The documented <code>filter_type: 5</code> does not exist</h2>
          <p>
            The handbook documents five time-window modes, including <code>5 = single month</code>. The API
            accepts only 1&ndash;4 and rejects 5 outright.
          </p>
          <pre className="code">
            <span className="c-key">422</span> {"{"}
            {"\n  "}
            <span className="c-str">&quot;message&quot;</span>: <span className="c-val">
              &quot;Field &apos;date_time.filter_type&apos; is invalid: Input should be 1, 2, 3 or 4&quot;
            </span>
            {"\n}"}
          </pre>
          <p>Any project that built a monthly analysis on the documented value would have failed at runtime.</p>
        </section>

        {/* ── 3 ── */}
        <section id="trap" className="docs-sec">
          <span className="docs-n">03</span>
          <h2><code>env_params.temperature</code> is an input, not an output</h2>
          <p>
            This one nearly shipped. Asking for a whole day returns 24 hourly values for a single{" "}
            {CREDIT_COST.env_params.toLocaleString()}-credit call, which looks like a bargain. But{" "}
            <code>temperature</code> is something you <em>supply</em>, and the endpoint applies your single
            scalar to all 24 hours &mdash; pairing peak-afternoon heat with pre-dawn humidity.
          </p>

          <CurveCompare />

          <div className="callout warn" style={{ marginTop: 18 }}>
            <b>The failure is silent.</b> The response is well-formed, array lengths are right, nothing errors.
            A team that trusted it would have presented inverted heat curves with complete confidence.
          </div>
        </section>

        {/* ── 4 ── */}
        <section id="fix" className="docs-sec">
          <span className="docs-n">04</span>
          <h2>The fix became the differentiator</h2>
          <p>
            Theron takes the genuinely hourly <em>humidity</em> series from <code>env_params</code>, pairs it
            with real per-hour <em>temperature</em> from <code>heatmap</code>, and computes the heat index
            itself using the NWS Rothfusz regression &mdash; the published method a safety officer would
            recognise. Then we checked it against the API&rsquo;s own output where both are correct:
          </p>

          <div className="validate">
            <div className="validate-cell">
              <span className="label">FortyGuard</span>
              <b>108.0&deg;F</b>
              <small>API response, Phoenix 14:00</small>
            </div>
            <div className="validate-eq" aria-hidden>
              =
            </div>
            <div className="validate-cell lead">
              <span className="label">Theron, local</span>
              <b>108.0&deg;F</b>
              <small>NWS Rothfusz, same inputs</small>
            </div>
            <div className="validate-cell">
              <span className="label">Difference</span>
              <b>0.0</b>
              <small>exact, to the decimal</small>
            </div>
          </div>
        </section>

        {/* ── 5 ── */}
        <section id="again" className="docs-sec">
          <span className="docs-n">05</span>
          <h2>We hit the same class of bug a second time</h2>
          <p>
            Building the cheap portfolio screen, we paired each shift&rsquo;s <em>peak temperature</em> with
            its <em>peak humidity</em>. Those maxima occur hours apart &mdash; humidity peaks before dawn,
            temperature mid-afternoon &mdash; so combining them invents an hour that never existed.
          </p>
          <div className="badnum">
            <div>
              <span className="label">Houston, screened wrongly</span>
              <b>161&deg;F</b>
              <small>98&deg;F paired with 88% humidity &mdash; an implied dew point that would be a world record</small>
            </div>
          </div>
          <p>
            That value is now explicitly a <em>screening estimate</em>, labelled wherever it appears, used only
            to decide whether a site deserves the expensive hourly analysis. It is never quoted as a
            measurement.
          </p>
        </section>

        {/* ── 6 ── */}
        <section id="triage" className="docs-sec">
          <span className="docs-n">06</span>
          <h2>Two-stage sweeping</h2>
          <p>
            A full hourly curve is 24 heatmap calls &mdash; about 101,000 credits per site per day. Run daily
            across a portfolio, that drains an account. Since cost is per call regardless of window, one
            shift-length request returns min/avg/max across exactly the exposed hours.
          </p>

          <div className="stages">
            <div className="stage">
              <span className="label">Stage 1 · Triage</span>
              <b>2 calls</b>
              <small>{(CREDIT_COST.heatmap + CREDIT_COST.env_params).toLocaleString()} credits — is this site worth looking at?</small>
            </div>
            <div className="stage-arrow" aria-hidden>
              →
            </div>
            <div className="stage lead">
              <span className="label">Stage 2 · Deep</span>
              <b>24 calls</b>
              <small>spent only on sites triage flags</small>
            </div>
            <div className="stage-save">
              <b>&minus;92%</b>
              <small>cost of watching a site</small>
            </div>
          </div>
        </section>

        {/* ── 7 ── */}
        <section id="wrong" className="docs-sec">
          <span className="docs-n">07</span>
          <h2>What we got wrong</h2>
          <p>
            Our first exposure metric counted <em>hours above the trigger</em>. It failed on exactly the days
            that matter most: at the Phoenix site every hour was above the trigger, so every candidate window
            scored an identical 9 and the metric reported &ldquo;nothing helps&rdquo; &mdash; while the best
            and worst windows differed by nearly 5&nbsp;°F of mean heat index.
          </p>
          <p>
            Theron now measures <strong>degree-hours above the trigger</strong>: how far over the line the crew
            sits, and for how long. It keeps discriminating when the whole day is dangerous.
          </p>
          <p>
            We also burned 149,000 credits in a single mis-configured request that persisted nothing. The
            response was structural rather than procedural: public routes now run in an <em>offline</em> mode
            where reaching the network is impossible, not merely budgeted against.
          </p>
        </section>

        <div className="callout docs-end">
          Raw captures live in <code>probes/</code>; the measured cost model is encoded in{" "}
          <code>lib/fortyguard/cost.ts</code>, where the planner reads it.{" "}
          <Link href="/app">See it run &rarr;</Link>
        </div>
      </article>
    </div>
  );
}
