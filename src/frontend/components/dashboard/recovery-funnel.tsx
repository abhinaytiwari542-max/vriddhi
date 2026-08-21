import { formatInr } from "@/frontend/lib/format";

export type FunnelStage = {
  label: string;
  count: number;
  value: number;
  note: string;
};

/**
 * The single most useful view of what this product does: money stalls at
 * checkout, the agent narrows it to the customers worth paying to recover,
 * a human approves, Razorpay sends links, some get paid. Shown as one row
 * of stages so the drop-off between "detected" and "actually recovered" is
 * impossible to miss — that gap is the honest state of the funnel, not
 * something to hide behind a single headline number.
 */
export function RecoveryFunnel({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stages.map((stage, i) => (
        <div
          key={stage.label}
          className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4"
        >
          <div className="space-y-0.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className="tabular-nums text-[10px] text-muted-foreground/70">
                {i + 1}
              </span>
              {stage.label}
            </p>
            <p className="text-2xl font-semibold tracking-tight tabular-nums text-foreground">
              {stage.count}
            </p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatInr(stage.value)}
            </p>
          </div>
          <div className="space-y-1.5">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="presentation"
            >
              <div
                className="h-full rounded-full bg-ai/70"
                style={{ width: `${Math.max((stage.count / max) * 100, 2)}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">{stage.note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
