import { prisma } from "@/backend/lib/db";
import { getTool } from "@/backend/lib/ai/tools";

export type ToolRunResult =
  | { ok: true; output: unknown }
  | { ok: false; error: string };

/**
 * The single chokepoint every tool call passes through — whether invoked by
 * the Gemini agent loop or called directly. Validates input against the
 * tool's own schema (never trusts the model's arguments blindly) and writes
 * an AgentAction row before returning, success or failure alike, so there is
 * no code path that calls a tool without it being logged.
 */
export async function runTool(
  merchantId: string,
  source: "CHAT" | "SYSTEM",
  toolName: string,
  rawInput: unknown
): Promise<ToolRunResult> {
  const tool = getTool(toolName);
  const startedAt = Date.now();

  if (!tool) {
    await prisma.agentAction.create({
      data: {
        merchantId,
        source,
        toolName,
        input: rawInput as object,
        output: { error: "Unknown tool" },
        status: "error",
        latencyMs: Date.now() - startedAt,
      },
    });
    return { ok: false, error: `Unknown tool: ${toolName}` };
  }

  const parsed = tool.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    await prisma.agentAction.create({
      data: {
        merchantId,
        source,
        toolName,
        input: rawInput as object,
        output: { error: "Invalid input", message: parsed.error.message },
        status: "error",
        latencyMs: Date.now() - startedAt,
      },
    });
    return { ok: false, error: `Invalid input for ${toolName}: ${JSON.stringify(parsed.error.issues)}` };
  }

  try {
    const output = await tool.handler(merchantId, parsed.data);
    await prisma.agentAction.create({
      data: {
        merchantId,
        source,
        toolName,
        input: parsed.data as object,
        output: output as object,
        status: "success",
        latencyMs: Date.now() - startedAt,
      },
    });
    return { ok: true, output };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.agentAction.create({
      data: {
        merchantId,
        source,
        toolName,
        input: parsed.data as object,
        output: { error: message },
        status: "error",
        latencyMs: Date.now() - startedAt,
      },
    });
    return { ok: false, error: message };
  }
}
