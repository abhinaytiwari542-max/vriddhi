"use client";

import { useActionState } from "react";
import { Check, TriangleAlert } from "lucide-react";

import { updatePolicy, type PolicyFormState } from "@/backend/actions/settings-actions";

type Policy = {
  maxCampaignBudget: number;
  maxDiscountPercent: number;
  maxTransactionValue: number;
  requireApprovalAlways: boolean;
  autoExecuteEnabled: boolean;
};

const INITIAL_STATE: PolicyFormState = { status: "idle" };

export function PolicyForm({ policy }: { policy: Policy }) {
  const [state, formAction, pending] = useActionState(updatePolicy, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-6 rounded-2xl border border-border bg-card p-6">
      <Field
        label="Maximum campaign budget (₹)"
        name="maxCampaignBudget"
        type="number"
        defaultValue={policy.maxCampaignBudget / 100}
        hint="Total spend allowed across one recovery campaign."
      />
      <Field
        label="Maximum discount percentage (%)"
        name="maxDiscountPercent"
        type="number"
        defaultValue={policy.maxDiscountPercent}
        hint="Discount offered cannot exceed this share of a customer's cart value."
      />
      <Field
        label="Maximum transaction value (₹)"
        name="maxTransactionValue"
        type="number"
        defaultValue={policy.maxTransactionValue / 100}
        hint="Money exposed per individual customer in one action."
      />
      <Toggle
        label="Require approval for every action"
        name="requireApprovalAlways"
        defaultChecked={policy.requireApprovalAlways}
        hint="When on, nothing executes without an explicit human approval — regardless of amount."
      />
      <Toggle
        label="Allow automatic campaigns"
        name="autoExecuteEnabled"
        defaultChecked={policy.autoExecuteEnabled}
        hint="Off by default. Even if enabled, every action still passes through the limits above."
      />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save limits"}
        </button>
        {state.status === "success" && (
          <span className="flex items-center gap-1.5 text-sm text-success" role="status">
            <Check className="size-3.5" /> Saved
          </span>
        )}
        {state.status === "error" && (
          <span className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
            <TriangleAlert className="size-3.5" /> {state.error}
          </span>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type,
  defaultValue,
  hint,
}: {
  label: string;
  name: string;
  type: string;
  defaultValue: number;
  hint: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        step="0.01"
        min="0"
        defaultValue={defaultValue}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring"
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Toggle({
  label,
  name,
  defaultChecked,
  hint,
}: {
  label: string;
  name: string;
  defaultChecked: boolean;
  hint: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border pt-4">
      <div>
        <label htmlFor={name} className="block text-sm font-medium text-foreground">
          {label}
        </label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-1 size-4 shrink-0 rounded border-border accent-primary"
      />
    </div>
  );
}
