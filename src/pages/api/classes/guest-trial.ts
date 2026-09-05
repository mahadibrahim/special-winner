/**
 * POST /api/classes/guest-trial
 *
 * Signed-OUT front door for the youth free-trial modal (owner decision
 * 2026-09-05, spec: docs/superpowers/specs/2026-09-05-guest-trial-flow.md).
 * Composes the existing guest primitives; all booking gates (age, capacity,
 * one-trial-ever incl. the cross-account kid dedupe) live in
 * createChildClassBooking and are NOT duplicated here.
 *
 * Existing-email rule: an email that already has an account gets a sign-in
 * link EMAILED and NO booking — child PII is never written to an account
 * the requester hasn't proven they control. The 200 { existing_account }
 * response is an accepted, rate-limit-bounded account-existence oracle
 * (same trade the registrations guest checkout makes).
 *
 * Waiver is REQUIRED in the body: a guest by definition has no waiver on
 * file, so the attempt→422→sign round trip would be pure latency.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, userRoles, consents } from "@/lib/db/schema";
import { familyMembers } from "@/lib/db/schema/registrations";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { createChildClassBooking, type ChildBookingError } from "@/lib/classes/book-child";
import { upsertGuestUser } from "@/lib/registrations/upsert-guest-user";
import { resolvePerson } from "@/lib/registrations/resolve-person";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth";
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";
import { sendMagicLinkLoginEmail } from "@/lib/email/send";
import { awaitEmailSend } from "@/lib/notifications/await-dispatch";
import { recordConsent, hasActiveConsent } from "@/lib/consents/record";
import { brandFromHost } from "@/lib/organization/soccerone-routing";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Total map, not partial: every `ChildBookingError["code"]` EXCEPT
 * `allotment_exhausted` (a `kind: "member"`-only error that can never be
 * returned for this endpoint's `kind: "trial"` booking — handled by the
 * explicit branch below instead of a lookup default) must appear here, so a
 * newly added code fails the TS build instead of silently falling back to
 * 400. Mirrors `/api/classes/book`'s `ERROR_STATUS` exactly, including codes
 * (`no_membership`, `technical_not_included`) that this endpoint's `trial`
 * kind can't actually trigger — completeness over cleverness.
 */
const ERROR_STATUS: Record<Exclude<ChildBookingError["code"], "allotment_exhausted">, number> = {
  session_not_found: 404,
  session_not_class: 400,
  session_not_scheduled: 400,
  session_started: 400,
  session_full: 409,
  child_not_found: 404,
  already_booked: 409,
  no_membership: 403,
  technical_not_included: 409,
  trial_already_used: 409,
  member_child_no_trial: 409,
  age_ineligible: 422,
  waiver_required: 422,
};

/**
 * Best-effort compensating cleanup for a NEW guest whose trial booking
 * failed (session_full, age_ineligible, etc). Without this, the freshly
 * created user+kid rows would strand: `cleanup-unverified-users.ts` never
 * collects them because `upsertGuestUser` always grants the `parent` role,
 * and that sweeper's `NOT EXISTS user_roles` guard skips any account with a
 * role assignment (see cleanup-unverified-users.ts:56-58) — the "kiosk
 * walk-in tolerance" this endpoint originally cited only applies to a
 * successful booking's rows, not a failed one's. Without cleanup, a parent
 * who hits `session_full`/`age_ineligible` and resubmits with the SAME email
 * would hit the `!wasNewUser` branch and get `existing_account` (a sign-in
 * email, no booking) instead of a real retry.
 *
 * Deletes, in FK-safe order: the child's consent rows, the family_members
 * row, the user's user_roles rows, then the user row itself. This order is
 * not just tidiness — `consents.signed_by_user_id` is `ON DELETE RESTRICT`,
 * so a consent row signed by this user would block the final `users` delete
 * if it weren't removed first; the `family_members` row's cascades would
 * otherwise cover everything else. Wrapped in try/catch — a cleanup failure
 * logs and falls through to stranding the account rather than 500ing the
 * response the parent is waiting on.
 *
 * `familyMemberId` is optional: the new-user path's outer try/catch (see
 * its call site) can throw before `resolvePerson` ever returns a child row,
 * in which case there's nothing to delete there — skip straight to the
 * user/role cleanup rather than passing a bogus id into a uuid column
 * (which would itself throw and abort the whole sequence before the user
 * row got deleted).
 *
 * Race tolerance (accepted): a concurrent duplicate submit that reads
 * `wasNewUser: false` between our create and this delete will go on to email
 * a sign-in link to a user we're about to delete — the email send just fails
 * (already best-effort/caught at that call site). Narrow window, no PII
 * exposure, not worth serializing over.
 */
async function cleanupFailedGuestSignup(
  db: ReturnType<typeof getDb>,
  params: { userId: string; familyMemberId?: string },
): Promise<void> {
  try {
    if (params.familyMemberId) {
      await db.delete(consents).where(eq(consents.familyMemberId, params.familyMemberId));
      await db.delete(familyMembers).where(eq(familyMembers.id, params.familyMemberId));
    }
    await db.delete(userRoles).where(eq(userRoles.userId, params.userId));
    await db.delete(users).where(eq(users.id, params.userId));
  } catch (err) {
    console.error("[guest-trial] compensating cleanup failed:", err);
  }
}

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  turnstileToken: z.string().max(4096).optional().default(""),
  parent: z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().max(255),
  }),
  child: z.object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  // COPPA: the separate affirmative parental consent for collecting this
  // child's PII. literal(true) — absence or false is a 422, same contract
  // as POST /api/family-members.
  parentalConsent: z.literal(true),
  waiver: z.object({
    signedBy: z.string().trim().min(1).max(200),
    consentText: z.string().trim().min(1),
  }),
});

export const POST: APIRoute = async (context) => {
  const { request, locals, clientAddress, url } = context;
  if (!locals.organization) return json({ error: "No organization context" }, 400);

  const ip = clientAddress || "unknown";
  const burst = rateLimit(`guest-trial:${ip}`, 5, 60_000);
  if (!burst.allowed) return rateLimitedResponse(burst.retryAfter ?? 60);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "invalid_body", details: parsed.error.flatten() }, 422);
  }
  const body = parsed.data;

  const turnstileOk = await verifyTurnstile(body.turnstileToken, {
    secret:
      process.env.TURNSTILE_SECRET_KEY ??
      (import.meta.env.TURNSTILE_SECRET_KEY as string | undefined),
    isProd: Boolean(import.meta.env.PROD),
  });
  if (!turnstileOk) return json({ error: "turnstile_failed" }, 403);

  const db = getDb();

  // Tenant guard, mirroring /api/classes/book: never leak cross-tenant ids.
  // classSlotTemplateId feeds the existing-account magic link's redirect so
  // the parent lands back on the exact class they tried to book.
  const [session] = await db
    .select({
      organizationId: dropInSessions.organizationId,
      classSlotTemplateId: dropInSessions.classSlotTemplateId,
    })
    .from(dropInSessions)
    .where(eq(dropInSessions.id, body.sessionId))
    .limit(1);
  if (!session || session.organizationId !== locals.organization.id) {
    return json({ error: "session_not_found", message: "Session not found" }, 404);
  }

  // Daily cap (owner decision): bounds repeat-trial farming from one
  // connection without ever bothering a normal family. Deliberately checked
  // here — AFTER the body validates and Turnstile passes, not up front with
  // the burst check — so a handful of empty/malformed or bot-flagged POSTs
  // (422 invalid_body, 403 turnstile_failed) can't burn a shared IP's
  // (CGNAT, school network) daily quota before anyone attempts a real
  // booking.
  const daily = rateLimit(`guest-trial-day:${ip}`, 3, 24 * 3_600_000);
  if (!daily.allowed) {
    // Controller ruling: the daily cap stays at 3/day, but its 429 must be
    // distinguishable from the burst-limit 429 above — otherwise the client
    // shows "try again in a few minutes" for what's actually a 24-hour wait.
    // `scope: "day"` lets trial-booking.tsx branch its copy; the burst
    // branch above is untouched and keeps using rateLimitedResponse.
    const retryAfter = daily.retryAfter ?? 3600;
    return new Response(
      JSON.stringify({ error: "rate_limited", scope: "day", retryAfter }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfter),
        },
      },
    );
  }

  const brand = brandFromHost(request.headers.get("host") ?? "");
  const { userRow, wasNewUser } = await upsertGuestUser(db, {
    email: body.parent.email,
    firstName: body.parent.firstName,
    lastName: body.parent.lastName,
  });

  if (!wasNewUser) {
    // Owner decision: existing account => email a sign-in link, never book.
    // Best-effort + per-user rate-limited, the already-registered nudge
    // pattern from registrations/guest-checkout.ts.
    const gate = rateLimit(`guest-trial-existing:${userRow.id}`, 1, 10 * 60_000);
    if (gate.allowed) {
      try {
        const redirectTo = session.classSlotTemplateId
          ? `/youth/classes?trial=${session.classSlotTemplateId}#schedule`
          : "/youth/classes#schedule";
        const link = await createMagicLink({
          userId: userRow.id,
          purpose: "login",
          purposeContext: { redirectTo },
          deliveredChannel: "email",
          deliveredTo: userRow.email,
        });
        await awaitEmailSend("guest-trial existing-account link", () =>
          sendMagicLinkLoginEmail({
            userId: userRow.id,
            parentEmail: userRow.email,
            parentName: userRow.firstName || userRow.email.split("@")[0],
            magicLinkUrl: buildMagicLinkUrl(link.token, { origin: url.origin }),
            expiresIn: "15 minutes",
            brand,
            variant: "existing",
          }),
        );
      } catch (err) {
        console.error("[guest-trial] existing-account link failed:", err);
      }
    }
    return json({ status: "existing_account" }, 200);
  }

  // New account: create the kid, stamp COPPA consent, book. ONLY resolvePerson
  // through determining the booking result (both the `!result.ok` branch and
  // the success assignment below) are guarded by this try/catch — a throw
  // ANYWHERE in that narrower range (resolvePerson, the COPPA update,
  // recordConsent, createChildClassBooking itself) would otherwise strand
  // the freshly created user+kid rows forever (the sweeper skips users with
  // a role assignment; see cleanupFailedGuestSignup's doc comment), and
  // every later submit from this email would wrongly hit the `!wasNewUser`
  // → existing_account branch instead of retrying. The `!result.ok` branch
  // below already runs cleanup and RETURNS (it never throws), so it can't
  // double-run cleanup through this catch.
  //
  // Deliberately NOT guarded: createSession and the welcome-email block,
  // both moved below this try/catch. A booking row is committed the moment
  // `result.ok` is true — a later failure (e.g. createSession's cookie/DB
  // write) must NOT roll that back. The bug this fixes (found in re-review):
  // createSession used to sit inside this try, so a transient session-layer
  // failure AFTER the booking committed fell into the catch, which ran
  // cleanupFailedGuestSignup with the real childId — deleting the COPPA
  // consent + family_members rows out from under a REAL booking (the
  // booking survives orphaned via `drop_in_bookings.familyMemberId`'s
  // set-null), had the users delete bounce off `drop_in_bookings.userId`'s
  // RESTRICT leaving a roleless user, and reported a 500 for a trial that
  // had actually booked.
  //
  // Tracked outside the try so the catch's cleanup can target the right
  // family_members row even if a later step (COPPA update, recordConsent,
  // createChildClassBooking) is what throws — undefined only if
  // resolvePerson itself never returned.
  let childId: string | undefined;
  let bookingSuccess: { bookingId: string; childFirstName: string } | undefined;
  try {
    const child = await resolvePerson(db, {
      kind: "dependent",
      parentUserId: userRow.id,
      firstName: body.child.firstName,
      lastName: body.child.lastName,
      birthDate: body.child.birthDate,
    });
    childId = child.id;

    // COPPA audit trail: the checkbox was the affirmative act; stamp who/
    // when/where. First flow to write these columns — deliberate (spec).
    await db
      .update(familyMembers)
      .set({
        parentalConsentGivenAt: new Date(),
        parentalConsentGivenBy: userRow.id,
        parentalConsentIp: clientAddress ?? null,
      })
      .where(eq(familyMembers.id, child.id));
    if (!(await hasActiveConsent(db, child.id, "parental"))) {
      await recordConsent({
        db,
        familyMemberId: child.id,
        organizationId: locals.organization.id,
        type: "parental",
        signedByUserId: userRow.id,
        signedByName: body.waiver.signedBy,
        ipAddress: clientAddress ?? null,
        userAgent: request.headers.get("user-agent"),
      });
    }

    const result = await createChildClassBooking({
      sessionId: body.sessionId,
      parentUserId: userRow.id,
      familyMemberId: child.id,
      kind: "trial",
      waiver: {
        signedBy: body.waiver.signedBy,
        consentText: body.waiver.consentText,
        ipAddress: clientAddress ?? null,
        userAgent: request.headers.get("user-agent"),
      },
      brand,
    });

    if (!result.ok) {
      // Compensating cleanup (see cleanupFailedGuestSignup's doc comment): a
      // failed trial for a brand-new guest must not strand the user+kid rows,
      // or a resubmit with the same email would wrongly hit the
      // `!wasNewUser` → existing_account branch instead of retrying the
      // booking. This path RETURNS (does not throw), so the catch below
      // cannot also run cleanup for it.
      await cleanupFailedGuestSignup(db, { userId: userRow.id, familyMemberId: child.id });
      const { code, message } = result.error;
      if (code === "allotment_exhausted") {
        // `kind: "member"`-only error — this endpoint always books
        // `kind: "trial"`, so book-child.ts should never return this here.
        // Log loudly (would mean its kind-gating broke) rather than silently
        // mapping to a made-up status.
        console.error("[guest-trial] unexpected allotment_exhausted for a trial booking");
        return json({ error: code, message }, 409);
      }
      return json({ error: code, message }, ERROR_STATUS[code]);
    }

    // Booking committed. Stash what the post-try code needs and fall out of
    // the guarded region — see this block's opening comment on why
    // createSession/the welcome email must NOT be inside this try.
    bookingSuccess = { bookingId: result.bookingId, childFirstName: child.firstName };
  } catch (err) {
    // A throw anywhere above (resolvePerson/COPPA update/recordConsent/
    // createChildClassBooking) would otherwise strand this brand-new guest
    // account forever — see this block's opening comment. Best-effort
    // cleanup, then rethrow so Astro turns it into a 500 (the parent's
    // request genuinely failed; we must not report success).
    console.error("[guest-trial] new-guest path threw, cleaning up:", err);
    await cleanupFailedGuestSignup(db, { userId: userRow.id, familyMemberId: childId });
    throw err;
  }

  if (!bookingSuccess) {
    // Unreachable in practice: the try above either returns early
    // (`!result.ok`), throws (caught above and rethrown, so execution never
    // reaches here), or falls through only after assigning bookingSuccess.
    // This guard exists purely so TypeScript doesn't have to take that on
    // faith across the try/catch boundary.
    throw new Error("[guest-trial] unreachable: bookingSuccess unset after booking try/catch");
  }

  // New guest becomes a signed-in (1h until email-verified) parent — the
  // uniform wasNewUser-only session rule from the paid guest checkouts.
  // Deliberately OUTSIDE the guarded try/catch above: the booking already
  // committed, so a createSession failure here must not trigger compensating
  // cleanup (that would delete rows out from under a real booking — see the
  // opening comment). Best-effort: log and continue to the 200 response
  // either way — a booked trial with a failed cookie is still a success,
  // and the welcome magic-link email below is the recovery path for signing
  // in.
  try {
    await createSession(userRow.id, context);
  } catch (err) {
    console.error(
      "[guest-trial] createSession failed after a successful booking (non-fatal — welcome email is the recovery path):",
      err,
    );
  }

  try {
    const link = await createMagicLink({
      userId: userRow.id,
      purpose: "login",
      purposeContext: { redirectTo: "/dashboard" },
      deliveredChannel: "email",
      deliveredTo: userRow.email,
    });
    await awaitEmailSend("guest-trial welcome link", () =>
      sendMagicLinkLoginEmail({
        userId: userRow.id,
        parentEmail: userRow.email,
        parentName: userRow.firstName || userRow.email.split("@")[0],
        magicLinkUrl: buildMagicLinkUrl(link.token, { origin: url.origin }),
        childName: bookingSuccess.childFirstName,
        brand,
        variant: "welcome",
      }),
    );
  } catch (err) {
    console.error("[guest-trial] welcome link failed:", err);
  }

  return json({ status: "booked", bookingId: bookingSuccess.bookingId }, 200);
};
