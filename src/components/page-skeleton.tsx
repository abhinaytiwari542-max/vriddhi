import { Skeleton } from "@/components/ui/skeleton";

/** Route-level loading UI (Next.js `loading.tsx`) for pages built around a
 * metric-tile grid — Overview, Analytics. */
export function MetricGridSkeleton({ tiles = 4 }: { tiles?: number }) {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: tiles }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/** Route-level loading UI for pages built around a vertical list of cards —
 * Opportunities, Campaigns, Audit Trail. */
export function ListPageSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
