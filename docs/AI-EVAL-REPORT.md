# AI Evaluation Report

This is not a formal offline eval harness (no golden dataset, no scored
rubric, no held-out test set) — the Gemini free-tier quota (20
requests/day, scoped per Google Cloud project — see
`docs/ARCHITECTURE.md`) made that impractical to run repeatedly during
development. What follows is instead an honest record of what was
**actually observed** across live runs at each phase, clearly separated
from what would need a real eval setup to claim.

## What "the AI" actually does in this system

Three distinct LLM call sites, none of which can move money or approve
anything (see `docs/ARCHITECTURE.md`'s safety-spine section):

1. **Opportunity narration** (`explain-opportunity.ts`) — turns
   deterministically-computed numbers into a 4-part plain-language
   explanation. Structurally cannot introduce new numbers: its output
   schema (`OpportunityNarrativeSchema`) has zero numeric fields.
2. **Merchant chat agent** (`agent.ts`) — multi-turn tool-calling over 8
   read/propose tools.
3. **Buyer agent** (`buyer-agent.ts`) — a smaller, separate tool registry
   (search + propose only, no pay tool) for the reversed-direction demo.

## Observed behavior — real runs, by phase

| Phase | What was run | What was observed |
|---|---|---|
| 8 | One real narration call against seeded data | Correctly referenced the exact seeded figures (₹1,20,172 stalled, 22 high-intent, recovery range) with **zero invented numbers**. Cached correctly on repeat calls with unchanged inputs. |
| 9 | 5 real natural-language queries via a throwaway test script | Correct tool selected per query in all 5; a real DRAFT Campaign was created with exactly the expected 22 targets; `create_payment_order` was refused exactly as designed regardless of phrasing; all 10 tool calls logged with real latencies (not asserted, checked in Postgres directly). One call hit a transient error, degraded cleanly, succeeded on retry. |
| 15 | "Run the highest-impact safe action" via the live chat UI | Correctly chose `get_abandoned_checkouts` then `create_campaign` — a real DRAFT campaign appeared in Postgres from a single natural-language instruction. Mid-session, Gemini began returning genuine (not induced) `503 UNAVAILABLE` errors — this incidentally verified two distinct degradation paths: tool calls that had already succeeded remained visible/actionable even when the final narration call failed, and a request that failed before any tool ran showed a plain retry message. |
| 18/19 | Buyer-agent guardrails | The LLM call itself was **not** exercised live in this phase — quota was already exhausted, so verification ran via a direct script calling the same service functions (`proposePurchase`, `completeBuyerPurchase`) the agent would call, bypassing Gemini. This confirms the guardrails hold independent of the model, but does **not** constitute an observation of the buyer-agent's actual language behavior at that phase. |
| 24.5 | 7-key fallback rotation | Confirmed live in production logs: a real chat request correctly tried keys #1 through #7 in order on a 429. Not a narration-quality observation — a plumbing observation. |

## What this does and doesn't tell you

**Reasonably well-supported by the above:** for the specific, narrow
tasks this app asks of it (pick the right tool from a small fixed set;
narrate pre-computed numbers without inventing new ones), Gemini
3.6-flash performs correctly across every live run observed. Structural
guardrails mean even a wrong tool choice or a hallucinated narration
detail can't cause an unauthorized action or a fabricated financial
figure to reach the merchant as fact.

**Not established by the above, and would need real eval work to claim:**
- Consistency across *many* runs of the same query (every phase above
  ran each query once or a handful of times, not enough for a real
  pass-rate statistic).
- Behavior across adversarial or ambiguous phrasing beyond the specific
  prompts tried.
- Any quantitative narration-quality metric (fluency, factual
  completeness, tone) — nothing here was scored, only checked for
  "did it invent a number that isn't in the input."
- Buyer-agent live LLM behavior specifically at Phase 18/19 (see above).

## If this were a real eval harness (proposed, not built)

A follow-up worth doing with a paid-tier key (removing the 20/day
ceiling):
1. A fixed set of ~30 representative merchant queries (covering the 8
   tools + ambiguous/adversarial phrasing) run N=10 times each, scored
   pass/fail on: correct tool selected, no numeric invention in the
   final answer, no attempted call to `create_payment_order` under any
   phrasing.
2. A separate rubric-scored sample (human or LLM-judge) for narration
   quality (is it *actually* the clearest way to explain this to a
   non-technical merchant, not just factually clean).
3. Track cost/latency per query at scale — nothing here was measured
   under load, only single-request latencies from `AgentAction.latencyMs`.

This is explicitly listed here as **proposed**, not run — see
`docs/EXPERIMENT-PLAN.md` for the same discipline applied to a
business-impact experiment.
