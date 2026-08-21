import type { z } from "zod";

export type ToolEffect = "read" | "propose";

/**
 * effect: 'read' tools execute immediately and their result is fed back to
 * the model. effect: 'propose' tools may only ever construct a draft record
 * (e.g. a Campaign in DRAFT status) — they must never call Razorpay or move
 * money, no matter what the model asks for. That guarantee lives in the
 * handler code itself, not in a prompt instruction.
 *
 * merchantId is always injected by the caller, never taken from model input
 * — the model cannot choose whose data it reads or writes.
 */
export type ToolDefinition<TInput = unknown, TOutput = unknown> = {
  name: string;
  description: string;
  effect: ToolEffect;
  inputSchema: z.ZodType<TInput>;
  handler: (merchantId: string, input: TInput) => Promise<TOutput>;
};

/**
 * Defines a tool with full type inference for its own inputSchema/handler,
 * then erases to the generic-default ToolDefinition shape so tools with
 * different input/output types can share one registry array. The erasure
 * is safe because runTool() always derives `input` from this same
 * `inputSchema` via safeParse before calling `handler`.
 */
export function defineTool<TInput, TOutput>(def: {
  name: string;
  description: string;
  effect: ToolEffect;
  inputSchema: z.ZodType<TInput>;
  handler: (merchantId: string, input: TInput) => Promise<TOutput>;
}): ToolDefinition {
  return def as ToolDefinition;
}
