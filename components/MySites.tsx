"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { addMySite, loadMySites, removeMySite } from "@/lib/my-sites";
import { isInsideUS, type UserSiteInput } from "@/lib/sites";

/**
 * Add your own worksite.
 *
 * Without this the product is a fixed demo of three sites nobody owns. A safety
 * manager's own site is the only one they care about, so adding one is the
 * first thing the workspace should let them do — and once added it goes to the
 * agent with every question, indistinguishable from the built-in portfolio.
 *
 * Coverage is checked here as well as on the server, so a non-U.S. point is
 * refused with an explanation instead of a wasted call and a confusing error.
 */

const BLANK = { name: "", lat: "", lon: "", crewSize: "10", shiftStart: "06:00", shiftEnd: "15:00" };

export default function MySites({ onChange }: { onChange?: (sites: UserSiteInput[]) => void }) {
  const [sites, setSites] = useState<UserSiteInput[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadMySites();
    setSites(loaded);
    onChange?.(loaded);
    // onChange is a callback prop; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit(next: UserSiteInput[]) {
    setSites(next);
    onChange?.(next);
  }

  function submit() {
    const lat = Number(form.lat);
    const lon = Number(form.lon);

    if (!form.name.trim()) return setError("Give the site a name.");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return setError("Latitude and longitude must be numbers.");
    if (!isInsideUS(lat, lon)) {
      return setError(
        "The Temperature API measures United States locations only, so there is no reading for that point.",
      );
    }

    setError(null);
    commit(
      addMySite({
        name: form.name.trim(),
        lat,
        lon,
        crewSize: Number(form.crewSize) || 10,
        shiftStart: form.shiftStart,
        shiftEnd: form.shiftEnd,
      }),
    );
    setForm(BLANK);
    setOpen(false);
  }

  return (
    <section className="mysites">
      <div className="mysites-head">
        <span className="label">
          <Icon name="crew" size={13} /> Your worksites
        </span>
        <button className="btn ghost sm" onClick={() => setOpen((o) => !o)} type="button">
          {open ? "Cancel" : "Add a site"}
        </button>
      </div>

      {sites.length > 0 && (
        <div className="mysites-list">
          {sites.map((s) => (
            <span className="mysite" key={s.id}>
              <b>{s.name}</b>
              <i>
                {Number(s.lat).toFixed(3)}, {Number(s.lon).toFixed(3)} · {s.crewSize} crew · {s.shiftStart}&ndash;
                {s.shiftEnd}
              </i>
              <button
                onClick={() => commit(removeMySite(s.id!))}
                aria-label={`Remove ${s.name}`}
                title="Remove"
                type="button"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {!sites.length && !open && (
        <p className="mysites-empty">
          Add your own site and the agent will monitor it alongside the demo portfolio. Stored in this
          browser only.
        </p>
      )}

      {open && (
        <>
          <div className="mysites-form">
            <label>
              <span className="label">Site name</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="North yard"
              />
            </label>
            <label>
              <span className="label">Latitude</span>
              <input
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: e.target.value })}
                placeholder="33.4484"
                inputMode="decimal"
              />
            </label>
            <label>
              <span className="label">Longitude</span>
              <input
                value={form.lon}
                onChange={(e) => setForm({ ...form, lon: e.target.value })}
                placeholder="-112.0740"
                inputMode="decimal"
              />
            </label>
            <label>
              <span className="label">Crew</span>
              <input
                value={form.crewSize}
                onChange={(e) => setForm({ ...form, crewSize: e.target.value })}
                inputMode="numeric"
              />
            </label>
            <label>
              <span className="label">Shift start</span>
              <input value={form.shiftStart} onChange={(e) => setForm({ ...form, shiftStart: e.target.value })} />
            </label>
            <label>
              <span className="label">Shift end</span>
              <input value={form.shiftEnd} onChange={(e) => setForm({ ...form, shiftEnd: e.target.value })} />
            </label>
            <button className="btn" onClick={submit} type="button">
              Add site
            </button>
          </div>
          {error && <div className="err">{error}</div>}
          <p className="mysites-note">
            United States coordinates only &mdash; that is where the Temperature API measures. Ask the agent
            about your site with <b>Live data</b> enabled to fetch a fresh reading.
          </p>
        </>
      )}
    </section>
  );
}
