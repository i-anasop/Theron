import type { Metadata } from "next";
import Link from "next/link";
import { CREDIT_COST } from "@/lib/fortyguard/cost";

export const metadata: Metadata = {
  title: "Method",
  description:
    "What we measured about the FortyGuard Temperature API, the physics bug we caught in its heat index, " +
    "and how Theron's cost model was derived from live calls rather than documentation.",
};

export default function Method() {
  return (
    <div className="wrap narrow" style={{ paddingTop: 52, paddingBottom: 20 }}>
      <div className="eyebrow">Method</div>
      <h1 style={{ margin: "14px 0 0", fontSize: "2.2rem", fontWeight: 670, letterSpacing: "-.038em", lineHeight: 1.1 }}>
        What we measured, and what we found wrong
      </h1>
      <p style={{ margin: "18px 0 0", fontSize: "1.04rem", color: "var(--ink-2)", lineHeight: 1.68 }}>
        Every figure in Theron&rsquo;s cost model was obtained by reading the credit balance before and after a
        live call &mdash; not taken from documentation. That investigation cost about 30,000 credits and
        changed the architecture three times. Two of the findings are bugs that would have shipped silently.
      </p>

      <div className="prose">
        {/* ── finding 1 ── */}
        <h3>1. Cost is charged per call, not per unit of data</h3>
        <p>
          A single-hour heatmap, a twelve-hour range, a full day, and a full month of days all cost{" "}
          <strong>exactly {CREDIT_COST.heatmap.toLocaleString()} credits</strong> over the same polygon. We
          measured all four. Granularity is free too &mdash; a 60&nbsp;m grid costs the same as 100&nbsp;m, so
          there is never a reason to request a coarser one.
        </p>
        <p>
          This is the single most consequential fact about the API, and it drives Theron&rsquo;s whole
          planning strategy: never split a window that one call could answer, and never buy a finer time
          resolution than the question needs.
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
              <tr>
                <td>Single hour</td>
                <td className="m">1</td>
                <td className="m">14:00</td>
                <td className="m">4,220</td>
              </tr>
              <tr>
                <td>Hour range</td>
                <td className="m">2</td>
                <td className="m">06:00&ndash;18:00</td>
                <td className="m">4,220</td>
              </tr>
              <tr>
                <td>Entire day</td>
                <td className="m">3</td>
                <td className="m">24 hours</td>
                <td className="m">4,220</td>
              </tr>
              <tr>
                <td>Day range</td>
                <td className="m">4</td>
                <td className="m">1&ndash;31 July</td>
                <td className="m">4,220</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── finding 2 ── */}
        <h3>2. The documented <code>filter_type: 5</code> does not exist</h3>
        <p>
          The participant handbook documents five time-window modes, including{" "}
          <code>5 = single month</code>. The API accepts only 1&ndash;4 and rejects 5 outright:{" "}
          <em>&ldquo;Input should be 1, 2, 3 or 4&rdquo;</em>. Any project that built a monthly analysis on the
          documented value would have failed at runtime.
        </p>

        {/* ── finding 3 ── */}
        <h3>3. <code>env_params.temperature</code> is an input, not an output</h3>
        <p>
          This one nearly shipped. Asking <code>env_params</code> for a whole day returns 24 hourly values for
          a single {CREDIT_COST.env_params.toLocaleString()}-credit call, which looks like a bargain. But{" "}
          <code>temperature</code> is something you <em>supply</em>, and the endpoint applies your single
          scalar to all 24 hours &mdash; pairing peak-afternoon heat with pre-dawn humidity.
        </p>
        <p>
          The result was a <strong>167&nbsp;°F heat index at midnight in Phoenix</strong>, with the day&rsquo;s
          minimum falling at 5&nbsp;PM. Physically impossible, and invisible unless you plot the curve and
          notice it is upside down.
        </p>

        <div className="callout warn" style={{ marginTop: 16 }}>
          <b>Why this matters beyond our own build.</b> The failure is silent. The response is well-formed, the
          array lengths are right, and nothing errors. A team that trusted it would have presented inverted
          heat curves to judges with complete confidence.
        </div>

        {/* ── finding 4 ── */}
        <h3>4. The fix became the differentiator</h3>
        <p>
          Theron takes the genuinely hourly <em>humidity</em> series from <code>env_params</code>, pairs it
          with real per-hour <em>temperature</em> from <code>heatmap</code>, and computes the heat index itself
          using the NWS Rothfusz regression &mdash; the published method a safety officer would recognise.
        </p>
        <p>
          We then cross-validated our implementation against the API&rsquo;s own output at a timestamp where
          both are correct:
        </p>

        <div className="stats" style={{ marginTop: 16 }}>
          <div className="stat">
            <span className="label">FortyGuard heat index</span>
            <div className="v">108.0<small>°F</small></div>
            <div className="foot">API response, Phoenix 14:00</div>
          </div>
          <div className="stat lead">
            <span className="label">Theron, computed locally</span>
            <div className="v">108.0<small>°F</small></div>
            <div className="foot">NWS Rothfusz, same inputs</div>
          </div>
          <div className="stat">
            <span className="label">Difference</span>
            <div className="v">0.0</div>
            <div className="foot">exact agreement to the decimal</div>
          </div>
        </div>

        <p style={{ marginTop: 18 }}>
          So the correct hourly curve costs one <code>env_params</code> call plus the hours you actually need,
          instead of one of each &mdash; and it is provably the same number the platform would have given us.
        </p>

        {/* ── finding 5 ── */}
        <h3>5. We hit the same class of bug a second time</h3>
        <p>
          Building the cheap portfolio screen, we paired each shift&rsquo;s <em>peak temperature</em> with its{" "}
          <em>peak humidity</em>. Those maxima occur hours apart &mdash; humidity peaks before dawn,
          temperature mid-afternoon &mdash; so combining them invents an hour that never existed. At the
          Houston site it produced a <strong>161&nbsp;°F</strong> heat index from a pairing whose implied dew
          point would be a world record.
        </p>
        <p>
          That value is now explicitly a <em>screening estimate</em>, labelled as such wherever it appears, and
          used only to decide whether a site deserves the expensive hourly analysis. It is never quoted as a
          measurement.
        </p>

        {/* ── economics ── */}
        <h3>6. Two-stage sweeping, because watching a portfolio has to be cheap</h3>
        <p>
          A full hourly curve is 24 heatmap calls &mdash; about 101,000 credits per site per day. Run daily
          across a portfolio, that drains an account. But since cost is per call regardless of window, a single
          shift-length request returns min/avg/max across exactly the hours the crew is exposed.
        </p>
        <ul>
          <li>
            <strong>Triage</strong> &mdash; 2 calls per site ({(CREDIT_COST.heatmap + CREDIT_COST.env_params).toLocaleString()}{" "}
            credits): is this site worth looking at?
          </li>
          <li>
            <strong>Deep analysis</strong> &mdash; 24 calls, spent only on sites triage flags.
          </li>
        </ul>
        <p>
          A 92% reduction in the cost of watching a site, with no loss of safety: triage is deliberately
          conservative, escalating anything at or above the OSHA high-heat trigger.
        </p>

        {/* ── honesty ── */}
        <h3>7. What we got wrong</h3>
        <p>
          Our first exposure metric counted <em>hours above the trigger</em>. It failed on exactly the days
          that matter most: at the Phoenix site every hour of the day was above the trigger, so every candidate
          window scored an identical 9 and the metric reported &ldquo;nothing helps&rdquo; &mdash; while the
          best and worst windows actually differed by nearly 5&nbsp;°F of mean heat index.
        </p>
        <p>
          Theron now measures <strong>degree-hours above the trigger</strong>: the integral of how far over the
          line the crew sits, and for how long. It keeps discriminating when the whole day is dangerous, and it
          is the shape of metric occupational hygiene already uses.
        </p>
        <p>
          We also burned 149,000 credits in a single mis-configured request that persisted nothing. The
          response was structural rather than procedural: public routes now run in an <em>offline</em> mode
          where reaching the network is impossible, not merely budgeted against.
        </p>
      </div>

      <div className="callout" style={{ marginTop: 40 }}>
        Raw captures from this investigation are committed in the repository under <code>probes/</code>, and
        the measured cost model is encoded in <code>lib/fortyguard/cost.ts</code> where the planner reads it.{" "}
        <Link href="/console">See it run &rarr;</Link>
      </div>
    </div>
  );
}
