/**
 * POST /api/classes/book
 *
 * Customer-facing endpoint for the two $0 child class booking kinds
 * (`member` and `trial` — one per child ever per org). Both are handled by
 * `createChildClassBooking` (src/lib/classes/book-child.ts), which does all
 * the real work — capacity, dedupe, age gate, waiver-on-file, membership/
 * credit/trial gates — inside one locked transaction.
 *
 * `kind: "member"` spends, in order: the child's monthly membership
 * allotment, then an already-purchased class credit (pack or block — see
 * src/lib/classes/credits.ts). So the returned `paymentMethod` is
 * `"member_allotment"`, `"pack_credit"` or `"trial"`; all three are $0 rows,
 * and the client should not treat `pack_credit` as a payment prompt.
 *
 * The 402 is reached ONLY when the child has an active membership whose
 * allotment is exhausted AND no redeemable credit: it returns
 * `memberRateCents` instead of a 4xx failure, and the client uses that
 * figure to route to the PAID make-up flow (`POST /api/dropin/bookings`
 * with `familyMemberId` set; see that endpoint's doc comment and the
 * webhook fulfillment core for how the paid child booking is threaded
 * through to the same `drop_in_bookings` row shape). A child with NO
 * membership and no redeemable credit still gets 403 `no_membership` —
 * there is no allotment to exhaust.
 *
 * Body: `{ sessionId, familyMemberId, kind: "member" | "trial", waiver?: { signedBy, consentText } }`
 *   — a supplied `waiver` is a FRESH signature and writes the canonical
 *     annual liability consent (src/lib/consents/liability.ts). This endpoint
 *     attaches the signing ip/user-agent from the request context; the body
 *     carries only what the human typed.
 * Returns: 200 `{ bookingId, paymentMethod }` |
 *          402 `{ error: "allotment_exhausted", memberRateCents }` |
 *          409 `{ error: "class_rate_not_configured" }` — the allotment IS
 *              exhausted but the session carries no class member rate, so
 *              there is nothing honest to quote (see class-rate.ts: the
 *              adult pickup rate card is NOT a fallback here) |
 *          409 `{ error: "technical_not_included" }` — the allotment has
 *              room, but the session is a technical slot and the
 *              membership's tier owes the technical supplement that this
 *              child hasn't paid for (no active technical enrollment on this
 *              membership — see requiresTechnicalPremium /
 *              hasActiveTechnicalEnrollment in book-child.ts). The seat is
 *              NOT granted from the allotment; a redeemable class credit
 *              (pack/block) still books normally regardless of this gate |
 *          4xx mapped from `ChildBookingError.code` (see ERROR_STATUS below).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import {
  createChildClassBooking,
  type ChildBookingKind,
  type ChildBookingError,
} from "@/lib/classes/book-child";
import { classRateNotConfigured } from "@/lib/classes/class-rate";
import { brandFromHost } from "@/lib/organization/soccerone-routing";

export const prerender = false;

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Maps every `ChildBookingError["code"]` EXCEPT `allotment_exhausted`
 * (handled specially, as a 402 with pricing) to its HTTP status. Kept as an
 * exhaustive-ish lookup rather than a switch so a newly added code falls
 * through to the 400 default instead of silently 500ing.
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
  trial_already_used: 409,
  // A member child asking for a trial — a state conflict (they already have
  // a membership), same class of error as trial_already_used.
  member_child_no_trial: 409,
  age_ineligible: 422,
  waiver_required: 422,
  // The allotment/credit gates are otherwise satisfied, but this is a
  // technical slot and the membership's tier owes the supplement — a state
  // conflict (409), distinct from allotment_exhausted so the client routes
  // to the membership add-on upsell rather than the paid make-up quote.
  technical_not_included: 409,
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization) return json({ error: "No organization context" }, 400);

  let body: {
    sessionId?: unknown;
    familyMemberId?: unknown;
    kind?: unknown;
    waiver?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  const familyMemberId =
    typeof body.familyMemberId === "string" ? body.familyMemberId : null;
  const kind: ChildBookingKind | null =
    body.kind === "member" || body.kind === "trial" ? body.kind : null;

  if (!sessionId || !UUID_RX.test(sessionId)) {
    return json({ error: "sessionId is required" }, 422);
  }
  if (!familyMemberId || !UUID_RX.test(familyMemberId)) {
    return json({ error: "familyMemberId is required" }, 422);
  }
  if (!kind) {
    return json({ error: 'kind must be "member" or "trial"' }, 422);
  }

  let waiver:
    | { signedBy: string; consentText: string; ipAddress: string | null; userAgent: string | null }
    | undefined;
  if (body.waiver !== undefined) {
    const w = body.waiver as { signedBy?: unknown; consentText?: unknown } | null;
    const signedBy = typeof w?.signedBy === "string" ? w.signedBy.trim() : "";
    const consentText = typeof w?.consentText === "string" ? w.consentText.trim() : "";
    if (!signedBy || !consentText) {
      return json({ error: "waiver.signedBy and waiver.consentText are required when waiver is provided" }, 422);
    }
    // Signing audit trail, taken from the REQUEST CONTEXT — never from the
    // body, which the client controls. A fresh signature here writes the
    // canonical annual consents row (see book-child.ts), and once the legacy
    // signature fallbacks age out that row is the only record the signature
    // ever had; every other consent-writing surface in the platform captures
    // ip/UA, so this one does too. Both `?? null` rather than "unknown": the
    // column is nullable and an honest NULL beats a fake value.
    waiver = {
      signedBy,
      consentText,
      ipAddress: clientAddress ?? null,
      userAgent: request.headers.get("user-agent"),
    };
  }

  const db = getDb();

  // Tenant guard — `createChildClassBooking` has no org scoping of its own
  // (it trusts the caller), so a session id from another org must be
  // rejected here before it ever reaches the booking library. Reuses this
  // same row for the allotment_exhausted price quote below, so it's not a
  // wasted lookup even on the happy path.
  const [session] = await db
    .select({
      organizationId: dropInSessions.organizationId,
      memberRateCents: dropInSessions.memberRateCents,
    })
    .from(dropInSessions)
    .where(eq(dropInSessions.id, sessionId))
    .limit(1);
  if (!session || session.organizationId !== locals.organization.id) {
    // Never leak whether the id exists in some other tenant.
    return json({ error: "session_not_found", message: "Session not found" }, 404);
  }

  const result = await createChildClassBooking({
    sessionId,
    parentUserId: locals.user.id,
    familyMemberId,
    kind,
    waiver,
    brand: brandFromHost(request.headers.get("host") ?? ""),
  });

  if (!result.ok) {
    const { code, message } = result.error;

    if (code === "allotment_exhausted") {
      // Session rates originate on the class-slot template and are copied
      // onto each materialized session by the cron (see
      // src/lib/classes/materialize.ts), so this is a CLASS price. There is
      // deliberately NO drop_in_rate_card fallback: that card is the ADULT
      // PICKUP price list, and quoting it here would hand a parent an adult
      // drop-in price for their kid's make-up class. A session whose
      // template left the rate unset (or a hand-made one-off class session)
      // is a config error — 409 with ops visibility, not a made-up quote.
      // Reaching this branch means the session is `kind: "class"`:
      // createChildClassBooking rejects anything else with `session_not_class`.
      if (session.memberRateCents === null) {
        return classRateNotConfigured(
          { id: sessionId, organizationId: session.organizationId },
          "member",
          { component: "api/classes/book" },
        );
      }
      return json(
        { error: "allotment_exhausted", memberRateCents: session.memberRateCents },
        402,
      );
    }

    return json({ error: code, message }, ERROR_STATUS[code] ?? 400);
  }

  return json({ bookingId: result.bookingId, paymentMethod: result.paymentMethod }, 200);
};
