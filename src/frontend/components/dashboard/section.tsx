/**
 * Every block on every page gets a title plus one short plain-language
 * note (deliberately kept to a handful of words) saying what it is. The
 * dashboard is full of terms a small-business owner has no reason to know
 * — "intervention rate", "reconciliation", "idempotency" — and a metric
 * with no explanation reads as decoration rather than information.
 */
export function Section({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{note}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
