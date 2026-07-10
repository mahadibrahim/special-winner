/**
 * Warn-tier dismissal recording (Program Blueprint T7). See "Age guardrails
 * (two-tier)" in docs/superpowers/specs/2026-07-10-program-blueprint-design.md:
 * "Dismissal writes a `blueprint_warning_dismissals` row (who/when) and the
 * badge collapses to a quiet acknowledged state."
 *
 * --- Keyed by (sequenceId, templateId), not sequenceEntryId ---
 * The entries PUT (entries.ts) delete-reinserts ALL entries with fresh
 * UUIDs on every save, so a dismissal keyed only to an entry id would
 * silently vanish the next time the director reorders or re-saves the
 * arc. A dismissal is an act on "this template's stage skew, for this
 * sequence" and must survive that churn — see blueprint.ts's schema
 * docstring and migration 0079.
 *
 * --- Tenancy: org-owned OR global sequences ---
 * Dismissals are an org-scoped act on a sequence the org can SEE, not
 * necessarily one it owns — the same visibility rule `loadSequenceForOrg`
 * already applies for reading/attaching sequences (org sequences + global
 * sequences with organizationId === null, same model as practice
 * templates). A dismissal recorded by org A against a global sequence is
 * exactly as valid as any other org-scoped read of that sequence; it does
 * not mutate the sequence itself, only who-in-this-org has acknowledged
 * the warning. Cross-org sequences (belonging to a DIFFERENT org, not
 * global) resolve to 404 via ownershipDeniedResponse(), same as every
 * other admin endpoint in this codebase.
 *
 * --- Cross-tenant leak fix (review I2) ---
 * A dismissal keyed ONLY by (sequenceId, templateId), with no org
 * dimension, meant that for a GLOBAL sequence (organizationId null,
 * visible/attachable by every org) Org A dismissing a warning silently
 * acknowledged it for every other org that can see the same sequence too.
 * Every write now stamps `organizationId: auth.organizationId`
 * (migration 0081), and the idempotency lookup below is scoped to it as
 * well — otherwise Org A's "already dismissed?" check would still match
 * Org B's row on a shared global sequence and skip the insert entirely.
 *
 * --- Membership check (review I2) ---
 * (sequenceId, templateId) must be a CURRENT entry of the sequence — this
 * closes a "pre-emptive dismissal" hole where a director could dismiss a
 * warning for a template that isn't (yet, or ever) actually in the arc,
 * banking a dismissal that would silently apply the moment it's added
 * later. 404s (via ownershipDeniedResponse(), same "not yours/not found"
 * convention as everywhere else) when the pair isn't a live entry.
 *
 * Idempotent: a second dismissal for the same (sequenceId, templateId,
 * organizationId) triple is a 200 no-op (returns the existing row's
 * dismissed:true) rather than a duplicate insert or an error —
 * re-clicking Acknowledge, or two directors in the SAME org dismissing the
 * same warning, should never fail.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { blueprintWarningDismissals } from "@/lib/db/schema/blueprint";
import { curriculumSequenceEntries } from "@/lib/db/schema/curriculum-sequences";
import { requireOrgAdminAccess } from "@/lib/auth";
import { ownershipDeniedResponse } from "@/lib/auth/require-resource-ownership";
import { loadSequenceForOrg } from "@/lib/curriculum/sequence-ownership";

const dismissSchema = z.object({
  sequenceId: z.string().uuid(),
  templateId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const body = await context.request.json();
    const result = dismissSchema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }

    const { sequenceId, templateId, reason } = result.data;

    const sequence = await loadSequenceForOrg(auth.organizationId, sequenceId);
    if (!sequence) return ownershipDeniedResponse();

    const db = getDb();

    // Membership check (review I2): (sequenceId, templateId) must be a
    // CURRENT entry of the sequence, not just any template the org can see
    // — closes the pre-emptive-dismissal hole (see module docstring).
    const [entryRow] = await db
      .select({ id: curriculumSequenceEntries.id })
      .from(curriculumSequenceEntries)
      .where(
        and(
          eq(curriculumSequenceEntries.sequenceId, sequenceId),
          eq(curriculumSequenceEntries.templateId, templateId),
        ),
      )
      .limit(1);
    if (!entryRow) return ownershipDeniedResponse();

    // Idempotent: a prior dismissal for this (sequence, template, org)
    // triple is a no-op success, not a duplicate insert. Scoped to
    // organizationId (review I2) — without it, Org A's lookup would match
    // Org B's dismissal row on a shared GLOBAL sequence and wrongly treat
    // Org A's warning as already-acknowledged. No orderBy needed on the
    // .limit(1) — this is a lookup on the same triple the unique-in-
    // practice (sequence_id, template_id, organization_id) shape targets,
    // so at most one row is expected; if a drifted DB somehow carries
    // more, "any existing row" is an equally valid answer to "has this
    // been dismissed".
    const [existing] = await db
      .select()
      .from(blueprintWarningDismissals)
      .where(
        and(
          eq(blueprintWarningDismissals.sequenceId, sequenceId),
          eq(blueprintWarningDismissals.templateId, templateId),
          eq(blueprintWarningDismissals.organizationId, auth.organizationId),
        ),
      )
      .limit(1);

    if (existing) {
      return new Response(JSON.stringify({ dismissed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    await db.insert(blueprintWarningDismissals).values({
      sequenceId,
      templateId,
      organizationId: auth.organizationId,
      dismissedBy: auth.user.id,
      reason: reason ?? null,
    });

    return new Response(JSON.stringify({ dismissed: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error recording blueprint warning dismissal:", error);
    return new Response(JSON.stringify({ error: "Failed to record dismissal" }), {
      status: 500,
    });
  }
};
