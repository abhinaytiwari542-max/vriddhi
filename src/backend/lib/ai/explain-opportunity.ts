import { z } from "zod";

import { getGeminiClient, OPPORTUNITY_EXPLANATION_MODEL } from "@/backend/lib/ai/client";
import { OpportunityNarrativeSchema, type OpportunityNarrative } from "@/backend/lib/ai/schemas";
import { formatInr, type AbandonedCheckoutResult } from "@/backend/lib/services/opportunity-engine";

export type NarrativeResult =
  | { ok: true; narrative: OpportunityNarrative }
  | { ok: false; reason: "no_api_key" | "invalid_output" | "api_error" };

const responseJsonSchema = z.toJSONSchema(OpportunityNarrativeSchema) as Record<string, unknown>;
delete responseJsonSchema.$schema;

function buildPrompt(result: Extract<AbandonedCheckoutResult, { detected: true }>) {
  const sample = result.evidence
    .slice(0, 8)
    .map(
      (e) =>
        `- ${e.customerName}: ${formatInr(e.amount)} cart, abandoned ${e.hoursSinceAbandoned}h ago, ${
          e.isRepeatCustomer ? "repeat customer" : "first-time visitor"
        }`
    )
    .join("\n");

  return `A merchant's abandoned-checkout opportunity has been detected by a deterministic rules engine. Explain it in plain language for a busy small-business owner who is not technical.

Facts (already computed by the rules engine — do not restate different numbers, do not invent new ones):
- Total abandoned checkouts: ${result.totalAbandonedCount}
- Total stalled value: ${formatInr(result.totalAbandonedValue)}
- High-intent customers worth targeting: ${result.highIntentCount}
- Their combined cart value: ${formatInr(result.highIntentValue)}
- Recommended action: send each a ₹100 discount payment link
- Estimated cost if all ${result.highIntentCount} are targeted: ${formatInr(result.estimatedCost)}
- Estimated recovered revenue range: ${formatInr(result.impactMin)}–${formatInr(result.impactMax)} (assuming 15-25% of targeted customers complete the discounted purchase)
- Risk level: ${result.risk}

Sample evidence (real customers):
${sample}

Respond with four short sections: what happened, why it matters, what to do, and what happens if the merchant approves. Keep it concrete and grounded in the facts above — do not use any numbers other than the ones given above.`;
}

export async function explainOpportunity(
  result: Extract<AbandonedCheckoutResult, { detected: true }>
): Promise<NarrativeResult> {
  const client = getGeminiClient();
  if (!client) return { ok: false, reason: "no_api_key" };

  const prompt = buildPrompt(result);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: OPPORTUNITY_EXPLANATION_MODEL,
        contents:
          attempt === 0
            ? prompt
            : `${prompt}\n\nYour previous response did not match the required JSON schema. Return ONLY valid JSON matching the schema exactly.`,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema,
        },
      });

      const text = response.text;
      const parsed = text ? OpportunityNarrativeSchema.safeParse(JSON.parse(text)) : null;

      if (parsed?.success) {
        return { ok: true, narrative: parsed.data };
      }
    } catch (err) {
      console.error("[explainOpportunity] Gemini call failed:", err);
      return { ok: false, reason: "api_error" };
    }
  }

  return { ok: false, reason: "invalid_output" };
}
