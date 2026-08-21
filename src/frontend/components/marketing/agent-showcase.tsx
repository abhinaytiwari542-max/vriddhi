"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Check, Pencil, ShieldCheck, X } from "lucide-react";

import { SHOWCASE_STEPS } from "@/frontend/lib/agent-showcase-steps";
import { StatusBadge } from "@/frontend/components/status-badge";
import { cn } from "@/frontend/lib/utils";

const STEP_DURATION_MS = 3400;

const SURFACE_STYLES: Record<string, string> = {
  ai: "glow-ai border-ai/20 bg-gradient-to-b from-ai/[0.07] to-transparent",
  action: "border-border bg-card",
  system: "border-border bg-popover font-mono",
};

export function AgentShowcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const step = SHOWCASE_STEPS[index];

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % SHOWCASE_STEPS.length);
    }, STEP_DURATION_MS);
    return () => clearInterval(timer);
  }, [paused]);

  function goTo(i: number) {
    setIndex(i);
  }

  return (
    <div
      className="w-full max-w-lg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative min-h-[280px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className={cn(
              "rounded-2xl border p-6 shadow-lg shadow-black/20",
              SURFACE_STYLES[step.surface]
            )}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {step.eyebrow}
              </span>
              <StatusBadge
                variant={step.statusVariant}
                pulse={step.statusVariant === "ai" || step.statusVariant === "info"}
              >
                {step.statusLabel}
              </StatusBadge>
            </div>

            <h3 className="mb-4 text-lg font-semibold leading-snug text-foreground">
              {step.title}
            </h3>

            <StepBody step={step} onApprove={() => goTo(3)} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <div className="flex gap-1.5">
          {SHOWCASE_STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => goTo(i)}
              aria-label={`Show step: ${s.eyebrow}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "w-6 bg-ai" : "w-1.5 bg-muted hover:bg-muted-foreground/40"
              )}
            />
          ))}
        </div>
        <Link
          href="/overview"
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Illustrative walkthrough — open the live dashboard →
        </Link>
      </div>
    </div>
  );
}

function StepBody({
  step,
  onApprove,
}: {
  step: (typeof SHOWCASE_STEPS)[number];
  onApprove: () => void;
}) {
  const { body } = step;

  if (body.kind === "evidence") {
    return (
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        {body.lines.map((line) => (
          <li key={line} className="flex items-start gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ai" />
            {line}
          </li>
        ))}
      </ul>
    );
  }

  if (body.kind === "explanation") {
    return (
      <div className="space-y-3 text-sm">
        <ul className="space-y-1.5 text-muted-foreground">
          {body.evidence.map((line) => (
            <li key={line} className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ai" />
              {line}
            </li>
          ))}
        </ul>
        <p className="text-foreground">{body.action}</p>
        <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-3 text-xs">
          <dt className="text-muted-foreground">Estimated cost</dt>
          <dd className="text-right text-foreground">{body.cost}</dd>
          <dt className="text-muted-foreground">Expected impact</dt>
          <dd className="text-right text-foreground">{body.impact}</dd>
          <dt className="text-muted-foreground">Confidence</dt>
          <dd className="text-right text-foreground">{body.confidence}</dd>
          <dt className="text-muted-foreground">Risk</dt>
          <dd className="text-right text-foreground">{body.risk}</dd>
        </dl>
      </div>
    );
  }

  if (body.kind === "approval") {
    return (
      <div className="space-y-4 text-sm">
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <dt className="text-muted-foreground">Audience</dt>
          <dd className="text-right text-foreground">{body.audience}</dd>
          <dt className="text-muted-foreground">Discount</dt>
          <dd className="text-right text-foreground">{body.discount}</dd>
          <dt className="text-muted-foreground">Max cost</dt>
          <dd className="text-right text-foreground">{body.maxCost}</dd>
          <dt className="text-muted-foreground">Expected recovery</dt>
          <dd className="text-right text-foreground">{body.impact}</dd>
        </dl>
        <div className="flex gap-2">
          <button
            onClick={onApprove}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Check className="size-3.5" /> Approve
          </button>
          <button className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted">
            <Pencil className="size-3.5" /> Modify
          </button>
          <button className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted">
            <X className="size-3.5" /> Reject
          </button>
        </div>
      </div>
    );
  }

  if (body.kind === "progress") {
    return (
      <div className="space-y-2">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-ai to-ai-2"
            initial={{ width: "20%" }}
            animate={{ width: `${body.percent}%` }}
            transition={{ duration: 1.6, ease: "easeInOut" }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{body.label}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      {body.entries.map((entry, i) => (
        <motion.div
          key={entry.time + entry.text}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.15 }}
          className="flex items-center gap-3 text-muted-foreground"
        >
          <span className="tabular-nums">{entry.time}</span>
          <ShieldCheck className="size-3 text-success" />
          <span className="text-foreground">{entry.text}</span>
        </motion.div>
      ))}
    </div>
  );
}
