import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  ai: "bg-ai/10 text-ai",
  pending: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
  info: "bg-muted text-muted-foreground",
  danger: "bg-destructive/10 text-destructive",
} as const;

const DOT_STYLES = {
  ai: "bg-ai",
  pending: "bg-warning",
  success: "bg-success",
  info: "bg-muted-foreground",
  danger: "bg-destructive",
} as const;

export type StatusVariant = keyof typeof STATUS_STYLES;

export function StatusBadge({
  variant,
  children,
  pulse = false,
  className,
}: {
  variant: StatusVariant;
  children: React.ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        STATUS_STYLES[variant],
        className
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              DOT_STYLES[variant]
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex h-1.5 w-1.5 rounded-full",
            DOT_STYLES[variant]
          )}
        />
      </span>
      {children}
    </span>
  );
}
