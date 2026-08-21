# Product Requirements Document — Vriddhi

> Written retroactively at Phase 24, against what actually shipped across
> Phases 0–23 — not the aspirational version written before code existed.
> Where a Phase 0/1 intention changed during the build (Anthropic → Gemini,
> a real Razorpay account → a simulated gateway, dark theme → light
> theme), this document states the shipped decision and links to where it
> changed, rather than pretending the plan never moved.

## 1. Problem

A Razorpay merchant's dashboard shows *what* happened (orders, payments)
but not *what's leaking* — abandoned checkouts that never converted,
cross-sell pairs nobody is surfacing, patterns a busy small-business owner
has no time to go looking for. Generic analytics dashboards report; they
don't recommend an action and they don't move money.

## 2. Who this is for

A single merchant persona: a small-to-mid D2C store owner (the seed data
models a footwear/apparel brand, "Stride Collective") who wants revenue
recovery suggestions they can trust enough to approve with one click —
not a system that acts on their behalf without asking, and not a system
that just shows a chart and leaves the work to them.

## 3. What it does (shipped)

| Capability | Phase | Status |
|---|---|---|
| Detect abandoned-checkout opportunities (rule-based) | 7 | Shipped |
| AI narration of a detected opportunity in plain language | 8 | Shipped (degrades gracefully without a key) |
| Merchant-facing chat agent with tool-calling over real data | 9, 15 | Shipped |
| Deterministic policy/guardrail engine (budget, discount %, per-transaction cap) | 10 | Shipped |
| Human approval gate: Approve / Modify / Reject, all recorded | 11 | Shipped |
| Real payment-link execution against a Razorpay-shaped gateway | 12 | Shipped (simulated gateway — see §5) |
| Full audit trail of every detection/approval/execution/block | 13 | Shipped |
| Halt-and-reconcile failure handling with safe, scoped retry | 14 | Shipped |
| Cross-sell detection via basket co-occurrence analysis | 16 | Shipped |
| Public, unauthenticated catalog API for external AI agents | 17 | Shipped |
| Reversed-direction agent: an AI shopper that proposes (never completes) a purchase | 18, 19 | Shipped |
| Analytics dashboard — merchant/AI/financial-safety/business-impact metrics | 20 | Shipped, with explicit "not yet measured" labeling where true |
| Automated test suite (guardrail, failure, payment, security, detection) | 21 | Shipped, 37 tests |
| Light, premium UI (redesigned from an original dark theme) | 5, 23.5 | Shipped |
| Live deployment (Vercel + Neon) | 23 | Shipped |

## 4. What it explicitly does NOT do

- **No real user authentication.** Every page operates as a single demo
  merchant. Multi-tenant auth was scoped out of the MVP at Phase 0 and
  never revisited — this is a known, stated limitation, not an oversight.
- **No auto-execution.** `autoExecuteEnabled` exists as a policy field and
  is checked, but nothing in this codebase ever sets it to true by
  default or offers a path to skip human approval. Every money action
  requires an explicit Approve/Modify click.
- **No real customer-facing checkout.** The "customer" in both the
  abandoned-checkout flow and the AI-buyer flow is simulated/seeded data,
  not a live storefront.

## 5. Explicit build-vs-plan deviations (and why)

| Planned (Phase 0/3) | Shipped | Why |
|---|---|---|
| Anthropic Claude | Google Gemini (`gemini-3.6-flash`) | No Anthropic key was available; a working Gemini key was. See Phase 8 decision. |
| Real Razorpay test-mode account | `SimulatedRazorpayGateway` behind the same `RazorpayGateway` interface a real client also implements | Signing up requires GST/business details the user didn't have. User chose (via an explicit three-option decision) to build the simulated adapter now, real-gateway-ready later with zero code changes. See Phase 12 decision. |
| Auth.js session auth | Deferred entirely | Out of MVP scope; single demo merchant via `getDemoMerchant()`. |
| Dark, premium SaaS theme | Light, warm "parchment + ink" theme (Mecka.ai-inspired) | User-requested redesign after Phase 23, before this final phase. |

## 6. Success metrics — Designed vs. Measured

Following the same discipline requested at Phase 0 ("never claim a result
you didn't measure"), every metric below is tagged with what state it's
actually in:

- **Designed, not measured:** recovery rate (assumed 15–25%, a stated
  benchmark-based assumption, never observed against a real customer
  payment), incremental GMV, ROI. See `docs/AI-EVAL-REPORT.md` and the
  Analytics page (`/analytics`) itself, which labels these "Not yet
  measured" rather than showing a fabricated number.
- **Measured, from real (seeded) data:** GMV, AOV, conversion rate,
  repeat-customer count, opportunities detected, campaigns
  executed/blocked/failed, duplicate-prevention events — all computed
  live from Postgres, verified against direct SQL queries at Phase 20/21,
  not asserted from return values alone.
- **Measured, about the guardrails themselves (the actual differentiator):**
  37 automated tests confirm the policy engine, approval workflow,
  execution idempotency, and duplicate-prevention logic hold under
  adversarial and failure conditions — see `docs/PHASE-21-TESTING.md`.

## 7. Non-goals (stated once, not re-litigated per phase)

- Multi-merchant / multi-tenant support
- A real payment gateway integration beyond the interface-ready simulated one
- Mobile native apps
- Localization/i18n
- Real-time websocket updates (every page is server-rendered on request)
