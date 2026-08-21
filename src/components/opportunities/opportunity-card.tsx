import { IndianRupee, TrendingUp, Users } from "lucide-react";

import { formatInr } from "@/lib/services/opportunity-engine";
import { StatusBadge } from "@/components/status-badge";
import type { AbandonedCheckoutResult } from "@/lib/services/opportunity-engine";

const RISK_VARIANT = {
  LOW: "success",
  MEDIUM: "pending",
  HIGH: "danger",
} as const;

export function OpportunityCard({
  result,
}: {
  result: Extract<AbandonedCheckoutResult, { detected: true }>;
}) {
  return (
    <div className="glow-ai rounded-2xl border border-ai/20 bg-gradient-to-b from-ai/[0.06] to-transparent p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Abandoned checkout recovery
        </span>
        <div className="flex items-center gap-2">
          <StatusBadge variant="ai">Confidence {Math.round(result.confidence * 100)}%</StatusBadge>
          <StatusBadge variant={RISK_VARIANT[result.risk]}>{result.risk} risk</StatusBadge>
        </div>
      </div>

      <h3 className="mb-2 text-xl font-semibold text-foreground">
        {result.totalAbandonedCount} abandoned checkouts · {formatInr(result.totalAbandonedValue)} stalled
      </h3>
      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
        {result.highIntentCount} customers scored high-intent — a prior purchase, a recent
        abandonment, or an above-typical cart value. Explanation is currently rule-based;
        AI narration arrives in Phase 8.
      </p>

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
      <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
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

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          disabled
          className="cursor-not-allowed rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground"
          title="Approval Center ships in Phase 11"
        >
          Review &amp; approve — Phase 11
        </button>
      </div>
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
    <div className="rounded-lg bg-black/20 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}
