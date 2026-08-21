# Portfolio Materials

Supporting copy for using Vriddhi as a portfolio piece — a short
description, resume bullets, and a prepared interview narrative. See
`docs/CASE-STUDY.md` for the full write-up these are distilled from.

## Portfolio description (short)

> **Vriddhi** — an AI growth agent for Razorpay merchants that detects
> abandoned-checkout and cross-sell revenue opportunities, explains them
> in plain language, and drafts a specific, costed recovery action — but
> every action passes through a deterministic policy engine and an
> explicit human approval before anything executes. Built solo across 22
> shipped phases: Next.js + Prisma + Postgres + Google Gemini, 37
> automated tests targeting the safety guarantees specifically, deployed
> live on Vercel + Neon.
> [Live demo](https://vriddhi-beta.vercel.app) · [Code](https://github.com/abhinaytiwari542-max/vriddhi)

## Resume bullets

Pick 2–4 depending on the role; the first two are the strongest general-purpose ones.

- Designed and built an AI agent product (Next.js, Prisma/Postgres,
  Google Gemini) where every LLM-proposed action passes through a
  deterministic policy engine and human approval gate before executing —
  proved the guardrail with automated tests that attempt to smuggle
  fabricated financial values into tool calls and confirm they're ignored.
- Shipped a full-stack agentic-commerce demo end-to-end solo — 22
  incremental phases, each tested live and approved before the next
  started — including a payment-execution pipeline with halt/reconcile/
  retry failure handling verified by a byte-for-byte diff of transaction
  IDs before and after retry.
- Built and shipped a reversed-direction AI agent (a simulated shopper
  proposing purchases against a public catalog API) using the identical
  propose-then-human-authorizes safety pattern as the merchant-facing
  agent, demonstrating the pattern generalizes across both sides of a
  transaction.
- Wrote 37 automated tests targeting guardrail, failure-handling, and
  security behaviors specifically (not incidental coverage) against a
  dedicated test database, plus a written report distinguishing what's
  covered from what explicitly isn't.
- Made and documented real build-time tradeoffs under real constraints
  (no available Anthropic key, no Razorpay test account) — isolated the
  AI provider and payment gateway each behind a single interface so
  either could be swapped with a one-file or zero-code change.

## Interview explanation (prepared narrative)

**"Tell me about a project you're proud of."**

I built an AI agent for Razorpay merchants — it looks at a merchant's own
order data, finds abandoned checkouts and cross-sell opportunities, and
proposes a specific action: "here are 24 high-intent customers, a ₹100
discount link would cost ₹2,400, here's the expected recovery range."

The part I'm actually proud of isn't the AI — it's that the AI
structurally cannot spend money. The tool the agent calls to draft a
campaign only accepts an opportunity ID; the discount amount and cost are
always re-read from a row a separate, deterministic rules engine wrote.
I wrote a test that tries to smuggle a fake ₹99 lakh discount into that
same tool call and confirmed the resulting campaign used the real number
instead, not the smuggled one. Then there's a policy engine that checks
budget/discount%/per-transaction limits three separate times — at draft,
at approval, and again at execution — against whatever the merchant's
*current* limits are, not what they were when the campaign was drafted.
And nothing executes without an explicit human clicking Approve, which
writes an immutable record of what was approved.

**"What was the hardest part?"**

Two things, honestly. First, I didn't have a real Razorpay account — no
GST registration — so I built a real gateway *interface* with a simulated
implementation that mimics the actual SDK's request/response shapes, and
made the switch to a real gateway a two-environment-variable change
instead of a rewrite. Second, the free Gemini tier gave me 20 requests a
day, which kept blocking live testing. I eventually added multi-key
fallback — and when I tested it, I found all the extra keys I'd been
given belonged to the same Google Cloud project, so they shared one quota
pool. The fallback code was correct; it just didn't solve the actual
problem, and I said so rather than claiming it did.

**"What would you do differently?"**

Add real authentication before doing anything else UI-related — I used a
single demo-merchant pattern for the whole build, which was the right MVP
call, but it's the first thing that breaks the moment there's a second
real merchant. And I'd actually run the A/B test I designed for the
recovery-rate assumption — right now that 15–25% number is a stated
benchmark-based guess, not something I measured against real customers,
and I was careful to label it that way on the analytics dashboard itself
rather than let a demo number quietly become a claimed result.
