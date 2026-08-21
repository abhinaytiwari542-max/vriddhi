import { describe, expect, it } from "vitest";

import { summarizeTrace } from "@/backend/lib/ai/trace-summary";
import type { AgentTraceEntry } from "@/backend/lib/ai/agent";

// ---------------------------------------------------------------------------
// The agent fetches data, then asks the model to write it up. When the second
// step fails the first has usually already succeeded, so the answer exists in
// the trace. Showing "the API call failed" while holding it was the most
// misleading behaviour in the app — the backend had worked. These tests pin
// the fallback that reads the trace instead of discarding it.
// ---------------------------------------------------------------------------

function entry(tool: string, output: unknown, ok = true): AgentTraceEntry {
  return { tool, input: {}, ok, output };
}

describe("deterministic answers from a tool trace", () => {
  it("reports a customer count from list output", () => {
    const summary = summarizeTrace([
      entry("get_customers", [{ id: "1" }, { id: "2" }, { id: "3" }]),
    ]);
    expect(summary).toContain("3 customers");
  });

  it("reports the real figures from an abandoned-checkout lookup", () => {
    const summary = summarizeTrace([
      entry("get_abandoned_checkouts", {
        detected: true,
        totalAbandonedCount: 43,
        totalAbandonedValue: "₹1,09,820",
        highIntentCount: 21,
        estimatedCost: "₹2,100",
        expectedImpact: "₹9,944-₹16,574",
      }),
    ]);
    expect(summary).toContain("43 abandoned checkouts");
    expect(summary).toContain("₹1,09,820");
    expect(summary).toContain("21");
    expect(summary).toContain("₹2,100");
  });

  it("says so plainly when nothing was detected", () => {
    const summary = summarizeTrace([entry("get_abandoned_checkouts", { detected: false })]);
    expect(summary).toContain("No abandoned-checkout opportunity");
  });

  it("surfaces a drafted campaign, since that is a real side effect", () => {
    // The important case: a campaign genuinely exists in the database. If the
    // merchant is told the request failed, they do not know to go approve it.
    const summary = summarizeTrace([
      entry("create_campaign", { status: "drafted", audienceCount: 21 }),
    ]);
    expect(summary).toContain("21 customers");
    expect(summary).toMatch(/approval/i);
    expect(summary).toMatch(/nothing has been sent/i);
  });

  it("surfaces a policy block with its reason", () => {
    const summary = summarizeTrace([
      entry("create_campaign", {
        status: "blocked",
        message: "Maximum campaign budget — requested ₹26,400, limit is ₹5,000",
      }),
    ]);
    expect(summary).toContain("₹26,400");
    expect(summary).toMatch(/blocked/i);
  });

  it("still reports the refusal for the tool that always refuses", () => {
    const summary = summarizeTrace([entry("create_payment_order", { status: "refused" })]);
    expect(summary).toMatch(/cannot be created by the agent/i);
  });

  it("combines several tool calls into one answer", () => {
    const summary = summarizeTrace([
      entry("get_customers", [{ id: "1" }, { id: "2" }]),
      entry("get_orders", [{ id: "o1" }]),
      entry("calculate_campaign_cost", { totalCost: "₹2,100" }),
    ]);
    expect(summary).toContain("2 customers");
    expect(summary).toContain("1 recent orders");
    expect(summary).toContain("₹2,100");
  });

  it("marks a failed tool call rather than omitting it", () => {
    const summary = summarizeTrace([entry("get_orders", null, false)]);
    expect(summary).toContain("could not be read");
  });

  it("returns null when the trace holds nothing worth showing", () => {
    // Callers rely on null to fall back to a plain error instead of
    // rendering an empty answer that looks like a broken response.
    expect(summarizeTrace([])).toBeNull();
    expect(summarizeTrace([entry("some_unknown_tool", { a: 1 })])).toBeNull();
  });

  it("never claims the model wrote it", () => {
    const summary = summarizeTrace([entry("get_customers", [{ id: "1" }])]);
    expect(summary).toMatch(/could not write this up/i);
  });
});
