import type { APIRoute } from "astro";
import { eq, and, sql, exists } from "drizzle-orm";
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
import { sendAbandonedCheckoutReminderEmail } from "@/lib/email/send";
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";
import { env } from "@/lib/env";
import { captureServerException } from "@/lib/observability/server-error";
import { normalizeBrand, originForBrand } from "@/lib/organization/soccerone-routing";

/**
 * POST /api/cron/send-abandoned-checkout-reminders
 *
 * Daily scheduled task. People who start a registration but never pay
 * convert late on their own (observed returns at 2, 7, and 13 days) — this
 * nudges them instead of hoping they remember. Two touches keyed off the
 * registration's age:
 *
 *   nudge      — created 20h–48h ago
 *   last_call  — created 3d–6d ago
 *
 * Eligibility: paymentStatus 'unpaid' + status 'pending' (a started-but-
 * unpaid registration IS the abandoned cart — guest checkout creates the
 * row before the payment form), amountDue > 0, and the season still open
 * for registration. email_logs is the idempotency gate per (registration,
 * touch), mirroring the balance-reminder cron.
 *
 * Guests (no password) get a magic-link that signs them in and lands on the
 * register page, which resumes their pending registration at the same
 * quoted amount; password users get the plain register URL.
 *
 * Authentication: `x-cron-secret` header, same convention as siblings.
 */

export const prerender = false;

const TOUCH_WINDOWS: Array<{
  touch: "nudge" | "last_call";
  minHours: number;
  maxHours: number;
}> = [
  { touch: "nudge", minHours: 20, maxHours: 48 },
  { touch: "last_call", minHours: 72, maxHours: 144 },
];

interface TouchResult {
  touch: "nudge" | "last_call";
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
  const touches: TouchResult[] = [];

  for (const window of TOUCH_WINDOWS) {
    const emailType = `abandoned_checkout_${window.touch}`;
    const result: TouchResult = {
      touch: window.touch,
      sent: 0,
      skipped: 0,
      errored: 0,
    };

    try {
      const rows = await db
        .select({
          registrationId: registrations.id,
          registrationBrand: registrations.brand,
          amountDueCents: registrations.amountDueCents,
          seasonId: seasons.id,
          seasonName: seasons.name,
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
        .innerJoin(
          familyMembers,
          eq(registrations.familyMemberId, familyMembers.id),
        )
        .innerJoin(users, eq(registrations.registeredByUserId, users.id))
        .where(
          and(
            eq(registrations.paymentStatus, "unpaid"),
            eq(registrations.status, "pending"),
            sql`${registrations.amountDueCents} > 0`,
            // Only nudge toward a season people can actually still join.
            eq(seasons.status, "open"),
            sql`(${seasons.registrationCloses} IS NULL OR ${seasons.registrationCloses} > now())`,
            sql`${registrations.createdAt} <= now() - (${window.minHours} || ' hours')::interval`,
            sql`${registrations.createdAt} > now() - (${window.maxHours} || ' hours')::interval`,
            // Idempotency gate — one send per (registration, touch), ever.
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
          const brand = normalizeBrand(row.registrationBrand);
          const brandAppUrl = originForBrand(brand) ?? env.PUBLIC_APP_URL;
          const registerPath = `/register/${row.seasonId}`;

          // Guests (no password) can't sign in to resume — mint a magic
          // link that lands them on the register page already authenticated.
          const isGuestUser = row.parentPasswordHash === null;
          let resumeUrl: string;
          if (isGuestUser) {
            const link = await createMagicLink({
              userId: row.parentUserId,
              organizationId: row.locationOrgId ?? undefined,
              purpose: "login",
              purposeContext: { redirectTo: registerPath },
              deliveredChannel: "email",
              deliveredTo: row.parentEmail,
            });
            resumeUrl = buildMagicLinkUrl(link.token, { origin: brandAppUrl });
          } else {
            resumeUrl = `${brandAppUrl}${registerPath}`;
          }

          await sendAbandonedCheckoutReminderEmail({
            userId: row.parentUserId,
            organizationId: row.locationOrgId ?? undefined,
            registrationId: row.registrationId,
            parentEmail: row.parentEmail,
            parentName: row.parentFirstName || row.parentEmail.split("@")[0],
            playerName: `${row.playerFirstName} ${row.playerLastName}`,
            programName: row.programName,
            seasonName: row.seasonName,
            amountDueCents: row.amountDueCents,
            resumeUrl,
            touch: window.touch,
            brand,
          });
          result.sent += 1;
        } catch (rowErr) {
          result.errored += 1;
          console.error(
            `[cron] abandoned-checkout ${window.touch} failed for registration ${row.registrationId}:`,
            rowErr,
          );
          void captureServerException(rowErr, {
            component: "cron/send-abandoned-checkout-reminders",
            metadata: { registration_id: row.registrationId, touch: window.touch },
          });
        }
      }
    } catch (windowErr) {
      console.error(
        `[cron] abandoned-checkout ${window.touch} query failed:`,
        windowErr,
      );
      void captureServerException(windowErr, {
        component: "cron/send-abandoned-checkout-reminders",
        metadata: { touch: window.touch, phase: "query" },
      });
    }

    touches.push(result);
  }

  return new Response(
    JSON.stringify({ touches, elapsedMs: Date.now() - startedAt }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
