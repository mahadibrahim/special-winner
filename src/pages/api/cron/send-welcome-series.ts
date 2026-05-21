import type { APIRoute } from "astro";
import { and, eq, inArray, isNull, isNotNull, gte, exists, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, registrations, emailLogs } from "@/lib/db/schema";
import { sendWelcomeSeriesEmail } from "@/lib/email/send";
import {
  WELCOME_SERIES_STEPS,
  WELCOME_SERIES_WINDOW_DAYS,
  dueWelcomeSeriesSteps,
} from "@/lib/marketing/welcome-series";

/**
 * POST /api/cron/send-welcome-series
 *
 * Daily. Two passes: (1) enroll any user who has a confirmed registration and
 * no welcome_series_enrolled_at; (2) for each enrolled, non-opted-out user
 * still inside the drip window, send any step now due. Idempotent — steps are
 * gated on email_logs. Auth: x-cron-secret header matching CRON_SECRET.
 */
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");
  if (secret) {
    if (provided !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else if (import.meta.env.PROD) {
    console.error("[cron] CRON_SECRET not configured in production. Refusing.");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();
  const db = getDb();
  const now = new Date();

  // Pass 1 — enroll. Stamp users with a confirmed registration and no
  // enrollment yet.
  const enrolledRows = await db
    .update(users)
    .set({ welcomeSeriesEnrolledAt: now, updatedAt: now })
    .where(
      and(
        isNull(users.welcomeSeriesEnrolledAt),
        exists(
          db
            .select({ one: sql`1` })
            .from(registrations)
            .where(
              and(
                eq(registrations.registeredByUserId, users.id),
                eq(registrations.status, "confirmed"),
              ),
            ),
        ),
      ),
    )
    .returning({ id: users.id });
  const enrolled = enrolledRows.length;

  // Pass 2 — drip. Candidates: enrolled, not opted out, within the window.
  const windowStart = new Date(
    now.getTime() - WELCOME_SERIES_WINDOW_DAYS * 86_400_000,
  );
  const candidates = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      enrolledAt: users.welcomeSeriesEnrolledAt,
      optedOutAt: users.marketingOptedOutAt,
    })
    .from(users)
    .where(
      and(
        isNotNull(users.welcomeSeriesEnrolledAt),
        isNull(users.marketingOptedOutAt),
        gte(users.welcomeSeriesEnrolledAt, windowStart),
      ),
    );

  let sent = 0;
  let errored = 0;

  for (const u of candidates) {
    let due: ReturnType<typeof dueWelcomeSeriesSteps>;
    try {
      // A welcome-series step is logged once it is attempted (success OR
      // failure); a failed send is not retried — one attempt per step, same
      // as the other transactional crons. The drip is otherwise idempotent.
      const logs = await db
        .select({ emailType: emailLogs.emailType })
        .from(emailLogs)
        .where(
          and(
            eq(emailLogs.userId, u.id),
            inArray(
              emailLogs.emailType,
              WELCOME_SERIES_STEPS.map((s) => s.emailType),
            ),
          ),
        );
      const sentTypes = new Set(logs.map((l) => l.emailType));

      due = dueWelcomeSeriesSteps({
        enrolledAt: u.enrolledAt!,
        optedOutAt: u.optedOutAt,
        sentEmailTypes: sentTypes,
        now,
      });
    } catch (err) {
      console.error(`[cron] welcome-series failed for user ${u.id}:`, err);
      errored += 1;
      continue;
    }

    for (const step of due) {
      try {
        const result = await sendWelcomeSeriesEmail({
          userId: u.id,
          step: step.step,
          recipientEmail: u.email,
          recipientName: u.firstName || u.email.split("@")[0],
        });
        if (result.success) sent += 1;
        else errored += 1;
      } catch (err) {
        console.error(`[cron] welcome-series step ${step.step} failed for user ${u.id}:`, err);
        errored += 1;
      }
    }
  }

  const elapsedMs = Date.now() - startedAt;
  console.info(
    `[cron] Welcome series: ${enrolled} enrolled, ${sent} sent, ${errored} errored in ${elapsedMs}ms`,
  );

  return new Response(
    JSON.stringify({ success: true, enrolled, sent, errored, elapsedMs }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

// GET — human-debug status page; sends nothing.
export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify({
      description: "Welcome-series cron endpoint",
      steps: WELCOME_SERIES_STEPS,
      usage: "POST with header x-cron-secret to enroll + drip. Scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
