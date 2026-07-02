import { and, eq, gte, lte, lt, isNull, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  feedbackRequests,
  organizations,
  users,
  dropInSessions,
  dropInBookings,
  fieldRentals,
  registrations,
  seasons,
  programs,
  locations,
  type NewFeedbackRequest,
  type FeedbackRequestKind,
  type FeedbackRequestMetadata,
  type OrganizationFeatures,
} from "@/lib/db/schema";
import {
  NPS_EXPIRY_DAYS,
  NPS_COOLDOWN_DAYS,
  POST_EVENT_DELAY_HOURS,
  DISPATCH_LOOKBACK_DAYS,
  SEASON_LOOKBACK_DAYS,
} from "./constants";
import { generateFeedbackToken, hashFeedbackToken, buildFeedbackUrl } from "./tokens";
import { sendNpsSurveyEmail } from "@/lib/email/send";
import { originForBrand } from "@/lib/organization/soccerone-routing";
import { env } from "@/lib/env";
import type { BrandId } from "@/lib/branding/themes";

export interface DispatchResult {
  created: number;
  sent: number;
  skippedCooldown: number;
  errors: number;
}

interface Candidate {
  organizationId: string;
  brand: string;
  kind: FeedbackRequestKind;
  targetId: string;
  recipientUserId: string;
  gameOfficialId?: string | null;
  metadata: FeedbackRequestMetadata;
  expiryDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function formatEventDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

/** Orgs with the given feature flag on. */
async function orgsWithFeature(
  flag: keyof OrganizationFeatures,
): Promise<Set<string>> {
  const rows = await getDb()
    .select({ id: organizations.id, features: organizations.features })
    .from(organizations);
  return new Set(
    rows.filter((r) => (r.features as OrganizationFeatures | null)?.[flag] === true).map((r) => r.id),
  );
}

/** Scan 1: completed drop-in sessions → confirmed, non-no-show bookings. */
async function scanDropIns(now: Date, enabledOrgs: Set<string>): Promise<Candidate[]> {
  const db = getDb();
  const endedBefore = new Date(now.getTime() - POST_EVENT_DELAY_HOURS * HOUR_MS);
  const endedAfter = new Date(now.getTime() - DISPATCH_LOOKBACK_DAYS * DAY_MS);

  const rows = await db
    .select({
      bookingId: dropInBookings.id,
      userId: dropInBookings.userId,
      brand: dropInBookings.brand,
      organizationId: dropInSessions.organizationId,
      label: dropInSessions.sportOrClassLabel,
      endsAt: dropInSessions.endsAt,
    })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInBookings.sessionId, dropInSessions.id))
    .where(
      and(
        eq(dropInBookings.status, "confirmed"),
        lte(dropInSessions.endsAt, endedBefore),
        gte(dropInSessions.endsAt, endedAfter),
        inArray(dropInSessions.status, ["scheduled", "completed"]),
      ),
    );

  return rows
    .filter((r) => enabledOrgs.has(r.organizationId))
    .map((r) => ({
      organizationId: r.organizationId,
      brand: r.brand,
      kind: "nps_drop_in" as const,
      targetId: r.bookingId,
      recipientUserId: r.userId,
      metadata: { eventLabel: `${r.label} — ${formatEventDate(r.endsAt)}` },
      expiryDays: NPS_EXPIRY_DAYS,
    }));
}

/** Scan 2: ended, paid field rentals (skips rentals with no linked user account). */
async function scanRentals(now: Date, enabledOrgs: Set<string>): Promise<Candidate[]> {
  const db = getDb();
  const endedBefore = new Date(now.getTime() - POST_EVENT_DELAY_HOURS * HOUR_MS);
  const endedAfter = new Date(now.getTime() - DISPATCH_LOOKBACK_DAYS * DAY_MS);

  const rows = await db
    .select({
      rentalId: fieldRentals.id,
      renterUserId: fieldRentals.renterUserId,
      brand: fieldRentals.brand,
      organizationId: fieldRentals.organizationId,
      endsAt: fieldRentals.endsAt,
    })
    .from(fieldRentals)
    .where(
      and(
        inArray(fieldRentals.status, ["confirmed", "completed"]),
        eq(fieldRentals.paymentStatus, "paid"),
        lte(fieldRentals.endsAt, endedBefore),
        gte(fieldRentals.endsAt, endedAfter),
      ),
    );

  return rows
    .filter((r) => r.renterUserId !== null && enabledOrgs.has(r.organizationId))
    .map((r) => ({
      organizationId: r.organizationId,
      brand: r.brand,
      kind: "nps_field_rental" as const,
      targetId: r.rentalId,
      recipientUserId: r.renterUserId as string,
      metadata: { eventLabel: `Field rental — ${formatEventDate(r.endsAt)}` },
      expiryDays: NPS_EXPIRY_DAYS,
    }));
}

/** Scan 3: seasons whose endDate passed → confirmed registrations. */
async function scanSeasons(now: Date, enabledOrgs: Set<string>): Promise<Candidate[]> {
  const db = getDb();
  const today = now.toISOString().slice(0, 10);
  const lookbackDate = new Date(now.getTime() - SEASON_LOOKBACK_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);

  const rows = await db
    .select({
      registrationId: registrations.id,
      recipientUserId: registrations.registeredByUserId,
      brand: registrations.brand,
      organizationId: locations.organizationId,
      seasonName: seasons.name,
      programName: programs.name,
    })
    .from(registrations)
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(
      and(
        eq(registrations.status, "confirmed"),
        lt(seasons.endDate, today),
        gte(seasons.endDate, lookbackDate),
      ),
    );

  return rows
    .filter((r) => enabledOrgs.has(r.organizationId))
    .map((r) => ({
      organizationId: r.organizationId,
      brand: r.brand,
      kind: "nps_season" as const,
      targetId: r.registrationId,
      recipientUserId: r.recipientUserId,
      metadata: { eventLabel: `${r.programName} — ${r.seasonName}` },
      expiryDays: NPS_EXPIRY_DAYS,
    }));
}

/** True when this recipient already got this NPS kind within the cooldown. */
async function inCooldown(
  recipientUserId: string,
  kind: FeedbackRequestKind,
  now: Date,
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - NPS_COOLDOWN_DAYS * DAY_MS);
  const [row] = await getDb()
    .select({ id: feedbackRequests.id })
    .from(feedbackRequests)
    .where(
      and(
        eq(feedbackRequests.recipientUserId, recipientUserId),
        eq(feedbackRequests.kind, kind),
        gte(feedbackRequests.sentAt, cutoff),
      ),
    )
    .orderBy(sql`${feedbackRequests.sentAt} DESC`)
    .limit(1);
  return row !== undefined;
}

/** Insert the request (dedupe via unique index) and send the email. */
async function createAndSend(candidate: Candidate, now: Date): Promise<"created_sent" | "duplicate" | "error"> {
  const db = getDb();
  const plaintext = generateFeedbackToken();

  const inserted = await db
    .insert(feedbackRequests)
    .values({
      organizationId: candidate.organizationId,
      brand: candidate.brand,
      kind: candidate.kind,
      targetId: candidate.targetId,
      recipientUserId: candidate.recipientUserId,
      gameOfficialId: candidate.gameOfficialId ?? null,
      tokenHash: hashFeedbackToken(plaintext),
      status: "pending",
      expiresAt: new Date(now.getTime() + candidate.expiryDays * DAY_MS),
      metadata: candidate.metadata,
    })
    .onConflictDoNothing()
    .returning({ id: feedbackRequests.id });

  if (inserted.length === 0) return "duplicate";

  const [recipient] = await db
    .select({
      email: users.email,
      firstName: users.firstName,
    })
    .from(users)
    .where(eq(users.id, candidate.recipientUserId))
    .limit(1);

  if (!recipient?.email) return "error";

  const brand = (candidate.brand === "soccerone" ? "soccerone" : "aspire") as BrandId;
  // originForBrand returns null for non-SoccerOne brands (see its doc
  // comment) — fall back to PUBLIC_APP_URL like every other caller in the
  // codebase (e.g. send-balance-reminders.ts), or the "aspire"-brand path
  // (the common case) would throw on `origin.replace` inside buildFeedbackUrl.
  const surveyUrl = buildFeedbackUrl(plaintext, originForBrand(brand) ?? env.PUBLIC_APP_URL);

  const [org] = await db
    .select({ features: organizations.features })
    .from(organizations)
    .where(eq(organizations.id, candidate.organizationId))
    .limit(1);
  const smsOptIn =
    (org?.features as OrganizationFeatures | null)?.enableSMS === true;

  try {
    await sendNpsSurveyEmail({
      to: recipient.email,
      userId: candidate.recipientUserId,
      organizationId: candidate.organizationId,
      brand,
      recipientName: recipient.firstName ?? "there",
      eventLabel: candidate.metadata.eventLabel,
      surveyUrl,
      smsOptIn,
    });
  } catch (err) {
    // Leave the row pending — the next run's pending sweep re-tokens and retries.
    console.error("[feedback] send failed, leaving pending:", err);
    return "error";
  }

  await db
    .update(feedbackRequests)
    .set({ status: "sent", sentAt: now })
    .where(eq(feedbackRequests.id, inserted[0].id));

  return "created_sent";
}

/**
 * Retry rows stuck in `pending` (a previous run created the row but the send
 * threw). The plaintext token is gone, so re-token before resending.
 */
async function resendPending(now: Date, result: DispatchResult): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(feedbackRequests)
    .where(
      and(
        eq(feedbackRequests.status, "pending"),
        gte(feedbackRequests.expiresAt, now),
        isNull(feedbackRequests.sentAt),
      ),
    )
    .orderBy(sql`${feedbackRequests.createdAt} ASC`)
    .limit(50);

  for (const row of rows) {
    // Referee resends are handled by the same path; NPS-only until Task 12
    // adds sendRefereeRatingEmail (pending referee rows are skipped here
    // by kind check until then — Task 12 removes the check).
    if (row.kind === "referee_rating") continue;

    const plaintext = generateFeedbackToken();
    await db
      .update(feedbackRequests)
      .set({ tokenHash: hashFeedbackToken(plaintext) })
      .where(eq(feedbackRequests.id, row.id));

    const [recipient] = await db
      .select({ email: users.email, firstName: users.firstName })
      .from(users)
      .where(eq(users.id, row.recipientUserId))
      .limit(1);
    if (!recipient?.email) continue;

    const brand = (row.brand === "soccerone" ? "soccerone" : "aspire") as BrandId;
    try {
      await sendNpsSurveyEmail({
        to: recipient.email,
        userId: row.recipientUserId,
        organizationId: row.organizationId,
        brand,
        recipientName: recipient.firstName ?? "there",
        eventLabel: row.metadata?.eventLabel ?? "your recent visit",
        surveyUrl: buildFeedbackUrl(plaintext, originForBrand(brand) ?? env.PUBLIC_APP_URL),
      });
      await db
        .update(feedbackRequests)
        .set({ status: "sent", sentAt: now })
        .where(eq(feedbackRequests.id, row.id));
      result.sent += 1;
    } catch (err) {
      console.error("[feedback] pending resend failed:", err);
      result.errors += 1;
    }
  }
}

export async function dispatchFeedbackRequests(now: Date = new Date()): Promise<DispatchResult> {
  const result: DispatchResult = { created: 0, sent: 0, skippedCooldown: 0, errors: 0 };

  const npsOrgs = await orgsWithFeature("enableNpsSurveys");
  const candidates: Candidate[] = [
    ...(await scanDropIns(now, npsOrgs)),
    ...(await scanRentals(now, npsOrgs)),
    ...(await scanSeasons(now, npsOrgs)),
  ];

  for (const candidate of candidates) {
    if (await inCooldown(candidate.recipientUserId, candidate.kind, now)) {
      result.skippedCooldown += 1;
      continue;
    }
    const outcome = await createAndSend(candidate, now);
    if (outcome === "created_sent") {
      result.created += 1;
      result.sent += 1;
    } else if (outcome === "error") {
      result.errors += 1;
    }
    // "duplicate" is the idempotency path — silently fine.
  }

  await resendPending(now, result);
  return result;
}
