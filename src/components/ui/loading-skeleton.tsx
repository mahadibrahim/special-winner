import { cn } from "@/lib/utils";

export interface LoadingSkeletonProps {
  /** Number of skeleton lines/rows to render. Default 3. */
  rows?: number;
  /** Set to "list" for vertically stacked rows, "card" for a card-shaped placeholder. */
  variant?: "list" | "card";
  className?: string;
}

/**
 * Generic loading-state skeleton. For typed/specialized skeletons (e.g. a
 * fully-styled program card placeholder), build a domain-specific component
 * instead. This is for "I'm loading something, show some placeholder shimmer."
 */
export function LoadingSkeleton({ rows = 3, variant = "list", className }: LoadingSkeletonProps) {
  if (variant === "card") {
    return (
      <div className={cn("rounded-lg border bg-card p-4 space-y-3", className)} aria-busy="true" aria-live="polite">
        <div className="h-5 w-1/3 rounded bg-muted animate-pulse" />
        <div className="h-3 w-full rounded bg-muted animate-pulse" />
        <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
      </div>
    );
  }
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 w-full rounded bg-muted animate-pulse" />
      ))}
    </div>
  );
}
