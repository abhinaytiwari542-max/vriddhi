"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check, RotateCcw, ShieldOff, Zap } from "lucide-react";

import { formatInr } from "@/frontend/lib/format";
import { StatusBadge } from "@/frontend/components/status-badge";
import { draftCustomCampaignAction } from "@/backend/actions/opportunities-actions";

export type Candidate = {
  customerId: string;
  orderId: string;
  customerName: string;
  /** Cart value in paise. */
  amount: number;
  hoursSinceAbandoned: number;
  isRepeatCustomer: boolean;
  intentScore: number;
};

export type PolicyLimits = {
  maxCampaignBudget: number; // paise
  maxDiscountPercent: number;
  maxTransactionValue: number; // paise
};

type SortKey = "amount" | "hoursSinceAbandoned" | "intentScore" | "customerName";

const DISCOUNT_STEPS_PAISE = [5_000, 10_000, 15_000, 20_000, 25_000, 30_000, 40_000, 50_000];

/**
 * Mirrors the engine's own stated assumption. Recovery is a RANGE with a
 * visible assumption behind it, never a point estimate — the same
 * discipline the opportunity card follows, so the two cannot quietly
 * disagree about what a campaign is worth.
 */
const RECOVERY_LOW = 0.15;
const RECOVERY_HIGH = 0.25;

export function CampaignBuilder({
  opportunityId,
  candidates,
  policy,
  defaultDiscountPaise,
}: {
  opportunityId: string;
  candidates: Candidate[];
  policy: PolicyLimits;
  defaultDiscountPaise: number;
}) {
  const [discountPaise, setDiscountPaise] = useState(defaultDiscountPaise);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(candidates.map((c) => c.customerId))
  );
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [sortAsc, setSortAsc] = useState(false);
  const [repeatOnly, setRepeatOnly] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [minCartRupees, setMinCartRupees] = useState(0);

  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { kind: "drafted"; count: number } | { kind: "error"; message: string } | null
  >(null);

  const visible = useMemo(() => {
    const filtered = candidates.filter(
      (c) =>
        (!repeatOnly || c.isRepeatCustomer) &&
        c.intentScore >= minScore &&
        c.amount >= minCartRupees * 100
    );
    const dir = sortAsc ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "customerName") return a.customerName.localeCompare(b.customerName) * dir;
      return (a[sortKey] - b[sortKey]) * dir;
    });
  }, [candidates, repeatOnly, minScore, minCartRupees, sortKey, sortAsc]);

  // Totals follow the SELECTION, not the filter: hiding a row must never
  // silently change what a click would spend.
  const chosen = useMemo(
    () => candidates.filter((c) => selected.has(c.customerId)),
    [candidates, selected]
  );

  const totals = useMemo(() => {
    const audience = chosen.length;
    const cost = discountPaise * audience;
    const cartValue = chosen.reduce((sum, c) => sum + c.amount, 0);
    const recoveryLow = Math.round(cartValue * RECOVERY_LOW);
    const recoveryHigh = Math.round(cartValue * RECOVERY_HIGH);
    const avgCart = audience > 0 ? cartValue / audience : 0;
    const discountPercent = avgCart > 0 ? (discountPaise / avgCart) * 100 : 0;

    // ROI on the pessimistic end of the range. Quoting the optimistic end
    // would flatter every setting and make the slider useless for deciding.
    const roi = cost > 0 ? (recoveryLow / cost) * 100 : 0;

    const breaches: { rule: string; requested: string; limit: string }[] = [];
    if (cost > policy.maxCampaignBudget) {
      breaches.push({
        rule: "Maximum campaign budget",
        requested: formatInr(cost),
        limit: formatInr(policy.maxCampaignBudget),
      });
    }
    if (discountPaise > policy.maxTransactionValue) {
      breaches.push({
        rule: "Maximum transaction value",
        requested: formatInr(discountPaise),
        limit: formatInr(policy.maxTransactionValue),
      });
    }
    if (discountPercent > policy.maxDiscountPercent) {
      breaches.push({
        rule: "Maximum discount percentage",
        requested: `${discountPercent.toFixed(1)}%`,
        limit: `${policy.maxDiscountPercent}%`,
      });
    }

    return {
      audience,
      cost,
      cartValue,
      recoveryLow,
      recoveryHigh,
      discountPercent,
      roi,
      breaches,
    };
  }, [chosen, discountPaise, policy]);

  /**
   * The largest offered discount that still clears every policy limit for
   * the current selection. Shown so a blocked state comes with the answer
   * to "then what would work", instead of leaving the merchant to hunt.
   */
  const highestAllowedDiscount = useMemo(() => {
    const cartValue = chosen.reduce((sum, c) => sum + c.amount, 0);
    const avgCart = chosen.length > 0 ? cartValue / chosen.length : 0;
    const allowed = DISCOUNT_STEPS_PAISE.filter(
      (step) =>
        step * chosen.length <= policy.maxCampaignBudget &&
        step <= policy.maxTransactionValue &&
        (avgCart === 0 || (step / avgCart) * 100 <= policy.maxDiscountPercent)
    );
    return allowed.length > 0 ? Math.max(...allowed) : null;
  }, [chosen, policy]);

  const blocked = totals.breaches.length > 0;
  const canDraft = totals.audience > 0 && !blocked && !pending;

  function toggle(customerId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
    setResult(null);
  }

  function setSort(key: SortKey) {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  if (result?.kind === "drafted") {
    return (
      <div className="rounded-2xl border border-success/40 bg-success/[0.06] p-6">
        <div className="mb-2 flex items-center gap-2">
          <Check className="size-4 text-success" />
          <h3 className="text-lg font-semibold text-foreground">
            Draft created for {result.count} customers
          </h3>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Nothing has been sent. It is waiting for your approval in Campaigns, where the policy
          check runs again before any payment link is created.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/campaigns"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            Review and approve
            <ArrowRight className="size-3.5" />
          </Link>
          <button
            onClick={() => setResult(null)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted"
          >
            <RotateCcw className="size-3.5" />
            Build another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ---------------- Simulator ---------------- */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <label
              htmlFor="discount"
              className="text-xs font-medium text-muted-foreground"
            >
              Discount per customer
            </label>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {formatInr(discountPaise)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {totals.discountPercent.toFixed(1)}% of their average cart
            </p>
          </div>
          <StatusBadge variant={blocked ? "danger" : "success"}>
            {blocked ? "Blocked by policy" : "Within all limits"}
          </StatusBadge>
        </div>

        <input
          id="discount"
          type="range"
          min={DISCOUNT_STEPS_PAISE[0]}
          max={DISCOUNT_STEPS_PAISE[DISCOUNT_STEPS_PAISE.length - 1]}
          step={1_000}
          value={discountPaise}
          onChange={(e) => {
            setDiscountPaise(Number(e.target.value));
            setResult(null);
          }}
          className="w-full accent-[var(--ai)]"
        />
        <div className="mb-4 flex flex-wrap gap-1.5">
          {DISCOUNT_STEPS_PAISE.map((step) => (
            <button
              key={step}
              onClick={() => {
                setDiscountPaise(step);
                setResult(null);
              }}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                discountPaise === step
                  ? "border-ai bg-ai/10 text-ai"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {formatInr(step)}
            </button>
          ))}
        </div>

        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Figure label="Audience" value={String(totals.audience)} note="Customers selected" />
          <Figure
            label="Total cost"
            value={formatInr(totals.cost)}
            note="Discount × audience"
            tone={blocked ? "bad" : undefined}
          />
          <Figure
            label="Expected recovery"
            value={`${formatInr(totals.recoveryLow)}–${formatInr(totals.recoveryHigh)}`}
            note="At an assumed 15–25%"
          />
          <Figure
            label="ROI (worst case)"
            value={totals.cost > 0 ? `${totals.roi.toFixed(0)}%` : "—"}
            note="Low-end recovery ÷ cost"
            tone={totals.cost > 0 && totals.roi < 100 ? "bad" : "good"}
          />
        </dl>

        {blocked && (
          <div className="mt-4 space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/[0.06] p-3">
            {totals.breaches.map((b) => (
              <p key={b.rule} className="flex items-start gap-1.5 text-xs text-foreground">
                <ShieldOff className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                <span>
                  {b.rule}: asking {b.requested}, limit is {b.limit}.
                </span>
              </p>
            ))}
            <p className="pt-1 text-[11px] text-muted-foreground">
              {highestAllowedDiscount
                ? `The highest discount that clears every limit for these ${totals.audience} customers is ${formatInr(highestAllowedDiscount)} — or select fewer customers.`
                : "No offered discount clears the limits for this many customers — select fewer, or raise the limits in Settings."}
            </p>
          </div>
        )}

        {totals.roi < 100 && totals.cost > 0 && !blocked && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            At this discount the pessimistic end of the range does not cover the spend — it only
            pays off if recovery lands nearer 25%.
          </p>
        )}
      </div>

      {/* ---------------- Targeting table ---------------- */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Who gets a link</p>
            <p className="text-xs text-muted-foreground">
              {totals.audience} of {candidates.length} selected · {visible.length} shown
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <MiniButton onClick={() => setSelected(new Set(candidates.map((c) => c.customerId)))}>
              Select all
            </MiniButton>
            <MiniButton onClick={() => setSelected(new Set(visible.map((c) => c.customerId)))}>
              Select filtered
            </MiniButton>
            <MiniButton onClick={() => setSelected(new Set())}>Clear</MiniButton>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-b border-border p-4 text-xs">
          <label className="flex items-center gap-2 text-muted-foreground">
            <input
              type="checkbox"
              checked={repeatOnly}
              onChange={(e) => setRepeatOnly(e.target.checked)}
              className="size-3.5 rounded border-border accent-[var(--ai)]"
            />
            Repeat customers only
          </label>
          <label className="flex items-center gap-2 text-muted-foreground">
            Min intent score
            <select
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="rounded border border-border bg-background px-1.5 py-1 text-foreground"
            >
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-muted-foreground">
            Min cart ₹
            <input
              type="number"
              min={0}
              step={500}
              value={minCartRupees}
              onChange={(e) => setMinCartRupees(Math.max(0, Number(e.target.value)))}
              className="w-20 rounded border border-border bg-background px-1.5 py-1 text-foreground"
            />
          </label>
        </div>

        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2" />
                <SortHeader label="Customer" active={sortKey === "customerName"} asc={sortAsc} onClick={() => setSort("customerName")} />
                <SortHeader label="Cart value" active={sortKey === "amount"} asc={sortAsc} onClick={() => setSort("amount")} />
                <SortHeader label="Abandoned" active={sortKey === "hoursSinceAbandoned"} asc={sortAsc} onClick={() => setSort("hoursSinceAbandoned")} />
                <SortHeader label="Intent" active={sortKey === "intentScore"} asc={sortAsc} onClick={() => setSort("intentScore")} />
                <th className="px-3 py-2 font-medium">They pay</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const isSelected = selected.has(c.customerId);
                return (
                  <tr
                    key={c.customerId}
                    onClick={() => toggle(c.customerId)}
                    className={`cursor-pointer border-t border-border transition-colors ${
                      isSelected ? "bg-ai/[0.05]" : "hover:bg-muted/60"
                    }`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggle(c.customerId)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${c.customerName}`}
                        className="size-3.5 rounded border-border accent-[var(--ai)]"
                      />
                    </td>
                    <td className="px-3 py-2 text-foreground">{c.customerName}</td>
                    <td className="px-3 py-2 tabular-nums text-foreground">
                      {formatInr(c.amount)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {c.hoursSinceAbandoned}h ago
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-muted-foreground">
                        {c.intentScore}/3 {c.isRepeatCustomer ? "· repeat" : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {formatInr(Math.max(c.amount - discountPaise, 0))}
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No customers match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- Commit ---------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={!canDraft}
          onClick={() =>
            startTransition(async () => {
              setResult(null);
              const res = await draftCustomCampaignAction({
                opportunityId,
                discountPaise,
                customerIds: [...selected],
              });
              if (res.status === "drafted") {
                setResult({ kind: "drafted", count: res.audienceCount });
              } else {
                setResult({ kind: "error", message: res.message });
              }
            })
          }
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Zap className="size-3.5" />
          {pending
            ? "Creating draft…"
            : `Draft campaign for ${totals.audience} customer${totals.audience === 1 ? "" : "s"}`}
        </button>
        <p className="text-[11px] text-muted-foreground">
          Creates a draft only — approval is still required before any link is sent.
        </p>
      </div>

      {result?.kind === "error" && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {result.message}
        </p>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-lg bg-muted p-3">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd
        className={`text-lg font-semibold tabular-nums ${
          tone === "bad" ? "text-destructive" : tone === "good" ? "text-success" : "text-foreground"
        }`}
      >
        {value}
      </dd>
      <p className="text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}

function SortHeader({
  label,
  active,
  asc,
  onClick,
}: {
  label: string;
  active: boolean;
  asc: boolean;
  onClick: () => void;
}) {
  return (
    <th className="px-3 py-2 font-medium">
      <button
        onClick={onClick}
        className={`flex items-center gap-1 transition-colors hover:text-foreground ${
          active ? "text-foreground" : ""
        }`}
      >
        {label}
        <span aria-hidden className="text-[9px]">
          {active ? (asc ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

function MiniButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-border px-2.5 py-1 text-[11px] text-foreground transition-colors hover:bg-muted"
    >
      {children}
    </button>
  );
}
