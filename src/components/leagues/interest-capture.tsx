"use client";
import { useInterestCapture } from "@/lib/hooks/use-interest-capture";
import { cn } from "@/lib/utils";

/**
 * Aspire-skinned "email me when it opens" capture. The SoccerOne twin is
 * SoccerOneInterestCapture — same hook, different shell. Behaviour changes go
 * in useInterestCapture / interestRequestFor so both brands move together.
 *
 * Pass `seasonId` for a specific forming season (per-division interest list);
 * omit it for the general slot (finder empty state) — the hook then feeds the
 * newsletter list tagged with `source`.
 */
export function InterestCapture({ seasonId, source, title, subtitle, compact }: {
  seasonId?: string;
  source: string;
  title: string;
  subtitle?: string;
  compact?: boolean;
}) {
  const { email, setEmail, status, submit } = useInterestCapture({
    seasonId,
    brand: "aspire",
    source,
  });

  if (status === "done") {
    return (
      <div className={cn("rounded-xl border border-sage/40 bg-sage/10 text-ink", compact ? "p-3" : "p-4")} data-testid="interest-done">
        <span className="font-semibold text-sm">You're on the list.</span>{" "}
        <span className="text-[13px] text-ink-2">We'll email you the day registration opens — nothing else.</span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={cn("rounded-xl border border-cream-3 bg-paper", compact ? "p-3" : "p-4")} data-testid="interest-capture">
      <div className="font-display font-semibold text-ink text-base">{title}</div>
      {subtitle && <p className="text-[12.5px] text-ink-muted mt-0.5">{subtitle}</p>}
      <div className="flex flex-wrap gap-2 mt-2.5">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          aria-label="Email address"
          className="flex-1 min-w-[190px] rounded-md border border-cream-3 bg-cream px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="font-sans font-semibold text-xs bg-primary-bright text-primary-foreground px-4 py-2 rounded-md disabled:opacity-60"
        >
          {status === "sending" ? "Sending…" : "Notify me"}
        </button>
      </div>
      {status === "error" && (
        <p className="text-[12px] text-primary mt-1.5" role="alert">
          That didn't go through — check the address and try again.
        </p>
      )}
    </form>
  );
}
