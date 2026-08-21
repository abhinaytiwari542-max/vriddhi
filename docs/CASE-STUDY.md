# Case Study: Vriddhi — AI Growth & Agentic Commerce

**Live demo:** https://vriddhi-beta.vercel.app
**Code:** https://github.com/abhinaytiwari542-max/vriddhi
**Role:** Solo — product definition, full-stack build, AI integration, testing, deployment

## The problem

Small merchant dashboards report what happened. They rarely tell a
non-technical store owner what's *recoverable* — an abandoned checkout
that almost converted, a cross-sell pattern nobody's surfacing — and
they never propose a specific, costed action the owner can approve with
one click. Meanwhile, "AI agent" products are increasingly comfortable
letting a model take real actions with real money attached, often on
trust in the prompt alone.

Vriddhi is a deliberately narrow answer to both: an agent that detects
two kinds of revenue opportunity in a merchant's own order data,
explains them in plain language, and can only ever *propose* a costed
action — a deterministic policy engine, a human approval gate, and a
full audit trail sit between every suggestion and any money actually
moving.

## Why the safety spine, not the AI, is the actual product

It would be easy to build a chatbot that "seems" to respect a budget
because its system prompt says so. That's not what shipped here.
Concretely:

- **The AI literally cannot supply financial numbers.** The
  `create_campaign` tool's input schema has one field —
  `opportunityId`. Discount amount, audience, and cost are always
  re-read from the `Opportunity` row a deterministic rules engine wrote.
  I proved this by writing a test that smuggles a fake
  `discountPerCustomer: ₹9,999,999` into the tool call and confirming
  the resulting campaign used the real number instead
  (`tests/tool-safety.test.ts`).
- **The policy check runs three times, not once** — at draft, at
  approval, and again at execution — against the merchant's *current*
  limits each time. Tightening a budget after approving a campaign but
  before it executes still blocks it.
- **A halted execution reconciles with the gateway before concluding
  anything failed**, and a retry is structurally incapable of touching
  a target that already succeeded — verified with an actual
  byte-for-byte diff of payment-link IDs before and after a retry, not
  just a green checkmark. See `docs/FAILURE-HANDLING-DEMO.md`.

None of that is prompt engineering. It's ordinary backend engineering
applied to a system that happens to have an LLM in it — which is the
argument I'd make to anyone skeptical that "agentic" products need to
be riskier than that.

## What I actually built (22 phases, one at a time, each tested before the next started)

- Two independent detection engines (abandoned-checkout scoring,
  cross-sell basket analysis via co-occurrence/lift/confidence) — both
  fully rule-based, zero LLM involvement in the numbers.
- An AI narration layer with a response schema that has *zero numeric
  fields*, so it structurally cannot invent a number even if the model
  wanted to.
- A merchant-facing chat agent and a **second, reversed-direction**
  agent — a simulated AI shopper that can propose a purchase but has no
  tool that can pay, mirroring the same discipline from the other side
  of a transaction.
- A policy engine, approval workflow, and execution pipeline with real
  halt/reconcile/retry failure handling.
- A full audit trail and an analytics dashboard that reports
  "Not yet measured" rather than a fabricated number where that's the
  honest state (see below).
- 45 automated tests covering the guardrails specifically — not
  incidental coverage, the actual point of the test suite. A later
  addition (Phase 25) added a deliberate red-team suite: structural
  attack tests plus a live jailbreak-prompt run against the real model,
  see `docs/RED-TEAM-REPORT.md`.
- A live deployment (Vercel + Neon), a public GitHub repo, and — after
  the build was functionally done — a full light-theme redesign done at
  the user's request without touching any of the above.

## Real decisions made under real constraints

This wasn't built with an unlimited budget or a clean environment, and
I think the decisions made under those constraints are more interesting
than the ones made with no constraints at all:

- **No Anthropic key was available.** Rather than block, I switched the
  AI layer to Google Gemini — isolated behind one client module, so it
  was a one-file change, not a scattered one.
- **No Razorpay test-mode account was available** (needs GST/business
  registration). Rather than fake payment execution invisibly or skip
  it, I built a real `RazorpayGateway` interface with a simulated
  implementation that mimics the actual SDK's shapes and latency —
  every payment link visibly says "SIMULATED," and the switch to a real
  gateway is a two-env-var change, not a rewrite.
- **The Gemini free tier turned out to be capped per Google Cloud
  project, not per key.** When I later added multi-key fallback (at the
  user's request, after they generated 6 additional keys), I verified
  live that the fallback logic worked exactly as designed — and that it
  didn't add real headroom in this case, because all 7 keys shared one
  project's quota pool. I reported that honestly rather than claiming
  the feature "fixed" a problem it structurally couldn't.
- **A real bug sat undiscovered for 18 phases:** a CSS variable
  (`--font-sans`) was circularly self-referencing since the very first
  UI-foundation commit, silently falling back to the browser's default
  serif font in every screenshot taken across the entire project. It
  wasn't visual QA that caught it — it was a `getComputedStyle` check
  during an unrelated redesign. Worth remembering that a screenshot
  looking "fine" isn't the same as confirming the right font actually
  loaded.

## What's measured, what's designed, what's proposed

Because the underlying stated assumption — a 15–25% recovery rate on a
targeted discount — is exactly the kind of number that's easy to quietly
promote from "assumption" to "fact" in a demo, I kept these separated
explicitly throughout, including on the live Analytics page itself:

- **Measured** (real seeded data, verified against direct SQL, not just
  return values): GMV, AOV, conversion, opportunities detected,
  campaigns executed/blocked/failed, duplicate-prevention events.
- **Designed, stated as an assumption, never measured:** the 15–25%
  recovery-rate benchmark itself. See `docs/EXPERIMENT-PLAN.md` for the
  actual randomized-trial design that would validate it against real
  customers — proposed, deliberately not run, since this project never
  had real customers to run it against.
- **Proposed:** a real LLM eval harness (`docs/AI-EVAL-REPORT.md`) —
  what exists today is an honest record of single live observations per
  phase, not a scored benchmark, because the free-tier quota made
  repeated runs impractical.

## What I'd do differently with more time or a bigger budget

- Real authentication before anything else UI-related — the single
  demo-merchant pattern was the right MVP call, but it's the first
  thing that stops being fine the moment a second real merchant shows up.
- A paid-tier Gemini key (or keys from genuinely separate GCP projects)
  so the AI narration/chat/buyer-agent paths could be demoed live on
  demand instead of degrading gracefully most of the time.
- The actual experiment in `docs/EXPERIMENT-PLAN.md`, run for real, the
  moment there's a real merchant and real customers to run it on.

## The honest one-line pitch

An AI agent that finds real revenue leaks in a merchant's own data and
proposes a specific, costed fix — but every dollar it recommends still
has to clear a deterministic budget check and a human's explicit yes
before anything happens, and I can point to the exact test that proves
it, not just tell you it's true.
