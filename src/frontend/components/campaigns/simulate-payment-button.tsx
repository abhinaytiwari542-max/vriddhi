"use client";

import { useState, useTransition } from "react";
import { Check, CreditCard } from "lucide-react";

import { simulateCustomerPaymentAction } from "@/backend/actions/campaigns-actions";

/**
 * Demo-only trigger for the Phase 26 webhook pipeline: fires a real,
 * signed payment_link.paid webhook through the exact same verification
 * path the live /api/webhooks/razorpay route uses. Only shown for
 * LINK_CREATED targets — once paid, the row re-renders as a plain status
 * cell (see campaigns/page.tsx), since there is nothing further to
 * trigger and no path back to LINK_CREATED.
 */
export function SimulatePaymentButton({ campaignTargetId }: { campaignTargetId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <span className="flex items-center gap-1 text-success">
        <Check className="size-3" /> PAID
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await simulateCustomerPaymentAction(campaignTargetId);
            if (result.ok) setDone(true);
            else setError(result.error);
          })
        }
        className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
      >
        <CreditCard className="size-3" />
        {pending ? "Sending webhook…" : "Simulate customer payment"}
      </button>
      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
}
