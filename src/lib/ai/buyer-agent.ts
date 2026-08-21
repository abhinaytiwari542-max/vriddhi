import { z } from "zod";
import {
  createModelContent,
  createPartFromFunctionResponse,
  createUserContent,
  type Content,
  type FunctionDeclaration,
} from "@google/genai";

import { getGeminiClient } from "@/lib/ai/client";
import { prisma } from "@/lib/db";
import { listCatalogProducts } from "@/lib/services/catalog";
import { proposePurchase } from "@/lib/services/buyer-checkout";

const BUYER_AGENT_MODEL = "gemini-3.6-flash";
const MAX_TOOL_TURNS = 5;

const SEARCH_SCHEMA = z.object({
  query: z.string().optional().describe("Text to search product names for, e.g. 'running shoes'"),
});
const PROPOSE_SCHEMA = z.object({
  productId: z.string().describe("The product_id of the chosen product"),
});

function buildSystemInstruction(budgetRupees: number) {
  return `You are a shopping assistant helping a customer buy something from this store's catalog.
The customer's authorized budget is ₹${budgetRupees} — you must never propose a product that costs more
than this, and you must never propose an out-of-stock product. Search the catalog, compare the options,
and pick the single best match for what the customer asked for. Call propose_purchase with your choice —
this only creates a pending order awaiting the customer's own authorization; you cannot pay for anything
yourself. Explain your reasoning briefly.`;
}

export type BuyerTraceEntry = { tool: string; input: unknown; ok: boolean; output: unknown };

export type BuyerAgentResult =
  | { ok: true; answer: string; trace: BuyerTraceEntry[]; proposedOrderId?: string }
  | {
      ok: false;
      reason: "no_api_key" | "api_error" | "max_turns_exceeded";
      trace: BuyerTraceEntry[];
      proposedOrderId?: string;
    };

/**
 * A separate, smaller agent from the merchant-side one (agent.ts) — deliberately
 * not sharing a tool registry, since these tools operate on the catalog/buyer
 * side, not merchant analytics. Same shape of guarantee, though: the only
 * "write" tool (propose_purchase) can create a pending order, never a paid
 * one — payment requires a human clicking Authorize, see buyer-checkout.ts.
 */
export async function runBuyerAgentQuery(
  merchantId: string,
  userMessage: string,
  context: { budgetRupees: number; buyerName: string; buyerEmail?: string }
): Promise<BuyerAgentResult> {
  const client = getGeminiClient();
  if (!client) return { ok: false, reason: "no_api_key", trace: [] };

  const trace: BuyerTraceEntry[] = [];
  const contents: Content[] = [createUserContent(userMessage)];

  const functionDeclarations: FunctionDeclaration[] = [
    {
      name: "search_products",
      description: "Search the store catalog by name.",
      parametersJsonSchema: stripSchemaMeta(z.toJSONSchema(SEARCH_SCHEMA)),
    },
    {
      name: "propose_purchase",
      description:
        "Propose buying a specific product for the customer. Creates a pending order — never pays.",
      parametersJsonSchema: stripSchemaMeta(z.toJSONSchema(PROPOSE_SCHEMA)),
    },
  ];

  let proposedOrderId: string | undefined;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    let response;
    try {
      response = await client.models.generateContent({
        model: BUYER_AGENT_MODEL,
        contents,
        config: {
          systemInstruction: buildSystemInstruction(context.budgetRupees),
          tools: [{ functionDeclarations }],
        },
      });
    } catch (err) {
      console.error("[runBuyerAgentQuery] Gemini call failed:", err);
      return { ok: false, reason: "api_error", trace };
    }

    const calls = response.functionCalls;
    if (!calls || calls.length === 0) {
      return { ok: true, answer: response.text ?? "", trace, proposedOrderId };
    }

    const modelTurn = response.candidates?.[0]?.content ?? createModelContent("");
    contents.push(modelTurn);

    for (const call of calls) {
      const name = call.name ?? "unknown_tool";
      const args = (call.args ?? {}) as { query?: string; productId?: string };
      const startedAt = Date.now();

      let output: unknown;
      let ok = true;
      try {
        if (name === "search_products") {
          const { products } = await listCatalogProducts({
            q: args.query,
            available: true,
            maxPriceRupees: context.budgetRupees,
            limit: 10,
          });
          output = { products };
        } else if (name === "propose_purchase") {
          const result = await proposePurchase({
            productId: args.productId ?? "",
            budgetRupees: context.budgetRupees,
            buyerName: context.buyerName,
            buyerEmail: context.buyerEmail,
          });
          if (result.ok) proposedOrderId = result.orderId;
          output = result;
          ok = result.ok;
        } else {
          output = { error: `Unknown tool: ${name}` };
          ok = false;
        }
      } catch (err) {
        output = { error: err instanceof Error ? err.message : "Unknown error" };
        ok = false;
      }

      await prisma.agentAction.create({
        data: {
          merchantId,
          source: "CHAT",
          toolName: name,
          input: args,
          output: output as object,
          status: ok ? "success" : "error",
          latencyMs: Date.now() - startedAt,
        },
      });

      trace.push({ tool: name, input: args, ok, output });
      contents.push(
        createUserContent([createPartFromFunctionResponse(call.id ?? name, name, { result: output })])
      );
    }
  }

  return { ok: false, reason: "max_turns_exceeded", trace, proposedOrderId };
}

function stripSchemaMeta(schema: unknown) {
  const copy = { ...(schema as Record<string, unknown>) };
  delete copy.$schema;
  return copy;
}
