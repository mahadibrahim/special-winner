import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ErrorBannerProps {
  /** The error message to display. If null/undefined, the banner doesn't render. */
  message?: string | null;
  /** Optional callback when the user dismisses the banner. If omitted, no dismiss button. */
  onDismiss?: () => void;
  className?: string;
}

/**
 * Inline error banner for forms and page-level errors. Use this instead of
 * rolling per-form error styling. For transient action errors (e.g. "save
 * failed"), prefer toast.error from sonner; for persistent state errors
 * (e.g. validation summary, API failure that the user must address), use
 * this banner.
 */
export function ErrorBanner({ message, onDismiss, className }: ErrorBannerProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive",
        className,
      )}
    >
      <AlertCircle className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
      <p className="flex-1">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs uppercase tracking-wider hover:underline"
          aria-label="Dismiss"
        >
          Close
        </button>
      )}
    </div>
  );
}
