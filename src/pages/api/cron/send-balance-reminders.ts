import type { APIRoute } from "astro";
import { eq, and, sql, notInArray, exists } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  registrations,
  seasons,
  programs,
  familyMembers,
  users,
  locations,
  emailLogs,
} from "@/lib/db/schema";
import { sendBalanceReminderEmail } from "@/lib/email/send";
import {
  createMagicLink,
  buildMagicLinkUrl,
} from "@/lib/auth/magic-link";
import { env } from "@/lib/env";

/**
 * POST /api/cron/send-balance-reminders
 *
 * Daily scheduled task. For each window in [T-21, T-7, T-1] days before a
 * season starts, fires balance-reminder emails to parents whose
 * registration has paymentStatus='deposit_paid'. Idempotent — skips rows
 * with a matching email_logs entry.
 *
 * Authentication: requires `x-cron-secret` header matching CRON_SECRET env
 * (same convention as the existing cron endpoints in this directory).
 *
 * Returns a per-window breakdown of sent / skipped / errored counts.
 */

export const prerender = false;

const REMINDER_WINDOWS: Array<{ days: number; type: "t21" | "t7" | "t1" }> = [
  { days: 21, type: "t21" },
  { days: 7, type: "t7" },
  { days: 1, type: "t1" },
];

interface WindowResult {
  type: "t21" | "t7" | "t1";
  daysBefore: number;
  sent: number;
  skipped: number;
  errored: number;
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
  const db = getDb();
  const appUrl = env.PUBLIC_APP_URL;

  const results: WindowResult[] = [];

  for (const window of REMINDER_WINDOWS) {
    const emailType = `balance_reminder_${window.type}`;
    const result: WindowResult = {
      type: window.type,
      daysBefore: window.days,
      sent: 0,
      skipped: 0,
      errored: 0,
    };

    try {
      // Pull all deposit_paid registrations whose season starts in exactly
      // <window.days> days from today. Drizzle's date arithmetic on a `date`
      // column requires raw SQL — this mirrors the spec's WHERE clause.
      const rows = await db
        .select({
          registrationId: registrations.id,
          amountDueCents: registrations.amountDueCents,
          amountPaidCents: registrations.amountPaidCents,
          startDate: seasons.startDate,
          seasonName: seasons.name,
          programName: programs.name,
          locationOrgId: locations.organizationId,
          parentUserId: users.id,
          parentEmail: users.email,
          parentFirstName: users.firstName,
          parentPasswordHash: users.passwordHash,
          childFirstName: familyMembers.firstName,
          childLastName: familyMembers.lastName,
        })
        .from(registrations)
        .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .innerJoin(
          familyMembers,
          eq(registrations.familyMemberId, familyMembers.id),
        )
        .innerJoin(users, eq(registrations.registeredByUserId, users.id))
        .where(
          and(
            eq(registrations.paymentStatus, "deposit_paid"),
            notInArray(registrations.status, [
              "cancelled",
              "refunded",
              "waitlisted",
            ]),
            sql`${seasons.startDate} = (CURRENT_DATE + (${window.days} || ' days')::interval)::date`,
            // Skip if we've already sent this exact reminder type for this
            // registration. Idempotent — re-runs are safe.
            sql`NOT ${exists(
              db
                .select({ one: sql`1` })
                .from(emailLogs)
                .where(
                  and(
                    eq(emailLogs.registrationId, registrations.id),
                    eq(emailLogs.emailType, emailType),
                  ),
                ),
            )}`,
          ),
        );

      for (const row of rows) {
        try {
          const balanceCents = row.amountDueCents - row.amountPaidCents;
          if (balanceCents <= 0) {
            // Defensive — shouldn't happen given the WHERE clause, but if a
            // partial-refund landed before this run, just skip silently.
            result.skipped += 1;
            continue;
          }

          // Guest-checkout users have no password; mint a magic-link so the
          // pay-balance link signs them in transparently. Authenticated users
          // get a plain dashboard link (middleware will gate it).
          const isGuestUser = row.parentPasswordHash === null;
          let payBalanceUrl: string;
          if (isGuestUser) {
            const link = await createMagicLink({
              userId: row.parentUserId,
              organizationId: row.locationOrgId ?? undefined,
              purpose: "login",
              purposeContext: {
                redirectTo: `/dashboard/registrations/${row.registrationId}/pay-balance`,
              },
              deliveredChannel: "email",
              deliveredTo: row.parentEmail,
            });
            payBalanceUrl = buildMagicLinkUrl(link.token);
          } else {
            payBalanceUrl = `${appUrl}/dashboard/registrations/${row.registrationId}/pay-balance`;
          }

          await sendBalanceReminderEmail({
            userId: row.parentUserId,
            organizationId: row.locationOrgId ?? undefined,
            registrationId: row.registrationId,
            parentEmail: row.parentEmail,
            parentName:
              row.parentFirstName || row.parentEmail.split("@")[0],
            childName: `${row.childFirstName} ${row.childLastName}`,
            programName: row.programName,
            seasonName: row.seasonName,
            balanceCents,
            seasonStartDate: row.startDate,
            payBalanceUrl,
            reminderType: window.type,
          });

          result.sent += 1;
        } catch (rowErr) {
          console.error(
            `[cron] balance reminder ${window.type} failed for registration ${row.registrationId}:`,
            rowErr,
          );
          result.errored += 1;
        }
      }
    } catch (windowErr) {
      console.error(
        `[cron] balance reminder ${window.type} window query failed:`,
        windowErr,
      );
      // Window-level failure: log + continue with other windows.
      result.errored += 1;
    }

    results.push(result);
  }

  const elapsedMs = Date.now() - startedAt;
  const totalSent = results.reduce((s, r) => s + r.sent, 0);
  const totalSkipped = results.reduce((s, r) => s + r.skipped, 0);
  const totalErrored = results.reduce((s, r) => s + r.errored, 0);

  console.info(
    `[cron] Balance reminders: ${totalSent} sent, ${totalSkipped} skipped, ${totalErrored} errored across ${REMINDER_WINDOWS.length} windows in ${elapsedMs}ms`,
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
      description: "Balance-reminder cron endpoint",
      windows: REMINDER_WINDOWS.map((w) => ({
        type: w.type,
        daysBeforeSeasonStart: w.days,
      })),
      usage:
        "POST to this endpoint with header x-cron-secret: $CRON_SECRET to send balance reminders. Intended for scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
