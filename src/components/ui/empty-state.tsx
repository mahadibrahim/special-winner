import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** Headline (typically a noun phrase or short sentence). */
  title: string;
  /** Optional supporting copy. */
  description?: string;
  /** Optional icon component (e.g. lucide-react icon). */
  icon?: ReactNode;
  /** Optional action(s) — e.g. a primary CTA button or two side-by-side buttons. */
  children?: ReactNode;
  className?: string;
}

/**
 * Standard empty-state for lists, search results, dashboards. Use whenever
 * a section would otherwise be blank. Provide a `title`; everything else
 * is optional.
 */
export function EmptyState({ title, description, icon, children, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-4 space-y-3",
        className,
      )}
    >
      {icon && <div className="text-muted-foreground/60 mb-1">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      )}
      {children && <div className="pt-2">{children}</div>}
    </div>
  );
}
