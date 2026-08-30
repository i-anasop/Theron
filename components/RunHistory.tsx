"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { describeAge, type RunHistory as History, type RunRecord } from "@/lib/runlog-types";

/**
 * Evidence that the scheduler fires.
 *
 * Shows the last unattended sweep and what it found. Crucially it also shows
 * where the record came from — a run written to a durable store and a run held
 * only in this instance's memory are different kinds of evidence, and a panel
 * that blurred them would be worse than no panel.
 */

const VERDICT_LABEL: Record<string, string> = {
  reschedule: "move shift",
  stand_down: "stand down",
  keep: "clear",
  clear: "clear",
  flagged: "flagged",
  skipped: "skipped",
  error: "error",
};

export default function RunHistory({ compact = false }: { compact?: boolean }) {
  const [history, setHistory] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/runs?limit=8")
      .then((r) => (r.ok ? r.json() : null))
      .then((h: History | null) => {
        setHistory(h);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const last: RunRecord | undefined = history?.runs?.[0];

  if (loading) {
    return (
      <div className="runs">
        <div className="runs-head">
          <span className="label">Autonomous sweeps</span>
        </div>
        <div className="runs-empty">checking the log…</div>
      </div>
    );
  }

  if (!last) {
    return (
      <div className="runs">
        <div className="runs-head">
          <span className="label">Autonomous sweeps</span>
          <span className="runs-cadence">daily · 11:00 UTC</span>
        </div>
        <div className="runs-empty">
          No sweep recorded yet. The scheduler writes an entry here every time it fires.
        </div>
      </div>
    );
  }

  return (
    <div className="runs">
      <div className="runs-head">
        <span className="label">
          <Icon name="clock" size={13} /> Autonomous sweeps
        </span>
        <span className="runs-cadence">daily · 11:00 UTC</span>
      </div>

      <div className="runs-last">
        <div className="runs-last-main">
          <span className={`runs-badge t-${last.trigger}`}>
            {last.trigger === "schedule" ? "scheduler" : last.trigger === "manual" ? "manual run" : "local"}
          </span>
          <b>{describeAge(last.ranAt)}</b>
          <span className="runs-when">{new Date(last.ranAt).toUTCString().replace(/:\d\d GMT$/, " UTC")}</span>
        </div>

        <div className="runs-figures">
          <span>
            <b>{last.sitesChecked}</b> sites checked
          </span>
          <span>
            <b>{last.sitesFlagged}</b> flagged
          </span>
          <span>
            <b>{last.alertsSent}</b> alert{last.alertsSent === 1 ? "" : "s"}
          </span>
          <span>
            <b>{last.creditsSpent.toLocaleString()}</b> credits
          </span>
          <span>
            <b>{last.durationMs.toLocaleString()}</b> ms
          </span>
        </div>

        <div className="runs-sites">
          {last.outcomes.map((o) => (
            <span key={o.siteId} className={`runs-site v-${o.verdict}`}>
              {o.city}
              <i>{VERDICT_LABEL[o.verdict] ?? o.verdict}</i>
            </span>
          ))}
        </div>
      </div>

      {!compact && history!.runs.length > 1 && (
        <ol className="runs-list">
          {history!.runs.slice(1).map((r) => (
            <li key={r.id}>
              <span className={`runs-dot t-${r.trigger}`} aria-hidden />
              <span className="runs-li-when">{describeAge(r.ranAt)}</span>
              <span className="runs-li-body">
                {r.sitesChecked} sites · {r.sitesFlagged} flagged · {r.creditsSpent.toLocaleString()} cr
              </span>
              <span className="runs-li-trigger">{r.trigger}</span>
            </li>
          ))}
        </ol>
      )}

      <p className="runs-source">
        {history!.source === "redis"
          ? "Persisted to a durable store — entries survive redeploys."
          : history!.source === "memory"
            ? "Held in this instance's memory only; it will not survive a redeploy. Configure UPSTASH_REDIS_REST_URL for durable history."
            : "Shown from the run log committed with the repository. Live runs are appended once a durable store is configured."}
      </p>
    </div>
  );
}
