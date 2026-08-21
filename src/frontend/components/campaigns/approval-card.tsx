"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";

import { formatInr } from "@/frontend/lib/format";
import { StatusBadge } from "@/frontend/components/status-badge";
import {
  approveCampaignAction,
  modifyCampaignAction,
  rejectCampaignAction,
} from "@/backend/actions/campaigns-actions";

const RISK_VARIANT = { LOW: "success", MEDIUM: "pending", HIGH: "danger" } as const;

export function ApprovalCard({
  campaignId,
  audienceCount,
  discountAmount,
  maxCost,
  impactMin,
  impactMax,
  risk,
}: {
  campaignId: string;
  audienceCount: number;
  discountAmount: number;
  maxCost: number;
  impactMin: number;
  impactMax: number;
  risk: "LOW" | "MEDIUM" | "HIGH";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [modifying, setModifying] = useState(false);
  const [discountInput, setDiscountInput] = useState(String(discountAmount / 100));

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong.");
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Action requires approval
        </span>
        <StatusBadge variant={RISK_VARIANT[risk]}>{risk} risk</StatusBadge>
      </div>

      <h3 className="mb-4 text-lg font-semibold text-foreground">
        Launch abandoned-checkout recovery campaign
      </h3>

      <dl className="mb-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Stat label="Audience" value={`${audienceCount} customers`} />
        <Stat label="Discount" value={formatInr(discountAmount)} />
        <Stat label="Maximum cost" value={formatInr(maxCost)} />
        <Stat label="Expected recovery" value={`${formatInr(impactMin)}–${formatInr(impactMax)}`} />
      </dl>

      {modifying && (
        <div className="mb-4 flex items-end gap-2 rounded-lg border border-border p-3">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              New discount per customer (₹)
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring"
            />
          </div>
          <button
            disabled={pending}
            onClick={() =>
              run(() => modifyCampaignAction(campaignId, Number(discountInput)))
            }
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Confirm & approve
          </button>
          <button
            onClick={() => setModifying(false)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() => run(() => approveCampaignAction(campaignId))}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Check className="size-3.5" /> Approve
        </button>
        <button
          disabled={pending}
          onClick={() => setModifying((m) => !m)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <Pencil className="size-3.5" /> Modify
        </button>
        <button
          disabled={pending}
          onClick={() => run(() => rejectCampaignAction(campaignId))}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <X className="size-3.5" /> Reject
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}
