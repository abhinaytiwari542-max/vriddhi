// ---------------------------------------------------------------------------
// Labeled evaluation corpus for the grounding verifier.
//
// The seed is a REAL narrative produced by gemini-3.6-flash for this
// merchant's actual abandoned-checkout opportunity, copied verbatim out of
// Opportunity.aiNarrative. Starting from genuine model output matters: a
// corpus written by hand would only ever contain the failures its author
// already imagined, and would quietly bake in this author's own phrasing
// habits rather than the model's.
//
// Positives are then produced by MUTATION rather than by writing fake
// narratives — each operator makes one surgical, labeled edit to the real
// text, so a detection can be attributed to a specific corruption and the
// only difference between a positive and its negative is the thing being
// detected. Negatives are paraphrases that move words around without
// changing any figure; those must NOT fire, and they are what keeps the
// precision number honest.
// ---------------------------------------------------------------------------

import type { GroundedFacts } from "@/backend/lib/ai/grounding";

export type NarrativeFields = {
  whatHappened: string;
  whyItMatters: string;
  recommendedAction: string;
  ifYouApprove: string;
};

export type CorpusCase = {
  id: string;
  /** Ground truth: does this narrative contain a figure the engine never produced? */
  ungrounded: boolean;
  /** Which mutation produced it, or how the negative was derived. */
  operator: string;
  /** Why this case exists — the specific behaviour it pins down. */
  intent: string;
  fields: NarrativeFields;
};

/**
 * Verbatim gemini-3.6-flash output for the seeded demo opportunity
 * (43 abandoned / ₹1,09,820 stalled / 21 high-intent / ₹66,294 combined /
 * ₹2,100 cost / ₹9,944–₹16,574 range / 15-25% assumed recovery).
 */
export const REAL_NARRATIVE: NarrativeFields = {
  whatHappened:
    "We detected 43 abandoned checkouts representing ₹1,09,820 in total stalled value, including 21 high-intent customers with a combined cart value of ₹66,294.",
  whyItMatters:
    "Leaving these checkouts unaddressed means missing out on potential orders from buyers who were nearly ready to purchase.",
  recommendedAction:
    "Send each of the 21 high-intent customers a ₹100 discount payment link.",
  ifYouApprove:
    "At a total cost of ₹2,100, this offer is estimated to recover between ₹9,944 and ₹16,574 in revenue if 15-25% of targeted buyers complete their orders.",
};

/** The fact set that actually went into the prompt for REAL_NARRATIVE. */
export const REAL_FACTS: GroundedFacts = {
  currencyPaise: [10_982_000, 6_629_400, 994_410, 1_657_350, 210_000, 10_000],
  counts: [43, 21, 21],
  percents: [15, 25],
};

function edit(
  fields: NarrativeFields,
  key: keyof NarrativeFields,
  from: string,
  to: string
): NarrativeFields {
  if (!fields[key].includes(from)) {
    // A silently-failed mutation would produce a case labeled `ungrounded`
    // whose text is actually clean, which quietly destroys recall. Loud
    // failure is the only safe behaviour here.
    throw new Error(`Mutation target "${from}" not present in ${key}`);
  }
  return { ...fields, [key]: fields[key].replace(from, to) };
}

export const CORPUS: CorpusCase[] = [
  // ----- Negatives: must not fire -------------------------------------
  {
    id: "clean-real",
    ungrounded: false,
    operator: "none (verbatim model output)",
    intent: "The exact text the model really produced must pass untouched.",
    fields: REAL_NARRATIVE,
  },
  {
    id: "clean-reordered",
    ungrounded: false,
    operator: "reorder sentences",
    intent: "Position must not affect grounding.",
    fields: {
      ...REAL_NARRATIVE,
      whatHappened:
        "Including 21 high-intent customers with a combined cart value of ₹66,294, we detected 43 abandoned checkouts representing ₹1,09,820 in total stalled value.",
    },
  },
  {
    id: "clean-reworded-no-figures",
    ungrounded: false,
    operator: "reword prose, no figures touched",
    intent: "Rewriting non-numeric prose must not fire.",
    fields: {
      ...REAL_NARRATIVE,
      whyItMatters:
        "Every one of these carts belonged to someone who had already chosen what they wanted, so the intent to buy was already there.",
    },
  },
  {
    id: "clean-hedged-rounding",
    ungrounded: false,
    operator: "hedged paraphrase of a real figure",
    intent:
      "A model summarising ₹1,09,820 as 'about ₹1.1 lakh' is rounding, not inventing — must not be a critical failure.",
    fields: edit(REAL_NARRATIVE, "whatHappened", "₹1,09,820", "about ₹1.1 lakh"),
  },
  {
    id: "clean-incidental-small-integer",
    ungrounded: false,
    operator: "add small integer in ordinary prose",
    intent: "Prose integers like 'the next 2 weeks' must not be treated as data claims.",
    fields: edit(
      REAL_NARRATIVE,
      "recommendedAction",
      "payment link.",
      "payment link within the next 2 weeks."
    ),
  },
  {
    id: "clean-currency-range-no-second-symbol",
    ungrounded: false,
    operator: "drop the second currency symbol in a range",
    intent: "'₹9,944–16,574' is the same claim as '₹9,944 and ₹16,574'.",
    fields: edit(
      REAL_NARRATIVE,
      "ifYouApprove",
      "between ₹9,944 and ₹16,574",
      "between ₹9,944–16,574"
    ),
  },

  // ----- Positives: must fire ----------------------------------------
  {
    id: "halluc-inflated-recovery",
    ungrounded: true,
    operator: "inflate a figure",
    intent: "The headline risk: an invented recovery figure a merchant might act on.",
    fields: edit(REAL_NARRATIVE, "ifYouApprove", "₹9,944", "₹85,000"),
  },
  {
    id: "halluc-transposed-digits",
    ungrounded: true,
    operator: "transpose digits",
    intent: "A subtle corruption that reads plausibly — the hardest realistic case.",
    fields: edit(REAL_NARRATIVE, "ifYouApprove", "₹16,574", "₹16,754"),
  },
  {
    id: "halluc-extra-figure-appended",
    ungrounded: true,
    operator: "append an entirely new claim",
    intent: "Invented upside stated alongside correct figures.",
    fields: edit(
      REAL_NARRATIVE,
      "whyItMatters",
      "ready to purchase.",
      "ready to purchase. Recovering them could also unlock ₹50,000 in repeat orders."
    ),
  },
  {
    id: "halluc-wrong-stalled-value",
    ungrounded: true,
    operator: "replace the stalled total",
    intent: "Corrupting the number the card headline also shows.",
    fields: edit(REAL_NARRATIVE, "whatHappened", "₹1,09,820", "₹2,45,000"),
  },
  {
    id: "halluc-wrong-cost",
    ungrounded: true,
    operator: "replace the campaign cost",
    intent: "Understating spend is the most dangerous direction to be wrong in.",
    fields: edit(REAL_NARRATIVE, "ifYouApprove", "₹2,100", "₹900"),
  },
  {
    id: "halluc-unhedged-rounding",
    ungrounded: true,
    operator: "unhedged wrong figure at rounding distance",
    intent:
      "Distinguishes hedged rounding from a plain false statement — same digits as clean-hedged-rounding, no hedge.",
    fields: edit(REAL_NARRATIVE, "whatHappened", "₹1,09,820", "₹1.1 lakh"),
  },
  {
    id: "halluc-fabricated-discount",
    ungrounded: true,
    operator: "change the per-customer discount",
    intent: "The discount is policy-controlled; the model must not restate it differently.",
    fields: edit(REAL_NARRATIVE, "recommendedAction", "₹100", "₹250"),
  },
];

// ---------------------------------------------------------------------------
// Fuzz corpus.
//
// Thirteen hand-written cases are enough to pin down specific behaviours and
// nowhere near enough to support a number like "100% recall" — with the same
// person writing both the detector and the cases, a small hand-built corpus
// mostly measures that author's imagination. These generated mutations widen
// the positive class to a few hundred perturbations of the real narrative,
// so recall is measured over a sample big enough for the figure to mean
// something.
//
// Seeded rather than random: an eval that reports a different number every
// run cannot gate anything, and a failure nobody can reproduce cannot be
// debugged.
// ---------------------------------------------------------------------------

/** mulberry32 — small, fast, and fully determined by its seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Currency figures that genuinely appear in REAL_NARRATIVE, as written. */
const REAL_CURRENCY_TOKENS: { field: keyof NarrativeFields; token: string }[] = [
  { field: "whatHappened", token: "₹1,09,820" },
  { field: "whatHappened", token: "₹66,294" },
  { field: "recommendedAction", token: "₹100" },
  { field: "ifYouApprove", token: "₹2,100" },
  { field: "ifYouApprove", token: "₹9,944" },
  { field: "ifYouApprove", token: "₹16,574" },
];

const ALLOWED_RUPEES = REAL_FACTS.currencyPaise.map((p) => Math.round(p / 100));

function formatIndianGrouping(value: number): string {
  const s = String(value);
  if (s.length <= 3) return s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
}

/**
 * Builds `count` single-figure corruptions of the real narrative.
 *
 * Each case replaces one genuine currency token with a value that is not in
 * the allowed set and not within approximation distance of it, so every
 * generated case is unambiguously ungrounded by construction — there are no
 * borderline labels to argue about, which is what lets the resulting recall
 * figure be read at face value.
 */
export function generateFuzzCases(count: number, seed = 20260822): CorpusCase[] {
  const rand = mulberry32(seed);
  const cases: CorpusCase[] = [];

  for (let i = 0; cases.length < count && i < count * 20; i++) {
    const target = REAL_CURRENCY_TOKENS[Math.floor(rand() * REAL_CURRENCY_TOKENS.length)];
    const original = Number.parseInt(target.token.replace(/[₹,]/g, ""), 10);

    // Scale the perturbation to the figure's own magnitude so corruptions of
    // ₹100 and of ₹1,09,820 are both plausible rather than absurd.
    const factor = 0.15 + rand() * 3;
    const candidate = Math.max(1, Math.round(original * factor));

    const tooClose = ALLOWED_RUPEES.some(
      (allowed) => Math.abs(allowed - candidate) / Math.max(allowed, 1) <= 0.02
    );
    if (tooClose || candidate === original) continue;

    cases.push({
      id: `fuzz-${cases.length}-${target.field}-${original}-to-${candidate}`,
      ungrounded: true,
      operator: "fuzz: perturb one real currency figure",
      intent: `${target.token} replaced with an unrelated amount.`,
      fields: edit(
        REAL_NARRATIVE,
        target.field,
        target.token,
        `₹${formatIndianGrouping(candidate)}`
      ),
    });
  }

  return cases;
}
