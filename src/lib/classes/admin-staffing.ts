/**
 * Shared support for the Task 3 (2026-09-05-coach-classes-phase01) admin
 * staffing endpoints — `templates/:id/coaches.ts` and
 * `sessions/:id/coaches.ts`: the wire-format body schemas, coach-candidacy
 * validation, and typed-error → JSON-response mapping for `setCoachesFor`'s
 * thrown errors (see src/lib/coach/coaching-assignments.ts).
 */
import { z } from "zod";
import { isOrgCoachingStaff } from "@/lib/auth/roles";
import {
  AssignmentTargetOrgMismatchError,
  TooManyAssistantCoachesError,
} from "@/lib/coach/coaching-assignments";

/** `PUT /api/admin/classes/sessions/:id/coaches` body. */
export const coachesBodySchema = z.object({
  lead: z.string().uuid().nullable(),
  assistants: z.array(z.string().uuid()).default([]),
});

/** `PUT /api/admin/classes/templates/:id/coaches` body — the session schema
 *  plus the blunt propagation flag (see that endpoint's header comment for
 *  the exact "replaces ALL future sessions" rule). */
export const templateCoachesBodySchema = coachesBodySchema.extend({
  applyToMaterialized: z.boolean().optional(),
});

export type CoachesBody = z.infer<typeof coachesBodySchema>;

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Returns the first id in `ids` that is NOT an active org coach (per
 * `isOrgCoachingStaff` — the org-scoped `coach` role), or `null` if every id
 * passes. Sequential rather than `Promise.all`: the list is at most 3 ids (1
 * lead + 2 assistants), so there is no throughput reason to parallelize, and
 * sequential keeps "which id is the offender" trivial to report.
 */
export async function firstInvalidCoachId(
  ids: string[],
  organizationId: string,
): Promise<string | null> {
  for (const id of ids) {
    if (!(await isOrgCoachingStaff(id, organizationId))) return id;
  }
  return null;
}

/** Every distinct non-null coach id a `{ lead, assistants }` body names. */
export function namedCoachIds(input: { lead: string | null; assistants: string[] }): string[] {
  const ids = new Set(input.assistants);
  if (input.lead) ids.add(input.lead);
  return Array.from(ids);
}

/**
 * Maps `setCoachesFor`'s typed rejections onto the 4xx JSON shape admin
 * endpoints use elsewhere. Returns `null` for anything else, so the caller
 * can rethrow and let an unexpected error surface as a genuine 500 rather
 * than being silently swallowed here.
 */
export function mapSetCoachesError(err: unknown): Response | null {
  if (err instanceof AssignmentTargetOrgMismatchError) {
    // Ownership was already validated before calling setCoachesFor, so this
    // should be unreachable in practice — kept as defense in depth, mapped
    // the same way a direct ownership-check miss would be (404, not 500).
    return jsonResponse({ error: "Target not found" }, 404);
  }
  if (err instanceof TooManyAssistantCoachesError) {
    return jsonResponse({ error: "too_many_assistants", message: err.message }, 422);
  }
  return null;
}
