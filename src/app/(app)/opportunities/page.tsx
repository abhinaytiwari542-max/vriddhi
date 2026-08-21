import { Sparkles } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export default function OpportunitiesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Opportunities
        </h1>
        <p className="text-sm text-muted-foreground">
          Revenue signals detected in your Razorpay data, with AI-generated
          evidence and recommendations.
        </p>
      </div>
      <EmptyState
        tone="ai"
        icon={Sparkles}
        title="Opportunity engine ships in Phase 7"
        description="Abandoned-checkout detection is next on the roadmap — this page will list detected opportunities ranked by estimated impact."
      />
    </div>
  );
}
