import { Settings as SettingsIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Spend limits, approval rules, and your Razorpay test-mode connection.
        </p>
      </div>
      <EmptyState
        icon={SettingsIcon}
        title="Policy and connection settings arrive in Phases 10 and 12"
        description="Maximum campaign budget, discount caps, transaction limits, and the auto-execute toggle will be configured here, alongside connecting your own Razorpay test keys."
      />
    </div>
  );
}
