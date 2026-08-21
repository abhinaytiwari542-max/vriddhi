# Vriddhi — AI Growth & Agentic Commerce

An AI agent that detects revenue opportunities for Razorpay merchants —
abandoned-checkout recovery and cross-sell — and drafts recovery actions
that a human must explicitly approve before anything executes. A second,
reversed agent lets a simulated AI shopper browse the same merchant's
catalog and propose (never silently complete) a purchase. Every money
action passes through a deterministic policy engine, a human approval
gate, and a full audit trail — the LLM can suggest, but it can't spend.

Built in 22 sequential phases, each shipped, live-tested, and approved
before the next started. See `docs/` for the architecture decisions
behind specific phases, and [`docs/PHASE-21-TESTING.md`](docs/PHASE-21-TESTING.md)
for what's actually verified vs. what isn't.

## What's real here, and what's deliberately simulated

- **Real**: the Postgres data model, the policy/guardrail engine, the
  approval workflow, the audit trail, halt-and-retry failure handling
  with idempotent execution, the cross-sell basket analysis, the Gemini
  AI narration layer, and 37 automated tests covering all of the above.
- **Simulated, by explicit design choice**: Razorpay payment links. There
  was no Razorpay test-mode account available while building this (needs
  business/GST details), so a `SimulatedRazorpayGateway` mimics the real
  SDK's request/response shape exactly, behind the same `RazorpayGateway`
  interface a real client also implements. Set `RAZORPAY_KEY_ID` /
  `RAZORPAY_KEY_SECRET` and the app switches to the real gateway with zero
  code changes — nothing else needs to know which one is active.
- **Not built**: real user authentication. Every page currently operates
  as a single demo merchant (`getDemoMerchant()`) rather than a
  session-derived one — a deliberate MVP scope call, not an oversight.

## Stack

Next.js 16 (App Router, TypeScript, Turbopack) · Tailwind CSS v4 +
shadcn/ui · Prisma 7 + Postgres (driver adapters) · Google Gemini
(`@google/genai`, model `gemini-3.6-flash`) · Razorpay Node SDK (test-mode
client written, simulated client used by default) · Vitest.

(Phase 0 originally planned Anthropic Claude and Auth.js — Claude was
swapped for Gemini when no Anthropic key was available; Auth.js was
deferred as out of MVP scope. See project decisions for why.)

## Prerequisites

- Node.js 20+
- A local Postgres server (this project was built against Homebrew
  Postgres 16) for local development — production uses a hosted Postgres
  (Neon), see **Deployment** below.

## Local setup

```bash
# 1. Install dependencies
npm install

# 2. Create the local database (skip if it already exists)
createdb vriddhi_dev

# 3. Copy env vars and adjust DATABASE_URL if your Postgres user differs
cp .env.example .env

# 4. Apply the database schema
npm run db:migrate

# 5. Seed realistic demo data (products, customers, orders — including
#    abandoned checkouts and cross-sell-eligible baskets)
npm run db:seed

# 6. Start the dev server
npm run dev
```

Open **http://localhost:3000**. `http://localhost:3000/api/health` reports
live DB connectivity as JSON.

`GEMINI_API_KEY` is optional — without it, AI narration degrades
gracefully to a rule-based summary and the AI-driven chat/buyer flows are
disabled, but every deterministic feature (detection, policy, approval,
execution, audit, analytics) still works. `RAZORPAY_KEY_ID`/`_SECRET` are
also optional — omit them to use the simulated gateway (the default).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` / `npm start` | Production build / run |
| `npm run lint` | ESLint |
| `npm test` | Run the test suite (Vitest) — see below |
| `npm run db:migrate` | Apply Prisma migrations to your local DB |
| `npm run db:generate` | Regenerate the Prisma client after a schema change |
| `npm run db:studio` | Open Prisma Studio (visual DB browser) |
| `npm run db:seed` | Seed demo data into the local DB |

## Running tests

Tests run against a separate `vriddhi_test` database — never `vriddhi_dev` —
so they can freely truncate tables between runs without touching the demo
dataset. One-time setup:

```bash
createdb vriddhi_test
DATABASE_URL="postgresql://$(whoami)@localhost:5432/vriddhi_test?schema=public" npx prisma migrate deploy
```

Then:

```bash
npm test
```

See [`docs/PHASE-21-TESTING.md`](docs/PHASE-21-TESTING.md) for what's
covered (and, just as importantly, what's explicitly not).

## Deployment

Deployed on **Vercel** (hosting) + **Neon** (managed Postgres). Both have
free tiers sufficient for this project.

1. **Provision Postgres** — create a free project at
   [neon.tech](https://neon.tech), copy its connection string.
2. **Apply the schema and seed data against it**:
   ```bash
   DATABASE_URL="<neon-connection-string>" npx prisma migrate deploy
   DATABASE_URL="<neon-connection-string>" npm run db:seed
   ```
3. **Import the GitHub repo into Vercel** (or `vercel` via the CLI) and set
   these environment variables in the Vercel project settings:

   | Variable | Required | Notes |
   |---|---|---|
   | `DATABASE_URL` | Yes | The Neon connection string from step 1 |
   | `GEMINI_API_KEY` | Recommended | Enables AI narration + chat/buyer agents; app degrades gracefully without it |
   | `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | No | Leave unset to keep the simulated gateway in production too |

4. Deploy. Vercel builds with `next build` and serves over HTTPS
   automatically — no extra config needed.
5. Verify with `https://<your-deployment>/api/health`.

Logging is Vercel's built-in function/runtime logs — nothing custom was
added, since every business-relevant event (detections, approvals,
executions, blocks, failures) already writes to the app's own `AuditLog`
table, visible at `/audit` in the app itself.
