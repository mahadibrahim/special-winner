import type { APIRoute } from "astro";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { organizations } from "@/lib/db/schema/organizations";
import { isConsentStale } from "@/lib/consents/marketing";
import { sendSms } from "@/lib/sms/send";
import { captureServerException } from "@/lib/observability/server-error";

/**
 * POST /api/cron/flush-parked-consents
 *
 * Half-hourly. The whole consent feature is built so intent SURVIVES a channel
 * that cannot deliver yet: a tick at the lobby kiosk is captured as a `pending`
 * phone_opt_ins row while SMS is dormant (10DLC under carrier review) or
 * WhatsApp has no WABA. This cron wakes that backlog — for each parked row it
 * sends the confirmation that PROMPTS the verified act (the customer's reply /
 * OTP), which is what promotes the row to `opted_in`. It never flips a row to
 * `opted_in` itself — see promotePendingPhoneConsents; that path is not bypassed.
 *
 * Each `pending` row resolves to exactly one outcome:
 *
 *   sent              — fresh (within CONSENT_STALE_AFTER_DAYS) and the channel
 *                       is awake: the confirmation goes out, naming when and
 *                       where they opted in.
 *   reconfirmRequired — FAILURE MODE A. A consent ticked in July and flushed in
 *                       October is exactly what gets a sender flagged. Past the
 *                       staleness window we must NOT send — it needs a fresh
 *                       re-confirmation, so the row is counted and left untouched
 *                       (`pending` is the only status sendSms refuses to send to,
 *                       so it is the safe resting state — a stale row is never
 *                       messaged by this cron or any other path).
 *   stillDormant      — FAILURE MODE B. The channel is still asleep. A dormant
 *                       channel must NEVER destroy consent, so the row stays
 *                       parked and is retried next run. Two sources: WhatsApp,
 *                       which cannot deliver at all yet (never even attempted),
 *                       and an SMS send that comes back reason "channel_dormant".
 *
 * Auth: x-cron-secret header matching CRON_SECRET, exactly as
 * send-welcome-series.ts. Optional `?organizationId=` scopes the scan to one org
 * (an operator affordance to re-flush a single tenant, and how the API test
 * isolates its assertions on the shared DB); the Netlify scheduler passes none
 * and scans every org.
 */
export const prerender = false;

const CONFIRM_SUFFIX = "Reply STOP to opt out.";

export const POST: APIRoute = async ({ request, url }) => {
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
  const orgFilter = url.searchParams.get("organizationId");

  // Every parked intent, oldest first. The orderBy is not cosmetic: this scans
  // pending rows across ALL orgs, and a deterministic order keeps the run
  // reproducible on the shared CI/staging DB (multi-tenant hazard).
  const rows = await db
    .select({
      id: phoneOptIns.id,
      phone: phoneOptIns.phone,
      channel: phoneOptIns.channel,
      organizationId: phoneOptIns.organizationId,
      optedInAt: phoneOptIns.optedInAt,
      createdAt: phoneOptIns.createdAt,
      facility: organizations.name,
    })
    .from(phoneOptIns)
    .innerJoin(organizations, eq(organizations.id, phoneOptIns.organizationId))
    .where(
      and(
        eq(phoneOptIns.status, "pending"),
        orgFilter ? eq(phoneOptIns.organizationId, orgFilter) : undefined,
      ),
    )
    .orderBy(asc(phoneOptIns.createdAt));

  let sent = 0;
  let reconfirmRequired = 0;
  let stillDormant = 0;
  let errored = 0;

  for (const row of rows) {
    // WhatsApp cannot deliver at all yet (no WABA/templates) — never attempt a
    // send, just keep the consent parked. Only SMS can be woken today.
    if (row.channel !== "sms") {
      stillDormant += 1;
      continue;
    }

    // The capture moment is the staleness anchor: a pending row has no optedInAt
    // (that timestamp is stamped by the verified act), so createdAt is when the
    // intent was ticked — and the date the confirmation names.
    const anchor = row.optedInAt ?? row.createdAt;
    if (isConsentStale(anchor, now)) {
      reconfirmRequired += 1;
      continue;
    }

    try {
      const when = anchor.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
      // bypassOptInCheck: this is the first-contact confirmation for a row that
      // is (by definition) still `pending`, so the opt-in gate would otherwise
      // refuse it. The message is transactional confirmation, not a marketing
      // blast, and it names when + where they opted in so a newly-live channel's
      // first message is never a context-free cold text.
      const result = await sendSms({
        to: row.phone,
        organizationId: row.organizationId,
        body: `You signed up at ${row.facility} on ${when}. ${CONFIRM_SUFFIX}`,
        bypassOptInCheck: true,
      });

      if (result.ok) {
        sent += 1;
      } else if (result.reason === "channel_dormant") {
        // The channel is still asleep — keep the consent parked, try again next
        // run. NEVER treat this as a failure that discards the intent.
        stillDormant += 1;
      } else {
        errored += 1;
      }
    } catch (err) {
      console.error(`[cron] flush-parked-consents failed for opt-in ${row.id}:`, err);
      void captureServerException(err, {
        component: "cron/flush-parked-consents",
        metadata: { optInId: row.id, phase: "send" },
      });
      errored += 1;
    }
  }

  const elapsedMs = Date.now() - startedAt;
  console.info(
    `[cron] Flush parked consents: ${rows.length} scanned, ${sent} sent, ` +
      `${reconfirmRequired} reconfirmRequired, ${stillDormant} stillDormant, ` +
      `${errored} errored in ${elapsedMs}ms`,
  );

  return new Response(
    JSON.stringify({
      success: true,
      scanned: rows.length,
      sent,
      reconfirmRequired,
      stillDormant,
      errored,
      elapsedMs,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

// GET — human-debug status page; sends nothing.
export const GET: APIRoute = async () =>
  new Response(
    JSON.stringify({
      description: "Flush-parked-consents cron endpoint",
      usage:
        "POST with header x-cron-secret to flush parked (pending) phone consents " +
        "whose channel has woken. Scheduled callers only.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
