"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Zap } from "lucide-react";

import { formatInr } from "@/frontend/lib/format";
import { StatusBadge } from "@/frontend/components/status-badge";
import {
  executeCampaignAction,
  retryCampaignAction,
} from "@/backend/actions/campaigns-actions";

type FailureState = {
  reason: string;
  createdCount: number;
  remainingCount: number;
};

export function ExecutionCard({
  campaignId,
  audienceCount,
  discountAmount,
  maxCost,
  isSimulated,
  status,
  createdCount = 0,
  remainingCount = 0,
  haltReason,
}: {
  campaignId: string;
  audienceCount: number;
  discountAmount: number;
  maxCost: number;
  isSimulated: boolean;
  status: "APPROVED" | "HALTED" | "EXECUTING";
  createdCount?: number;
  remainingCount?: number;
  haltReason?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [failure, setFailure] = useState<FailureState | null>(
    status === "HALTED" && haltReason
      ? { reason: haltReason, createdCount, remainingCount }
      : null
  );

  if (failure) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-destructive">
            <AlertTriangle className="size-3.5" /> Action failed
          </span>
          <StatusBadge variant="danger">HALTED</StatusBadge>
        </div>

        <h3 className="mb-1 text-lg font-semibold text-foreground">
          No customer was charged.
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">Reason: {failure.reason}</p>

        <div className="mb-5 space-y-1.5 text-sm">
          <SafetyLine text="No duplicate transaction" />
          <SafetyLine text="No additional charge" />
          <SafetyLine text="Action recorded in the audit trail" />
        </div>

        <p className="mb-4 text-xs text-muted-foreground">
          {failure.createdCount} of {audienceCount} links were created before this happened —
          retrying will only attempt the remaining {failure.remainingCount}, never the ones
          already done.
        </p>

        {error && (
          <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await retryCampaignAction(campaignId);
              if (!result.ok) {
                setError(result.error);
              } else if (result.halted) {
                setFailure({
                  reason: result.haltReason ?? "Unknown failure",
                  createdCount: result.created + result.alreadyDone,
                  remainingCount: result.remaining,
                });
              } else {
                setFailure(null);
                setDone(true);
              }
            })
          }
          className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Retrying…" : `Retry remaining ${failure.remainingCount}`}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {status === "EXECUTING" ? "Interrupted — resume execution" : "Approved — ready to execute"}
        </span>
        <div className="flex items-center gap-2">
          <StatusBadge variant={isSimulated ? "pending" : "success"}>
            {isSimulated ? "SIMULATED gateway" : "Razorpay test mode"}
          </StatusBadge>
          <StatusBadge variant={status === "EXECUTING" ? "pending" : "success"}>{status}</StatusBadge>
        </div>
      </div>

      <h3 className="mb-4 text-lg font-semibold text-foreground">
        Send Razorpay payment links to {audienceCount} customers
      </h3>
      {status === "EXECUTING" && (
        <p className="mb-4 text-xs text-muted-foreground">
          A previous run of this campaign was interrupted before it could record a final
          status. {createdCount} of {audienceCount} links were already created — resuming will
          only attempt the remaining {remainingCount}, never the ones already done.
        </p>
      )}
      {isSimulated && (
        <p className="mb-4 text-xs text-muted-foreground">
          No real Razorpay test account is connected — this will call a simulated gateway
          that mimics Razorpay&apos;s real API shape. No real payment link is created.
        </p>
      )}

      <dl className="mb-5 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-muted p-3">
          <dt className="text-[11px] font-medium text-muted-foreground">Audience</dt>
          <dd className="font-semibold text-foreground">{audienceCount} customers</dd>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <dt className="text-[11px] font-medium text-muted-foreground">Discount</dt>
          <dd className="font-semibold text-foreground">{formatInr(discountAmount)}</dd>
        </div>
        <div className="rounded-lg bg-muted p-3">
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
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={simulateFailure}
              onChange={(e) => setSimulateFailure(e.target.checked)}
              className="size-3.5 rounded border-border accent-warning"
            />
            Simulate a mid-campaign failure (demo of failure handling)
          </label>
          <button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await executeCampaignAction(campaignId, simulateFailure);
                if (!result.ok) {
                  setError(result.error);
                } else if (result.halted) {
                  setFailure({
                    reason: result.haltReason ?? "Unknown failure",
                    createdCount: result.created + result.alreadyDone,
                    remainingCount: result.remaining,
                  });
                } else {
                  setDone(true);
                }
              })
            }
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Zap className="size-3.5" />
            {pending ? "Creating payment links…" : "Execute campaign"}
          </button>
        </div>
      )}
    </div>
  );
}

function SafetyLine({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-1.5 text-success">
      <Check className="size-3.5" />
      <span className="text-foreground">{text}</span>
    </div>
  );
}
