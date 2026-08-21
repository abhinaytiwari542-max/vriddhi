// ---------------------------------------------------------------------------
// Numeric grounding verifier.
//
// Why this exists: this project's stated safety thesis is "the AI cannot
// supply financial numbers", justified by the fact that create_campaign
// takes only an opportunityId and OpportunityNarrativeSchema has no numeric
// fields. That argument is sound for the *structured* fields — and it does
// not cover the narrative PROSE, which is four free-form strings rendered
// straight to the merchant. A hallucinated "you could recover ₹85,000"
// lives happily inside a string field, and the only thing standing against
// it was a sentence in the prompt asking the model not to do that
// ("do not use any numbers other than the ones given above" —
// explain-opportunity.ts). Trusting a prompt is exactly the failure mode the
// rest of this codebase refuses to accept, so here it is enforced instead:
// every number in generated prose is extracted and checked against the set
// of figures the deterministic engine actually computed.
//
// Deliberately no LLM is involved in the checking. A verifier that itself
// calls a model would inherit the failure mode it exists to catch, and could
// not run in CI or under an exhausted quota.
// ---------------------------------------------------------------------------

/** Canonical form of a number found in generated text. */
export type NumericMention = {
  /** The exact substring as it appeared, for highlighting the offending span. */
  raw: string;
  kind: "currency" | "percent" | "count";
  /**
   * Canonical value: whole rupees for `currency`, percentage points for
   * `percent`, the integer itself for `count`. Rupees rather than paise
   * because prose is written in rupees and paise precision is never
   * recoverable from a formatted string.
   */
  value: number;
  start: number;
  end: number;
};

/** The only numbers generated prose is permitted to contain. */
export type GroundedFacts = {
  /** Allowed money values, in paise (the unit the engine and DB use). */
  currencyPaise: number[];
  /** Allowed bare counts (audience sizes, hours, scores). */
  counts: number[];
  /** Allowed percentages, in percentage points. */
  percents: number[];
};

export type GroundingFinding = {
  field: string;
  mention: NumericMention;
  /**
   * `critical` is reserved for money, because a wrong rupee figure is the
   * one that can actually mislead a merchant into approving something.
   * Bare counts and percentages are `warning`: prose legitimately contains
   * incidental integers ("a 2-day window") and rounded shares ("about
   * 20%"), so treating those as hard failures would block good output.
   */
  severity: "critical" | "warning";
  reason: string;
};

export type GroundingReport = {
  /** True when nothing critical was found — the gate the runtime uses. */
  ok: boolean;
  checked: number;
  grounded: number;
  findings: GroundingFinding[];
};

/**
 * Rounding tolerance in rupees. formatInr() renders with
 * maximumFractionDigits: 0, so ₹2,921 can legitimately stand for anything
 * from 292050 to 292149 paise. Comparing on rounded rupees already handles
 * that; ±1 absorbs half-up/half-even disagreement at the boundary rather
 * than reporting a hallucination over a sub-rupee rounding difference.
 */
const RUPEE_TOLERANCE = 1;

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  thousand: 1_000,
  lakh: 100_000,
  lakhs: 100_000,
  lac: 100_000,
  crore: 10_000_000,
  crores: 10_000_000,
};

/**
 * Digit-group separators are stripped rather than parsed, which is what
 * makes this correct for Indian grouping: "1,09,820" and "109,820" both
 * reduce to 109820. Locale-aware parsing would have to know which
 * convention produced the string, and it never can.
 */
function parseGrouped(digits: string): number {
  return Number.parseFloat(digits.replace(/,/g, ""));
}

/**
 * Kills binary floating-point residue from suffix expansion: 1.1 * 100000
 * evaluates to 110000.00000000001, and carrying that through a money
 * comparison is asking for a mismatch that has nothing to do with what the
 * model wrote. Two decimals is past anything this app ever renders.
 */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Range notation has to be matched before the single-value patterns, and
 * finding that out is what testing against real model output bought:
 * Gemini wrote "15-25% of targeted buyers", where only "25%" carries the
 * percent sign. Matched naively, the leading "15" falls through to the
 * bare-integer pass and gets reported as an ungrounded count — a false
 * positive on a figure that was in the prompt all along. The same shape
 * appears in money ("₹9,944–16,574"), where the second value often omits
 * the symbol. Both halves of a range inherit the kind of the range.
 */
const RANGE_SEP = String.raw`\s*(?:-|–|—|\bto\b)\s*`;
const NUM = String.raw`\d[\d,]*(?:\.\d+)?`;
const CURRENCY_SYMBOL = String.raw`(?:₹|\bRs\.?\s?|\bINR\s?)`;

const PERCENT_RANGE_RE = new RegExp(
  `(${NUM})${RANGE_SEP}(${NUM})\\s*(?:%|per\\s?cent|percent)`,
  "gi"
);
const CURRENCY_RANGE_RE = new RegExp(
  `${CURRENCY_SYMBOL}\\s?(${NUM})${RANGE_SEP}${CURRENCY_SYMBOL}?\\s?(${NUM})`,
  "gi"
);
// Currency singles: "₹1,09,820", "Rs. 2,100", "INR 100", "₹1.1 lakh".
const CURRENCY_RE = new RegExp(
  `${CURRENCY_SYMBOL}\\s?(${NUM})\\s*(k|thousand|lakhs?|lac|crores?)?`,
  "gi"
);
const PERCENT_RE = new RegExp(`(${NUM})\\s*(?:%|per\\s?cent|percent)`, "gi");
// Whatever integers are left over once the above have claimed their spans.
const COUNT_RE = new RegExp(NUM, "g");

type Span = { start: number; end: number };

function overlaps(span: Span, taken: Span[]): boolean {
  return taken.some((t) => span.start < t.end && span.end > t.start);
}

/**
 * Pulls every numeric mention out of a piece of generated prose.
 *
 * Ordering is load-bearing: currency and percent patterns claim their spans
 * first, so the "100" inside "₹100" is never re-counted as a bare integer
 * and "25" inside "25%" is never treated as a count. Without that, a single
 * figure would be reported twice under two different kinds.
 */
export function extractNumericMentions(text: string): NumericMention[] {
  const mentions: NumericMention[] = [];
  const taken: Span[] = [];

  // Ranges first — see the note on RANGE_SEP. Each range contributes two
  // mentions of its own kind, and claims the whole span so neither half is
  // re-read by a later, narrower pass.
  for (const [re, kind] of [
    [PERCENT_RANGE_RE, "percent"],
    [CURRENCY_RANGE_RE, "currency"],
  ] as const) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const span = { start, end: start + m[0].length };
      if (overlaps(span, taken)) continue;
      mentions.push({ raw: m[0].trim(), kind, value: parseGrouped(m[1]), ...span });
      mentions.push({ raw: m[0].trim(), kind, value: parseGrouped(m[2]), ...span });
      taken.push(span);
    }
  }

  for (const m of text.matchAll(CURRENCY_RE)) {
    const start = m.index ?? 0;
    const span = { start, end: start + m[0].length };
    if (overlaps(span, taken)) continue;
    const multiplier = m[2] ? (MULTIPLIERS[m[2].toLowerCase()] ?? 1) : 1;
    mentions.push({
      raw: m[0].trim(),
      kind: "currency",
      value: roundMoney(parseGrouped(m[1]) * multiplier),
      ...span,
    });
    taken.push(span);
  }

  for (const m of text.matchAll(PERCENT_RE)) {
    const start = m.index ?? 0;
    const span = { start, end: start + m[0].length };
    if (overlaps(span, taken)) continue;
    mentions.push({ raw: m[0].trim(), kind: "percent", value: parseGrouped(m[1]), ...span });
    taken.push(span);
  }

  for (const m of text.matchAll(COUNT_RE)) {
    const start = m.index ?? 0;
    const span = { start, end: start + m[0].length };
    if (overlaps(span, taken)) continue;
    mentions.push({ raw: m[0], kind: "count", value: parseGrouped(m[0]), ...span });
    taken.push(span);
  }

  return mentions.sort((a, b) => a.start - b.start);
}

function matchesCurrency(rupees: number, facts: GroundedFacts): boolean {
  return facts.currencyPaise.some(
    (paise) => Math.abs(Math.round(paise / 100) - rupees) <= RUPEE_TOLERANCE
  );
}

/**
 * Widened tolerance for figures the prose openly presents as approximate.
 *
 * Without this the verifier punishes a legitimate paraphrase: a model that
 * renders ₹1,09,820 as "about ₹1.1 lakh" is summarising correctly, not
 * inventing, yet exact matching scores it as a hallucinated figure. Hedged
 * rounding is only accepted when the text actually hedges — an unqualified
 * "₹1.1 lakh" stays a hard failure, because stating a wrong number plainly
 * is exactly what this module exists to stop.
 */
const APPROXIMATION_TOLERANCE = 0.02;
const APPROXIMATION_MARKER = /\b(?:about|approx(?:\.|imately)?|around|roughly|nearly|almost|close to|some|~|over|under|up to)\s*$/i;
const APPROXIMATION_LOOKBEHIND = 20;

function isHedged(text: string, mentionStart: number): boolean {
  const before = text.slice(Math.max(0, mentionStart - APPROXIMATION_LOOKBEHIND), mentionStart);
  return APPROXIMATION_MARKER.test(before);
}

function matchesCurrencyApproximately(rupees: number, facts: GroundedFacts): boolean {
  return facts.currencyPaise.some((paise) => {
    const allowed = Math.round(paise / 100);
    if (allowed === 0) return rupees === 0;
    return Math.abs(allowed - rupees) / allowed <= APPROXIMATION_TOLERANCE;
  });
}

function matchesNumber(value: number, allowed: number[]): boolean {
  return allowed.some((a) => Math.abs(a - value) < 0.0001);
}

/**
 * Checks one named field of generated prose against the allowed facts.
 */
export function verifyFieldGrounding(
  field: string,
  text: string,
  facts: GroundedFacts
): GroundingFinding[] {
  const findings: GroundingFinding[] = [];

  for (const mention of extractNumericMentions(text)) {
    if (mention.kind === "currency") {
      if (matchesCurrency(mention.value, facts)) continue;

      if (
        isHedged(text, mention.start) &&
        matchesCurrencyApproximately(mention.value, facts)
      ) {
        findings.push({
          field,
          mention,
          severity: "warning",
          reason: `${mention.raw} is a rounded restatement, not an exact figure.`,
        });
        continue;
      }

      findings.push({
        field,
        mention,
        severity: "critical",
        reason: `${mention.raw} is not a figure the rules engine produced.`,
      });
      continue;
    }

    if (mention.kind === "percent") {
      if (!matchesNumber(mention.value, facts.percents)) {
        findings.push({
          field,
          mention,
          severity: "warning",
          reason: `${mention.raw} is not one of the stated rates.`,
        });
      }
      continue;
    }

    // A bare integer is only worth reporting if it is large enough to read
    // as a claim about the merchant's data. Small integers appear
    // constantly in ordinary prose ("the next 2 days", "step 3") and
    // flagging them produced nothing but noise.
    if (mention.value >= 10 && !matchesNumber(mention.value, facts.counts)) {
      findings.push({
        field,
        mention,
        severity: "warning",
        reason: `${mention.raw} does not match any count in the underlying data.`,
      });
    }
  }

  return findings;
}

/**
 * Verifies every field of a generated narrative at once.
 *
 * `ok` is false only for critical (money) findings, so the runtime gate
 * fails closed on the thing that matters while still surfacing softer
 * warnings for inspection.
 */
export function verifyGrounding(
  fields: Record<string, string>,
  facts: GroundedFacts
): GroundingReport {
  const findings: GroundingFinding[] = [];
  let checked = 0;

  for (const [field, text] of Object.entries(fields)) {
    checked += extractNumericMentions(text).length;
    findings.push(...verifyFieldGrounding(field, text, facts));
  }

  return {
    ok: !findings.some((f) => f.severity === "critical"),
    checked,
    grounded: checked - findings.length,
    findings,
  };
}
