/**
 * Class pricing guard — a `kind='class'` session is NEVER priced off the
 * org's `drop_in_rate_card`.
 *
 * Class rates originate on the class-slot template and are copied onto every
 * materialized session by the cron (`sessionRateCents` / `memberRateCents`,
 * see src/lib/classes/materialize.ts). When they're null — a template that
 * left them unset, or a hand-made one-off class session — the paid class
 * paths used to fall back to `drop_in_rate_card.default*RateCents`. That card
 * is the ADULT PICKUP price list: falling back to it quotes a parent an adult
 * drop-in price for their kid's class, invented by nobody, and (on the paid
 * make-up path) actually charges it. A missing class rate is a configuration
 * error, so fail loud instead:
 *
 *   409 { error: "class_rate_not_configured", message: <human copy> }
 *
 * plus server-side visibility (`console.error` + `captureServerException`,
 * the same shape materialize.ts uses for its own config/ops failures) so a
 * half-configured template surfaces in PostHog rather than only as a customer
 * complaint.
 *
 * Scope: CLASS sessions only. Pickup sessions keep the rate-card fallback
 * exactly as before — that card IS their price list. Call sites must
 * therefore have established `session.kind === 'class'` before calling in;
 * every current caller does (see their comments):
 *
 *   - POST /api/classes/book                       (409)
 *   - POST /api/dropin/bookings                    (409)
 *   - POST /api/kiosk/[locationSlug]/walkin/start  (409)
 *   - POST /api/kiosk/[locationSlug]/walkin/payment(409)
 *   - POST /api/dropin/claim/[token]               (409, "pay" action only)
 *   - GET  /api/dropin/sessions/[id]               (report only — the quote
 *                                                   fields are omitted)
 *   - GET  /api/kiosk/[locationSlug]/sessions      (report only — the
 *                                                   session is dropped from
 *                                                   the listing)
 *   - lib/self-serve/build-context                 (report only — the
 *                                                   payment card is withdrawn)
 */
import { captureServerException } from "@/lib/observability/server-error";

/** Machine-readable error code clients branch on. */
export const CLASS_RATE_NOT_CONFIGURED = "class_rate_not_configured";

/** Customer-facing copy — a config error they can't fix themselves. */
export const CLASS_RATE_NOT_CONFIGURED_MESSAGE =
  "This class is missing its pricing — contact the front desk";

/**
 * Which class rate the caller needed:
 * - `member`  — the discounted rate for a child with an active membership
 *               (the make-up quote, and the paid make-up charge).
 * - `session` — the plain public class rate (no active child membership).
 */
export type ClassRateNeed = "member" | "session";

/**
 * Records the config error server-side (console + PostHog) and returns the
 * error BODY, without committing to an HTTP response. Use this from callers
 * that don't return a `Response` — the self-serve context builder returns a
 * typed result object, and the kiosk session listing merely DROPS the
 * unpriced session from what it shows (there is no request to fail), but
 * both want the same ops visibility as the endpoints that 409.
 *
 * `classRateNotConfigured` below is the Response-returning wrapper; one
 * implementation, one log line shape, whichever door the config error is
 * noticed at.
 */
export function reportClassRateNotConfigured(
  session: { id: string; organizationId: string },
  need: ClassRateNeed,
  ctx: { component: string },
): { error: string; message: string } {
  const detail = `class session ${session.id} has no ${need} rate configured — refusing to quote the org drop_in_rate_card (adult pickup pricing)`;
  console.error(`[classes] ${detail}`);
  void captureServerException(new Error(detail), {
    component: ctx.component,
    metadata: {
      phase: "class-rate-guard",
      sessionId: session.id,
      organizationId: session.organizationId,
      need,
    },
  });

  return {
    error: CLASS_RATE_NOT_CONFIGURED,
    message: CLASS_RATE_NOT_CONFIGURED_MESSAGE,
  };
}

/**
 * Builds the 409 response for a class session missing the rate the caller
 * needed, and records the config error server-side. Callers `return` it
 * directly:
 *
 * ```ts
 * if (session.memberRateCents === null) {
 *   return classRateNotConfigured(session, "member", { component: "api/classes/book" });
 * }
 * // TypeScript has narrowed memberRateCents to `number` past this point.
 * ```
 *
 * `component` follows the `api/<route-segment>` convention documented in
 * src/lib/observability/server-error.ts.
 */
export function classRateNotConfigured(
  session: { id: string; organizationId: string },
  need: ClassRateNeed,
  ctx: { component: string },
): Response {
  return new Response(JSON.stringify(reportClassRateNotConfigured(session, need, ctx)), {
    status: 409,
    headers: { "Content-Type": "application/json" },
  });
}
