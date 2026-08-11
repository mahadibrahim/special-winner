import type { APIRoute } from "astro";
import { eq, and, sql, inArray, like, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  registrations,
  seasons,
  programs,
  familyMembers,
  users,
  locations,
  emailLogs,
  teamReservationAttempts,
  teamRegistrations,
} from "@/lib/db/schema";
import { sendAbandonedCheckoutReminderEmail } from "@/lib/email/send";
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";
import { env } from "@/lib/env";
import { BUSINESS_TIMEZONE } from "@/lib/time/business-timezone";
import { captureServerException } from "@/lib/observability/server-error";
import { normalizeBrand, originForBrand } from "@/lib/organization/soccerone-routing";
import { CAPTAIN_DEPOSIT_CENTS } from "@/lib/registrations/team-deposit";

/**
 * POST /api/cron/send-abandoned-checkout-reminders
 *
 * Daily scheduled task over abandoned carts, SOLO (pending/unpaid
 * registrations) and TEAM (team_reservation_attempts — captains who reached
 * the deposit form but never paid). Touch schedule is owner-specified,
 * anchored to both cart age and the season's registration deadline:
 *
 *   attempt      — 2h–24h after the cart was created ("shortly after")
 *   nudge        — 3–6 days old, only when the deadline is >12 days out
 *   closing_soon — deadline 6–10 days away (cart ≥ 24h old)
 *   last_day     — deadline day itself (business TZ), while still open
 *
 * At most ONE touch per cart per run (priority last_day > closing_soon >
 * attempt > nudge); each touch sends once ever per cart (email_logs);
 * a 48h spacing guard separates touches (12h for last_day — the final
 * deadline email may follow a recent touch, never stack same-day).
 */

export const prerender = false;

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

type Touch = "attempt" | "nudge" | "closing_soon" | "last_day";

interface VariantResult {
  sent: Partial<Record<Touch, number>>;
  skipped: number;
  errored: number;
}

function bizDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: BUSINESS_TIMEZONE });
}

function deadlineLabel(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    timeZone: BUSINESS_TIMEZONE,
  });
}

/**
 * Pick the single touch this cart should get right now, or null.
 * `sentTypes` are touches already sent for this cart; `lastSentAt` is the
 * most recent same-family send (spacing guard).
 */
export function pickTouch(opts: {
  createdAt: Date;
  closesAt: Date | null;
  now: Date;
  sentTypes: Set<string>;
  lastSentAt: Date | null;
}): Touch | null {
  const { createdAt, closesAt, now, sentTypes, lastSentAt } = opts;
  const age = now.getTime() - createdAt.getTime();
  const untilClose = closesAt ? closesAt.getTime() - now.getTime() : Infinity;
  const sinceLast = lastSentAt ? now.getTime() - lastSentAt.getTime() : Infinity;

  const isLastDay =
    closesAt != null && untilClose > 0 && bizDate(closesAt) === bizDate(now);

  if (isLastDay && age >= 6 * HOUR && !sentTypes.has("last_day")) {
    return sinceLast >= 12 * HOUR ? "last_day" : null;
  }
  if (sinceLast < 48 * HOUR) return null;
  if (
    untilClose > 6 * DAY &&
    untilClose <= 10 * DAY &&
    age >= 24 * HOUR &&
    !sentTypes.has("closing_soon")
  ) {
    return "closing_soon";
  }
  if (age >= 2 * HOUR && age < 24 * HOUR && !sentTypes.has("attempt")) {
    return "attempt";
  }
  if (
    age >= 3 * DAY &&
    age < 6 * DAY &&
    untilClose > 12 * DAY &&
    !sentTypes.has("nudge")
  ) {
    return "nudge";
  }
  return null;
}

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  const providedSecret = request.headers.get("x-cron-secret");

  if (secret) {
    if (providedSecret !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else if (import.meta.env.PROD) {
    console.error(
      "[cron] CRON_SECRET not configured in production. Refusing request.",
    );
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();
  const now = new Date();
  const db = getDb();
  const solo: VariantResult = { sent: {}, skipped: 0, errored: 0 };
  const team: VariantResult = { sent: {}, skipped: 0, errored: 0 };

  // ---- Solo carts: pending/unpaid registrations ---------------------------
  try {
    const carts = await db
      .select({
        registrationId: registrations.id,
        createdAt: registrations.createdAt,
        registrationBrand: registrations.brand,
        amountDueCents: registrations.amountDueCents,
        seasonId: seasons.id,
        seasonName: seasons.name,
        registrationCloses: seasons.registrationCloses,
        startDate: seasons.startDate,
        programName: programs.name,
        locationOrgId: locations.organizationId,
        parentUserId: users.id,
        parentEmail: users.email,
        parentFirstName: users.firstName,
        parentPasswordHash: users.passwordHash,
        playerFirstName: familyMembers.firstName,
        playerLastName: familyMembers.lastName,
      })
      .from(registrations)
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(users, eq(registrations.registeredByUserId, users.id))
      .where(
        and(
          eq(registrations.paymentStatus, "unpaid"),
          eq(registrations.status, "pending"),
          sql`${registrations.amountDueCents} > 0`,
          eq(seasons.status, "open"),
          sql`COALESCE(${seasons.registrationCloses}, ${seasons.startDate}::timestamp) > now()`,
          sql`${registrations.createdAt} <= now() - interval '2 hours'`,
          // Nothing is ever eligible beyond 10 days of age AND 10 days from
          // the deadline both passed — but the deadline touches have no age
          // ceiling, so only bound by a sane overall horizon (60 days).
          sql`${registrations.createdAt} > now() - interval '60 days'`,
        ),
      );

    const ids = carts.map((c) => c.registrationId);
    const logs = ids.length
      ? await db
          .select({
            registrationId: emailLogs.registrationId,
            emailType: emailLogs.emailType,
            sentAt: emailLogs.sentAt,
          })
          .from(emailLogs)
          .where(
            and(
              inArray(emailLogs.registrationId, ids),
              like(emailLogs.emailType, "abandoned_checkout%"),
            ),
          )
      : [];
    const logsByCart = new Map<string, { types: Set<string>; last: Date | null }>();
    for (const l of logs) {
      if (!l.registrationId) continue;
      const entry =
        logsByCart.get(l.registrationId) ?? { types: new Set(), last: null };
      // Both legacy (v1: nudge/last_call) and current type names count for
      // dedupe + spacing.
      entry.types.add(l.emailType.replace("abandoned_checkout_", ""));
      if (!entry.last || l.sentAt > entry.last) entry.last = l.sentAt;
      logsByCart.set(l.registrationId, entry);
    }

    for (const cart of carts) {
      const closesAt =
        cart.registrationCloses ?? new Date(`${cart.startDate}T00:00:00Z`);
      const history = logsByCart.get(cart.registrationId);
      const touch = pickTouch({
        createdAt: cart.createdAt,
        closesAt,
        now,
        sentTypes: history?.types ?? new Set(),
        lastSentAt: history?.last ?? null,
      });
      if (!touch) {
        solo.skipped += 1;
        continue;
      }

      try {
        const brand = normalizeBrand(cart.registrationBrand);
        const brandAppUrl = originForBrand(brand) ?? env.PUBLIC_APP_URL;
        const registerPath = `/register/${cart.seasonId}`;

        const isGuestUser = cart.parentPasswordHash === null;
        let resumeUrl: string;
        if (isGuestUser) {
          const link = await createMagicLink({
            userId: cart.parentUserId,
            organizationId: cart.locationOrgId ?? undefined,
            purpose: "login",
            purposeContext: { redirectTo: registerPath },
            deliveredChannel: "email",
            deliveredTo: cart.parentEmail,
          });
          resumeUrl = buildMagicLinkUrl(link.token, { origin: brandAppUrl });
        } else {
          resumeUrl = `${brandAppUrl}${registerPath}`;
        }

        await sendAbandonedCheckoutReminderEmail({
          userId: cart.parentUserId,
          organizationId: cart.locationOrgId ?? undefined,
          registrationId: cart.registrationId,
          variant: "solo",
          parentEmail: cart.parentEmail,
          parentName: cart.parentFirstName || cart.parentEmail.split("@")[0],
          subjectName: `${cart.playerFirstName} ${cart.playerLastName}`,
          programName: cart.programName,
          seasonName: cart.seasonName,
          amountDueCents: cart.amountDueCents,
          deadlineLabel: deadlineLabel(closesAt),
          resumeUrl,
          touch,
          brand,
        });
        solo.sent[touch] = (solo.sent[touch] ?? 0) + 1;
      } catch (err) {
        solo.errored += 1;
        console.error(
          `[cron] abandoned solo ${touch} failed for ${cart.registrationId}:`,
          err,
        );
        void captureServerException(err, {
          component: "cron/send-abandoned-checkout-reminders",
          metadata: { registration_id: cart.registrationId, touch },
        });
      }
    }
  } catch (err) {
    console.error("[cron] abandoned solo query failed:", err);
    void captureServerException(err, {
      component: "cron/send-abandoned-checkout-reminders",
      metadata: { phase: "solo-query" },
    });
  }

  // ---- Team carts: reservation attempts with no team ----------------------
  try {
    const attempts = await db
      .select({
        attemptId: teamReservationAttempts.id,
        createdAt: teamReservationAttempts.createdAt,
        captainEmail: teamReservationAttempts.captainEmail,
        captainName: teamReservationAttempts.captainName,
        teamName: teamReservationAttempts.teamName,
        brand: teamReservationAttempts.brand,
        orgId: teamReservationAttempts.organizationId,
        seasonId: seasons.id,
        seasonName: seasons.name,
        registrationCloses: seasons.registrationCloses,
        startDate: seasons.startDate,
        programName: programs.name,
      })
      .from(teamReservationAttempts)
      .innerJoin(seasons, eq(teamReservationAttempts.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .where(
        and(
          eq(seasons.status, "open"),
          sql`COALESCE(${seasons.registrationCloses}, ${seasons.startDate}::timestamp) > now()`,
          sql`${teamReservationAttempts.createdAt} <= now() - interval '2 hours'`,
          sql`${teamReservationAttempts.createdAt} > now() - interval '60 days'`,
          // Converted captains go silent: their team exists for this season…
          sql`NOT EXISTS (
            SELECT 1 FROM team_registrations tr
            WHERE tr.season_id = ${teamReservationAttempts.seasonId}
              AND lower(tr.captain_email) = lower(${teamReservationAttempts.captainEmail})
          )`,
          // …or they registered (and paid) as a player instead.
          sql`NOT EXISTS (
            SELECT 1 FROM registrations r
            JOIN users u ON u.id = r.registered_by_user_id
            WHERE r.season_id = ${teamReservationAttempts.seasonId}
              AND lower(u.email) = lower(${teamReservationAttempts.captainEmail})
              AND r.payment_status IN ('paid', 'deposit_paid')
          )`,
        ),
      );

    for (const attempt of attempts) {
      const closesAt =
        attempt.registrationCloses ?? new Date(`${attempt.startDate}T00:00:00Z`);

      // Per-attempt history: team carts have no registration id, so dedupe on
      // (recipient, team_abandoned_*) newer than the attempt itself —
      // naturally resets for a fresh attempt next season.
      const history = await db
        .select({ emailType: emailLogs.emailType, sentAt: emailLogs.sentAt })
        .from(emailLogs)
        .where(
          and(
            eq(emailLogs.recipientEmail, attempt.captainEmail),
            like(emailLogs.emailType, "team_abandoned%"),
            gt(emailLogs.sentAt, attempt.createdAt),
          ),
        );
      const types = new Set(
        history.map((h) => h.emailType.replace("team_abandoned_", "")),
      );
      const last = history.reduce<Date | null>(
        (acc, h) => (!acc || h.sentAt > acc ? h.sentAt : acc),
        null,
      );

      const touch = pickTouch({
        createdAt: attempt.createdAt,
        closesAt,
        now,
        sentTypes: types,
        lastSentAt: last,
      });
      if (!touch) {
        team.skipped += 1;
        continue;
      }

      try {
        const brand = normalizeBrand(attempt.brand);
        const brandAppUrl = originForBrand(brand) ?? env.PUBLIC_APP_URL;

        await sendAbandonedCheckoutReminderEmail({
          organizationId: attempt.orgId,
          variant: "team",
          parentEmail: attempt.captainEmail,
          parentName:
            attempt.captainName.split(" ")[0] ||
            attempt.captainEmail.split("@")[0],
          subjectName: attempt.teamName,
          programName: attempt.programName,
          seasonName: attempt.seasonName,
          amountDueCents: CAPTAIN_DEPOSIT_CENTS,
          deadlineLabel: deadlineLabel(closesAt),
          resumeUrl: `${brandAppUrl}/register/${attempt.seasonId}`,
          touch,
          brand,
        });
        team.sent[touch] = (team.sent[touch] ?? 0) + 1;
      } catch (err) {
        team.errored += 1;
        console.error(
          `[cron] abandoned team ${touch} failed for ${attempt.attemptId}:`,
          err,
        );
        void captureServerException(err, {
          component: "cron/send-abandoned-checkout-reminders",
          metadata: { attempt_id: attempt.attemptId, touch },
        });
      }
    }
  } catch (err) {
    console.error("[cron] abandoned team query failed:", err);
    void captureServerException(err, {
      component: "cron/send-abandoned-checkout-reminders",
      metadata: { phase: "team-query" },
    });
  }

  return new Response(
    JSON.stringify({ solo, team, elapsedMs: Date.now() - startedAt }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
