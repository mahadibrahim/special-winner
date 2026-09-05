/**
 * GET /api/coach/classes
 *
 * Task 5 of the 2026-09-05-coach-classes-phase01 plan: "My classes" listing
 * for the coach portal. Thin wrapper over `getCoachGroups` (Task 2) — every
 * class-slot template the signed-in coach is staffed on, either as a
 * standing `class_template` lead/assistant or as a one-off `class_session`
 * substitute (`sessionOnly: true`).
 *
 * Auth mirrors the other coach-portal listing endpoints (e.g.
 * `/api/coach/sessions`'s POST): `requireCoachPortalAccess` — 401 with no
 * session, 403 for a caller with neither the `coach` role nor any team
 * assignment (parents/players never pass), otherwise resolves the request's
 * organization for scoping.
 */
import type { APIRoute } from "astro";
import { requireCoachPortalAccess } from "@/lib/auth/roles";
import { getCoachGroups } from "@/lib/coach/get-coach-groups";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async (context) => {
  const auth = await requireCoachPortalAccess(context);
  if (!auth.authorized) return auth.response;

  const { classGroups } = await getCoachGroups(auth.user.id, auth.organizationId);
  return json({ classGroups }, 200);
};
