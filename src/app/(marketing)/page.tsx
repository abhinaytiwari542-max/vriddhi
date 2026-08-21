import Link from "next/link";

import { prisma } from "@/lib/db";
import { AgentShowcase } from "@/components/marketing/agent-showcase";
import { StatusBadge } from "@/components/status-badge";

export default async function LandingPage() {
  let systemHealthy = false;
  try {
    await prisma.merchant.count();
    systemHealthy = true;
  } catch {
    systemHealthy = false;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-sm font-semibold tracking-tight text-foreground">
          Vriddhi
        </span>
        <Link
          href="/overview"
          className="rounded-full border border-border px-4 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
        >
          View live demo
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-16 px-6 py-16 lg:flex-row lg:items-center lg:gap-12 lg:py-0">
        <div className="max-w-md text-center lg:text-left">
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl">
            Growth for merchants,{" "}
            <span className="text-gradient-ai">approved by merchants</span>.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            Vriddhi finds recoverable revenue in your Razorpay data, explains
            exactly why it matters, and proposes an action — but it never
            spends a rupee without your approval.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Link
              href="/overview"
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              View live demo
            </Link>
            <a
              href="#how-it-works"
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              See how it works
            </a>
          </div>
        </div>

        <div id="how-it-works">
          <AgentShowcase />
        </div>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
        <span>Razorpay test mode · no real money moves in this build</span>
        <StatusBadge variant={systemHealthy ? "success" : "danger"}>
          {systemHealthy ? "System operational" : "System degraded"}
        </StatusBadge>
      </footer>
    </div>
  );
}
