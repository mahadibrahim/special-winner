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
import { sendSms } from "@/lib/sms/send";
import { buildShareBlurb } from "./share-blurb";

const DAILY_CAP = 2;
// All prod orgs are Ohio today; org-level tz can replace this when needed.
const DISPLAY_TZ = "America/New_York";

/**
 * The "needs players" sweep. One blast per session EVER (fillAlertSentAt is
 * claimed via a conditional UPDATE before any SMS goes out — a crashed run
 * can't double-blast; the cost of a crash is a missed blast, not a double).
 * Per-user cap: max 2 fill-alert texts per UTC day across all sessions.
 */
export async function runFillAlertSweep(
  now: Date = new Date(),
): Promise<{ sessionsAlerted: number; smsSent: number; smsSkipped: number }> {
  const db = getDb();
  let sessionsAlerted = 0;
  let smsSent = 0;
  let smsSkipped = 0;

  // Eligible sessions: scheduled pickup, un-alerted, inside the org window,
  // under the org threshold. Window/threshold come from each org's rate card.
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
    if (session.capacity <= 0) continue;
    const pct = (session.confirmedCount / session.capacity) * 100;
    if (pct >= session.thresholdPct) continue;

    // Claim the blast (stamp-then-send).
    const claimed = await db
      .update(dropInSessions)
      .set({ fillAlertSentAt: now, updatedAt: now })
      .where(
        and(eq(dropInSessions.id, session.id), isNull(dropInSessions.fillAlertSentAt)),
      )
      .returning({ id: dropInSessions.id });
    if (claimed.length === 0) continue; // another run got it
    sessionsAlerted++;

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

    const spotsLeft = session.capacity - session.confirmedCount;
    const body = buildShareBlurb({
      sport: session.sport,
      venueName: session.venueName,
      startsAt: session.startsAt,
      spotsLeft,
      url: `${appUrl}/dropin/${session.id}?src=fill-alert`,
      timeZone: DISPLAY_TZ,
    });

    const seenUsers = new Set<string>();
    for (const sub of subscribers) {
      if (seenUsers.has(sub.userId)) continue; // overlapping subscriptions
      seenUsers.add(sub.userId);

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

      const result = await sendSms({
        to: sub.phone!,
        body,
        organizationId: session.organizationId,
      });
      if (result.ok) {
        smsSent++;
        await db
          .insert(pickupAlertSends)
          .values({ sessionId: session.id, userId: sub.userId, sentAt: now });
      } else {
        smsSkipped++;
      }
    }
  }

  return { sessionsAlerted, smsSent, smsSkipped };
}
