/**
 * Fill-state derivation shared by browse cards, the host game view, and the
 * fill-alert cron's eligibility check. Pure — org config (threshold/window)
 * comes from the rate card via the caller.
 */
export type FillState = "full" | "almost_full" | "filling" | "needs_players" | "open";

export const FILL_STATE_LABELS: Record<FillState, string | null> = {
  full: "Full",
  almost_full: "Almost full",
  filling: "Filling",
  needs_players: "Needs players",
  open: null,
};

export function deriveFillState(opts: {
  confirmedCount: number;
  capacity: number;
  startsAt: Date;
  now?: Date;
  thresholdPct: number;
  windowHours: number;
}): FillState {
  const now = opts.now ?? new Date();
  if (opts.capacity <= 0 || opts.confirmedCount >= opts.capacity) return "full";
  const pct = (opts.confirmedCount / opts.capacity) * 100;
  if (pct >= 80) return "almost_full";
  if (pct >= opts.thresholdPct) return "filling";
  const msToStart = opts.startsAt.getTime() - now.getTime();
  if (msToStart >= 0 && msToStart <= opts.windowHours * 60 * 60 * 1000) {
    return "needs_players";
  }
  return "open";
}
