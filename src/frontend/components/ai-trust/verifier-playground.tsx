"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import { verifyGrounding, type GroundedFacts } from "@/backend/lib/ai/grounding";
import { StatusBadge } from "@/frontend/components/status-badge";

/**
 * The verifier runs in the browser here on purpose.
 *
 * grounding.ts is pure string work with no I/O and no model call, so the
 * exact module the server gates on can execute against whatever the reader
 * types, with no round trip and nothing cached in between. That is the
 * demonstration: an interviewer can edit a figure and watch the same code
 * that guards the real page change its verdict live.
 */
export function VerifierPlayground({
  initialText,
  facts,
  factLabels,
}: {
  initialText: string;
  facts: GroundedFacts;
  factLabels: { label: string; value: string }[];
}) {
  const [text, setText] = useState(initialText);

  const report = useMemo(() => verifyGrounding({ narrative: text }, facts), [text, facts]);
  const critical = report.findings.filter((f) => f.severity === "critical");
  const warnings = report.findings.filter((f) => f.severity === "warning");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-2">
          <label
            htmlFor="narrative-input"
            className="text-xs font-medium text-muted-foreground"
          >
            Model output shown to the merchant — edit any number
          </label>
          <textarea
            id="narrative-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            spellCheck={false}
            className="w-full resize-y rounded-xl border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-ring"
          />
          <p className="text-[11px] text-muted-foreground">
            Try changing ₹9,944 to ₹85,000 — or write &ldquo;about ₹1.1 lakh&rdquo;.
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Figures the rules engine actually produced
          </p>
          <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-xs">
            {factLabels.map((f) => (
              <div key={f.label} className="flex items-center justify-between px-3 py-1.5">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="font-mono tabular-nums text-foreground">{f.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[11px] text-muted-foreground">
            Anything outside this set is not groundable.
          </p>
        </div>
      </div>

      <div
        className={`rounded-xl border p-4 ${
          report.ok
            ? "border-success/30 bg-success/[0.06]"
            : "border-destructive/40 bg-destructive/[0.06]"
        }`}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {report.ok ? (
            <StatusBadge variant="success">
              <ShieldCheck className="size-3" /> Shown to merchant
            </StatusBadge>
          ) : (
            <StatusBadge variant="danger">
              <AlertTriangle className="size-3" /> Blocked before display
            </StatusBadge>
          )}
          <span className="text-xs text-muted-foreground">
            {report.checked} figures checked · {critical.length} critical · {warnings.length}{" "}
            warning
          </span>
        </div>

        {report.findings.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Every figure traces back to the rules engine.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {[...critical, ...warnings].map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <StatusBadge variant={f.severity === "critical" ? "danger" : "pending"}>
                  {f.severity}
                </StatusBadge>
                <span className="text-foreground">{f.reason}</span>
              </li>
            ))}
          </ul>
        )}

        {!report.ok && (
          <p className="mt-3 border-t border-destructive/20 pt-2 text-[11px] text-muted-foreground">
            On the live Opportunities page this narrative would be withheld and the
            deterministic summary shown instead — and the block recorded in the audit trail.
          </p>
        )}
      </div>
    </div>
  );
}
