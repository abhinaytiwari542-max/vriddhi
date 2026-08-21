import { CreditCard, Link2, ShieldCheck, Webhook } from "lucide-react";

import { formatInr } from "@/frontend/lib/format";
import { StatusBadge } from "@/frontend/components/status-badge";

export type RazorpayPanelData = {
  mode: "real" | "simulated";
  webhookConfigured: boolean;
  linksCreated: number;
  linksPaid: number;
  amountCollected: number;
};

/**
 * Razorpay is the whole point of this product's execution layer, so it
 * gets a dedicated panel rather than a badge buried in a corner: which
 * gateway is live, whether webhook verification is wired, and what has
 * actually moved through it. Every number here is a real row count, not a
 * projection.
 */
export function RazorpayPanel({ data }: { data: RazorpayPanelData }) {
  const isReal = data.mode === "real";

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/60 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[#0C2451] text-white">
            <CreditCard className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Razorpay payments</p>
            <p className="text-xs text-muted-foreground">
              Where every approved action actually executes
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge variant={isReal ? "success" : "pending"}>
            {isReal ? "Test-mode API live" : "Simulated gateway"}
          </StatusBadge>
          <StatusBadge variant={data.webhookConfigured ? "success" : "info"}>
            <Webhook className="size-3" />
            {data.webhookConfigured ? "Webhook verified" : "Webhook not set"}
          </StatusBadge>
        </div>
      </div>

      <dl className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
        <Stat
          icon={<Link2 className="size-3.5" />}
          label="Payment links created"
          value={String(data.linksCreated)}
          note="One per targeted customer"
        />
        <Stat
          icon={<CreditCard className="size-3.5" />}
          label="Links paid"
          value={String(data.linksPaid)}
          note="Confirmed by signed webhook"
        />
        <Stat
          icon={<ShieldCheck className="size-3.5" />}
          label="Collected"
          value={formatInr(data.amountCollected)}
          note="Recovered from stalled carts"
        />
        <Stat
          icon={<ShieldCheck className="size-3.5" />}
          label="Signature checks"
          value={data.webhookConfigured ? "HMAC-SHA256" : "Not configured"}
          note="Razorpay SDK verifies each event"
        />
      </dl>

      <p className="border-t border-border px-5 py-2.5 text-xs text-muted-foreground">
        {isReal
          ? "Calls go to Razorpay's real test-mode API — payment links here exist in your Razorpay dashboard."
          : "Runs against a gateway that mirrors Razorpay's real API shape, so no live payment link is created."}
      </p>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="space-y-0.5 px-5 py-4">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="text-xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </dd>
      <p className="text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}
