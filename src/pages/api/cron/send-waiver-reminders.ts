import type { APIRoute } from "astro";
import { and, eq, inArray, notInArray, sql, exists } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  registrations,
  seasons,
  programs,
  users,
  locations,
  emailLogs,
} from "@/lib/db/schema";
import {
  WAIVER_ON_FILE_ATTRIBUTION,
  hasValidLiabilityWaiver,
} from "@/lib/consents/liability";
import { sendWaiverReminderEmail } from "@/lib/email/send";
import {
  createMagicLink,
  buildMagicLinkUrl,
} from "@/lib/auth/magic-link";
import { env } from "@/lib/env";
import { captureServerException } from "@/lib/observability/server-error";
import { normalizeBrand, originForBrand } from "@/lib/organization/soccerone-routing";
import { getPostHogServer } from "@/lib/posthog-server";
import { SERVER_EVENTS } from "@/lib/analytics/events";
import type { WaiverReminderWindowType } from "@/lib/registrations/waiver-reminder-windows";

/**
 * POST /api/cron/send-waiver-reminders
 *
 * Daily scheduled task. Reminds parents whose registration is paid (or
 * deposit-paid) but the waiver hasn't been signed yet — mirrors
 * /api/cron/send-balance-reminders in structure and idempotency approach.
 *
 * Cadence windows (age = now - registrations.createdAt), each queried and
 * reported independently, matching the boundaries defined in
 * src/lib/registrations/waiver-reminder-windows.ts (keep the two in sync):
 *  - "1":        age in [1d, 4d)
 *  - "2":        age in [4d, 8d)
 *  - "w1"…"w7":  weekly buckets, age in [8+7*(N-1) d, 8+7*N d)
 *  - "w8":       age >= 57d (uncapped — catches any further-neglected rows)
 *  - "final":    season starts within the next 48h, regardless of age —
 *    and it SUPPRESSES the age windows for those registrations (#459):
 *    one email that morning, not two
 *
 * reminder_number captured in analytics: "1" -> 1, "2" -> 2, "w{N}" -> 7+N
 * (w1 -> 8 ... w8 -> 15), "final" -> 99.
 *
 * Authentication: requires `x-cron-secret` header matching CRON_SECRET env
 * (same convention as the existing cron endpoints in this directory).
 */

export const prerender = false;

interface AgeWindowDef {
  type: Exclude<WaiverReminderWindowType, "final">;
  reminderNumber: number;
  lowerDays: number;
  upperDays: number | null;
}

const AGE_WINDOWS: AgeWindowDef[] = [
  { type: "1", reminderNumber: 1, lowerDays: 1, upperDays: 4 },
  { type: "2", reminderNumber: 2, lowerDays: 4, upperDays: 8 },
  { type: "w1", reminderNumber: 8, lowerDays: 8, upperDays: 15 },
  { type: "w2", reminderNumber: 9, lowerDays: 15, upperDays: 22 },
  { type: "w3", reminderNumber: 10, lowerDays: 22, upperDays: 29 },
  { type: "w4", reminderNumber: 11, lowerDays: 29, upperDays: 36 },
  { type: "w5", reminderNumber: 12, lowerDays: 36, upperDays: 43 },
  { type: "w6", reminderNumber: 13, lowerDays: 43, upperDays: 50 },
  { type: "w7", reminderNumber: 14, lowerDays: 50, upperDays: 57 },
  { type: "w8", reminderNumber: 15, lowerDays: 57, upperDays: null },
];

const FINAL_REMINDER_NUMBER = 99;

interface WindowResult {
  type: WaiverReminderWindowType;
  reminderNumber: number;
  sent: number;
  skipped: number;
  errored: number;
}

// Shared eligibility: waiver not yet signed, payment landed, season hasn't
// started, and not a cancelled/refunded registration (paymentStatus is not
// reset on cancel — without this a cancelled-but-paid registration would
// keep getting reminded to sign a waiver for a season it's no longer in).
//
// ANNUAL WAIVER note: `registrations.waiverSigned = false` is ALSO the annual
// exclusion for anything created after that change landed — every registration
// write path now stamps the row `waiverSigned: true` at birth when the
// participant already has a valid org-scoped signature
// (create-registration.ts, walk-up-registration.ts), so covered families never
// enter this candidate set in the first place. What this query cannot see is
// the TRANSITION population: rows created before the stamp existed, and rows
// whose family signed at another door after the registration was made. Those
// are caught per-row by `stampIfWaiverOnFile` below rather than by a second
// SQL predicate here — a correlated EXISTS would have to restate
// hasValidLiabilityWaiver's rule (canonical consents row OR either legacy
// signature fallback) in SQL, forking the one place that owns it.
//
// COST, honestly: only the COVERED rows are self-liquidating — each is stamped
// once and never re-enters the candidate set. Every UNCOVERED candidate (the
// majority, and the steady state once the transition population drains) pays
// the lookup again on every window it matches, on every run, forever: up to 3
// indexed queries each, and a row can match one age window plus the final
// window. That is the price of not forking the predicate, and it is affordable
// only because the candidate set is small by construction (paid AND unsigned
// AND season not yet started AND not already emailed for that window). If that
// set ever grows past the low hundreds, the fix is a batched
// `hasValidLiabilityWaiver` variant taking many (person, org) pairs — NOT a
// hand-written EXISTS here.
function baseEligibility() {
  return and(
    eq(registrations.waiverSigned, false),
    inArray(registrations.paymentStatus, ["paid", "deposit_paid"]),
    notInArray(registrations.status, ["cancelled", "refunded"]),
    sql`${seasons.startDate} >= CURRENT_DATE`,
  );
}

function notAlreadyLogged(emailType: string) {
  const db = getDb();
  return sql`NOT ${exists(
    db
      .select({ one: sql`1` })
      .from(emailLogs)
      .where(
        and(
          eq(emailLogs.registrationId, registrations.id),
          eq(emailLogs.emailType, emailType),
        ),
      ),
  )}`;
}

async function fetchRows(whereExtra: ReturnType<typeof and>) {
  const db = getDb();
  return db
    .select({
      registrationId: registrations.id,
      registrationBrand: registrations.brand,
      familyMemberId: registrations.familyMemberId,
      seasonId: registrations.seasonId,
      startDate: seasons.startDate,
      seasonName: seasons.name,
      locationName: locations.name,
      locationOrgId: locations.organizationId,
      parentUserId: users.id,
      parentEmail: users.email,
      parentFirstName: users.firstName,
      parentPasswordHash: users.passwordHash,
    })
    .from(registrations)
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .innerJoin(users, eq(registrations.registeredByUserId, users.id))
    .where(and(baseEligibility(), whereExtra));
}

/**
 * Transition backstop: a candidate row whose participant is ALREADY covered by
 * a valid annual signature must not be chased. Stamps the row with the shared
 * on-file attribution and reports true so the caller counts it as skipped
 * instead of sending.
 *
 * The stamp bounds the cost only for rows that HIT: stamping takes them out of
 * `baseEligibility` permanently, so a covered registration pays this lookup
 * once, ever. Rows that MISS — the majority, and the whole steady state —
 * re-pay it on every window they match on every run. See the cost note on
 * `baseEligibility` above.
 *
 * `waiverSignedAt` stays NULL (written explicitly): the row is a derived copy
 * of an earlier signature, and hasValidLiabilityWaiver's legacy `registrations`
 * fallback accepts any DATED signed row — dating it would let the reminder cron
 * renew the very window it just read.
 *
 * Errors resolve to "not covered" so a lookup blip degrades to today's
 * behaviour (send the reminder) rather than silently suppressing it.
 */
async function stampIfWaiverOnFile(
  row: Awaited<ReturnType<typeof fetchRows>>[number],
): Promise<boolean> {
  if (!row.locationOrgId) return false;
  try {
    const covered = await hasValidLiabilityWaiver(
      row.familyMemberId,
      row.locationOrgId,
    );
    if (!covered) return false;
    await getDb()
      .update(registrations)
      .set({
        waiverSigned: true,
        waiverSignedBy: WAIVER_ON_FILE_ATTRIBUTION,
        waiverSignedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, row.registrationId));
    return true;
  } catch (err) {
    console.error(
      `[cron] waiver-on-file check failed for registration ${row.registrationId}:`,
      err,
    );
    return false;
  }
}

async function sendForRow(
  row: Awaited<ReturnType<typeof fetchRows>>[number],
  reminderType: WaiverReminderWindowType,
  reminderNumber: number,
) {
  const brand = normalizeBrand(row.registrationBrand);
  const brandAppUrl = originForBrand(brand) ?? env.PUBLIC_APP_URL;
  const destPath = `/account/complete/${row.registrationId}?via=email_link`;

  // Guest-checkout (passwordless) users need a magic-link so the completion
  // link signs them in transparently — mirrors send-balance-reminders.ts.
  const isGuestUser = row.parentPasswordHash === null;
  let completionUrl: string;
  if (isGuestUser) {
    const link = await createMagicLink({
      userId: row.parentUserId,
      organizationId: row.locationOrgId ?? undefined,
      purpose: "login",
      purposeContext: { redirectTo: destPath },
      deliveredChannel: "email",
      deliveredTo: row.parentEmail,
    });
    completionUrl = buildMagicLinkUrl(link.token, { origin: brandAppUrl });
  } else {
    completionUrl = `${brandAppUrl}${destPath}`;
  }

  await sendWaiverReminderEmail({
    userId: row.parentUserId,
    organizationId: row.locationOrgId ?? undefined,
    registrationId: row.registrationId,
    parentEmail: row.parentEmail,
    parentName: row.parentFirstName || row.parentEmail.split("@")[0],
    seasonName: row.seasonName,
    seasonStartDate: row.startDate,
    locationName: row.locationName,
    completionUrl,
    reminderType,
    brand,
  });

  const posthog = getPostHogServer();
  posthog.capture({
    distinctId: row.parentUserId,
    event: SERVER_EVENTS.waiverReminderSent,
    properties: {
      registration_id: row.registrationId,
      season_id: row.seasonId,
      reminder_number: reminderNumber,
    },
  });
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
  const results: WindowResult[] = [];

  for (const windowDef of AGE_WINDOWS) {
    const emailType = `waiver_reminder_${windowDef.type}`;
    const result: WindowResult = {
      type: windowDef.type,
      reminderNumber: windowDef.reminderNumber,
      sent: 0,
      skipped: 0,
      errored: 0,
    };

    try {
      // Final-48h suppression (#459, owner decision): a registration whose
      // season starts inside the final window gets ONLY the final reminder
      // that morning, never an age-window email on top. Must stay the
      // NEGATION of the final window's own predicate below — and mirror
      // computeWaiverReminderWindows (waiver-reminder-windows.ts).
      const notInFinalWindow = sql`NOT (${seasons.startDate} BETWEEN CURRENT_DATE AND (CURRENT_DATE + interval '2 days'))`;
      const ageWhere =
        windowDef.upperDays != null
          ? and(
              sql`${registrations.createdAt} <= now() - (${windowDef.lowerDays} || ' days')::interval`,
              sql`${registrations.createdAt} > now() - (${windowDef.upperDays} || ' days')::interval`,
              notInFinalWindow,
              notAlreadyLogged(emailType),
            )
          : and(
              sql`${registrations.createdAt} <= now() - (${windowDef.lowerDays} || ' days')::interval`,
              notInFinalWindow,
              notAlreadyLogged(emailType),
            );

      const rows = await fetchRows(ageWhere!);

      for (const row of rows) {
        try {
          if (await stampIfWaiverOnFile(row)) {
            result.skipped += 1;
            continue;
          }
          await sendForRow(row, windowDef.type, windowDef.reminderNumber);
          result.sent += 1;
        } catch (rowErr) {
          console.error(
            `[cron] waiver reminder ${windowDef.type} failed for registration ${row.registrationId}:`,
            rowErr,
          );
          void captureServerException(rowErr, {
            component: "cron/send-waiver-reminders",
            metadata: {
              window: windowDef.type,
              registrationId: row.registrationId,
              phase: "row",
            },
          });
          result.errored += 1;
        }
      }
    } catch (windowErr) {
      console.error(
        `[cron] waiver reminder ${windowDef.type} window query failed:`,
        windowErr,
      );
      void captureServerException(windowErr, {
        component: "cron/send-waiver-reminders",
        metadata: { window: windowDef.type, phase: "window-query" },
      });
      result.errored += 1;
    }

    results.push(result);
  }

  // "final" is independent of registration age — season starting within
  // 48h. Reported as its own window, same shape as the age-based ones.
  {
    const emailType = "waiver_reminder_final";
    const result: WindowResult = {
      type: "final",
      reminderNumber: FINAL_REMINDER_NUMBER,
      sent: 0,
      skipped: 0,
      errored: 0,
    };

    try {
      const finalWhere = and(
        sql`${seasons.startDate} BETWEEN CURRENT_DATE AND (CURRENT_DATE + interval '2 days')`,
        notAlreadyLogged(emailType),
      );

      const rows = await fetchRows(finalWhere!);

      for (const row of rows) {
        try {
          if (await stampIfWaiverOnFile(row)) {
            result.skipped += 1;
            continue;
          }
          await sendForRow(row, "final", FINAL_REMINDER_NUMBER);
          result.sent += 1;
        } catch (rowErr) {
          console.error(
            `[cron] waiver reminder final failed for registration ${row.registrationId}:`,
            rowErr,
          );
          void captureServerException(rowErr, {
            component: "cron/send-waiver-reminders",
            metadata: {
              window: "final",
              registrationId: row.registrationId,
              phase: "row",
            },
          });
          result.errored += 1;
        }
      }
    } catch (windowErr) {
      console.error(
        "[cron] waiver reminder final window query failed:",
        windowErr,
      );
      void captureServerException(windowErr, {
        component: "cron/send-waiver-reminders",
        metadata: { window: "final", phase: "window-query" },
      });
      result.errored += 1;
    }

    results.push(result);
  }

  const elapsedMs = Date.now() - startedAt;
  const totalSent = results.reduce((s, r) => s + r.sent, 0);
  const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
  const totalErrored = results.reduce((s, r) => s + r.errored, 0);

  console.info(
    `[cron] Waiver reminders: ${totalSent} sent, ${totalSkipped} skipped, ${totalErrored} errored across ${results.length} windows in ${elapsedMs}ms`,
  );

  return new Response(
    JSON.stringify({
      success: true,
      windows: results,
      totalSent,
      totalSkipped,
      totalErrored,
      elapsedMs,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

// GET returns a small status page for human debugging. Does not send messages.
export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      description: "Waiver-reminder cron endpoint",
      windows: [...AGE_WINDOWS.map((w) => w.type), "final"],
      usage:
        "POST to this endpoint with header x-cron-secret: $CRON_SECRET to send waiver reminders. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
