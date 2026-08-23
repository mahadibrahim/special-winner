/**
 * POST /api/classes/book
 *
 * Customer-facing endpoint for the two $0 child class booking kinds
 * (`member` — draws from the child's monthly class allotment, and `trial`
 * — one per child ever per org). Both are handled by
 * `createChildClassBooking` (src/lib/classes/book-child.ts), which does all
 * the real work — capacity, dedupe, age gate, waiver-on-file, membership/
 * trial gates — inside one locked transaction.
 *
 * When `kind: "member"` and the child's monthly allotment is exhausted, this
 * returns 402 with `memberRateCents` instead of a 4xx failure — the client
 * uses that figure to route to the PAID make-up flow
 * (`POST /api/dropin/bookings` with `familyMemberId` set; see that
 * endpoint's doc comment and the webhook fulfillment core for how the paid
 * child booking is threaded through to the same `drop_in_bookings` row
 * shape).
 *
 * Body: `{ sessionId, familyMemberId, kind: "member" | "trial", waiver?: { signedBy, consentText } }`
 * Returns: 200 `{ bookingId, paymentMethod }` |
 *          402 `{ error: "allotment_exhausted", memberRateCents }` |
 *          4xx mapped from `ChildBookingError.code` (see ERROR_STATUS below).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInRateCard } from "@/lib/db/schema/drop-in";
import {
  createChildClassBooking,
  type ChildBookingKind,
  type ChildBookingError,
} from "@/lib/classes/book-child";
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
};

export const POST: APIRoute = async ({ request, locals }) => {
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

  let waiver: { signedBy: string; consentText: string } | undefined;
  if (body.waiver !== undefined) {
    const w = body.waiver as { signedBy?: unknown; consentText?: unknown } | null;
    const signedBy = typeof w?.signedBy === "string" ? w.signedBy.trim() : "";
    const consentText = typeof w?.consentText === "string" ? w.consentText.trim() : "";
    if (!signedBy || !consentText) {
      return json({ error: "waiver.signedBy and waiver.consentText are required when waiver is provided" }, 422);
    }
    waiver = { signedBy, consentText };
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
      // src/lib/classes/materialize.ts), so this is a CLASS price. The
      // drop_in_rate_card fallback below is the ADULT PICKUP card and now
      // only fires for a session whose template left the rate unset (or a
      // hand-made one-off class session) — keep it as a last resort so a
      // half-configured org still quotes something rather than 0.
      let memberRateCents = session.memberRateCents;
      if (memberRateCents === null) {
        const [rateCard] = await db
          .select({ defaultMemberRateCents: dropInRateCard.defaultMemberRateCents })
          .from(dropInRateCard)
          .where(eq(dropInRateCard.organizationId, session.organizationId))
          .limit(1);
        memberRateCents = rateCard?.defaultMemberRateCents ?? 0;
      }
      return json({ error: "allotment_exhausted", memberRateCents }, 402);
    }

    return json({ error: code, message }, ERROR_STATUS[code] ?? 400);
  }

  return json({ bookingId: result.bookingId, paymentMethod: result.paymentMethod }, 200);
};
