import type { AgentTraceEntry } from "@/backend/lib/ai/agent";

// ---------------------------------------------------------------------------
// Deterministic fallback answer.
//
// The agent loop does its work in two halves: it calls tools to fetch real
// data, then asks the model to write that up. When the second half fails —
// most often because the free-tier quota ran out mid-conversation — the first
// half has usually already SUCCEEDED, and the answer is sitting in the trace.
// Throwing it away and showing "the API call failed" is the single most
// misleading thing this app used to do: the backend worked, the database was
// queried, the numbers were returned, and the merchant was told it was broken.
//
// So this reads the tool results and states them plainly. No model involved,
// which is the point — it is exactly the path that still works when the model
// does not. It is labelled as unnarrated rather than passed off as the
// agent's own prose.
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** One plain-language line per tool call, or null if it says nothing useful. */
function describe(entry: AgentTraceEntry): string | null {
  if (!entry.ok) return `· ${entry.tool} — could not be read.`;

  const rows = Array.isArray(entry.output) ? entry.output : null;
  const obj = asRecord(entry.output);

  switch (entry.tool) {
    case "get_customers":
      return rows ? `· You have ${rows.length} customers on record.` : null;

    case "get_orders":
      return rows ? `· I found ${rows.length} recent orders.` : null;

    case "get_products":
      return rows ? `· Your catalog has ${rows.length} products.` : null;

    case "get_abandoned_checkouts": {
      if (!obj) return null;
      if (obj.detected !== true) return "· No abandoned-checkout opportunity is open right now.";
      return (
        `· ${obj.totalAbandonedCount} abandoned checkouts worth ${obj.totalAbandonedValue}, ` +
        `of which ${obj.highIntentCount} are high-intent. Targeting them would cost ` +
        `${obj.estimatedCost} and is estimated to recover ${obj.expectedImpact}.`
      );
    }

    case "calculate_campaign_cost":
      return obj?.totalCost ? `· That campaign would cost ${obj.totalCost}.` : null;

    case "get_payment_status": {
      if (!obj) return null;
      if (obj.found !== true) return "· That order could not be found.";
      return `· That order is ${String(obj.orderStatus).toLowerCase()}.`;
    }

    case "create_campaign": {
      if (!obj) return null;
      if (obj.status === "drafted") {
        return `· I drafted a campaign for ${obj.audienceCount} customers. It is waiting for your approval in Campaigns — nothing has been sent.`;
      }
      if (obj.status === "blocked") {
        return `· A campaign was blocked by your spend limits: ${obj.message ?? "over policy limit"}.`;
      }
      if (obj.status === "already_drafted") {
        return "· A campaign for this opportunity already exists — see Campaigns.";
      }
      return null;
    }

    case "create_payment_order":
      return "· Payment orders cannot be created by the agent — that always requires your approval.";

    default:
      return null;
  }
}

/**
 * Builds an answer from what the tools actually returned.
 *
 * Returns null when the trace carries nothing worth showing, so the caller
 * can fall back to a plain error rather than printing an empty shell.
 */
export function summarizeTrace(trace: AgentTraceEntry[]): string | null {
  const lines = trace.map(describe).filter((l): l is string => l !== null);
  if (lines.length === 0) return null;

  return [
    "I could not write this up in prose just now, but the lookups themselves succeeded — here is what your data says:",
    "",
    ...lines,
  ].join("\n");
}
