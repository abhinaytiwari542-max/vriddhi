"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Check, ShoppingBag, X } from "lucide-react";

import { formatInr } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import {
  approveCrossSellAction,
  rejectCrossSellAction,
} from "@/app/(app)/opportunities/actions";
import type { CrossSellResult } from "@/lib/services/cross-sell-engine";

export function CrossSellCard({
  result,
}: {
  result: Extract<CrossSellResult, { detected: true }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [decided, setDecided] = useState<"approved" | "rejected" | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, outcome: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
      else setDecided(outcome);
    });
  }

  return (
    <div className="glow-ai rounded-2xl border border-ai/20 bg-gradient-to-b from-ai/[0.06] to-transparent p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Cross-sell recommendation
        </span>
        <div className="flex items-center gap-2">
          <StatusBadge variant="ai">Confidence {Math.round(result.confidenceScore * 100)}%</StatusBadge>
          <StatusBadge variant="success">LOW risk</StatusBadge>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <ShoppingBag className="size-4 text-muted-foreground" />
        <span className="text-lg font-semibold text-foreground">{result.productName}</span>
        <ArrowRight className="size-4 text-ai" />
        <span className="text-lg font-semibold text-ai">{result.recommendedProductName}</span>
      </div>

      <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
        {result.coOccurrenceCount} of {result.supportA} customers who bought{" "}
        <span className="text-foreground">{result.productName}</span> also bought{" "}
        <span className="text-foreground">{result.recommendedProductName}</span> — a{" "}
        {Math.round(result.confidence * 100)}% attach rate, {result.lift.toFixed(1)}x more likely than
        chance.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Co-occurrence" value={`${result.coOccurrenceCount} orders`} />
        <Stat label="Attach rate" value={`${Math.round(result.confidence * 100)}%`} />
        <Stat label="Lift" value={`${result.lift.toFixed(1)}x`} />
        <Stat
          label="Est. incremental revenue"
          value={`${formatInr(result.impactMin)}–${formatInr(result.impactMax)}`}
        />
      </div>

      <p className="mb-5 text-xs text-muted-foreground">
        No cost, no discount, no customer targeting — this only changes what&apos;s suggested on the
        product page. Assumes featuring it adds 5–12 percentage points of attach rate on top of the
        current organic rate (a stated assumption, not a measured fact).
      </p>

      {error && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
      )}

      {decided ? (
        <StatusBadge variant={decided === "approved" ? "success" : "info"}>
          {decided === "approved" ? "Approved — now live as a cross-sell" : "Rejected"}
        </StatusBadge>
      ) : (
        <div className="flex gap-2">
          <button
            disabled={pending}
            onClick={() => run(() => approveCrossSellAction(result.opportunityId), "approved")}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Check className="size-3.5" /> Approve
          </button>
          <button
            disabled={pending}
            onClick={() => run(() => rejectCrossSellAction(result.opportunityId), "rejected")}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <X className="size-3.5" /> Reject
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
