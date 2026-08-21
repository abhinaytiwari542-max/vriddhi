# Phase 21 — Test report

37 tests, 8 files, run with `npm test` (Vitest) against a dedicated
`vriddhi_test` Postgres database — never the `vriddhi_dev` database that
holds the demo dataset. Every table is truncated before each test
(`tests/setup.ts`), and each test builds its own fixtures from scratch
(`tests/helpers/fixtures.ts`) — no test depends on another's state or on
seed data.

```
npm test
```

## What's covered, and where

The 24-phase plan asked for unit, integration, agent, guardrail, failure,
security, and payment coverage. Most of this codebase's logic touches
Postgres directly (there are very few pure functions to isolate), so the
split below is by **what's being proven**, not by a strict unit/integration
line — a test that hits the real test database while exercising one
service function in isolation is still doing unit-level verification of
that function's behavior.

| Category | File | What it proves |
|---|---|---|
| Guardrail | `policy-engine.test.ts` | `evaluatePolicy` blocks on budget, per-transaction value, and discount % independently; blocks unconditionally with no policy row; reads the merchant's **current** limits, not a cached snapshot. |
| Guardrail | `approval-engine.test.ts` | Approve/reject/modify each re-run the policy check against current limits; a blocked approval/modify changes zero state; only DRAFT campaigns can be decided on (double-decision attempts refused). |
| Guardrail + Failure | `campaign-execution.test.ts` | The sole Razorpay-gateway chokepoint refuses non-APPROVED/HALTED campaigns; halts at an injected failure index leaving later targets untouched; a retry only touches the remainder and produces **byte-for-byte identical** links for everything already created (real diff, not just a status check); re-checks policy at execution time even for an already-approved campaign. |
| Payment | `buyer-checkout.test.ts` | Over-budget and unavailable-product proposals are refused before any order exists; a valid proposal creates a `CREATED` order with zero payments; budget is re-checked at authorization time; a simulated payment failure leaves the order retryable with **zero** Payment rows, and the next successful attempt writes **exactly one**; re-authorizing an already-PAID order is blocked and logged; cancel-then-authorize and double-cancel are both refused. |
| Security | `tool-safety.test.ts` | `runTool` logs and rejects unknown tools and schema-invalid input before any handler runs; every call — success or failure — writes an `AgentAction` row; `create_campaign` **ignores model-supplied discount/cost fields entirely** (its Zod schema only accepts an opportunity id, proven by smuggling `discountPerCustomer`/`maxCost` into the call and confirming the resulting campaign used the real Opportunity numbers instead); `create_payment_order` refuses unconditionally regardless of input. |
| Security | `db-constraints.test.ts` | The `@@unique([campaignId, customerId])` and `@@unique([productId, recommendedProductId])` constraints reject a second row even if application logic were ever bypassed — the DB is a second, independent line of defense, not just the app-level idempotency checks. |
| Unit (agent-facing logic) | `opportunity-engine.test.ts` | Abandonment threshold (30 min) gates detection; intent scoring correctly separates a repeat/recent/above-median customer from a first-time one; impact is always a 15–25% range, never a point estimate; repeated runs upsert the same OPEN opportunity instead of duplicating. |
| Unit (agent-facing logic) | `cross-sell-engine.test.ts` | Below the minimum co-occurrence (4), nothing is detected; a real qualifying pair clears the lift/confidence thresholds with the actual computed numbers; a pair already recorded in `ProductCrossSell` is excluded from re-detection. |

**"Agent" coverage, explained:** the LLM (Gemini) call itself is not
exercised in this suite — it's non-deterministic, rate-limited (see the
Phase 18 quota note in project memory), and calling it isn't what makes
the safety guarantees hold. What *is* tested, deterministically, is the
one thing that actually matters for agent safety: **`runTool` is the only
door a tool call can go through**, and that door validates input and logs
every call regardless of whether Gemini or a test script is on the other
side of it. `tool-safety.test.ts` calls `runTool` exactly as `agent.ts`'s
loop would, with the same source (`"CHAT"`), just without a live model
picking the arguments.

## Explicitly NOT covered — do not assume these work from this report

- **The real Razorpay gateway** (`RealRazorpayGateway`) — written and
  type-checked, never exercised, because there's still no Razorpay test
  account (see Phase 12's decision in project memory). Only the simulated
  gateway is under test.
- **The live Gemini call path** (`agent.ts`, `buyer-agent.ts`,
  `explain-opportunity.ts`) — no test in this suite calls the real API.
  These were verified live, manually, in Phases 8/9/15/18/19 (see project
  memory for what was actually observed, including real quota-exhaustion
  behavior) — that manual verification is not repeated or re-proven here.
- **UI/browser end-to-end tests** — no Playwright (or similar) suite exists.
  Every page has been manually verified live in the browser at its own
  phase checkpoint (documented per-phase in project memory); this Vitest
  suite does not re-verify rendering, click flows, or responsive layout.
- **Concurrency / race conditions** — e.g. two simultaneous execution
  requests for the same campaign. The DB unique constraints
  (`db-constraints.test.ts`) would prevent a duplicate row even under a
  race, but no test actually fires concurrent requests to prove that
  under load.
- **Load / performance** — no volume or timing assertions anywhere.

## A real bug this suite caught while it was being written

The first version of the `create_campaign` "ignores smuggled numbers" test
failed — not because the guardrail was wrong, but because the test's own
fixture used a fake `orderId` string in the opportunity's evidence, and
`CampaignTarget.orderId` is a real foreign key to `Order`. Fixed by having
the fixture create a real `Order` row. Kept as a reminder that this class
of FK mismatch is easy to introduce when hand-building JSON evidence.

The cross-sell "detects a pair" test also initially failed for a different
reason: the fixture had every order containing the "anchor" product, which
makes lift mathematically equal to 1 no matter the numbers (if support(A)
== totalOrders, then confidence(A→B) == support(B), so lift == 1 always).
Fixed by adding orders for an unrelated product to dilute the denominator,
the same way a real catalog with many single-item purchases would.
