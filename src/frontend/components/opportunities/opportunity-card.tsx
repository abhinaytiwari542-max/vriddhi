import Link from "next/link";
import { IndianRupee, TrendingUp, Users } from "lucide-react";

import { formatInr } from "@/backend/lib/services/opportunity-engine";
import { StatusBadge } from "@/frontend/components/status-badge";
import { DraftCampaignButton } from "@/frontend/components/opportunities/draft-campaign-button";
import type { AbandonedCheckoutResult } from "@/backend/lib/services/opportunity-engine";
import type { NarrativeResult } from "@/backend/lib/ai/explain-opportunity";
import type { PolicyCheckResult } from "@/backend/lib/services/policy-engine";

const RISK_VARIANT = {
  LOW: "success",
  MEDIUM: "pending",
  HIGH: "danger",
} as const;

function fallbackReasonCopy(
  reason: "no_api_key" | "invalid_output" | "api_error" | "ungrounded"
) {
  switch (reason) {
    case "no_api_key":
      return "AI narration disabled — add GEMINI_API_KEY to enable it.";
    case "ungrounded":
      // The one failure mode worth stating outright: the model produced a
      // figure the rules engine never computed, so the prose was withheld
      // rather than shown. Saying so is the feature, not an apology.
      return "AI summary withheld — it contained a number the rules engine never produced, so it was blocked before display. The figures below are unaffected.";
    case "invalid_output":
      return "AI explanation unavailable — the model's response didn't validate. Showing the rule-based summary.";
    case "api_error":
      // The overwhelmingly common cause here is the free-tier daily quota
      // running out, and "the API call failed" invites the merchant to
      // retry something that won't succeed. The important reassurance is
      // that the numbers below are unaffected — they never came from the
      // model in the first place.
      return "Plain-English summary unavailable right now (AI quota). Every number below is unchanged — they come from your data, not the AI.";
  }
}

export type LastFinishedCampaign = {
  id: string;
  status: string;
  createdAt: Date;
  targetCount: number;
  paidCount: number;
};

export function OpportunityCard({
  result,
  narrative,
  policyCheck,
  existingCampaign,
  lastFinishedCampaign,
}: {
  result: Extract<AbandonedCheckoutResult, { detected: true }>;
  narrative?: NarrativeResult;
  policyCheck?: PolicyCheckResult;
  /** A campaign still in flight — blocks drafting another. */
  existingCampaign?: { id: string; status: string } | null;
  /** The previous run, shown as context when drafting again is allowed. */
  lastFinishedCampaign?: LastFinishedCampaign | null;
}) {
  return (
    <div className="glow-ai rounded-2xl border border-ai/20 bg-gradient-to-b from-ai/[0.06] to-transparent p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Abandoned checkout recovery
        </span>
        <div className="flex items-center gap-2">
          {narrative?.ok && <StatusBadge variant="ai" pulse>AI explanation</StatusBadge>}
          <StatusBadge variant="ai">Confidence {Math.round(result.confidence * 100)}%</StatusBadge>
          <StatusBadge variant={RISK_VARIANT[result.risk]}>{result.risk} risk</StatusBadge>
        </div>
      </div>

      <h3 className="mb-2 text-xl font-semibold text-foreground">
        {result.totalAbandonedCount} abandoned checkouts · {formatInr(result.totalAbandonedValue)} stalled
      </h3>

      {narrative?.ok ? (
        <div className="mb-5 space-y-3 text-sm leading-relaxed">
          <NarrativeSection label="What happened" text={narrative.narrative.whatHappened} />
          <NarrativeSection label="Why it matters" text={narrative.narrative.whyItMatters} />
          <NarrativeSection label="What to do" text={narrative.narrative.recommendedAction} />
          <NarrativeSection label="If you approve" text={narrative.narrative.ifYouApprove} />
        </div>
      ) : (
        <div className="mb-5 space-y-2">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {result.highIntentCount} customers scored high-intent — a prior purchase, a recent
            abandonment, or an above-typical cart value.
          </p>
          {narrative && !narrative.ok && (
            <StatusBadge
              variant={
                narrative.reason === "ungrounded"
                  ? "danger"
                  : narrative.reason === "no_api_key"
                    ? "info"
                    : "pending"
              }
            >
              {fallbackReasonCopy(narrative.reason)}
            </StatusBadge>
          )}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Users} label="Audience" value={String(result.highIntentCount)} />
        <Stat icon={IndianRupee} label="Est. cost" value={formatInr(result.estimatedCost)} />
        <Stat
          icon={TrendingUp}
          label="Expected recovery"
          value={`${formatInr(result.impactMin)}–${formatInr(result.impactMax)}`}
        />
        <Stat icon={IndianRupee} label="Discount / customer" value="₹100" />
      </div>

      <div className="mb-2 text-xs font-medium text-muted-foreground">
        Evidence ({result.evidence.length} customers)
      </div>
      <div className="max-h-64 overflow-x-auto overflow-y-auto rounded-lg border border-border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-card text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Cart value</th>
              <th className="px-3 py-2 font-medium">Abandoned</th>
              <th className="px-3 py-2 font-medium">History</th>
            </tr>
          </thead>
          <tbody>
            {result.evidence.map((row) => (
              <tr key={row.orderId} className="border-t border-border">
                <td className="px-3 py-2 text-foreground">{row.customerName}</td>
                <td className="px-3 py-2 text-foreground">{formatInr(row.amount)}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {row.hoursSinceAbandoned}h ago
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {row.isRepeatCustomer ? "Repeat customer" : "First-time"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {policyCheck && (
        <div className="mt-5 rounded-lg border border-border p-3">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Policy check</span>
            <StatusBadge variant={policyCheck.verdict === "PASS" ? "success" : "danger"}>
              {policyCheck.verdict}
            </StatusBadge>
          </div>
          {policyCheck.verdict === "BLOCKED" ? (
            <p className="text-xs text-muted-foreground">
              {policyCheck.rule}: requested {policyCheck.requested}, limit is {policyCheck.limit}.
              No campaign can be created until this is within limits or the limit is raised in{" "}
              <span className="text-foreground">Settings</span>.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Within all configured limits — ready to draft for approval.
            </p>
          )}
        </div>
      )}

      <div className="mt-4">
        {existingCampaign ? (
          <div className="flex items-center gap-2">
            <StatusBadge variant={existingCampaign.status === "APPROVED" ? "success" : "info"}>
              Campaign {existingCampaign.status.toLowerCase()}
            </StatusBadge>
            <Link
              href="/campaigns"
              className="text-xs font-medium text-foreground underline-offset-4 hover:underline"
            >
              View in Campaigns →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {lastFinishedCampaign && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusBadge
                  variant={lastFinishedCampaign.status === "COMPLETED" ? "success" : "info"}
                >
                  Last run {lastFinishedCampaign.status.toLowerCase()}
                </StatusBadge>
                <span>
                  {lastFinishedCampaign.targetCount} links ·{" "}
                  {lastFinishedCampaign.paidCount} paid ·{" "}
                  {lastFinishedCampaign.createdAt.toLocaleDateString()}
                </span>
                <Link
                  href="/campaigns"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  View →
                </Link>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <DraftCampaignButton
                opportunityId={result.opportunityId}
                label={
                  lastFinishedCampaign ? "Draft another campaign" : "Draft recovery campaign"
                }
              />
              <Link
                href="/campaign-builder"
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                Customize audience &amp; discount →
              </Link>
            </div>
            {lastFinishedCampaign && (
              <p className="text-[11px] text-muted-foreground">
                Customers who already paid are excluded from a new run.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NarrativeSection({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <p className="text-foreground">{text}</p>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}
