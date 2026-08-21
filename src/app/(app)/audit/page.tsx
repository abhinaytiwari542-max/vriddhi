import { ScrollText } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export default function AuditPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Audit Trail
        </h1>
        <p className="text-sm text-muted-foreground">
          Every detection, recommendation, approval, and execution — timestamped
          and attributed.
        </p>
      </div>
      <EmptyState
        icon={ScrollText}
        title="No events recorded yet"
        description="The audit log fills in automatically as the opportunity engine, approvals, and Razorpay execution come online in later phases."
      />
    </div>
  );
}
