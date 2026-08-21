# Vriddhi — AI Growth & Agentic Commerce

An AI agent that detects revenue opportunities for Razorpay merchants (starting
with abandoned-checkout recovery) and executes approved actions through
Razorpay **test-mode** APIs, behind a deterministic policy engine, a human
approval gate, and a full audit trail.

This repo is being built in sequential phases — see `docs/` for the product
brief, PRD, UX flows, and architecture behind each decision. Project status
as of this commit: **Phase 4 — project scaffold**, not yet feature-complete.

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind CSS · Prisma 7 + Postgres ·
Anthropic Claude SDK · Razorpay Node SDK (test mode only) · Auth.js

## Prerequisites

- Node.js 20+
- A local Postgres server (this project was set up against Homebrew Postgres 16)

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

# 5. Start the dev server
npm run dev
```

Open **http://localhost:3000** — you should see a scaffold-check page
reporting `Database: connected`. `http://localhost:3000/api/health` returns
the same status as JSON.

`ANTHROPIC_API_KEY` and `RAZORPAY_*` keys are not required yet — they're
wired in starting Phase 8 (AI layer) and Phase 12 (Razorpay integration)
respectively. Until then the app runs entirely against local seeded/derived
data.

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
