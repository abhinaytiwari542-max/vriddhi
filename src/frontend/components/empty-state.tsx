import type { LucideIcon } from "lucide-react";

import { cn } from "@/frontend/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
  tone = "neutral",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
  tone?: "neutral" | "ai";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center",
        className
      )}
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-full",
          tone === "ai" ? "bg-ai/10 text-ai" : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
