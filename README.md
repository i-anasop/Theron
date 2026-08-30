# Theron

**Know whether your crew can work today — before they show up.**

FortyGuard Hackathon '26 · Track 06 — Agentic AI
**Live: [theron-ops.vercel.app](https://theron-ops.vercel.app)**

Theron is an autonomous agent for outdoor worksites. It checks how hot each site will actually get,
decides whether the scheduled shift is safe, and when it isn't, **proves** which alternative window is safer
and by how much. Every figure it reports traces back to an API call shown on the page.

---

## The insight it's built on

The Temperature API forecasts **12 hours** ahead. Read as weather, that's a limitation.

Twelve hours is **exactly one work shift** — the next one, the one you can still change.

Theron isn't a weather app and doesn't need a seven-day outlook. It does shift-level operational planning,
where 12 hours is the correct horizon rather than a compromise.

## The user, and why they'd pay

A safety manager responsible for crews at construction, utility and logistics sites in high-heat metros.
OSHA's proposed heat injury and illness prevention standard sets heat-index trigger points that map directly
onto the `env_params` heat index. That makes this a compliance and liability tool with a named buyer.

*Theron cites that rulemaking as **proposed**, not settled law — and the caveat is enforced in code, not
requested in a prompt. See below.*

## The measured result

Roosevelt Row Mixed-Use, Phoenix AZ · 34-worker crew · 2026-08-28, from live API data:

> Move the shift from **06:00–15:00 to 15:00–24:00**. Crew heat exposure falls from **138.5 to 95 °F-hours**
> above the high-heat trigger — a **31 % reduction**, **1,479 crew-degree-hours** removed. Mean heat index
> **105.4 → 100.6 °F**.
>
> No hour of this day falls below the trigger, so rest-cycle controls remain mandatory regardless.

That last line matters as much as the first: Theron returns a `stand_down` verdict when rescheduling
genuinely can't fix a day, rather than manufacturing a recommendation.

---

## Try it

| | |
|---|---|
| **Home** | [/](https://theron-ops.vercel.app) — what it does, a worked example |
| **Method** | [/method](https://theron-ops.vercel.app/method) — what we measured about the API, and the bugs we caught |
| **Ask** | [/app](https://theron-ops.vercel.app/app) — talk to the agent; watch it plan |
| **Monitor** | [/app/sites](https://theron-ops.vercel.app/app/sites) — live sites, thermal field, screen any US location |
| **Impact** | [/app/impact](https://theron-ops.vercel.app/app/impact) — what the exposure costs |
| **Trail** | [/app/history](https://theron-ops.vercel.app/app/history) — every API call, and the autonomous run log |

Everything in the demo runs at **zero credits** — the analysis is cached, content-addressed.

---

## Architecture

```
plain-language goal
        │
        ▼
   Planner ──► picks endpoints, sequences calls, budgets its own credit spend
        │
        ▼
   Executor ─► submit → activity_id → poll → cache.  Never polls inside a request.
        │
        ▼
   Analyst ──► self-baselines today against this site's own history since 2022
        │
        ▼
   Decider ──► proposes a window, then VERIFIES it by querying the alternative hours
        │
        ▼
   Auditor ──► renders every call, its cost, and its activity ID
```

### The rule the design turns on

**Tools return facts; the model returns prose.** Every figure in an output must appear verbatim in a tool
result. The model chooses what to ask and how to explain it — it never computes a number, cites a
regulation, or invents a control measure. Those constraints live in the tool layer.

Where a property must hold *every* time, it's enforced in code rather than asked for in a prompt. The
proposed-rule caveat is the clearest case: hardening the instruction wasn't enough — the eval suite caught
the model dropping it on 2 of 8 scenarios — so `enforceProposedRuleCaveat` guarantees it after generation.

### Provider-agnostic reasoning

Any OpenAI-compatible tool-calling endpoint drives the same loop. Ships configured for free tiers (Google AI
Studio, Groq, OpenRouter), with a **model fallback chain** so a rate limit degrades instead of failing.

---

## What we learned about the Temperature API

Every figure below was measured by reading the credit balance before and after a live call — not taken from
documentation. Raw captures are in [`probes/`](probes/); the full write-up is at
[/method](https://theron-ops.vercel.app/method).

| Finding | Detail |
|---|---|
| **Cost is per _call_, not per _data volume_** | One hour, twelve hours, a full day, a full month of days: **all exactly 4,220 credits** over the same polygon. |
| **Granularity is free** | 60 m costs the same as 100 m. Never request a coarser grid. |
| **`filter_type: 5` does not exist** | The handbook documents "5 = single month"; the API accepts only 1–4 and rejects 5. |
| **`env_params.temperature` is an _input_** | Not an output. See the trap below. |
| **Usage endpoint is shaped differently** | Needs the key in the *body* as well as the header, and returns its payload unwrapped. |
| **Measured costs** | heatmap **4,220** · env_params **2,900** · usage free. Charged only on success. |

### The trap that nearly shipped

Asking `env_params` for a whole day returns 24 hourly values for one 2,900-credit call. It looks like a
bargain. But `temperature` is an input, so the API applies your single scalar to all 24 hours — pairing
peak-afternoon heat with pre-dawn humidity.

It produced a **167 °F heat index at midnight in Phoenix**, with the daily *minimum* at 5 PM. Physically
impossible, and invisible unless you plot it.

The fix became an asset. Theron takes the genuinely-hourly humidity series from `env_params`, pairs it with
real per-hour temperature from `heatmap`, and computes the heat index itself via the NWS Rothfusz
regression. Cross-validated against the API's own output: **108.0 °F vs 108.0 °F — exact.** That equality is
now an assertion in the test suite.

We hit the same class of bug a second time in triage (peak temperature paired with peak humidity, hours
apart, yielding **161 °F** from an impossible dew point). That value is now explicitly a *screening
estimate*, labelled wherever it appears.

---

## Credit discipline

The API bills real money, so cost control is part of the product.

- **Two-stage sweep.** Triage screens a site for 2 calls (7,120 credits) instead of 24 (~101,000). Only
  flagged sites get the hourly curve.
- **Content-addressed cache.** Identical requests never pay twice. The demo runs at **0 credits**.
- **`CreditBudget`** refuses a call *before* spending.
- **Offline mode.** Public routes physically cannot reach the API — spending is structurally impossible, not
  merely bounded. *(This exists because a mis-set allowance once burned 149,000 credits in one request.)*
- **The scheduler can't drill on its own initiative.** The cron triages live but runs its hourly analysis
  against a cache-only client, so an unattended timer can never buy a 101,000-credit curve.

---

## Autonomy, proven

`vercel.json` schedules `/api/cron/tick` daily at 11:00 UTC. Every firing writes a record — when, **how it
was triggered**, which sites it checked, what it decided, what it spent — persisted to Redis and surfaced on
[/app/history](https://theron-ops.vercel.app/app/history).

A scheduled job that leaves no trace is indistinguishable from one that never ran, so the log distinguishes
scheduler-fired runs from human-triggered ones, and says plainly whether its entries came from a durable
store. Real runs are committed in [`data/run-log.json`](data/run-log.json) so the history is never empty.

---

## Tests and evals

```bash
npm test     # 47 unit tests — the safety-critical maths
npm run eval # 8 agent scenarios — behaviour, not wording
```

Most tests are **regressions**, because the bugs already happened: the inverted day, the mismatched maxima,
and the saturated-day metric failure (counting hours above the trigger scored every window identically on
exactly the days that matter — now degree-hours).

The eval harness asserts the agent never fabricates a regulation, never claims a spend it didn't make,
reaches the right verdict, resolves a bare follow-up against the prior turn, reports missing data as
missing, and stays inside budget. **It found a real compliance defect on its first run.** It spends zero
credits by construction.

---

## Running it

```bash
npm install
cp .env.example .env        # add FORTYGUARD_API_KEY and one free LLM key
npm run dev
```

| Command | What it does |
|---|---|
| `npm test` | Unit tests |
| `npm run eval` | Agent evaluation harness |
| `npm run probe` | Verifies key, client and cache end to end |
| `npm run triage -- --date 2026-08-28` | Cheap portfolio screening, 2 calls per site |
| `npm run analyze -- --site phx-roosevelt --date 2026-08-28` | Full pipeline, **no LLM involved** |
| `npm run agent -- "your question"` | The agent, with its audit trail |
| `npm run baseline` | Builds historical baselines (matched-window sampling) |
| `npm run snapshot` | Bundles the response cache for deployment |

`npm run analyze` is worth running first: it produces the headline result **with no language model in the
loop at all**. The LLM plans and narrates; the data decides.

### Reasoning provider

Set any one (all free, no card):

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

## Layout

```
lib/fortyguard/   typed client, measured cost model, layered cache
lib/heat/         NWS Rothfusz heat index + OSHA thresholds
lib/analysis/     hourly curve, counterfactual, percentile baseline, triage, tiles
lib/agent/        provider-agnostic LLM client, tool surface, agent loop
lib/monitor.ts    the autonomous sweep
lib/runlog.ts     run history
app/(marketing)/  home + method
app/app/          workspace: ask, monitor, impact, trail
tests/            47 unit tests
scripts/          probe, baseline, triage, analyze, agent, eval, snapshot
probes/           raw API captures from the cost-model investigation
```

---

Built for the FortyGuard Hackathon '26. Thresholds reference OSHA's **proposed** heat standard — a proposed
rule, not settled law.
