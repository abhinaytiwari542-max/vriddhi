import { z } from "zod";
import {
  createPartFromFunctionResponse,
  createUserContent,
  type Content,
  type FunctionDeclaration,
} from "@google/genai";

import { getGeminiClient } from "@/lib/ai/client";
import { TOOL_REGISTRY } from "@/lib/ai/tools";
import { runTool } from "@/lib/ai/tool-runner";

const AGENT_MODEL = "gemini-3.6-flash";
const MAX_TOOL_TURNS = 6;

const SYSTEM_INSTRUCTION = `You are Vriddhi's merchant assistant. Answer questions about the merchant's
orders, customers, products, and revenue opportunities using the tools provided — never guess or
invent numbers. If a question implies spending money or taking an action, you may call create_campaign
or create_payment_order, but you must clearly tell the merchant that nothing executes without their
approval; you cannot approve anything yourself. Keep answers short and concrete.`;

function toFunctionDeclarations(): FunctionDeclaration[] {
  return TOOL_REGISTRY.map((tool) => {
    const schema = z.toJSONSchema(tool.inputSchema) as Record<string, unknown>;
    delete schema.$schema;
    return {
      name: tool.name,
      description: `[${tool.effect}] ${tool.description}`,
      parametersJsonSchema: schema,
    };
  });
}

export type AgentTraceEntry = {
  tool: string;
  input: unknown;
  ok: boolean;
  output: unknown;
};

export type AgentResult =
  | { ok: true; answer: string; trace: AgentTraceEntry[] }
  | { ok: false; reason: "no_api_key" | "api_error" | "max_turns_exceeded"; trace: AgentTraceEntry[] };

/**
 * Natural language in, tool calls reasoned about by the model, real data
 * out. Every tool call is logged by runTool() regardless of how this loop
 * terminates. No tool result the model receives can differ from what
 * runTool() actually returned — there is no step where the model's own
 * text output is treated as ground truth about money, orders, or customers.
 */
export async function runAgentQuery(merchantId: string, userMessage: string): Promise<AgentResult> {
  const client = getGeminiClient();
  if (!client) return { ok: false, reason: "no_api_key", trace: [] };

  const trace: AgentTraceEntry[] = [];
  const contents: Content[] = [createUserContent(userMessage)];
  const functionDeclarations = toFunctionDeclarations();

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    let response;
    try {
      response = await client.models.generateContent({
        model: AGENT_MODEL,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations }],
        },
      });
    } catch (err) {
      console.error("[runAgentQuery] Gemini call failed:", err);
      return { ok: false, reason: "api_error", trace };
    }

    const calls = response.functionCalls;
    if (!calls || calls.length === 0) {
      return { ok: true, answer: response.text ?? "", trace };
    }

    const modelTurn = response.candidates?.[0]?.content;
    if (modelTurn) contents.push(modelTurn);

    for (const call of calls) {
      const name = call.name ?? "unknown_tool";
      const result = await runTool(merchantId, "CHAT", name, call.args ?? {});
      trace.push({ tool: name, input: call.args, ok: result.ok, output: result.ok ? result.output : result.error });

      contents.push(
        createUserContent([
          createPartFromFunctionResponse(
            call.id ?? name,
            name,
            result.ok ? { result: result.output } : { error: result.error }
          ),
        ])
      );
    }
  }

  return { ok: false, reason: "max_turns_exceeded", trace };
}
