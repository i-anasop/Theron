import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WORKSITES, getSite } from "@/lib/sites";
import { BASELINES } from "@/lib/baselines";
import { appCache } from "@/lib/cache-factory";
import { DEMO_DATE } from "@/lib/demo";
import { FortyGuardClient } from "@/lib/fortyguard/client";
import { CreditBudget } from "@/lib/fortyguard/cost";
import { buildHourlyCurve } from "@/lib/analysis/hourly";
import { findBestShift } from "@/lib/analysis/counterfactual";
import { compareToBaseline } from "@/lib/analysis/percentile";
import { cToF } from "@/lib/heat/heatIndex";
import HeatChart from "@/components/HeatChart";

export const revalidate = 3600;

export function generateStaticParams() {
  return WORKSITES.map((s) => ({ id: s.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const site = WORKSITES.find((s) => s.id === id);
  return { title: site ? `${site.name}` : "Worksite" };
}

export default async function SitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!WORKSITES.some((s) => s.id === id)) notFound();

  const site = getSite(id);
  const client = new FortyGuardClient({
    budget: new CreditBudget(400_000),
    cache: appCache(),
    offline: true,
  });

  const curve = await buildHourlyCurve(
    client,
    site,
    DEMO_DATE,
    Array.from({ length: 24 }, (_, i) => i),
  );
  const cf = curve.readings.length ? findBestShift(curve, site) : null;
  const baseline = BASELINES.find((b) => b.siteId === site.id);
  const peakC = curve.readings.length ? Math.max(...curve.readings.map((r) => r.tempC)) : null;
  const comparison = baseline && peakC !== null ? compareToBaseline(baseline, peakC) : null;

  return (
    <div className="wrap" style={{ paddingTop: 44 }}>
      <p style={{ margin: 0, fontSize: ".85rem" }}>
        <Link href="/console">&larr; Console</Link>
      </p>

      <div className="sec-head" style={{ marginTop: 16 }}>
        <div className="eyebrow">
          {site.city}, {site.state} · {DEMO_DATE}
        </div>
        <h2 style={{ fontSize: "2rem" }}>{site.name}</h2>
        <p>
          {site.operator} · {site.crewSize} crew · shift {site.shift.start}&ndash;{site.shift.end} ·{" "}
          {site.work}
        </p>
      </div>

      {!cf && (
        <div className="callout">
          No cached hourly analysis exists for this site on {DEMO_DATE}. The console shows its cheap triage
          screen instead &mdash; Theron only buys the full 24-call curve for sites triage flags.{" "}
          <Link href="/console">Back to the console &rarr;</Link>
        </div>
      )}

      {cf && (
        <>
          <div className="stats">
            <div className="stat">
              <span className="label">Verdict</span>
              <div className="v" style={{ fontSize: "1.35rem", textTransform: "capitalize" }}>
                {cf.verdict.replace("_", " ")}
              </div>
              <div className="foot">against the scheduled {cf.current.label} shift</div>
            </div>
            <div className="stat">
              <span className="label">Peak heat index</span>
              <div className="v" style={{ color: "var(--high)" }}>
                {cf.current.peakHeatIndexF}
                <small>°F</small>
              </div>
              <div className="foot">worst hour the crew is exposed to</div>
            </div>
            <div className="stat">
              <span className="label">Exposure above trigger</span>
              <div className="v">
                {cf.current.degreeHoursOverTrigger}
                <small>°F·h</small>
              </div>
              <div className="foot">{cf.current.exposureHours} of {cf.current.hours.length} hours over the line</div>
            </div>
            <div className="stat lead">
              <span className="label">Avoidable</span>
              <div className="v">
                {cf.percentReduction}
                <small>%</small>
              </div>
              <div className="foot">
                {cf.crewDegreeHoursAvoided.toLocaleString()} crew-°F·h across {site.crewSize} workers
              </div>
            </div>
          </div>

          <section>
            <div className="sec-head">
              <h2>The day, hour by hour</h2>
              <p>
                Air temperature from the heatmap endpoint, humidity from the hourly environmental series, heat
                index computed locally with the NWS Rothfusz regression.
              </p>
            </div>

            <div className="card" style={{ padding: 24 }}>
              <HeatChart
                id={`site-${site.id}`}
                hours={curve.readings}
                shiftStart={cf.current.startHour}
                shiftEnd={cf.current.endHour}
                proposedStart={cf.verdict === "reschedule" ? cf.proposed.startHour : undefined}
                proposedEnd={cf.verdict === "reschedule" ? cf.proposed.endHour : undefined}
                height={220}
              />
              <p className="verdict" style={{ marginTop: 20 }}>
                {cf.headline}
              </p>
            </div>
          </section>

          {comparison && (
            <section style={{ paddingTop: 0 }}>
              <div className="sec-head">
                <h2>Against this site&rsquo;s own history</h2>
                <p>
                  Absolute thresholds treat every city alike. Crews acclimatise, so Theron ranks today against{" "}
                  {baseline!.stats.count} comparable days sampled at this same site since 2022.
                </p>
              </div>
              <div className="card" style={{ padding: 24 }}>
                <p className="verdict" style={{ fontSize: ".97rem" }}>
                  {comparison.summary}
                </p>
                <div className="metrics" style={{ marginTop: 18, gridTemplateColumns: "repeat(4, 1fr)" }}>
                  <div className="metric">
                    <span className="label">Percentile</span>
                    <div className="m">{comparison.percentile}th</div>
                  </div>
                  <div className="metric">
                    <span className="label">Rank</span>
                    <div className="m">
                      {comparison.rank}/{comparison.sampleCount}
                    </div>
                  </div>
                  <div className="metric">
                    <span className="label">Site mean peak</span>
                    <div className="m">{cToF(baseline!.stats.meanPeakC).toFixed(0)}&deg;F</div>
                  </div>
                  <div className="metric">
                    <span className="label">Z-score</span>
                    <div className="m">{comparison.zScore > 0 ? "+" : ""}{comparison.zScore}</div>
                  </div>
                </div>
              </div>
            </section>
          )}

          <section style={{ paddingTop: 0 }}>
            <div className="sec-head">
              <h2>Every window Theron tested</h2>
              <p>
                The counterfactual searches all same-length windows in the day and ranks by degree-hours above
                the trigger. Nothing is recommended without this comparison behind it.
              </p>
            </div>

            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Window</th>
                    <th>Mean heat index</th>
                    <th>Peak</th>
                    <th>Hours over trigger</th>
                    <th>Exposure °F·h</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[cf.current, cf.proposed]
                    .filter((w, i, arr) => arr.findIndex((x) => x.startHour === w.startHour) === i)
                    .map((w) => (
                      <tr key={w.startHour}>
                        <td className="m">{w.label}</td>
                        <td className="m">{w.meanHeatIndexF}&deg;F</td>
                        <td className="m">{w.peakHeatIndexF}&deg;F</td>
                        <td className="m">
                          {w.exposureHours}/{w.hours.length}
                        </td>
                        <td className="m">{w.degreeHoursOverTrigger}</td>
                        <td>
                          <span className={`tag ${w.startHour === cf.current.startHour ? "unknown" : "keep"}`}>
                            {w.startHour === cf.current.startHour ? "scheduled" : "best found"}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {cf.noSafeWindowExists && (
              <div className="callout warn" style={{ marginTop: 16 }}>
                <b>No safe window exists on this date.</b> Every hour of the day sits above the OSHA high-heat
                trigger, so rescheduling reduces severity but cannot produce a safe shift. Rest-cycle controls,
                crew rotation, or a stand-down remain necessary regardless of timing.
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
