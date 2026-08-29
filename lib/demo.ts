/**
 * Demo configuration.
 *
 * The dashboard defaults to a date whose full 24-hour curve is already cached
 * for every monitored site. That is not a shortcut around the live API — it is
 * the cache doing its job — and it means the demo answers instantly and spends
 * zero credits no matter how many times a judge clicks through it.
 *
 * Pass an explicit date anywhere in the UI or API to run against live data.
 */

export const DEMO_DATE = process.env.NEXT_PUBLIC_DEMO_DATE ?? "2026-08-28";

/**
 * Public endpoints serve cached data only unless explicitly opened up.
 *
 * The dashboard is a public URL. Without this, anyone who opens it — or any
 * crawler that POSTs to it — can spend the account's credits. Set
 * THERON_ALLOW_LIVE=1 to permit live calls from the public routes.
 */
export const PUBLIC_ROUTES_OFFLINE = process.env.THERON_ALLOW_LIVE !== "1";

/** The site with a complete cached curve and a built baseline. */
export const DEMO_SITE_ID = "phx-roosevelt";

export const DEMO_GOALS = [
  "Should the Phoenix crew work their scheduled shift today? Give me a decision I can act on.",
  "Sweep the portfolio and tell me which sites need intervention.",
  "How does today's heat at the Phoenix site compare to its own history?",
];
