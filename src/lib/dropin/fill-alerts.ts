import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dropInSessions,
  dropInBookings,
  dropInRateCard,
} from "@/lib/db/schema/drop-in";
import { pickupAlertSubscriptions, pickupAlertSends } from "@/lib/db/schema/hosts";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { sendSms, normalizeUsPhone } from "@/lib/sms/send";
import { buildShareBlurb } from "./share-blurb";
import { deriveFillState } from "./fill-state";

const DAILY_CAP = 2;
// All prod orgs are Ohio today; org-level tz can replace this when needed.
const DISPLAY_TZ = "America/New_York";

// TCPA-motivated quiet hours: never dispatch outside this local window, even
// though the cron runs every 15 minutes around the clock. A session that
// becomes eligible at 10pm just waits for the next in-window tick — it does
// NOT get stamped/skipped, so it fires as soon as the window reopens.
const DISPATCH_HOUR_START = 9; // 9am inclusive
const DISPATCH_HOUR_END = 20; // 8pm exclusive

function isWithinDispatchHours(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: DISPLAY_TZ,
  }).formatToParts(now);
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  let hour = Number(hourStr);
  // Some ICU implementations report midnight as "24" with hour12:false.
  if (hour === 24) hour = 0;
  return hour >= DISPATCH_HOUR_START && hour < DISPATCH_HOUR_END;
}

/**
 * The "needs players" sweep. One blast per session EVER (fillAlertSentAt is
 * claimed via a conditional UPDATE — a crashed run can't double-blast; the
 * cost of a crash is a missed blast, not a double). Critically, the stamp is
 * only claimed AFTER we've computed a non-empty list of recipients who would
 * actually be texted (subscriber match + daily-cap + dedupe) — a sweep with
 * zero eligible recipients leaves the session un-alerted so it can still
 * fire once a subscriber shows up or the cap resets.
 * Per-user cap: max 2 fill-alert texts per UTC day across all sessions.
 * Eligibility is determined by deriveFillState (shared with browse cards and the host game view).
 * Dispatch is also gated to 9am-8pm America/New_York (TCPA quiet hours) —
 * outside that window the sweep no-ops entirely (see isWithinDispatchHours).
 */
export async function runFillAlertSweep(
  now: Date = new Date(),
): Promise<{ sessionsAlerted: number; smsSent: number; smsSkipped: number }> {
  if (!isWithinDispatchHours(now)) {
    return { sessionsAlerted: 0, smsSent: 0, smsSkipped: 0 };
  }

  const db = getDb();
  let sessionsAlerted = 0;
  let smsSent = 0;
  let smsSkipped = 0;

  // Eligible sessions: scheduled pickup, un-alerted, inside the org window.
  // Window and threshold come from each org's rate card. Fill-state eligibility
  // is determined in the loop by deriveFillState.
  // No drizzle-typing adaptation was needed here: interpolating the
  // dropInRateCard.fillAlertWindowHours column straight into
  // `make_interval(hours => ...)` type-checked and ran as-is (drizzle embeds
  // a Column reference as a SQL identifier, not a bound param, so pg sees a
  // real `integer` operand). The `::int` cast below is defensive only, in
  // case the column type ever drifts.
  const candidates = await db
    .select({
      id: dropInSessions.id,
      organizationId: dropInSessions.organizationId,
      venueId: dropInSessions.venueId,
      sport: dropInSessions.sportOrClassLabel,
      startsAt: dropInSessions.startsAt,
      capacity: dropInSessions.capacity,
      venueName: venues.name,
      thresholdPct: dropInRateCard.fillAlertThresholdPct,
      windowHours: dropInRateCard.fillAlertWindowHours,
      confirmedCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${dropInBookings}
        WHERE ${dropInBookings.sessionId} = ${dropInSessions.id}
          AND ${dropInBookings.status} IN ('confirmed', 'pending_payment', 'pending_claim')
      )`,
    })
    .from(dropInSessions)
    .innerJoin(
      dropInRateCard,
      eq(dropInRateCard.organizationId, dropInSessions.organizationId),
    )
    .leftJoin(venues, eq(venues.id, dropInSessions.venueId))
    .where(
      and(
        eq(dropInSessions.kind, "pickup"),
        eq(dropInSessions.status, "scheduled"),
        isNull(dropInSessions.fillAlertSentAt),
        gte(dropInSessions.startsAt, now),
        lte(
          dropInSessions.startsAt,
          sql`${now.toISOString()}::timestamptz + make_interval(hours => ${dropInRateCard.fillAlertWindowHours}::int)`,
        ),
      ),
    );

  const appUrl = (
    (import.meta.env.PUBLIC_APP_URL as string | undefined) ??
    "http://localhost:4321"
  ).replace(/\/$/, "");
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);

  for (const session of candidates) {
    const state = deriveFillState({
      confirmedCount: session.confirmedCount,
      capacity: session.capacity,
      startsAt: session.startsAt,
      now,
      thresholdPct: session.thresholdPct,
      windowHours: session.windowHours,
    });
    if (state !== "needs_players") continue;

    // Matching subscribers with a phone, excluding active bookers.
    const subscribers = await db
      .select({
        userId: pickupAlertSubscriptions.userId,
        phone: users.phone,
      })
      .from(pickupAlertSubscriptions)
      .innerJoin(users, eq(users.id, pickupAlertSubscriptions.userId))
      .where(
        and(
          eq(pickupAlertSubscriptions.organizationId, session.organizationId),
          eq(pickupAlertSubscriptions.active, true),
          sql`(${pickupAlertSubscriptions.venueId} IS NULL OR ${pickupAlertSubscriptions.venueId} = ${session.venueId})`,
          sql`(${pickupAlertSubscriptions.sport} IS NULL OR lower(${pickupAlertSubscriptions.sport}) = lower(${session.sport}))`,
          sql`${users.phone} IS NOT NULL`,
          sql`NOT EXISTS (
            SELECT 1 FROM ${dropInBookings} b
            WHERE b.session_id = ${session.id}
              AND b.user_id = ${pickupAlertSubscriptions.userId}
              AND b.status IN ('confirmed', 'waitlisted', 'pending_claim', 'pending_payment')
          )`,
        ),
      );

    // Build the EFFECTIVE recipient list — dedupe, normalize phone, and
    // apply the daily cap — BEFORE claiming the one-blast stamp. This must
    // happen up front so a session with zero actual recipients never burns
    // its stamp (see doc comment above).
    const seenUsers = new Set<string>();
    const effectiveRecipients: Array<{ userId: string; phone: string }> = [];
    for (const sub of subscribers) {
      if (seenUsers.has(sub.userId)) continue; // overlapping subscriptions
      seenUsers.add(sub.userId);

      const normalizedPhone = sub.phone ? normalizeUsPhone(sub.phone) : null;
      if (!normalizedPhone) {
        smsSkipped++;
        continue;
      }

      const [{ sentToday }] = await db
        .select({ sentToday: sql<number>`count(*)::int` })
        .from(pickupAlertSends)
        .where(
          and(eq(pickupAlertSends.userId, sub.userId), gte(pickupAlertSends.sentAt, dayStart)),
        );
      if (sentToday >= DAILY_CAP) {
        smsSkipped++;
        continue;
      }

      effectiveRecipients.push({ userId: sub.userId, phone: normalizedPhone });
    }

    if (effectiveRecipients.length === 0) continue; // nobody to actually text — don't burn the stamp

    // Claim the blast (stamp-then-send) — one blast per session ever. Only
    // reached once we know there's at least one real recipient.
    const claimed = await db
      .update(dropInSessions)
      .set({ fillAlertSentAt: now, updatedAt: now })
      .where(
        and(eq(dropInSessions.id, session.id), isNull(dropInSessions.fillAlertSentAt)),
      )
      .returning({ id: dropInSessions.id });
    if (claimed.length === 0) continue; // another run got it
    sessionsAlerted++;

    const spotsLeft = session.capacity - session.confirmedCount;
    const body =
      buildShareBlurb({
        sport: session.sport,
        venueName: session.venueName,
        startsAt: session.startsAt,
        spotsLeft,
        url: `${appUrl}/dropin/${session.id}?src=fill-alert`,
        timeZone: DISPLAY_TZ,
      }) + " Reply STOP to opt out.";

    for (const recipient of effectiveRecipients) {
      const result = await sendSms({
        to: recipient.phone,
        body,
        organizationId: session.organizationId,
      });
      if (result.ok) {
        smsSent++;
        await db
          .insert(pickupAlertSends)
          .values({ sessionId: session.id, userId: recipient.userId, sentAt: now });
      } else {
        smsSkipped++;
      }
    }
  }

  return { sessionsAlerted, smsSent, smsSkipped };
}
