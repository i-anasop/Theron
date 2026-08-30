# Theron — Submission Summary

**Track 06 · Agentic AI** · Live: https://theron-ops.vercel.app · Repo: https://github.com/i-anasop/Theron

---

## Problem

Extreme heat is the deadliest weather hazard for outdoor workers, and the people who decide whether a crew
works are deciding blind. A weather app gives one city-wide number. A worksite is a few hundred square
metres of asphalt, shade and reflected glare, where the temperature that matters is the one where the crew
is actually standing. So a foreman guesses — and after an incident has no record of what he knew, or when.

## Who it's for

A safety manager responsible for outdoor crews at construction, utility and logistics sites in high-heat
U.S. metros. OSHA's proposed heat injury and illness prevention standard sets explicit heat-index trigger
points, so this is a compliance and liability obligation forming in real time, not a hypothetical.

## How Theron uses the FortyGuard API

Theron is an autonomous agent. Given a plain-language goal, it plans its own sequence of calls, budgets its
own credit spend before spending it, and — before recommending a shift change — **queries the alternative
hours and measures the difference**. Endpoints used:

- **`POST /v1/heatmap`** — per-hour temperature across each worksite polygon, and shift-window aggregates
  for cheap screening
- **`POST /v1/env_params`** — hourly humidity series, solar irradiance, air quality
- **`GET /v1/status/{activity_id}`** — asynchronous task collection with backoff
- **`POST /v1/system/fetch-api-key-usage`** — live credit ledger, so the agent reports actual spend rather
  than an estimate

We measured the API rather than trusting its documentation, and found three things it gets wrong. Cost is
charged **per call, not per unit of data** — a single hour, a full day and a full month all cost exactly
4,220 credits. The documented `filter_type: 5` does not exist. And `env_params.temperature` is an *input*,
not an output: asking for a whole day applies your single scalar to all 24 hours, which produced a **167 °F
heat index at midnight in Phoenix** with the daily minimum at 5 PM. Theron therefore pairs the genuinely
hourly humidity series with real per-hour temperature and computes the heat index itself via the NWS
Rothfusz regression — cross-validated against the API's own output at **108.0 °F versus 108.0 °F**.

## Measured result

Roosevelt Row Mixed-Use, Phoenix AZ, 34-worker crew, 2026-08-28:

> Moving the shift from **06:00–15:00 to 15:00–24:00** cuts crew heat exposure from **138.5 to 95 °F-hours**
> above the high-heat trigger — a **31 % reduction**, **1,479 crew-degree-hours** removed.

Equally important: no hour of that day falls below the trigger, so Theron returns a **stand-down caveat**
rather than letting a percentage imply the day became safe.

It sweeps every site unattended on a daily schedule, and every run is logged — what it checked, decided and
spent. Two-stage design keeps that affordable: screening costs 2 API calls where the full hourly analysis
costs 24. The build ships **47 unit tests** and an **8-scenario agent evaluation suite** that asserts the
agent never fabricates a regulation, never claims a spend it did not make, and reports missing data as
missing. It caught a real compliance defect on its first run.
