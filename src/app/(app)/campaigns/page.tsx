import { Megaphone } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export default function CampaignsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Campaigns
        </h1>
        <p className="text-sm text-muted-foreground">
          Approved, executing, and completed recovery actions.
        </p>
      </div>
      <EmptyState
        icon={Megaphone}
        title="No campaigns yet"
        description="Campaigns are created once an opportunity is approved (Phase 11) — this page will show live execution progress and results."
      />
    </div>
  );
}
