"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Ban, Bot, Check, ShoppingBag, Wrench } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import {
  sendBuyerMessage,
  authorizePurchaseAction,
  cancelOrderAction,
} from "@/app/(app)/buyer/actions";
import type { BuyerTraceEntry } from "@/lib/ai/buyer-agent";

type Proposal = { orderId: string; productName: string; priceRupees: number; deliveryEstimate: string | null };

type Turn = {
  message: string;
  answer?: string;
  trace?: BuyerTraceEntry[];
  proposal?: Proposal;
  error?: string;
};

type OrderDecision =
  | { kind: "success"; mode: string; paymentLinkId: string }
  | { kind: "failed"; error: string }
  | { kind: "cancelled" };

const SUGGESTED = [
  "Find running shoes under ₹3,000.",
  "I need a rain-friendly hiking boot under ₹5,000.",
  "Something for ₹500 or less to try out the store.",
];

function extractProposal(trace: BuyerTraceEntry[] | undefined): Proposal | undefined {
  const hit = trace?.find((t) => t.tool === "propose_purchase" && t.ok);
  if (!hit) return undefined;
  const out = hit.output as { orderId?: string; productName?: string; priceRupees?: number; deliveryEstimate?: string | null };
  if (!out.orderId) return undefined;
  return {
    orderId: out.orderId,
    productName: out.productName ?? "product",
    priceRupees: out.priceRupees ?? 0,
    deliveryEstimate: out.deliveryEstimate ?? null,
  };
}

export function BuyerPanel() {
  const [budget, setBudget] = useState("3000");
  const [name, setName] = useState("Demo Buyer");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, startTransition] = useTransition();
  const [decisions, setDecisions] = useState<Record<string, OrderDecision>>({});
  const [simulateFailure, setSimulateFailure] = useState(false);

  function send(text: string) {
    if (!text.trim() || pending) return;
    const budgetRupees = Number(budget) || 0;
    setTurns((prev) => [...prev, { message: text }]);
    setMessage("");

    startTransition(async () => {
      const result = await sendBuyerMessage(text, budgetRupees, name, email);
      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (result.ok) {
          last.answer = result.answer;
          last.trace = result.trace;
          last.proposal = extractProposal(result.trace);
        } else {
          last.error =
            result.reason === "no_api_key"
              ? "AI buyer disabled — add GEMINI_API_KEY to enable it."
              : "The Gemini API call failed. Try again in a moment.";
          last.trace = result.trace;
          last.proposal = extractProposal(result.trace);
        }
        return next;
      });
    });
  }

  function authorize(orderId: string) {
    startTransition(async () => {
      const result = await authorizePurchaseAction(orderId, Number(budget) || 0, simulateFailure);
      setDecisions((prev) => ({
        ...prev,
        [orderId]: result.ok
          ? { kind: "success", mode: result.mode, paymentLinkId: result.paymentLinkId }
          : { kind: "failed", error: result.error },
      }));
    });
  }

  function cancel(orderId: string) {
    startTransition(async () => {
      const result = await cancelOrderAction(orderId);
      if (result.ok) setDecisions((prev) => ({ ...prev, [orderId]: { kind: "cancelled" } }));
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
        <Field label="Your authorized budget (₹)" value={budget} onChange={setBudget} type="number" />
        <Field label="Your name" value={name} onChange={setName} />
        <Field label="Your email (optional)" value={email} onChange={setEmail} />
      </div>
      <p className="text-xs text-muted-foreground">
        This budget is a hard ceiling the agent cannot exceed, checked in code — not something it merely
        remembers from the conversation. It re-checks again at authorization time too.
      </p>

      <div className="space-y-4">
        {turns.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {SUGGESTED.map((p) => (
              <button
                key={p}
                onClick={() => send(p)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground">
                {t.message}
              </div>
            </div>

            {(t.answer || t.error) && (
              <div className="flex gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ai/10 text-ai">
                  <Bot className="size-3.5" />
                </span>
                <div className="max-w-[80%] space-y-2">
                  <div
                    className={
                      t.error
                        ? "rounded-2xl bg-warning/10 px-4 py-2 text-sm text-warning"
                        : "rounded-2xl bg-muted px-4 py-2 text-sm text-foreground"
                    }
                  >
                    {t.error ?? t.answer}
                  </div>
                  {t.trace && t.trace.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {t.trace.map((tr, j) => (
                        <StatusBadge key={j} variant={tr.ok ? "info" : "danger"}>
                          <Wrench className="size-3" />
                          {tr.tool}
                        </StatusBadge>
                      ))}
                    </div>
                  )}

                  {t.proposal && (
                    <ProposalCard
                      proposal={t.proposal}
                      decision={decisions[t.proposal.orderId]}
                      pending={pending}
                      simulateFailure={simulateFailure}
                      onSimulateFailureChange={setSimulateFailure}
                      onAuthorize={() => authorize(t.proposal!.orderId)}
                      onCancel={() => cancel(t.proposal!.orderId)}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {pending && <p className="text-xs text-muted-foreground">Thinking…</p>}
      </div>

      <div className="flex gap-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(message)}
          placeholder="What are you looking for?"
          disabled={pending}
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring disabled:opacity-50"
        />
        <button
          disabled={pending || !message.trim()}
          onClick={() => send(message)}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Ask
        </button>
      </div>
    </div>
  );
}

function ProposalCard({
  proposal,
  decision,
  pending,
  simulateFailure,
  onSimulateFailureChange,
  onAuthorize,
  onCancel,
}: {
  proposal: Proposal;
  decision?: OrderDecision;
  pending: boolean;
  simulateFailure: boolean;
  onSimulateFailureChange: (v: boolean) => void;
  onAuthorize: () => void;
  onCancel: () => void;
}) {
  if (decision?.kind === "success") {
    return (
      <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-xs">
        <p className="flex items-center gap-1.5 font-medium text-success">
          <Check className="size-3.5" /> Purchase confirmed
        </p>
        <p className="mt-1 text-muted-foreground">
          {decision.mode === "simulated" ? "SIMULATED payment — " : "Razorpay test-mode payment — "}
          link {decision.paymentLinkId}
        </p>
      </div>
    );
  }

  if (decision?.kind === "cancelled") {
    return (
      <div className="rounded-xl border border-border bg-card p-3 text-xs">
        <p className="flex items-center gap-1.5 font-medium text-muted-foreground">
          <Ban className="size-3.5" /> Cancelled — no charge
        </p>
      </div>
    );
  }

  // Undecided, or a failed attempt still open for retry/cancel.
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
        <ShoppingBag className="size-3.5 text-ai" /> Authorization required
      </p>
      <p className="mb-2 text-xs text-muted-foreground">
        {proposal.productName} — ₹{proposal.priceRupees}
        {proposal.deliveryEstimate ? ` · ${proposal.deliveryEstimate}` : ""}
      </p>

      {decision?.kind === "failed" && (
        <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          <AlertTriangle className="size-3.5" /> Payment failed — no charge. {decision.error}
        </p>
      )}

      <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={simulateFailure}
          onChange={(e) => onSimulateFailureChange(e.target.checked)}
          className="size-3.5 rounded border-border accent-warning"
        />
        Simulate a payment failure (demo)
      </label>

      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={onAuthorize}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {decision?.kind === "failed" ? "Retry payment" : "Authorize & pay (test mode)"}
        </button>
        <button
          disabled={pending}
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring"
      />
    </div>
  );
}
