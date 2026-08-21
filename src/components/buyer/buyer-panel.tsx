"use client";

import { useState, useTransition } from "react";
import { Bot, Check, ShoppingBag, Wrench } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { sendBuyerMessage, authorizePurchaseAction } from "@/app/(app)/buyer/actions";
import type { BuyerTraceEntry } from "@/lib/ai/buyer-agent";

type Proposal = { orderId: string; productName: string; priceRupees: number; deliveryEstimate: string | null };

type Turn = {
  message: string;
  answer?: string;
  trace?: BuyerTraceEntry[];
  proposal?: Proposal;
  error?: string;
};

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
  const [authorized, setAuthorized] = useState<Record<string, { mode: string; paymentLinkId: string } | "error">>(
    {}
  );

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
      const result = await authorizePurchaseAction(orderId, Number(budget) || 0);
      setAuthorized((prev) => ({
        ...prev,
        [orderId]: result.ok ? { mode: result.mode, paymentLinkId: result.paymentLinkId } : "error",
      }));
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

                  {t.proposal &&
                    (authorized[t.proposal.orderId] ? (
                      authorized[t.proposal.orderId] === "error" ? (
                        <p className="text-xs text-destructive">Authorization failed — try again.</p>
                      ) : (
                        <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-xs">
                          <p className="flex items-center gap-1.5 font-medium text-success">
                            <Check className="size-3.5" /> Purchase confirmed
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            {(authorized[t.proposal.orderId] as { mode: string; paymentLinkId: string }).mode ===
                            "simulated"
                              ? "SIMULATED payment — "
                              : "Razorpay test-mode payment — "}
                            link {(authorized[t.proposal.orderId] as { mode: string; paymentLinkId: string }).paymentLinkId}
                          </p>
                        </div>
                      )
                    ) : (
                      <div className="rounded-xl border border-border bg-card p-3">
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
                          <ShoppingBag className="size-3.5 text-ai" /> Authorization required
                        </p>
                        <p className="mb-2 text-xs text-muted-foreground">
                          {t.proposal.productName} — ₹{t.proposal.priceRupees}
                          {t.proposal.deliveryEstimate ? ` · ${t.proposal.deliveryEstimate}` : ""}
                        </p>
                        <button
                          disabled={pending}
                          onClick={() => authorize(t.proposal!.orderId)}
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          Authorize &amp; pay (test mode)
                        </button>
                      </div>
                    ))}
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
