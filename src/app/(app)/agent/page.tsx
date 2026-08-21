import { Bot } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export default function AgentPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Agent
        </h1>
        <p className="text-sm text-muted-foreground">
          Ask Vriddhi about your revenue, opportunities, or what to do next.
        </p>
      </div>
      <EmptyState
        tone="ai"
        icon={Bot}
        title="Agent chat ships in Phase 15"
        description="Natural-language questions will be converted into tool calls here — every money-related answer still passes through policy and approval, never straight to execution."
      />
    </div>
  );
}
