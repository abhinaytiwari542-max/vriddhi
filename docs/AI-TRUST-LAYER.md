# AI Trust Layer — grounding verification and injection screening

**Live:** [`/ai-trust`](https://vriddhi-beta.vercel.app/ai-trust) · **Code:**
`src/backend/lib/ai/grounding.ts`, `src/backend/lib/ai/injection-scan.ts`,
`src/backend/lib/ai/eval/`

## The gap this closes

Up to this point the project's safety argument was, in its own words:

> The AI literally cannot supply financial numbers. The `create_campaign` tool's
> input schema has one field — `opportunityId`.

That is true, test-backed, and **narrower than it sounds**. It protects the
*structured* path. It says nothing about the four free-form strings in
`OpportunityNarrativeSchema`, which are rendered to the merchant verbatim
(`opportunity-card.tsx`) under a badge reading "AI explanation".

A `z.string()` holds `"you could recover ₹85,000"` perfectly well. The only thing
standing between an invented figure and the merchant's screen was one sentence of
prompt text:

```
do not use any numbers other than the ones given above
```

Trusting a prompt is precisely the failure mode the rest of this codebase refuses
to accept. The in-code comment claiming the schema "physically cannot carry a
number the model could invent" was wrong as written — it conflated *zero numeric
fields* with *zero numbers*.

Worse, `Opportunity.aiNarrative` caches the generated prose and re-serves it on
every subsequent page view with no re-validation, so a single bad generation
would persist indefinitely.

## What was built

### 1. Numeric grounding verifier (`grounding.ts`)

Extracts every numeric mention from generated prose and checks it against the
exact set of figures the deterministic engine produced.

- **No LLM in the checking path.** A verifier that called a model would inherit
  the failure mode it exists to catch, and could not run in CI or with the API
  quota exhausted.
- **Indian digit grouping** — separators are stripped rather than locale-parsed,
  so `1,09,820` and `109,820` both reduce correctly.
- **Range-aware** — `15-25%` and `₹9,944–16,574` are matched as ranges before the
  single-value patterns run. Without this, the leading number of a range falls
  through to the bare-integer pass and is reported as ungrounded. This was a real
  false positive found by testing against actual model output, not a hypothetical.
- **Severity split.** Only money is `critical` and only `critical` blocks. Bare
  integers and percentages are `warning`, because prose legitimately contains
  incidental numbers ("the next 2 weeks") and treating those as failures would
  block good output.
- **Approximation-aware.** A model rendering `₹1,09,820` as "about ₹1.1 lakh" is
  summarising, not inventing, so a *hedged* figure within 2% is a warning. The
  same digits stated plainly — "₹1.1 lakh is stalled" — remain a hard block. The
  hedge is what earns the tolerance.

### 2. Indirect prompt-injection screening (`injection-scan.ts`)

`buildPrompt()` interpolates real customer names into the prompt as evidence.
Those names are attacker-controlled: anyone who can get a record into the store
chooses what they say.

Two mechanisms, because detection alone is not a defence:

- `neutralizeForPrompt()` — **always applied**, and the part that actually holds.
  Strips control and zero-width characters, collapses newlines, caps length, and
  quotes the value so it cannot run on as instruction text. A high-risk value is
  replaced with `Customer #N` outright.
- `scanUntrustedText()` — **advisory**. Pattern-matches known injection shapes
  (instruction override, role impersonation, tool mimicry, prompt delimiters,
  exfiltration, invisible characters) for logging and display. A denylist can
  always be paraphrased around; it is monitoring, not a wall.

**Scope, stated precisely:** the narration call passes no tools and is pinned to a
four-string schema, so injected text **cannot** move money or trigger an action —
the existing tool-layer guarantees hold. What it could do is corrupt the advice a
merchant reads and trusts. That is the exposure this closes.

### 3. Fail-closed runtime enforcement

- `explainOpportunity()` verifies before returning; a failure yields
  `reason: "ungrounded"` and the prose is discarded.
- `getOpportunityNarrative()` **re-verifies on every cache read**, not just at
  generation. Verification is pure string work against numbers already in hand,
  so per-read costs nothing worth saving — and it is the only thing that closes
  the persistence hole. A poisoned entry is purged and regenerated.
- Both paths write an `opportunity.narrative_blocked` audit row with
  `status: BLOCKED`.
- The card states plainly that the summary was withheld and why.

### 4. Measured evaluation (`eval/`)

Deterministic, offline, reproducible — it runs in CI and with the quota spent.

- **Seed corpus is real model output**, copied verbatim from
  `Opportunity.aiNarrative`. A hand-written corpus only ever contains the failures
  its author already imagined.
- **Positives are mutations**, one surgical labeled edit each, so a detection is
  attributable to a specific corruption.
- **Negatives are paraphrases** that move words without changing figures. These
  are what keep the precision number honest.
- **300 seeded fuzz mutations** widen the positive class, because 100% recall over
  7 hand-picked cases is not a number worth quoting. Seeded, not random — an eval
  that reports a different figure every run cannot gate anything.

Measured result over 313 cases: **precision 100%, recall 100%, 0 false positives.**

## What these numbers do not say

The positives are all numeric corruptions — the failure class this verifier is
built for. A perfect score is evidence it does its job, **not** that the narration
is trustworthy in general. Specifically:

- It cannot detect a claim containing no number ("recovery is guaranteed").
- The corpus is seeded from one real narrative, so it measures *this prompt*
  rather than the model in general.
- The injection scanner's denylist is bypassable by paraphrase; only the
  structural neutralisation is load-bearing.

## Verifying it yourself

```bash
npm test -- tests/grounding.test.ts
```

40 assertions covering extraction, both severity directions, prompt/fact
drift, injection screening, and the eval thresholds. Unlike
`scripts/red-team-live.ts` — which prints "YES — INVESTIGATE" on a real breach
and still `process.exit(0)` — these fail the build.

The `/ai-trust` page runs the same verifier module in the browser: edit any
figure and watch the verdict change, with zero model calls.
