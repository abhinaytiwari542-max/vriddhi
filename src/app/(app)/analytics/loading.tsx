import { MetricGridSkeleton } from "@/frontend/components/page-skeleton";

export default function Loading() {
  return (
    <div className="space-y-10">
      <MetricGridSkeleton tiles={5} />
      <MetricGridSkeleton tiles={5} />
      <MetricGridSkeleton tiles={5} />
    </div>
  );
}
