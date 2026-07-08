/**
 * GET/POST /api/staff/location-consent
 *
 * The mandatory, versioned employment-condition acknowledgement gating the
 * first clock-in/check-in (owner decision #1, 2026-07-07 — see
 * docs/superpowers/plans/2026-07-07-time-tracking.md). GET reflects the
 * caller's current status; POST records (or re-confirms) acknowledgement of
 * the CURRENT notice version.
 *
 * Deliberately NOT gated by `requireStaffAccess` (which admits only
 * super_admin/location_admin/coach) — referees clock in with location
 * capture too (POST /api/referee/matches/[gameId]/check-in, Task 12) and go
 * through this same consent gate, so any authenticated user with a
 * resolved organization context can read/ack here. The actual authority
 * check for whether someone may clock in at all still lives at the
 * clock-in/check-in endpoints themselves (deriveLaborRole /
 * requireAssignedOfficial) — acknowledging this notice on its own grants no
 * access.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { requireOrganizationContext } from "@/lib/auth";
import {
  CURRENT_LOCATION_CONSENT_VERSION,
  LOCATION_CONSENT_NOTICE_BODY,
  LOCATION_CONSENT_NOTICE_TITLE,
  acknowledgeLocationConsent,
  getLocationConsentStatus,
} from "@/lib/time-tracking/consent";

export const prerender = false;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const ackSchema = z.object({ acknowledged: z.literal(true) });

export const GET: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ error: "Unauthorized" }, 401);

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const status = await getLocationConsentStatus(user.id, orgContext.organizationId);

  return json({
    currentVersion: CURRENT_LOCATION_CONSENT_VERSION,
    noticeTitle: LOCATION_CONSENT_NOTICE_TITLE,
    noticeBody: LOCATION_CONSENT_NOTICE_BODY,
    ...status,
  });
};

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ error: "Unauthorized" }, 401);

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = ackSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Must acknowledge the notice: { acknowledged: true }", issues: parsed.error.issues },
      400,
    );
  }

  // Idempotent upsert — client-supplied version is never trusted, the
  // server always stamps CURRENT_LOCATION_CONSENT_VERSION.
  const status = await acknowledgeLocationConsent(user.id, orgContext.organizationId);

  return json({ currentVersion: CURRENT_LOCATION_CONSENT_VERSION, ...status });
};
