# Theron

**An autonomous heat-safety operations agent for outdoor workforces.**

FortyGuard Hackathon '26 · Track 06 — Agentic AI

Theron monitors a portfolio of U.S. worksites without a human in the loop. It plans its own sequence of
Temperature API calls, ranks today against each site's own multi-year history, and — before recommending a
shift change — **queries the alternative hours and proves the difference**. Every number it reports traces
back to a recorded API call, shown in an audit trail on the page.

---

## The insight this is built on

The Temperature API forecasts **12 hours ahead**. Treated as a weather limitation, that's a weakness.

Twelve hours is **exactly one work shift**.

Theron isn't a weather app and doesn't need a seven-day outlook. It does shift-level operational planning,
where a 12-hour horizon is the correct horizon — not a compromise.

## The user, and why they pay

A safety manager responsible for crews at construction, utility, and logistics sites in high-heat metros.
OSHA's proposed Heat Injury and Illness Prevention standard sets heat-index trigger points (~80 °F initial,
~90 °F high-heat) that map directly onto the `env_params` heat index. That makes this a compliance and
liability tool with a named buyer, not a civic demo looking for a user.

*Theron cites that rulemaking as **proposed**, not settled law — and says so in every output.*

## The measured result

Roosevelt Row Mixed-Use, Phoenix AZ · 34-worker crew · 2026-08-28, from live API data:

> Move the shift from **06:00–15:00 to 15:00–24:00**. Crew heat exposure falls from **138.5 to 95 °F-hours**
> above OSHA's high-heat trigger — a **31 % reduction**, **1,479 crew-degree-hours** removed across 34
> workers. Mean heat index **105.4 → 100.6 °F**.
>
> No hour of this day falls below the trigger, so rest-cycle controls remain mandatory regardless.

That last line matters as much as the first. Theron returns a `stand_down` verdict when rescheduling
genuinely cannot fix a day, instead of manufacturing a recommendation.

---

## Architecture

```
plain-language goal
        │
        ▼
   Planner ──────► picks endpoints, sequences calls, budgets its own credit spend
        │
        ▼
   Executor ─────► submit → activity_id → poll → cache.  Never polls inside a request.
        │
        ▼
   Analyst ──────► self-baselines today against this site's own history since 2022
        │
        ▼
   Decider ──────► proposes a window, then VERIFIES it by querying the alternative hours
        │
        ▼
   Auditor ──────► renders every call, its cost, and its activity_id
```

The reasoning layer is **provider-agnostic** — any OpenAI-compatible tool-calling endpoint drives the same
loop. It ships configured for free tiers (Google AI Studio, Groq, OpenRouter) so a client can run it on
credentials they already have rather than a vendor lock-in.

### The rule the whole design turns on

**Tools return facts; the model returns prose.** Every figure in an output must appear verbatim in a tool
result. The model chooses what to ask and how to explain it — it never computes a number, never cites a
regulation, and never invents a control measure. Those constraints are enforced in the tool layer, not just
requested in the prompt.

---

## What we learned about the Temperature API

Every figure below was measured against a live Hackathon-plan key by reading the credit balance before and
after each call — not taken from documentation. Raw captures are in [`probes/`](probes/).

| Finding | Detail |
|---|---|
| **Cost is per _call_, not per _data volume_** | A single hour, twelve hours, a full day, and a full month of days all cost **exactly 4,220 credits** over the same polygon. |
| **Granularity is free** | 60 m costs the same as 100 m. There is never a reason to request a coarser grid. |
| **`filter_type: 5` does not exist** | The handbook documents "5 = single month"; the API accepts only 1–4 and rejects 5. |
| **`env_params.temperature` is an _input_** | Not an output. See the trap below. |
| **Usage endpoint is shaped differently** | Requires the key in the *body* as well as the header, and returns its payload unwrapped — no `data` envelope, unlike every analysis endpoint. |
| **Measured costs** | heatmap **4,220** · env_params **2,900** · usage free. Charged only on success. |

### The trap that nearly shipped

Asking `env_params` for a whole day returns 24 hourly values for one 2,900-credit call. It looks like a
bargain. But `temperature` is an input, so the API applies your single scalar to all 24 hours — pairing
peak-afternoon heat with pre-dawn humidity.

It produced a **167 °F heat index at midnight in Phoenix**, with the daily *minimum* at 5 PM. Physically
impossible, and invisible unless you look at the curve.

The fix became an asset. Theron takes the genuinely-hourly humidity series from `env_params`, pairs it with
real per-hour temperature from `heatmap`, and computes the heat index itself using the NWS Rothfusz
regression. Cross-validated against the API's own output: **108.0 °F vs 108.0 °F — exact agreement.**

We hit the same class of bug a second time in portfolio triage (peak temperature paired with peak humidity,
which occur hours apart, yielding a 161 °F heat index from an impossible dew point). That value is now
explicitly a *screening estimate*, never quoted as a measurement.

---

## Credit discipline

The API bills real money, so cost control is part of the product, not an afterthought.

- **Two-stage sweep.** Triage screens a site for 2 calls (7,120 credits) instead of 24 (~101,000). Only
  flagged sites get the full hourly curve.
- **Content-addressed cache.** Identical requests never pay twice. The demo runs at **0 credits**.
- **`CreditBudget`** refuses a call *before* spending, not after.
- **Offline mode.** Public routes physically cannot reach the API — spending is structurally impossible, not
  merely bounded. (This exists because a mis-set allowance once burned 149,000 credits in a single request.)

---

## Running it

```bash
npm install
cp .env.example .env        # add FORTYGUARD_API_KEY and one free LLM key
npm run dev
```

| Command | What it does |
|---|---|
| `npm run probe` | Verifies the API key, client, and cache end to end |
| `npm run triage -- --date 2026-08-28` | Cheap portfolio screening, 2 calls per site |
| `npm run analyze -- --site phx-roosevelt --date 2026-08-28` | Full deterministic pipeline, no LLM involved |
| `npm run agent -- "your question"` | The agent, with its audit trail |
| `npm run baseline` | Builds historical baselines (matched-window sampling) |
| `npm run snapshot` | Bundles the response cache for deployment |

`npm run analyze` is worth running first: it produces the headline result **with no language model in the
loop at all**, which is the point — the LLM plans and narrates, the data decides.

### Reasoning provider

Set any one of these in `.env` (all have a free tier, no card):

- `GEMINI_API_KEY` — [aistudio.google.com/apikey](https://aistudio.google.com/apikey) *(recommended)*
- `GROQ_API_KEY` — [console.groq.com/keys](https://console.groq.com/keys)
- `OPENROUTER_API_KEY` — [openrouter.ai/keys](https://openrouter.ai/keys)

Or `LLM_BASE_URL` + `LLM_API_KEY` + `LLM_MODEL` for any OpenAI-compatible endpoint.

---

## Endpoints used

| Endpoint | Used for |
|---|---|
| `POST /v1/heatmap` | Per-hour temperature across each worksite polygon; shift-window aggregates for triage |
| `POST /v1/env_params` | Hourly humidity series, solar irradiance, air quality |
| `GET /v1/status/{activity_id}` | Async task collection with backoff |
| `POST /v1/system/fetch-api-key-usage` | Live credit ledger, so the agent reports actual spend |

## Autonomy

`vercel.json` schedules `/api/cron/tick` daily at 11:00 UTC (04:00 PT) — ahead of the morning shift, inside
the API's 12-hour forecast horizon. Each tick sweeps the portfolio, evaluates every site against that shift
window, and posts a Slack alert for any site whose verdict is not `keep`. It runs whether or not anyone has
the page open — the audit trail fills in overnight.

*(A Hobby-plan Vercel account is limited to one cron firing per day; the tick is designed to be idempotent
and cache-first, so a Pro account can raise it to every few hours by editing `vercel.json` alone.)*

---

## Project layout

```
lib/fortyguard/    typed API client, measured cost model, layered cache
lib/heat/          NWS Rothfusz heat index + OSHA thresholds
lib/analysis/      hourly curve, counterfactual, percentile baseline, triage
lib/agent/         provider-agnostic LLM client, tool surface, agent loop
lib/monitor.ts     the autonomous sweep
app/               dashboard + API routes + cron
scripts/           probe, baseline, triage, analyze, agent, snapshot
probes/            raw API captures from the cost-model investigation
```

---

Built for the FortyGuard Hackathon '26. Thresholds reference OSHA's **proposed** heat standard — a proposed
rule, not settled law.
