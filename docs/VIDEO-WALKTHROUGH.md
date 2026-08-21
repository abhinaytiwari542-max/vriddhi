# 5-Minute Walkthrough Script (Loom)

A timed script for a screen-share walkthrough — what to say, what to show,
and roughly how long each part should take. Total: ~5:00. Practice it
once out loud before recording; the timings assume a normal speaking
pace with pauses while you click through the app.

Everything in here is a real, already-verified fact from the build (see
`docs/CASE-STUDY.md` and `docs/AI-EVAL-REPORT.md`) — nothing is written
for effect that isn't also true.

---

## 0:00–0:25 — Hook + the problem

**[Screen: the marketing landing page, `/`]**

> "This is Vriddhi — an AI agent for Razorpay merchants. Here's the
> problem it solves: a merchant's dashboard tells you what happened —
> orders, payments — but not what's *recoverable*. An abandoned checkout
> that almost converted. A cross-sell nobody's surfacing. Vriddhi finds
> that, explains it in plain language, and proposes a specific, costed
> action — but it can't spend a rupee without a human saying yes."

## 0:25–1:00 — Objectives, in one breath

**[Screen: stay on landing page, then click "View live demo" → `/overview`]**

> "Three goals going in: find real revenue leaks in a merchant's own
> order data, let an AI explain and recommend an action in plain
> language, and make sure that AI structurally *cannot* execute anything
> financial on its own — a deterministic policy engine and a human
> approval have to sit between every suggestion and any money that
> moves. That safety constraint is the actual point of this project, not
> a side feature."

## 1:00–2:30 — The core loop, live (detect → explain → approve → execute → audit)

**[Screen: `/opportunities`]**

> "Here's a real detected opportunity — 43 abandoned checkouts, 24 of
> them scored high-intent based on real signals: did they buy before, how
> recently did they abandon, was the cart above-average. That's a
> deterministic rules engine, zero AI. The AI's only job is to narrate
> these exact numbers in plain language — [point at the explanation] —
> and its response schema literally has no numeric fields, so it can't
> invent a number even if it tried."

**[Click "Draft recovery campaign"]**

> "Drafting a campaign runs a policy check server-side — budget, discount
> percentage, per-transaction cap — before anything's created."

**[Navigate to `/campaigns`]**

> "Now it's sitting here, awaiting my approval. I can Approve, Modify, or
> Reject — and Modify re-runs that same policy check against the new
> numbers. Nothing moves until I click Approve."

**[Click Approve, then show Execute]**

> "Execute is the one function anywhere in this codebase that's allowed
> to call the payment gateway. [Check the "simulate a failure" box if
> you want the failure demo] — and if a step fails partway through, it
> halts, reconciles with the gateway before concluding anything, and a
> retry can only touch what's left — it structurally can't double-charge
> already-completed targets. I actually proved that with a byte-for-byte
> diff of transaction IDs before and after a retry, not just a green
> checkmark."

**[Navigate to `/audit`]**

> "And every single one of those steps — detected, explained, drafted,
> approved, executed — is in this audit trail, timestamped and
> attributed. Nothing happens off the record."

## 2:30–3:10 — The reversed agent + analytics (quick hits)

**[Screen: `/buyer`]**

> "There's a second, smaller agent running the same discipline from the
> other direction — a simulated AI shopper. It can search the catalog and
> *propose* a purchase, but it has no tool that can pay. Only a human
> clicking 'Authorize' can move to payment — same propose-then-approve
> pattern, mirrored."

**[Screen: `/analytics`]**

> "And this dashboard is deliberately honest — it shows real measured
> numbers where I have them, and it says 'Not yet measured' instead of
> guessing where I don't. The 15–25% recovery-rate assumption baked into
> the opportunity engine, for example, is labeled as an assumption, not a
> result — I even wrote up the actual randomized-trial design that would
> validate it against real customers, and I say plainly that it was never
> run."

## 3:10–4:30 — Build challenges and how I solved them

**[Screen: your choice — GitHub repo, or just talking head / the case-study artifact]**

> "A few real obstacles along the way, briefly:
>
> **No Anthropic API key.** The plan was Claude; I didn't have a key.
> I switched the whole AI layer to Google Gemini instead — it was
> isolated behind one client module, so it was a one-file change, not a
> scattered rewrite.
>
> **No Razorpay test-mode account** — signing up needs GST/business
> registration I didn't have. Instead of faking payment execution
> invisibly, I built a real gateway *interface* with a simulated
> implementation that mimics the actual SDK's request and response
> shapes. Every simulated link visibly says so, and switching to a real
> gateway later is a two-environment-variable change, not a rewrite.
>
> **Gemini's free tier caps at 20 requests a day**, which kept blocking
> live testing. I added fallback across multiple API keys — and when I
> tested it live, I found all the keys I'd generated belonged to the same
> Google Cloud project, so they shared one quota pool. The fallback code
> worked exactly as designed; it just didn't solve the actual problem,
> and I said so instead of claiming it did.
>
> **And one I didn't expect:** a CSS variable had been silently broken
> since almost the first UI commit — the whole app was rendering in the
> browser's default fallback font for something like 18 phases, and
> nobody caught it by eye. I only found it because I checked
> `getComputedStyle` directly during an unrelated redesign. It's a good
> reminder that a screenshot looking fine isn't the same as verifying the
> right thing actually loaded."

## 4:30–5:00 — Close

**[Screen: back to `/overview` or the landing page]**

> "That's Vriddhi — solo build, 22 shipped phases plus a redesign, 37
> automated tests specifically targeting the guardrails, deployed live
> right now. Live demo and source code are both linked below. Thanks for
> watching."

**[End card / description: links]**
- Live demo: https://vriddhi-beta.vercel.app
- Code: https://github.com/abhinaytiwari542-max/vriddhi
- Full case study: `docs/CASE-STUDY.md` in the repo

---

## For a written submission form (same content, prose form)

If the form asks for these as separate text answers rather than a video,
here's the same material written as standalone paragraphs:

### Project Objectives — what does it solve?

Vriddhi is an AI agent for Razorpay merchants that finds recoverable
revenue their dashboard doesn't surface on its own — abandoned checkouts
that almost converted, and cross-sell patterns nobody's promoting — and
proposes a specific, costed action to recover it. The core design goal
wasn't the AI itself; it was making sure that AI can *recommend* spending
money but cannot *execute* a financial action on its own. Every proposal
passes through a deterministic policy engine (budget, discount %,
per-transaction caps, checked three separate times) and an explicit human
approval before anything happens, and every step — detection, approval,
execution, or a policy block — is written to a permanent audit trail.

### Build Challenges & Technical Obstacles

The build hit four real obstacles, each solved rather than worked around:

1. **No Anthropic API key was available**, so the AI layer was switched
   to Google Gemini instead, isolated behind a single client module so
   the change touched one file, not the whole codebase.
2. **No Razorpay test-mode account was available** (it requires GST/
   business registration). Rather than skip payment execution, I built a
   real `RazorpayGateway` interface with a simulated implementation that
   matches the actual SDK's request/response shapes and timing exactly —
   every simulated payment link is clearly labeled, and switching to a
   real gateway later is a two-environment-variable change, not a
   rewrite.
3. **Gemini's free tier is capped at 20 requests/day**, which repeatedly
   blocked live testing throughout the build. I added automatic fallback
   across multiple API keys, then discovered live that all the keys
   shared one Google Cloud project's quota pool — the fallback logic
   worked exactly as designed, but didn't add real capacity in that
   specific case, which I documented honestly rather than claiming the
   feature had fixed a problem it structurally couldn't.
4. **A latent CSS bug** left the entire app rendering in the browser's
   default fallback font for roughly 18 development phases, undetected
   by visual review across many screenshots, until a direct
   `getComputedStyle` check caught it during an unrelated redesign — a
   reminder that a screenshot looking acceptable isn't the same as
   confirming the intended asset actually loaded.

Beyond these, the project's guardrail logic (policy checks, approval
state, execution idempotency) is covered by 37 automated tests, and the
halt/retry failure-handling path was verified with an actual
byte-for-byte diff of transaction IDs before and after a retry — not
just a passing status check — to prove a retry can never duplicate an
already-completed action.
