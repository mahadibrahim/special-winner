import { and, eq, gte, lte, lt, isNull, isNotNull, inArray, sql, desc, max, notExists } from "drizzle-orm";
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
import { isEmailConfigured } from "@/lib/email";
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

/**
 * Scan 1: completed drop-in sessions → confirmed, non-no-show bookings.
 *
 * The `notExists` clause anti-joins against feedback_requests on the exact
 * dedupe key (kind + targetId + recipientUserId — the same key the unique
 * index enforces). This is what stops the hourly rolling-window re-scan from
 * re-fetching bookings that were already dispatched in a prior run: without
 * it, every booking inside the DISPATCH_LOOKBACK_DAYS window comes back every
 * hour and only gets filtered out downstream (by cooldown or insert
 * conflict). Behaviorally identical — a booking with an existing row here was
 * ALWAYS a no-op in this loop (either cooldown-skipped because the prior send
 * landed, or insert-conflicted silently because a prior attempt is still
 * pending) — this just stops paying query/JS cost to rediscover that fact.
 */
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
      venueId: dropInSessions.venueId,
      hostUserId: dropInSessions.hostUserId,
      hostFirstName: users.firstName,
    })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInBookings.sessionId, dropInSessions.id))
    .leftJoin(users, eq(dropInSessions.hostUserId, users.id))
    .where(
      and(
        eq(dropInBookings.status, "confirmed"),
        lte(dropInSessions.endsAt, endedBefore),
        gte(dropInSessions.endsAt, endedAfter),
        inArray(dropInSessions.status, ["scheduled", "completed"]),
        notExists(
          db
            .select({ one: sql`1` })
            .from(feedbackRequests)
            .where(
              and(
                eq(feedbackRequests.kind, "nps_drop_in"),
                eq(feedbackRequests.targetId, dropInBookings.id),
                eq(feedbackRequests.recipientUserId, dropInBookings.userId),
              ),
            ),
        ),
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
      metadata: {
        eventLabel: `${r.label} — ${formatEventDate(r.endsAt)}`,
        venueId: r.venueId,
        // hostName is stamped ONLY when the host has a real first name —
        // omitted (not a "your host" placeholder) otherwise, so the form
        // never renders "How was your host, your host?". The form instead
        // derives whether to show the host question at all from hasHost
        // (metadata.hostUserId presence), independent of hostName.
        ...(r.hostUserId
          ? {
              hostUserId: r.hostUserId,
              ...(r.hostFirstName ? { hostName: r.hostFirstName } : {}),
            }
          : {}),
      },
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
      venueId: fieldRentals.venueId,
    })
    .from(fieldRentals)
    .where(
      and(
        inArray(fieldRentals.status, ["confirmed", "completed"]),
        eq(fieldRentals.paymentStatus, "paid"),
        lte(fieldRentals.endsAt, endedBefore),
        gte(fieldRentals.endsAt, endedAfter),
        // renterUserId can be null (no linked account) — notExists still
        // works (a NULL renterUserId never equals an existing row's
        // recipientUserId, so the subquery correctly finds nothing and the
        // row survives to the `renterUserId !== null` JS filter below).
        notExists(
          db
            .select({ one: sql`1` })
            .from(feedbackRequests)
            .where(
              and(
                eq(feedbackRequests.kind, "nps_field_rental"),
                eq(feedbackRequests.targetId, fieldRentals.id),
                eq(feedbackRequests.recipientUserId, fieldRentals.renterUserId),
              ),
            ),
        ),
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
      metadata: {
        eventLabel: `Field rental — ${formatEventDate(r.endsAt)}`,
        venueId: r.venueId,
      },
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
      venueId: seasons.venueId,
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
        notExists(
          db
            .select({ one: sql`1` })
            .from(feedbackRequests)
            .where(
              and(
                eq(feedbackRequests.kind, "nps_season"),
                eq(feedbackRequests.targetId, registrations.id),
                eq(feedbackRequests.recipientUserId, registrations.registeredByUserId),
              ),
            ),
        ),
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
      metadata: {
        eventLabel: `${r.programName} — ${r.seasonName}`,
        ...(r.venueId ? { venueId: r.venueId } : {}),
      },
      expiryDays: NPS_EXPIRY_DAYS,
    }));
}

/**
 * Scan 4: completed games with an official → adults on both rosters.
 *
 * Batched into a fixed number of queries regardless of game count M:
 * 1. completedGames (unchanged — already a single query with joins)
 * 2. all officials for all eligible games, via inArray(gameOfficials.gameId, …)
 * 3. all roster recipients for all eligible teams, via inArray(rosters.teamId, …)
 * 4. an anti-join existing-check against feedback_requests, via inArray on the
 *    candidate (targetId, recipientUserId) pairs
 *
 * Replaces the previous 1 + 2M shape (one official query + one roster query
 * per game) and the M-fold rediscovery of games that already got their asks
 * sent in a prior hourly run.
 */
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

  // Filter to eligible games (org flag on, at least one team) BEFORE the
  // batch queries, so the inArray()s below only cover games we'll actually
  // build candidates for — mirrors the original per-game `continue`s.
  const eligibleGames = completedGames.filter(
    (g) =>
      enabledOrgs.has(g.organizationId) &&
      (g.homeTeamId !== null || g.awayTeamId !== null),
  );
  if (eligibleGames.length === 0) return [];

  const gameIds = eligibleGames.map((g) => g.gameId);
  const teamIds = [
    ...new Set(
      eligibleGames.flatMap((g) => [g.homeTeamId, g.awayTeamId]).filter((id): id is string => id !== null),
    ),
  ];

  const [allOfficials, allRosterRows] = await Promise.all([
    db
      .select({
        gameId: gameOfficials.gameId,
        id: gameOfficials.id,
        userId: gameOfficials.userId,
        firstName: users.firstName,
        lastName: users.lastName,
        createdAt: gameOfficials.createdAt,
      })
      .from(gameOfficials)
      .innerJoin(users, eq(gameOfficials.userId, users.id))
      .where(inArray(gameOfficials.gameId, gameIds)),
    db
      .selectDistinct({
        teamId: rosters.teamId,
        userId: registrations.registeredByUserId,
        brand: registrations.brand,
      })
      .from(rosters)
      .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
      .where(
        and(
          inArray(rosters.teamId, teamIds),
          eq(rosters.status, "active"),
          eq(registrations.status, "confirmed"),
        ),
      ),
  ]);

  // Head referee = earliest-assigned official per game (explicit ordering by
  // createdAt, same tiebreak the original per-game `orderBy ASC limit 1` used).
  const officialByGame = new Map<string, (typeof allOfficials)[number]>();
  for (const o of allOfficials) {
    const existing = officialByGame.get(o.gameId);
    if (!existing || o.createdAt < existing.createdAt) officialByGame.set(o.gameId, o);
  }

  const recipientsByTeam = new Map<string, Array<{ userId: string; brand: string }>>();
  for (const r of allRosterRows) {
    const arr = recipientsByTeam.get(r.teamId);
    if (arr) arr.push({ userId: r.userId, brand: r.brand });
    else recipientsByTeam.set(r.teamId, [{ userId: r.userId, brand: r.brand }]);
  }

  const rawCandidates: Candidate[] = [];
  for (const game of eligibleGames) {
    const official = officialByGame.get(game.gameId);
    if (!official) continue;

    const gameTeamIds = [game.homeTeamId, game.awayTeamId].filter((id): id is string => id !== null);

    // Adults tied to both rosters: parents of youth players AND adult
    // self-registrants — both are registrations.registeredByUserId.
    // De-dupe by userId across the two teams (mirrors the original
    // selectDistinct scoped to this game's team pair).
    const seen = new Map<string, string>(); // userId -> brand
    for (const teamId of gameTeamIds) {
      for (const r of recipientsByTeam.get(teamId) ?? []) {
        if (!seen.has(r.userId)) seen.set(r.userId, r.brand);
      }
    }

    const refereeName = `${official.firstName ?? "The"} ${(official.lastName ?? "referee").charAt(0)}.`;
    const gameType = game.programType === "tournament" ? "tournament" : "league";
    const eventLabel = `${game.programName} — ${formatEventDate(game.scheduledAt)}`;

    for (const [userId, brand] of seen) {
      if (userId === official.userId) continue; // never self-rate
      rawCandidates.push({
        organizationId: game.organizationId,
        brand,
        kind: "referee_rating",
        targetId: game.gameId,
        recipientUserId: userId,
        gameOfficialId: official.id,
        metadata: { eventLabel, gameType, refereeName },
        expiryDays: REFEREE_EXPIRY_DAYS,
      });
    }
  }

  if (rawCandidates.length === 0) return rawCandidates;

  // Anti-join: drop candidates whose exact (kind, targetId, recipientUserId,
  // gameOfficialId) already exists — same reasoning as the NPS scans above.
  // A pre-existing row here was always a no-op in this loop (cap-skipped if
  // sent, insert-conflict-noop if still pending from a prior run).
  const candidateGameIds = [...new Set(rawCandidates.map((c) => c.targetId))];
  const candidateRecipientIds = [...new Set(rawCandidates.map((c) => c.recipientUserId))];
  const existing = await db
    .select({
      targetId: feedbackRequests.targetId,
      recipientUserId: feedbackRequests.recipientUserId,
      gameOfficialId: feedbackRequests.gameOfficialId,
    })
    .from(feedbackRequests)
    .where(
      and(
        eq(feedbackRequests.kind, "referee_rating"),
        inArray(feedbackRequests.targetId, candidateGameIds),
        inArray(feedbackRequests.recipientUserId, candidateRecipientIds),
      ),
    );
  const existingKeys = new Set(
    existing.map((r) => `${r.targetId}:${r.recipientUserId}:${r.gameOfficialId}`),
  );

  return rawCandidates.filter(
    (c) => !existingKeys.has(`${c.targetId}:${c.recipientUserId}:${c.gameOfficialId}`),
  );
}

/** Cooldown/cap cutoff for a kind: 24h for referee ratings, NPS_COOLDOWN_DAYS for NPS kinds. */
function cutoffFor(kind: FeedbackRequestKind, now: Date): Date {
  return kind === "referee_rating"
    ? new Date(now.getTime() - REFEREE_DAILY_CAP_HOURS * HOUR_MS)
    : new Date(now.getTime() - NPS_COOLDOWN_DAYS * DAY_MS);
}

/**
 * Batched replacement for the old per-candidate `inCooldown` / `inRefereeDailyCap`
 * queries: one `latest sentAt per (recipientUserId, kind)` lookup, computed
 * with inArray + groupBy instead of N/R round trips. NULL sentAt rows (never
 * sent — pending) are excluded by the query, matching the original
 * `gte(sentAt, cutoff)` semantics where a NULL never satisfies `gte`.
 */
async function batchLatestSentAt(
  recipientUserIds: string[],
  kinds: FeedbackRequestKind[],
): Promise<Map<string, Date>> {
  if (recipientUserIds.length === 0 || kinds.length === 0) return new Map();
  const db = getDb();
  const rows = await db
    .select({
      recipientUserId: feedbackRequests.recipientUserId,
      kind: feedbackRequests.kind,
      latestSentAt: max(feedbackRequests.sentAt),
    })
    .from(feedbackRequests)
    .where(
      and(
        inArray(feedbackRequests.recipientUserId, recipientUserIds),
        inArray(feedbackRequests.kind, kinds),
        isNotNull(feedbackRequests.sentAt),
      ),
    )
    .groupBy(feedbackRequests.recipientUserId, feedbackRequests.kind);

  const map = new Map<string, Date>();
  for (const r of rows) {
    if (r.latestSentAt) map.set(`${r.recipientUserId}:${r.kind}`, new Date(r.latestSentAt));
  }
  return map;
}

/** True when the batched map shows a recent-enough send for this recipient+kind. */
function isInCooldownMap(
  map: Map<string, Date>,
  recipientUserId: string,
  kind: FeedbackRequestKind,
  now: Date,
): boolean {
  const latest = map.get(`${recipientUserId}:${kind}`);
  if (!latest) return false;
  return latest >= cutoffFor(kind, now);
}

/** Batched replacement for the old per-candidate recipient SELECT. */
async function batchRecipients(
  userIds: string[],
): Promise<Map<string, { email: string; firstName: string | null }>> {
  if (userIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: users.id, email: users.email, firstName: users.firstName })
    .from(users)
    .where(inArray(users.id, userIds));
  return new Map(rows.map((r) => [r.id, { email: r.email, firstName: r.firstName }]));
}

/** Batched replacement for the old per-candidate org-features SELECT. */
async function batchOrgFeatures(
  orgIds: string[],
): Promise<Map<string, OrganizationFeatures | null>> {
  if (orgIds.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: organizations.id, features: organizations.features })
    .from(organizations)
    .where(inArray(organizations.id, orgIds));
  return new Map(rows.map((r) => [r.id, r.features as OrganizationFeatures | null]));
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

/**
 * Insert the request (dedupe via unique index) and send the email.
 *
 * `recipient` and `smsOptIn` are pre-fetched by the caller via
 * batchRecipients/batchOrgFeatures (inArray, once per run) rather than
 * looked up here per-candidate. The insert itself stays per-candidate and
 * synchronous with the send: candidates are processed in order, and a
 * same-run recipient+kind collision (two candidates for the same person)
 * must see the outcome of the earlier candidate before deciding whether to
 * proceed — see the in-run `sentThisRun` sets in dispatchFeedbackRequests.
 * That ordering guarantee is why sends stay a per-recipient loop instead of
 * a bulk multi-row insert-then-send.
 */
async function createAndSend(
  candidate: Candidate,
  now: Date,
  recipient: { email: string; firstName: string | null } | undefined,
  smsOptIn: boolean,
): Promise<CreateSendOutcome> {
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
    // retry cannot double-send). Exception: when the email channel itself is
    // unconfigured (no RESEND_API_KEY — CI and bare local dev), the platform
    // convention is an intentionally inert channel; retrying hourly until
    // expiry would be noise, so mark the request sent (email_logs still
    // records the failed attempt for audit).
    if (!sendResult.success && isEmailConfigured()) {
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
 *
 * Cooldown/cap re-checks and the recipient lookup are batched up front
 * (inArray + groupBy / inArray) instead of one query per row. An in-sweep
 * `sentThisSweep` set replaces what the old per-row fresh-DB-query got for
 * free: if an earlier row in this same 50-row batch just sent for the same
 * recipient+kind, a later row for that recipient must still see it as
 * capped/cooled-down.
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

  if (rows.length === 0) return;

  const recipientIds = [...new Set(rows.map((r) => r.recipientUserId))];
  const kinds = [...new Set(rows.map((r) => r.kind))];
  const [cooldownMap, recipients] = await Promise.all([
    batchLatestSentAt(recipientIds, kinds),
    batchRecipients(recipientIds),
  ]);

  const sentThisSweep = new Set<string>(); // `${recipientUserId}:${kind}`

  for (const row of rows) {
    // The row's entire processing — including the re-token update and
    // recipient lookup — lives inside this try/catch. A transient DB error
    // anywhere in here (not just the send call) must log, count as an
    // error, and let the sweep continue with the remaining rows instead of
    // aborting.
    try {
      const key = `${row.recipientUserId}:${row.kind}`;
      // Re-check the cap/cooldown here: if the latest candidate's send
      // failed (row pending, sentAt null), an older candidate for the same
      // recipient+kind can pass the check in the dispatch loop above and
      // send — retrying this pending row in the same run without a re-check
      // would put two asks inside the cooldown/cap window. Capped/cooled
      // rows stay pending this sweep; a future sweep after the window can
      // retry them (subject to expiresAt).
      if (isInCooldownMap(cooldownMap, row.recipientUserId, row.kind, now) || sentThisSweep.has(key)) {
        continue;
      }

      const plaintext = generateFeedbackToken();
      await db
        .update(feedbackRequests)
        .set({ tokenHash: hashFeedbackToken(plaintext) })
        .where(eq(feedbackRequests.id, row.id));

      const recipient = recipients.get(row.recipientUserId);
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
      // for the next sweep, same as a throw — no email went out. Unconfigured
      // email (no RESEND_API_KEY) is an intentionally inert channel: mark
      // sent rather than retrying hourly until expiry (see createAndSend).
      if (!sendResult.success && isEmailConfigured()) {
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
      sentThisSweep.add(key);
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

  const npsKinds: FeedbackRequestKind[] = ["nps_drop_in", "nps_field_rental", "nps_season"];
  const npsRecipientIds = [...new Set(candidates.map((c) => c.recipientUserId))];
  const npsOrgIds = [...new Set(candidates.map((c) => c.organizationId))];
  const [npsCooldownMap, npsRecipients, npsOrgFeatures] = await Promise.all([
    batchLatestSentAt(npsRecipientIds, npsKinds),
    batchRecipients(npsRecipientIds),
    batchOrgFeatures(npsOrgIds),
  ]);

  // Tracks recipient+kind pairs that successfully sent earlier in THIS run —
  // the in-memory equivalent of the old per-candidate fresh-DB cooldown
  // query picking up a sibling candidate's just-committed send.
  const sentThisRun = new Set<string>();

  // Each candidate is isolated: an unexpected throw (e.g. a transient DB
  // error) counts as an error and moves on, so one bad candidate can never
  // abort the rest of the run or skip the resendPending sweep below.
  for (const candidate of candidates) {
    const key = `${candidate.recipientUserId}:${candidate.kind}`;
    try {
      if (isInCooldownMap(npsCooldownMap, candidate.recipientUserId, candidate.kind, now) || sentThisRun.has(key)) {
        result.skippedCooldown += 1;
        continue;
      }
      const recipient = npsRecipients.get(candidate.recipientUserId);
      const smsOptIn = npsOrgFeatures.get(candidate.organizationId)?.enableSMS === true;
      const outcome = await createAndSend(candidate, now, recipient, smsOptIn);
      if (outcome.created) result.created += 1;
      if (outcome.sent) {
        result.sent += 1;
        sentThisRun.add(key);
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

  const refRecipientIds = [...new Set(refereeCandidates.map((c) => c.recipientUserId))];
  const refOrgIds = [...new Set(refereeCandidates.map((c) => c.organizationId))];
  const [refCooldownMap, refRecipients, refOrgFeatures] = await Promise.all([
    batchLatestSentAt(refRecipientIds, ["referee_rating"]),
    batchRecipients(refRecipientIds),
    batchOrgFeatures(refOrgIds),
  ]);

  const refSentThisRun = new Set<string>();

  for (const candidate of refereeCandidates) {
    const key = `${candidate.recipientUserId}:${candidate.kind}`;
    try {
      if (isInCooldownMap(refCooldownMap, candidate.recipientUserId, candidate.kind, now) || refSentThisRun.has(key)) {
        result.skippedCooldown += 1;
        continue;
      }
      const recipient = refRecipients.get(candidate.recipientUserId);
      const smsOptIn = refOrgFeatures.get(candidate.organizationId)?.enableSMS === true;
      const outcome = await createAndSend(candidate, now, recipient, smsOptIn);
      if (outcome.created) result.created += 1;
      if (outcome.sent) {
        result.sent += 1;
        refSentThisRun.add(key);
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
