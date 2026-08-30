/**
 * Worksites the person adds themselves.
 *
 * Stored in the browser rather than on a server: the demo has no accounts, and
 * asking someone to sign up before they can try their own site would lose more
 * people than the persistence is worth. Every read and write is guarded —
 * private windows, cleared site data and blocked storage all have to degrade
 * to "no saved sites" rather than a crash.
 *
 * The sites travel with each agent request, so the agent treats them exactly
 * like the built-in portfolio.
 */

import type { UserSiteInput } from "./sites";

const KEY = "theron.sites";
const MAX = 25;

export function loadMySites(): UserSiteInput[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function saveMySites(sites: UserSiteInput[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(sites.slice(0, MAX)));
  } catch {
    /* storage unavailable — the session still works, it just will not persist */
  }
}

export function addMySite(site: UserSiteInput): UserSiteInput[] {
  const id = site.id || `user-${Number(site.lat).toFixed(3)}_${Number(site.lon).toFixed(3)}`;
  const next = [...loadMySites().filter((s) => s.id !== id), { ...site, id }];
  saveMySites(next);
  return next;
}

export function removeMySite(id: string): UserSiteInput[] {
  const next = loadMySites().filter((s) => s.id !== id);
  saveMySites(next);
  return next;
}
