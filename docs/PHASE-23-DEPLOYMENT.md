# Phase 23 — Deployment

**Live URL:** https://vriddhi-beta.vercel.app
**Repo:** https://github.com/abhinaytiwari542-max/vriddhi (public)
**Hosting:** Vercel · **Database:** Neon (managed Postgres, free tier)

## What's actually running in production

Same code as local dev, same simulated Razorpay gateway (no
`RAZORPAY_KEY_ID`/`_SECRET` set in production — see Phase 12's decision),
same Gemini AI layer (`GEMINI_API_KEY` set, subject to the same free-tier
daily quota noted in Phase 18's memory). The production database is a
Neon Postgres project, migrated with `prisma migrate deploy` and seeded
with the same `prisma/seed.ts` script used locally — same demo merchant
("Stride Collective"), same shape of data, different random values (the
seed script uses real randomness, not a fixed seed, so exact rupee
figures differ run to run — verified GMV ≈ ₹5,28,745 on this seed vs.
≈ ₹5,51,544 on the local dev DB's most recent seed; both are real, just
different random draws).

## Setup performed

1. Created a public GitHub repo and pushed all 22 phases of history.
2. Created a Neon Postgres project, ran `prisma migrate deploy` against
   its **direct** (non-pooled) connection string, then seeded it.
3. Vercel auto-created a project from the GitHub push (an existing
   GitHub↔Vercel integration on this account auto-imports new repos) —
   used that project rather than creating a second one via `vercel link`,
   so future pushes to `main` auto-deploy without any manual step.
4. Set `DATABASE_URL` (Neon's **pooled** connection string — recommended
   for serverless functions that open/close connections frequently) and
   `GEMINI_API_KEY` as Production + Preview environment variables.
5. Deployed with `vercel deploy --prod`.

## Two things found while deploying, not before

**A real bug in `prisma/seed.ts`, caught for the first time here:**
`OrderItem` (Phase 16) and `ProductCrossSell` (Phase 16) were never added
to the cleanup sequence at the top of the seed script. Every local re-seed
during Phases 16-22 happened via `prisma migrate reset` (drops and
recreates the schema, so there was nothing to clean up) rather than
re-running `seed.ts` directly against an already-seeded database — so this
FK-ordering bug stayed latent until seeding a fresh Neon database that
already had a partial seed from a first, timed-out attempt. Fixed by
adding both `deleteMany()` calls in the correct FK-safe order (see the
Phase 23 commit). Re-ran locally against `vriddhi_dev` (already had months
of test data in it) to confirm the fix before trusting it against Neon.

**Unexpected pre-existing environment variables on the auto-created Vercel
project:** `DATABASE_URL`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`, `AUTH_SECRET`, `APP_URL`, and `DEMO_MODE` were
already present the moment the project was created (timestamps ~12
minutes before I touched env vars at all) — before any `vercel env add`
call from this session. `DATABASE_URL` held a value pointing at
`127.0.0.1`, which is why the first health check after auto-deploy
returned `"database":"unreachable"`. The provenance of these values isn't
established from this session alone; they were removed (Razorpay keys,
since the app must never think it has real Razorpay credentials when it
doesn't) or overwritten with correct values (`DATABASE_URL`,
`GEMINI_API_KEY`) rather than trusted as-is. If a future session sees
unexplained environment variables on a Vercel project, verify their
actual values before assuming they're correct — don't assume "already
set" means "set correctly."

## Verified live after deploy

- `GET /api/health` → `{"status":"ok","database":"connected","merchantCount":1}`
- `GET /api/catalog` → real seeded product data
- `/overview` and `/analytics` render with real numbers from the Neon
  database, screenshotted and visually confirmed, not just curled.
