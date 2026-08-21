import { Settings as SettingsIcon, ShieldCheck } from "lucide-react";

import { getDemoMerchant } from "@/backend/lib/demo-merchant";
import { getOrCreatePolicy } from "@/backend/lib/services/policy-engine";
import { PolicyForm } from "@/frontend/components/settings/policy-form";
import { EmptyState } from "@/frontend/components/empty-state";
import { Section } from "@/frontend/components/dashboard/section";
import { StatusBadge } from "@/frontend/components/status-badge";

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
          description="Run the seed script (npm run db:seed) to create the demo merchant first."
        />
      </div>
    );
  }

  const policy = await getOrCreatePolicy(merchant.id);
  const keyId = process.env.RAZORPAY_KEY_ID;
  const isReal = Boolean(keyId);
  const webhookConfigured = Boolean(process.env.RAZORPAY_WEBHOOK_SECRET);

  return (
    <div className="max-w-3xl space-y-9">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your spending limits and payment connection. The agent reads these and can never
          change them.
        </p>
      </div>

      <Section title="Spend limits" note="Hard caps the agent cannot exceed">
        <PolicyForm policy={policy} />
      </Section>

      <Section title="Razorpay connection" note="Where approved actions get executed">
        <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <Row
            label="Gateway"
            value={isReal ? "Razorpay test mode" : "Simulated gateway"}
            note={
              isReal
                ? "Live calls to Razorpay's test API"
                : "Mirrors Razorpay's API without sending"
            }
            badge={
              <StatusBadge variant={isReal ? "success" : "pending"}>
                {isReal ? "Connected" : "Not connected"}
              </StatusBadge>
            }
          />
          <Row
            label="Key ID"
            value={isReal ? maskKeyId(keyId!) : "Not set"}
            note="Set through environment variables only"
          />
          <Row
            label="Webhook verification"
            value={webhookConfigured ? "HMAC-SHA256 enabled" : "Not configured"}
            note="Every incoming event is signature-checked"
            badge={
              <StatusBadge variant={webhookConfigured ? "success" : "info"}>
                {webhookConfigured ? "Verified" : "Off"}
              </StatusBadge>
            }
          />

          <p className="flex items-start gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
            <span>
              API keys are never entered or stored in this dashboard — they are read from the
              server environment, so nothing here can leak a secret to the browser. Switching
              between the simulated and real gateway needs no code change.
            </span>
          </p>
        </div>
      </Section>
    </div>
  );
}

/**
 * Shows enough of the key to confirm *which* account is wired up, without
 * printing a credential into the page. Razorpay key IDs aren't secret on
 * their own (the secret is the other half), but there's no reason to render
 * one in full.
 */
function maskKeyId(keyId: string) {
  return keyId.length <= 12 ? keyId : `${keyId.slice(0, 8)}…${keyId.slice(-4)}`;
}

function Row({
  label,
  value,
  note,
  badge,
}: {
  label: string;
  value: string;
  note: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="font-mono text-sm text-foreground">{value}</p>
        <p className="text-[11px] text-muted-foreground">{note}</p>
      </div>
      {badge}
    </div>
  );
}
