import { ScrollText } from "lucide-react";

import { prisma } from "@/backend/lib/db";
import { getDemoMerchant } from "@/backend/lib/demo-merchant";
import { auditActionLabel } from "@/backend/lib/audit-labels";
import { EmptyState } from "@/frontend/components/empty-state";
import { StatusBadge } from "@/frontend/components/status-badge";

export const dynamic = "force-dynamic";

const STATUS_VARIANT = {
  SUCCESS: "success",
  FAILURE: "danger",
  BLOCKED: "pending",
} as const;

const ACTOR_LABEL = {
  SYSTEM: "System",
  AI: "AI",
  MERCHANT: "Merchant",
  RAZORPAY: "Razorpay",
  CUSTOMER: "Customer",
} as const;

const LOG_LIMIT = 200;

export default async function AuditPage() {
  const merchant = await getDemoMerchant();
  const logs = merchant
    ? await prisma.auditLog.findMany({
        where: { merchantId: merchant.id },
        orderBy: { timestamp: "desc" },
        take: LOG_LIMIT,
      })
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Audit Trail
        </h1>
        <p className="text-sm text-muted-foreground">
          Every detection, recommendation, approval, and execution — timestamped
          and attributed. Most recent first.
        </p>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No events recorded yet"
          description="Visit Opportunities to trigger detection, or approve and execute a campaign — events will appear here as they happen."
        />
      ) : (
        <div className="divide-y divide-border rounded-2xl border border-border font-mono">
          {logs.map((log) => (
            <details key={log.id} className="group p-4 open:bg-muted/60">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 text-xs [&::-webkit-details-marker]:hidden">
                <span className="tabular-nums text-muted-foreground">
                  {log.timestamp.toLocaleString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="text-muted-foreground">{ACTOR_LABEL[log.actor]}</span>
                <span className="flex-1 font-sans text-foreground">
                  {auditActionLabel(log.action)}
                </span>
                <StatusBadge variant={STATUS_VARIANT[log.status]}>{log.status}</StatusBadge>
              </summary>

              <div className="mt-3 grid gap-2 border-t border-border pt-3 font-sans text-xs text-muted-foreground sm:grid-cols-2">
                {log.relatedEntityType && (
                  <div>
                    <span className="font-medium">Related:</span> {log.relatedEntityType}{" "}
                    <span className="font-mono">{log.relatedEntityId}</span>
                  </div>
                )}
                {log.error && (
                  <div className="text-destructive">
                    <span className="font-medium">Error:</span> {log.error}
                  </div>
                )}
                {log.input !== null && (
                  <div className="sm:col-span-2">
                    <span className="font-medium">Input:</span>{" "}
                    <span className="font-mono">{JSON.stringify(log.input)}</span>
                  </div>
                )}
                {log.output !== null && (
                  <div className="sm:col-span-2">
                    <span className="font-medium">Output:</span>{" "}
                    <span className="font-mono">{JSON.stringify(log.output)}</span>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
