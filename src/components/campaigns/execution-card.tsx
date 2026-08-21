"use client";

import { useState, useTransition } from "react";
import { Zap } from "lucide-react";

import { formatInr } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { executeCampaignAction } from "@/app/(app)/campaigns/actions";

export function ExecutionCard({
  campaignId,
  audienceCount,
  discountAmount,
  maxCost,
  isSimulated,
}: {
  campaignId: string;
  audienceCount: number;
  discountAmount: number;
  maxCost: number;
  isSimulated: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Approved — ready to execute
        </span>
        <div className="flex items-center gap-2">
          <StatusBadge variant={isSimulated ? "pending" : "success"}>
            {isSimulated ? "SIMULATED gateway" : "Razorpay test mode"}
          </StatusBadge>
          <StatusBadge variant="success">APPROVED</StatusBadge>
        </div>
      </div>

      <h3 className="mb-4 text-lg font-semibold text-foreground">
        Send Razorpay payment links to {audienceCount} customers
      </h3>
      {isSimulated && (
        <p className="mb-4 text-xs text-muted-foreground">
          No real Razorpay test account is connected — this will call a simulated gateway
          that mimics Razorpay&apos;s real API shape. No real payment link is created.
        </p>
      )}

      <dl className="mb-5 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-black/20 p-3">
          <dt className="text-[11px] font-medium text-muted-foreground">Audience</dt>
          <dd className="font-semibold text-foreground">{audienceCount} customers</dd>
        </div>
        <div className="rounded-lg bg-black/20 p-3">
          <dt className="text-[11px] font-medium text-muted-foreground">Discount</dt>
          <dd className="font-semibold text-foreground">{formatInr(discountAmount)}</dd>
        </div>
        <div className="rounded-lg bg-black/20 p-3">
          <dt className="text-[11px] font-medium text-muted-foreground">Max cost</dt>
          <dd className="font-semibold text-foreground">{formatInr(maxCost)}</dd>
        </div>
      </dl>

      {error && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      {done ? (
        <p className="text-xs text-success">Execution complete — moving to History…</p>
      ) : (
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await executeCampaignAction(campaignId);
              if (!result.ok) setError(result.error);
              else setDone(true);
            })
          }
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Zap className="size-3.5" />
          {pending ? "Creating payment links…" : "Execute campaign"}
        </button>
      )}
    </div>
  );
}
