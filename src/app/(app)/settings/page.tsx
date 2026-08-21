import { getDemoMerchant } from "@/backend/lib/demo-merchant";
import { getOrCreatePolicy } from "@/backend/lib/services/policy-engine";
import { PolicyForm } from "@/frontend/components/settings/policy-form";
import { EmptyState } from "@/frontend/components/empty-state";
import { Settings as SettingsIcon } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const merchant = await getDemoMerchant();

  if (!merchant) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
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
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Deterministic spend limits — the AI agent can never override these,
          no matter what it&rsquo;s asked to do.
        </p>
      </div>

      <PolicyForm policy={policy} />

      <p className="text-xs text-muted-foreground">
        Razorpay connection settings arrive in Phase 12.
      </p>
    </div>
  );
}
