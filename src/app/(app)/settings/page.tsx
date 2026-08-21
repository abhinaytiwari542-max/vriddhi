import { getDemoMerchant } from "@/lib/demo-merchant";
import { getOrCreatePolicy } from "@/lib/services/policy-engine";
import { updatePolicy } from "@/app/(app)/settings/actions";
import { EmptyState } from "@/components/empty-state";
import { Settings as SettingsIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const merchant = await getDemoMerchant();

  if (!merchant) {
    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <EmptyState
          icon={SettingsIcon}
          title="No merchant found"
          description="Run the seed script (Phase 6) first."
        />
      </div>
    );
  }

  const policy = await getOrCreatePolicy(merchant.id);

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Deterministic spend limits — the AI agent can never override these,
          no matter what it&rsquo;s asked to do.
        </p>
      </div>

      <form action={updatePolicy} className="space-y-6 rounded-2xl border border-border bg-card p-6">
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

        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Save limits
        </button>
      </form>

      <p className="text-xs text-muted-foreground">
        Razorpay connection settings arrive in Phase 12.
      </p>
    </div>
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
