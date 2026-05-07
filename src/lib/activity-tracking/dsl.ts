/**
 * DSL parser for the `expected_completion` field on activity catalog entries.
 *
 * Supported forms:
 *   - T±Nmin / T±Nh   relative to game.scheduledAt
 *   - HH:MM           absolute time-of-day in the org timezone, on the
 *                     calendar date of game.scheduledAt
 *   - phase_start /   resolved via PHASE_*_OFFSETS using the activity's
 *     phase_end       phase
 *   - trigger+Nmin    returns null — bootstrap defers; the runtime
 *                     scheduler computes expected_at when the trigger
 *                     event lands
 *
 * Throws for any other form.
 */

const PHASE_END_OFFSETS: Record<string, { kind: "minutes" | "hours" | "kickoff"; offset?: number }> = {
  pre_day: { kind: "hours", offset: -2 },
  day_setup: { kind: "hours", offset: -2 },
  pre_game: { kind: "kickoff" },
  in_game: { kind: "minutes", offset: 90 },
  post_game: { kind: "minutes", offset: 30 },
  end_of_day: { kind: "hours", offset: 8 },
  post_day: { kind: "hours", offset: 72 },
};

const PHASE_START_OFFSETS: Record<string, { kind: "minutes" | "hours" | "kickoff"; offset?: number }> = {
  pre_day: { kind: "hours", offset: -12 },
  day_setup: { kind: "hours", offset: -12 },
  pre_game: { kind: "hours", offset: -2 },
  in_game: { kind: "kickoff" },
  post_game: { kind: "kickoff" },
  end_of_day: { kind: "kickoff" },
  post_day: { kind: "hours", offset: 24 },
};

export function computeExpectedAt(
  dsl: string,
  game: { scheduledAt: Date; durationMin?: number | null },
  orgTimezone: string,
  phase?: string,
): Date | null {
  // T±Nmin / T±Nh
  const tMatch = dsl.match(/^T([+-])(\d+)(min|h)$/);
  if (tMatch) {
    const sign = tMatch[1] === "+" ? 1 : -1;
    const n = parseInt(tMatch[2], 10);
    const unit = tMatch[3];
    const ms = unit === "min" ? n * 60 * 1000 : n * 60 * 60 * 1000;
    return new Date(game.scheduledAt.getTime() + sign * ms);
  }

  // trigger+Nmin → deferred to runtime
  if (dsl.startsWith("trigger")) return null;

  // phase_start / phase_end
  if (dsl === "phase_start" || dsl === "phase_end") {
    if (!phase) throw new Error(`computeExpectedAt: phase required for ${dsl}`);
    const offsets = dsl === "phase_end" ? PHASE_END_OFFSETS : PHASE_START_OFFSETS;
    const cfg = offsets[phase];
    if (!cfg) throw new Error(`computeExpectedAt: unknown phase ${phase}`);
    if (cfg.kind === "kickoff") return new Date(game.scheduledAt.getTime());
    const ms =
      cfg.kind === "minutes"
        ? (cfg.offset ?? 0) * 60 * 1000
        : (cfg.offset ?? 0) * 60 * 60 * 1000;
    return new Date(game.scheduledAt.getTime() + ms);
  }

  // HH:MM (absolute time-of-day in org timezone)
  const hmMatch = dsl.match(/^(\d{1,2}):(\d{2})$/);
  if (hmMatch) {
    const hh = parseInt(hmMatch[1], 10);
    const mm = parseInt(hmMatch[2], 10);
    return computeAbsoluteTimeInTz(game.scheduledAt, hh, mm, orgTimezone);
  }

  throw new Error(`computeExpectedAt: unparseable DSL '${dsl}'`);
}

function computeAbsoluteTimeInTz(referenceDate: Date, hh: number, mm: number, tz: string): Date {
  // Get the calendar date in the target timezone, then construct HH:MM in that tz.
  // Uses Intl.DateTimeFormat to extract the y/m/d in tz, then converts back to UTC.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(referenceDate).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const localISO = `${parts.year}-${parts.month}-${parts.day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
  // Convert local ISO in tz back to UTC by checking the offset at that wall time
  const asUTC = new Date(localISO + "Z");
  const tzOffsetMs = computeTzOffsetMs(asUTC, tz);
  return new Date(asUTC.getTime() - tzOffsetMs);
}

function computeTzOffsetMs(at: Date, tz: string): number {
  // Returns the offset in ms such that: utcDate = localDate - offset
  const localFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = localFmt.formatToParts(at).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  // Intl en-US can emit "24" as the hour part for midnight; normalize to 0.
  const hourRaw = parseInt(parts.hour, 10);
  const hour = hourRaw === 24 ? 0 : hourRaw;
  const localTimestamp = Date.UTC(
    parseInt(parts.year, 10),
    parseInt(parts.month, 10) - 1,
    parseInt(parts.day, 10),
    hour,
    parseInt(parts.minute, 10),
    parseInt(parts.second, 10),
  );
  return localTimestamp - at.getTime();
}
