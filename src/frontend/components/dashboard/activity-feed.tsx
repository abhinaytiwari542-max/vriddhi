import { StatusBadge, type StatusVariant } from "@/frontend/components/status-badge";

const STATUS_VARIANT: Record<string, StatusVariant> = {
  SUCCESS: "success",
  FAILURE: "danger",
  BLOCKED: "pending",
};

const ACTOR_LABEL: Record<string, string> = {
  SYSTEM: "System",
  AI: "AI",
  MERCHANT: "You",
  RAZORPAY: "Razorpay",
  CUSTOMER: "Customer",
};

export type ActivityItem = {
  id: string;
  actor: string;
  label: string;
  status: string;
  timestamp: Date;
};

/**
 * A compact tail of the audit trail on the dashboard itself. Without it
 * the audit trail is a page you have to remember to visit, and the app
 * gives no sign that anything it did was recorded — which is the one
 * property this product is actually built around.
 */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
        Nothing recorded yet — approve a campaign and every step shows up here.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-xs">
          <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
            {item.timestamp.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          <span className="w-16 shrink-0 text-muted-foreground">
            {ACTOR_LABEL[item.actor] ?? item.actor}
          </span>
          <span className="flex-1 text-foreground">{item.label}</span>
          <StatusBadge variant={STATUS_VARIANT[item.status] ?? "info"}>
            {item.status}
          </StatusBadge>
        </li>
      ))}
    </ol>
  );
}
