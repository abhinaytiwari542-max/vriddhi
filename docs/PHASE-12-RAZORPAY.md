# Phase 12 — Razorpay Test API Integration

## Status: running in **simulated mode**

No Razorpay account was available when this phase was built — Razorpay's
signup flow asks for business/GST details the project owner didn't have.
Rather than skip real API integration or fake it silently, the codebase has
one interface (`RazorpayGateway`) with two implementations, chosen
automatically:

- **`RealRazorpayGateway`** (`src/lib/razorpay/real-client.ts`) — wraps the
  official `razorpay` npm SDK against real test-mode credentials. Written
  and type-checked, but **not yet exercised against a real account**.
- **`SimulatedRazorpayGateway`** (`src/lib/razorpay/simulated-client.ts`) —
  matches the real SDK's request/response shape exactly and adds
  realistic (200–600ms) latency, so every layer above it — idempotency,
  audit logging, status transitions, the UI — is genuinely exercised
  against something that behaves like the real API, not mocked away.

`getRazorpayGateway()` (`src/lib/razorpay/gateway.ts`) picks real vs.
simulated based on whether `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are set
in the environment. **The moment real test-mode keys are added to `.env`,
the app switches to the real API with no other code change.**

Every screen that touches this shows a **"SIMULATED gateway"** badge —
never labeled as if it were real.

## Credentials setup (for when a real account exists)

1. Sign up at [razorpay.com](https://razorpay.com), keep **Test Mode** on.
2. Settings → API Keys → Generate Test Key → copy `key_id` and `key_secret`.
3. Add to `.env`:
   ```
   RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
   RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. Restart the dev server. `/campaigns` will show "Razorpay test mode"
   instead of "SIMULATED gateway" and real Payment Links will be created.

Credentials are read only from environment variables, never logged, never
returned by any API response, and `.env` is gitignored.

## Endpoint used

**Payment Links API** — `POST /v1/payment_links` (via the SDK's
`razorpay.paymentLink.create()`), one call per targeted customer in an
approved campaign. This is the "one safe transaction workflow" the phase
calls for: creating a discounted payment link a customer can choose to pay,
never charging anyone directly.

### Request (real and simulated both accept this same shape)

```json
{
  "amount": 293200,
  "currency": "INR",
  "description": "Vriddhi recovery offer",
  "reference_id": "cm...<CampaignTarget id>",
  "customer": { "name": "Ghanshyam Malik", "email": "...", "contact": "+91-..." },
  "notify": { "sms": false, "email": false }
}
```

### Response — real Razorpay API (per the SDK's types, not yet observed live)

```json
{
  "id": "plink_ERgihyaAAC0VNW",
  "short_url": "https://rzp.io/i/AbCd1234",
  "status": "created",
  "amount": 293200,
  "amount_paid": 0,
  ...
}
```

### Response — simulated gateway (actually observed, real run)

```json
{
  "id": "plink_krvZ5F6ydEJBYN",
  "shortUrl": "https://simulated-razorpay.invalid/pl/plink_krvZ5F6ydEJBYN",
  "status": "created"
}
```

The simulated `shortUrl` domain is `.invalid` — an IANA-reserved TLD
guaranteed to never resolve — so nobody can mistake it for a clickable,
real payment link.

## Execution chokepoint

`executeApprovedCampaign()` (`src/lib/services/campaign-execution.ts`) is
the **only** code path allowed to call the gateway:

```
Campaign must be APPROVED
  → re-run evaluatePolicy() a 3rd time (draft → approval → here)
  → Campaign.status = EXECUTING
  → for each target (skip if already LINK_CREATED/PAID — idempotent):
      → gateway.createPaymentLink()
      → on success: target.status = LINK_CREATED, store the link id
      → on failure: target.status = FAILED
      → write an AuditLog row either way
  → Campaign.status = COMPLETED (or HALTED if any target failed)
  → write a final AuditLog row
```

Targets are processed **sequentially, not in parallel** — deliberately, so
a mid-run failure (Phase 14) has a well-defined "N of M done" boundary
instead of a scattered result, and so a real integration wouldn't hammer
Razorpay's rate limits.

## Error handling (this phase)

- **Not approved** → refused before any gateway call, no side effects.
- **Policy blocked at execution time** → refused, campaign stays APPROVED,
  nothing sent. (Verified: lowering a limit between approval and execution
  blocks execution — see Phase 10/11 test notes.)
- **Already executed** → re-running `executeApprovedCampaign` on a
  COMPLETED campaign is refused outright (verified live — see below); a
  partially-HALTED campaign would skip already-`LINK_CREATED` targets and
  only retry the rest.
- **Per-target gateway failure** → caught, that target marked `FAILED`,
  logged, loop continues to the next target rather than aborting the whole
  batch. (Full timeout/reconciliation UX — mid-run halt with a merchant-
  facing "safety receipt" — is Phase 14's job, not this one.)

## What was actually verified live (not asserted)

Ran a real approved campaign (22 customers, ₹100 discount, ₹2,200 cap)
through `executeApprovedCampaign()`:

- All 22 simulated Payment Links created, each with a realistic
  `plink_`-prefixed id and a real-looking (but `.invalid`-domain) short URL.
- `campaign_targets`: all 22 → `LINK_CREATED`.
- `campaigns`: → `COMPLETED`.
- `audit_logs`: 1 `campaign.execution.started` (actor `SYSTEM`), 22
  `payment_link.created` (actor `RAZORPAY`), 1 `campaign.execution.finished`
  — 24 rows, all `SUCCESS`, all queryable in Postgres.
- Re-running execution against the same, now-`COMPLETED` campaign was
  refused with `"Campaign is not approved for execution."` and created
  zero additional rows anywhere.

## Known gap

`docs/PRD.md`, `docs/UX-flows.md`, and `docs/ARCHITECTURE.md` were promised
in Phases 1–3 but never actually committed — this is the first file in
`docs/`. Worth catching up on before Phase 24 (Portfolio Packaging), which
needs them anyway.
