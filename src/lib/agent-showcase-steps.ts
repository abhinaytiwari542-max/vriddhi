// Illustrative walkthrough content for the landing page demo — NOT live data.
// The real version of this sequence runs on seeded/derived data starting Phase 6/7.
import type { StatusVariant } from "@/components/status-badge";

export type ShowcaseStep = {
  id: string;
  surface: "ai" | "action" | "system";
  eyebrow: string;
  statusVariant: StatusVariant;
  statusLabel: string;
  title: string;
  body: ShowcaseBody;
};

export type ShowcaseBody =
  | { kind: "evidence"; lines: string[] }
  | { kind: "explanation"; evidence: string[]; action: string; cost: string; impact: string; confidence: string; risk: string }
  | { kind: "approval"; audience: string; discount: string; maxCost: string; impact: string }
  | { kind: "progress"; label: string; percent: number }
  | { kind: "audit"; entries: { time: string; text: string }[] };

export const SHOWCASE_STEPS: ShowcaseStep[] = [
  {
    id: "detect",
    surface: "ai",
    eyebrow: "Opportunity detected",
    statusVariant: "ai",
    statusLabel: "AI analyzing",
    title: "43 abandoned checkouts · ₹1,24,000 stalled",
    body: {
      kind: "evidence",
      lines: [
        "43 orders created, never paid",
        "18 customers scored high-intent",
        "Detected from Razorpay test-mode order history",
      ],
    },
  },
  {
    id: "explain",
    surface: "ai",
    eyebrow: "AI explanation",
    statusVariant: "ai",
    statusLabel: "Recommendation ready",
    title: "Recover 18 high-intent checkouts",
    body: {
      kind: "explanation",
      evidence: [
        "18 customers abandoned within the last 48 hours",
        "Average stalled cart value: ₹2,850",
      ],
      action: "Send a ₹100 discount payment link to each",
      cost: "₹1,800 max",
      impact: "₹8,000–₹12,000 recovered",
      confidence: "0.78",
      risk: "Medium",
    },
  },
  {
    id: "approve",
    surface: "action",
    eyebrow: "Approval required",
    statusVariant: "pending",
    statusLabel: "Awaiting your decision",
    title: "Nothing executes without your approval",
    body: {
      kind: "approval",
      audience: "18 customers",
      discount: "₹100 each",
      maxCost: "₹1,800",
      impact: "₹8,000–₹12,000",
    },
  },
  {
    id: "execute",
    surface: "action",
    eyebrow: "Executing",
    statusVariant: "info",
    statusLabel: "In progress",
    title: "Creating Razorpay test-mode payment links",
    body: { kind: "progress", label: "12 / 18 links created", percent: 67 },
  },
  {
    id: "audit",
    surface: "system",
    eyebrow: "Audit trail",
    statusVariant: "success",
    statusLabel: "Recorded",
    title: "Every step, timestamped and attributed",
    body: {
      kind: "audit",
      entries: [
        { time: "11:32", text: "Opportunity detected" },
        { time: "11:34", text: "AI recommendation generated" },
        { time: "11:37", text: "Merchant approved · Razorpay called" },
      ],
    },
  },
];
