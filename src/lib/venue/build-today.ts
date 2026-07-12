/**
 * Shapes VenueDayData (from getVenueDayData) into VenueTodayPayload for the
 * venue command-center endpoint.
 *
 * Best-effort v1 simplifications (tracked below):
 *   - booked: mapped from capacityCurrent ?? 0  (capacityCurrent is a known TODO
 *     in getVenueDayData — it's always null for drop-in and games right now)
 *   - checkedIn: 0 (no per-session check-in count in ActivityBlock; Phase-3)
 *   - waiversOut: 0 (no per-session waiver count in ActivityBlock; Phase-3)
 *   - photosMissing: 0 (no per-session photo count in ActivityBlock; Phase-3)
 *   - spaceId/spaceName: mapped from ActivityBlock.resourceName; if absent,
 *     falls back to the first resource or "unknown"
 *   - attention waiver/photo items: omitted (no source data; Phase-3)
 *   - ActivityType "camp" → kind "camp"; "external" → "hold"; "maintenance" → "hold"
 */

import type { VenueDayData, ActivityBlock, ActivityType } from "@/lib/admin/venue-day-data";
import type {
  VenueTodayPayload,
  VenueTodaySession,
  VenueAttentionItem,
} from "@/lib/venue/today-types";
import { getNavBadges, type NavBadges } from "@/lib/admin/nav-badges";

/** Maps ActivityType → the VenueTodaySession kind union. */
function mapKind(
  type: ActivityType,
): VenueTodaySession["kind"] {
  switch (type) {
    case "league_game":    return "league";
    case "tournament_game": return "tournament";
    case "drop_in":        return "dropin";
    case "class":          return "class";
    case "camp":           return "camp";
    case "rental":         return "rental";
    case "external":       return "hold";
    case "maintenance":    return "hold";
    default:               return "hold"; // exhaustive safety net
  }
}

export async function buildVenueToday(
  dayData: VenueDayData,
  orgId: string,
  userId: string,
  locationIds: string[],
  timezone: string = "America/New_York",
  // Callers that already know orgId/userId/locationIds before dayData is
  // ready (i.e. every real caller) should kick off getNavBadges concurrently
  // with getVenueDayData and pass the in-flight promise here, so its ~1-RTT
  // cost overlaps dayData's fetch instead of stacking after it. Falls back
  // to calling getNavBadges itself for callers that don't pre-start it.
  badgesPromise: Promise<NavBadges> = getNavBadges(orgId, {
    locationIds,
    userId,
    inboxScope: "org",
  }),
): Promise<VenueTodayPayload> {
  // Build a map of resourceName → resource for spaceId resolution.
  // We key on resourceName (string) because ActivityBlock exposes resourceName
  // but not resourceId. Fall back to venueId-level grouping when no resource.
  const resourceByName = new Map(
    dayData.resources.map((r) => [r.name, r]),
  );
  // Default resource for blocks with no resourceName (unlikely but safe).
  const firstResource = dayData.resources[0] ?? null;

  // --- Sessions ---
  const sessions: VenueTodaySession[] = dayData.blocks.map(
    (block: ActivityBlock) => {
      // Resolve spaceId / spaceName from resourceName
      const res = block.resourceName
        ? resourceByName.get(block.resourceName)
        : firstResource;

      const spaceId = res?.id ?? "unknown";
      const spaceName =
        res?.displayName ?? block.resourceName ?? block.venueName ?? "Unknown";

      return {
        id: block.id,
        kind: mapKind(block.type),
        spaceId,
        spaceName,
        title: block.title,
        startsAt: block.startAt,
        endsAt: block.endAt,
        capacity: block.capacityMax ?? null,
        // capacityCurrent is always null in v1 (known TODO in venue-day-data.ts)
        booked: block.capacityCurrent ?? 0,
        // No per-session check-in/waiver/photo counts in ActivityBlock (Phase-3)
        checkedIn: 0,
        waiversOut: 0,
        photosMissing: 0,
        refAssigned: block.refAssigned,
      };
    },
  );

  // --- Spaces (unique resources for this day's location) ---
  // Column headers use the front-desk label ("Blue Field"), while block→
  // column matching above stays keyed on the raw resource name.
  const spaces = dayData.resources.map((r) => ({
    id: r.id,
    name: r.displayName,
  }));

  // --- Attention items ---
  // ref: games missing a referee assignment
  const refAttention: VenueAttentionItem[] = dayData.blocks
    .filter((b) => b.refAssigned === false) // false = game exists but no ref; null = N/A
    .map((b) => ({
      kind: "ref" as const,
      id: `ref-${b.id}`,
      title: b.title,
      subtitle: b.resourceName
        ? `${b.resourceName} · ${new Date(b.startAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone })}`
        : new Date(b.startAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }),
      sessionId: b.id,
    }));

  // request + message: reuse getNavBadges counts, scoped to this call.
  // requestAttention (refundsPending) is genuinely location-scoped via
  // locationIds. messageAttention (inbox) is deliberately requested
  // org-wide (inboxScope: "org") so it always agrees with the sidebar's
  // Inbox badge (owner decision 2026-07-12) — the conversations table has
  // no location column, so a location-scoped inbox count was really an
  // "assigned to me" count, not a location count, and could silently
  // diverge from the sidebar number. We create synthetic attention items
  // from the badge counts so the command-center can show a badge without a
  // full item list (Phase-3 can expand to item-level detail).
  let requestAttention: VenueAttentionItem[] = [];
  let messageAttention: VenueAttentionItem[] = [];
  try {
    const badges = await badgesPromise;
    if (badges.refundsPending > 0) {
      requestAttention = [
        {
          kind: "request",
          id: "pending-refunds",
          title: `${badges.refundsPending} pending refund request${badges.refundsPending !== 1 ? "s" : ""}`,
          subtitle: "Requires approval",
        },
      ];
    }
    if (badges.inbox > 0) {
      messageAttention = [
        {
          kind: "message",
          id: "unread-inbox",
          title: `${badges.inbox} unread message${badges.inbox !== 1 ? "s" : ""}`,
          subtitle: "Inbox",
        },
      ];
    }
  } catch (err) {
    // Fail-soft: attention items are non-critical, but a silent catch here
    // previously masked a live audit finding (badges call failing looked
    // identical to "genuinely zero"). Log so a real failure is visible.
    console.error("[build-today] attention badges failed:", err);
  }

  const attention: VenueAttentionItem[] = [
    ...refAttention,
    ...requestAttention,
    ...messageAttention,
    // waiver + photo attention items omitted in v1 (no per-session source yet)
  ];

  return {
    date: dayData.date,
    locationId: dayData.locationId,
    locationName: dayData.locationName,
    timezone,
    spaces,
    sessions,
    attention,
  };
}
