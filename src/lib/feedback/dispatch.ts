import { and, eq, gte, lte, lt, isNull, inArray, sql, desc } from "drizzle-orm";
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
  games,
  gameOfficials,
  rosters,
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
  REFEREE_EXPIRY_DAYS,
  REFEREE_DAILY_CAP_HOURS,
} from "./constants";
import { generateFeedbackToken, hashFeedbackToken, buildFeedbackUrl } from "./tokens";
import { sendNpsSurveyEmail, sendRefereeRatingEmail } from "@/lib/email/send";
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

/** Scan 4: completed games with an official → adults on both rosters. */
async function scanRefereeRatings(now: Date, enabledOrgs: Set<string>): Promise<Candidate[]> {
  const db = getDb();
  const updatedAfter = new Date(now.getTime() - DISPATCH_LOOKBACK_DAYS * DAY_MS);

  // Ordered scheduledAt DESC: candidates below are built in this order, so
  // for a recipient appearing across multiple completed games, the earlier
  // (older) game's candidate is appended later. The daily-cap check runs
  // in candidate order, so it always sees the most recent game's candidate
  // first — anchoring the recipient's single allowed email to their most
  // recent completed game rather than an arbitrary one.
  const completedGames = await db
    .select({
      gameId: games.id,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      scheduledAt: games.scheduledAt,
      organizationId: locations.organizationId,
      programType: programs.programType,
      programName: programs.name,
    })
    .from(games)
    .innerJoin(seasons, eq(games.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(and(eq(games.status, "completed"), gte(games.updatedAt, updatedAfter)))
    .orderBy(desc(games.scheduledAt));

  const candidates: Candidate[] = [];

  for (const game of completedGames) {
    if (!enabledOrgs.has(game.organizationId)) continue;

    const teamIds = [game.homeTeamId, game.awayTeamId].filter(
      (id): id is string => id !== null,
    );
    if (teamIds.length === 0) continue;

    // Head referee = earliest-assigned official (explicit orderBy: the CI DB
    // accumulates rows; see multi-tenant query hazards).
    const [official] = await db
      .select({
        id: gameOfficials.id,
        userId: gameOfficials.userId,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(gameOfficials)
      .innerJoin(users, eq(gameOfficials.userId, users.id))
      .where(eq(gameOfficials.gameId, game.gameId))
      .orderBy(sql`${gameOfficials.createdAt} ASC`)
      .limit(1);
    if (!official) continue;

    // Adults tied to both rosters: parents of youth players AND adult
    // self-registrants — both are registrations.registeredByUserId.
    const recipientRows = await db
      .selectDistinct({ userId: registrations.registeredByUserId, brand: registrations.brand })
      .from(rosters)
      .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
      .where(
        and(
          inArray(rosters.teamId, teamIds),
          eq(rosters.status, "active"),
          eq(registrations.status, "confirmed"),
        ),
      );

    const refereeName = `${official.firstName ?? "The"} ${(official.lastName ?? "referee").charAt(0)}.`;
    const gameType = game.programType === "tournament" ? "tournament" : "league";
    const eventLabel = `${game.programName} — ${formatEventDate(game.scheduledAt)}`;

    for (const recipient of recipientRows) {
      if (recipient.userId === official.userId) continue; // never self-rate
      candidates.push({
        organizationId: game.organizationId,
        brand: recipient.brand,
        kind: "referee_rating",
        targetId: game.gameId,
        recipientUserId: recipient.userId,
        gameOfficialId: official.id,
        metadata: { eventLabel, gameType, refereeName },
        expiryDays: REFEREE_EXPIRY_DAYS,
      });
    }
  }

  return candidates;
}

/** True when the recipient got ANY referee-rating ask in the cap window. */
async function inRefereeDailyCap(recipientUserId: string, now: Date): Promise<boolean> {
  const cutoff = new Date(now.getTime() - REFEREE_DAILY_CAP_HOURS * HOUR_MS);
  const [row] = await getDb()
    .select({ id: feedbackRequests.id })
    .from(feedbackRequests)
    .where(
      and(
        eq(feedbackRequests.recipientUserId, recipientUserId),
        eq(feedbackRequests.kind, "referee_rating"),
        gte(feedbackRequests.sentAt, cutoff),
      ),
    )
    .orderBy(sql`${feedbackRequests.sentAt} DESC`)
    .limit(1);
  return row !== undefined;
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

/**
 * Outcome of one candidate: `created` — the insert landed (not a dedupe
 * duplicate); `sent` — the email went out AND the row was marked sent.
 * `created && !sent` is the error path: the row stays `pending` for the
 * next run's resend sweep (no email went out, so retrying can't double-send —
 * except the marked-loudly status-update-failure case below).
 */
interface CreateSendOutcome {
  created: boolean;
  sent: boolean;
}

/** Insert the request (dedupe via unique index) and send the email. */
async function createAndSend(candidate: Candidate, now: Date): Promise<CreateSendOutcome> {
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

  if (inserted.length === 0) return { created: false, sent: false }; // duplicate — idempotency path

  const requestId = inserted[0].id;

  const [recipient] = await db
    .select({
      email: users.email,
      firstName: users.firstName,
    })
    .from(users)
    .where(eq(users.id, candidate.recipientUserId))
    .limit(1);

  if (!recipient?.email) {
    console.error(`[feedback] no recipient email for request ${requestId}; leaving pending`);
    return { created: true, sent: false };
  }

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
    const sendResult =
      candidate.kind === "referee_rating"
        ? await sendRefereeRatingEmail({
            to: recipient.email,
            userId: candidate.recipientUserId,
            organizationId: candidate.organizationId,
            brand,
            recipientName: recipient.firstName ?? "there",
            eventLabel: candidate.metadata.eventLabel,
            refereeName: candidate.metadata.refereeName ?? "the referee",
            surveyUrl,
            smsOptIn,
          })
        : await sendNpsSurveyEmail({
            to: recipient.email,
            userId: candidate.recipientUserId,
            organizationId: candidate.organizationId,
            brand,
            recipientName: recipient.firstName ?? "there",
            eventLabel: candidate.metadata.eventLabel,
            surveyUrl,
            smsOptIn,
          });
    // sendEmail never throws on delivery failure — it resolves
    // { success: false }. Treat that exactly like a throw: leave the row
    // pending for the next run's resend sweep (no email went out, so the
    // retry cannot double-send).
    if (!sendResult.success) {
      console.error(
        `[feedback] send failed for request ${requestId}, leaving pending: ${sendResult.error ?? "unknown error"}`,
      );
      return { created: true, sent: false };
    }
  } catch (err) {
    // Leave the row pending — the next run's pending sweep re-tokens and retries.
    console.error(`[feedback] send threw for request ${requestId}, leaving pending:`, err);
    return { created: true, sent: false };
  }

  // The email is out the door. Record that — with one retry — because a row
  // left `pending` after a successful send means the next run's sweep
  // re-sends a real customer email.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await db
        .update(feedbackRequests)
        .set({ status: "sent", sentAt: now })
        .where(eq(feedbackRequests.id, requestId));
      return { created: true, sent: true };
    } catch (err) {
      if (attempt === 2) {
        console.error(
          `[feedback] CRITICAL: email delivered but marking request ${requestId} as sent failed twice — row is still pending and the next run WILL re-send. Mark it sent manually.`,
          err,
        );
      }
    }
  }
  return { created: true, sent: false };
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
    // The row's entire processing — including the re-token update and
    // recipient lookup — lives inside this try/catch. A transient DB error
    // anywhere in here (not just the send call) must log, count as an
    // error, and let the sweep continue with the remaining rows instead of
    // aborting.
    try {
      // Referee rows must re-check the daily cap here: if the latest game's
      // send failed (row pending, sentAt null), an OLDER game's candidate
      // for the same recipient passes the cap in the dispatch loop above
      // and sends — retrying the pending latest-game row in this same run
      // without a cap check would put two referee emails inside the 24h
      // window. Capped rows stay pending this sweep; a future sweep after
      // the window can retry them (subject to expiresAt).
      if (
        row.kind === "referee_rating" &&
        (await inRefereeDailyCap(row.recipientUserId, now))
      ) {
        continue;
      }

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
      const surveyUrl = buildFeedbackUrl(plaintext, originForBrand(brand) ?? env.PUBLIC_APP_URL);
      const sendResult =
        row.kind === "referee_rating"
          ? await sendRefereeRatingEmail({
              to: recipient.email,
              userId: row.recipientUserId,
              organizationId: row.organizationId,
              brand,
              recipientName: recipient.firstName ?? "there",
              eventLabel: row.metadata?.eventLabel ?? "your recent game",
              refereeName: row.metadata?.refereeName ?? "the referee",
              surveyUrl,
            })
          : await sendNpsSurveyEmail({
              to: recipient.email,
              userId: row.recipientUserId,
              organizationId: row.organizationId,
              brand,
              recipientName: recipient.firstName ?? "there",
              eventLabel: row.metadata?.eventLabel ?? "your recent visit",
              surveyUrl,
            });
      // Resolved-but-failed sends ({ success: false }) leave the row pending
      // for the next sweep, same as a throw — no email went out.
      if (!sendResult.success) {
        console.error(
          `[feedback] pending resend failed for request ${row.id}: ${sendResult.error ?? "unknown error"}`,
        );
        result.errors += 1;
        continue;
      }
      await db
        .update(feedbackRequests)
        .set({ status: "sent", sentAt: now })
        .where(eq(feedbackRequests.id, row.id));
      result.sent += 1;
    } catch (err) {
      console.error(`[feedback] pending resend failed for request ${row.id}:`, err);
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

  // Each candidate is isolated: an unexpected throw (e.g. a transient DB
  // error) counts as an error and moves on, so one bad candidate can never
  // abort the rest of the run or skip the resendPending sweep below.
  for (const candidate of candidates) {
    try {
      if (await inCooldown(candidate.recipientUserId, candidate.kind, now)) {
        result.skippedCooldown += 1;
        continue;
      }
      const outcome = await createAndSend(candidate, now);
      if (outcome.created) result.created += 1;
      if (outcome.sent) {
        result.sent += 1;
      } else if (outcome.created) {
        // Insert landed but the send (or the sent-marker update) failed.
        result.errors += 1;
      }
      // !created && !sent is the duplicate/idempotency path — silently fine.
    } catch (err) {
      console.error(
        `[feedback] candidate dispatch threw (kind=${candidate.kind} target=${candidate.targetId}):`,
        err,
      );
      result.errors += 1;
    }
  }

  // Referee ratings use a daily cap (one email per recipient per rolling
  // 24h) instead of the 90-day NPS cooldown, so they run through their own
  // loop rather than joining `candidates` above. scanRefereeRatings already
  // returns candidates ordered most-recent-game-first (see its comment), so
  // the cap anchors each recipient's single email to their latest game.
  const refOrgs = await orgsWithFeature("enableRefereeRatings");
  const refereeCandidates = await scanRefereeRatings(now, refOrgs);

  for (const candidate of refereeCandidates) {
    try {
      if (await inRefereeDailyCap(candidate.recipientUserId, now)) {
        result.skippedCooldown += 1;
        continue;
      }
      const outcome = await createAndSend(candidate, now);
      if (outcome.created) result.created += 1;
      if (outcome.sent) {
        result.sent += 1;
      } else if (outcome.created) {
        result.errors += 1;
      }
    } catch (err) {
      console.error(
        `[feedback] candidate dispatch threw (kind=${candidate.kind} target=${candidate.targetId}):`,
        err,
      );
      result.errors += 1;
    }
  }

  await resendPending(now, result);
  return result;
}
