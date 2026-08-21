import { z } from "zod";

// ---------------------------------------------------------------------------
// Structured output contract for the AI explanation layer (Phase 8).
//
// Deliberately narrative-only: no cost, impact, confidence, or risk fields
// exist here. Those numbers come exclusively from the deterministic
// opportunity engine (Phase 7) and are never regenerated or overridden by
// the model — this schema physically cannot carry a number the model could
// invent, so there is nothing for a prompt-injection or hallucination to
// corrupt on the financial side.
// ---------------------------------------------------------------------------
export const OpportunityNarrativeSchema = z.object({
  whatHappened: z
    .string()
    .min(1)
    .describe("One or two plain-language sentences describing what was detected."),
  whyItMatters: z
    .string()
    .min(1)
    .describe("Why this matters to the merchant's revenue, referencing the real figures given."),
  recommendedAction: z
    .string()
    .min(1)
    .describe("A specific, concrete instruction for what the merchant should do next."),
  ifYouApprove: z
    .string()
    .min(1)
    .describe("Plain-language description of the likely outcome if the merchant approves this action."),
});

export type OpportunityNarrative = z.infer<typeof OpportunityNarrativeSchema>;
