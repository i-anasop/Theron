/**
 * Outbound alerts.
 *
 * An alert is the point where an autonomous system reaches into someone's
 * day, so it has to earn the interruption: lead with the decision, carry the
 * measured evidence, and never fire twice for the same unchanged state.
 */

import type { Counterfactual } from "../analysis/counterfactual";
import type { Worksite } from "../sites";

export interface AlertPayload {
  site: Worksite;
  counterfactual: Counterfactual;
  /** Site-relative context, when a baseline exists. */
  baselineSummary?: string;
  /** Where the reader can see the full working. */
  dashboardUrl?: string;
}

const VERDICT_STYLE: Record<Counterfactual["verdict"], { emoji: string; label: string }> = {
  stand_down: { emoji: "🛑", label: "STAND DOWN" },
  reschedule: { emoji: "🔄", label: "RESCHEDULE SHIFT" },
  keep: { emoji: "✅", label: "SHIFT OK AS SCHEDULED" },
};

export function formatSlackMessage(p: AlertPayload): Record<string, unknown> {
  const { site, counterfactual: cf } = p;
  const style = VERDICT_STYLE[cf.verdict];

  const facts = [
    `*Scheduled* ${cf.current.label} — ${cf.current.degreeHoursOverTrigger} °F·h over trigger`,
    cf.verdict === "reschedule"
      ? `*Proposed* ${cf.proposed.label} — ${cf.proposed.degreeHoursOverTrigger} °F·h over trigger`
      : `*Best available* ${cf.proposed.label} — ${cf.proposed.degreeHoursOverTrigger} °F·h over trigger`,
    `*Peak heat index* ${cf.current.peakHeatIndexF} °F  ·  *Crew* ${site.crewSize}`,
  ];

  if (cf.verdict === "reschedule") {
    facts.push(
      `*Exposure avoided* ${cf.degreeHoursAvoided} °F·h (${cf.percentReduction}%) = ` +
        `${cf.crewDegreeHoursAvoided} crew-°F·h`,
    );
  }

  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${style.emoji} ${style.label} — ${site.city}`, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${site.name}* · ${site.operator}\n${cf.headline}` },
    },
    { type: "section", fields: facts.map((f) => ({ type: "mrkdwn", text: f })) },
  ];

  if (p.baselineSummary) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `📊 ${p.baselineSummary}` }],
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text:
          `Theron · autonomous sweep · ${cf.date} · thresholds from OSHA's *proposed* heat standard ` +
          `(not settled law)${p.dashboardUrl ? ` · <${p.dashboardUrl}|open dashboard>` : ""}`,
      },
    ],
  });

  return { blocks };
}

/**
 * Posts to Slack. Returns false rather than throwing when no webhook is
 * configured — a missing alert channel must never take down the sweep.
 */
export async function sendSlackAlert(p: AlertPayload, webhookUrl = process.env.SLACK_WEBHOOK_URL): Promise<boolean> {
  if (!webhookUrl) return false;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formatSlackMessage(p)),
    });
    return res.ok;
  } catch {
    return false;
  }
}
