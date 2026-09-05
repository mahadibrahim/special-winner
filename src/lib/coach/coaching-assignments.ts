/**
 * Assignment CRUD for `coaching_assignments` (Task 1 schema,
 * src/lib/db/schema/coaching.ts). This module owns writes to the table;
 * everything else (get-coach-groups.ts, roles.ts's canCoachReachFamilyMember)
 * only reads it.
 *
 * `setCoachesFor` is a DECLARATIVE REPLACE, not an incremental add/remove:
 * callers pass the full desired (lead, assistants) set for one target and
 * this reconciles the DB to match — deactivating rows that fell out of the
 * set (never deletes; `active: false` preserves history the same way
 * `class_enrollments.status = 'ended'` does) and upserting the rest via the
 * table's `(coachUserId, kind, targetId)` unique constraint, which also
 * naturally REACTIVATES a previously-deactivated row instead of erroring or
 * leaving a stale inactive duplicate behind.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { coachingAssignments } from "@/lib/db/schema/coaching";
import { users } from "@/lib/db/schema/users";
import { classSlotTemplates } from "@/lib/db/schema/classes";
import { dropInSessions } from "@/lib/db/schema/drop-in";

/** A `getDb()` handle or a transaction handle from `db.transaction(...)`.
 *  Mirrors src/lib/memberships/get-child-membership.ts. */
type DbClient =
  | ReturnType<typeof getDb>
  | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export const MAX_ASSISTANT_COACHES = 2;

/** Thrown by `setCoachesFor` when the caller asks for more than
 *  `MAX_ASSISTANT_COACHES` assistants — a typed rejection, never a silent
 *  truncation of the list. */
export class TooManyAssistantCoachesError extends Error {
  readonly requestedCount: number;
  constructor(requestedCount: number) {
    super(
      `At most ${MAX_ASSISTANT_COACHES} assistant coaches are allowed per assignment target (got ${requestedCount})`,
    );
    this.name = "TooManyAssistantCoachesError";
    this.requestedCount = requestedCount;
  }
}

export type CoachingAssignmentKind = "team" | "class_template" | "class_session";

/** Thrown by `setCoachesFor` when `targetId` does not belong to
 *  `organizationId` — the cross-tenant trust-boundary guard. `targetId` is
 *  polymorphic and carries no FK (see coaching.ts's table doc comment), so
 *  nothing at the DB layer stops a caller from naming another org's
 *  template/session; this is the app-layer check that closes that gap. */
export class AssignmentTargetOrgMismatchError extends Error {
  constructor(
    readonly kind: CoachingAssignmentKind,
    readonly targetId: string,
  ) {
    super(`Assignment target ${kind}:${targetId} does not belong to the given organization`);
    this.name = "AssignmentTargetOrgMismatchError";
  }
}

/** Verifies `targetId` (a class_slot_templates or drop_in_sessions row,
 *  depending on `kind`) actually belongs to `organizationId`. Both target
 *  tables key `id` as their primary key, so `.limit(1)` is a uniqueness
 *  guarantee, not an ordering choice. Throws `AssignmentTargetOrgMismatchError`
 *  on a missing row OR an org mismatch — both are "not a valid target in
 *  this org" from the caller's perspective. */
async function assertTargetBelongsToOrg(
  db: DbClient,
  kind: "class_template" | "class_session",
  targetId: string,
  organizationId: string,
): Promise<void> {
  if (kind === "class_template") {
    const [row] = await db
      .select({ organizationId: classSlotTemplates.organizationId })
      .from(classSlotTemplates)
      .where(eq(classSlotTemplates.id, targetId))
      .limit(1);
    if (!row || row.organizationId !== organizationId) {
      throw new AssignmentTargetOrgMismatchError(kind, targetId);
    }
  } else {
    const [row] = await db
      .select({ organizationId: dropInSessions.organizationId })
      .from(dropInSessions)
      .where(eq(dropInSessions.id, targetId))
      .limit(1);
    if (!row || row.organizationId !== organizationId) {
      throw new AssignmentTargetOrgMismatchError(kind, targetId);
    }
  }
}

/**
 * Declaratively replace the coach roster for one (kind, targetId): the
 * caller states who should be lead and who should be assistants right now,
 * and this reconciles the table to match. Rows for coaches not in the new
 * set are deactivated (`active: false`); rows for coaches in the new set are
 * upserted (insert, or reactivate + update role if a prior row exists).
 *
 * `lead` may be null (no lead assigned yet — assistants-only staffing is
 * valid). Duplicate ids between `lead` and `assistants`, or repeats within
 * `assistants`, are deduped; `lead` wins the role on overlap.
 */
export async function setCoachesFor(opts: {
  organizationId: string;
  kind: "class_template" | "class_session";
  targetId: string;
  lead: string | null;
  assistants: string[];
  createdByUserId: string;
  dbOrTx?: DbClient;
}): Promise<void> {
  const { organizationId, kind, targetId, lead, createdByUserId } = opts;

  // lead wins role on overlap (lead listed again as an "assistant" is
  // still just the lead — not a validation error, matches how a caller
  // might naively pass a form's full roster). Dedupe AND drop the lead
  // BEFORE the cap check: the cap is on real assistant seats, and a lead
  // relisted among `assistants` occupies zero of them.
  const uniqueAssistants = Array.from(new Set(opts.assistants)).filter(
    (assistantId) => assistantId !== lead,
  );
  if (uniqueAssistants.length > MAX_ASSISTANT_COACHES) {
    throw new TooManyAssistantCoachesError(uniqueAssistants.length);
  }

  const wanted = new Map<string, "lead" | "assistant">();
  if (lead) wanted.set(lead, "lead");
  for (const assistantId of uniqueAssistants) {
    wanted.set(assistantId, "assistant");
  }

  await assertTargetBelongsToOrg(opts.dbOrTx ?? getDb(), kind, targetId, organizationId);

  const run = async (tx: DbClient) => {
    const existing = await tx
      .select({ coachUserId: coachingAssignments.coachUserId })
      .from(coachingAssignments)
      .where(
        and(
          eq(coachingAssignments.organizationId, organizationId),
          eq(coachingAssignments.kind, kind),
          eq(coachingAssignments.targetId, targetId),
          eq(coachingAssignments.active, true),
        ),
      );

    const toDeactivate = existing
      .map((row) => row.coachUserId)
      .filter((coachUserId) => !wanted.has(coachUserId));

    if (toDeactivate.length > 0) {
      await tx
        .update(coachingAssignments)
        .set({ active: false, updatedAt: new Date() })
        .where(
          and(
            eq(coachingAssignments.organizationId, organizationId),
            eq(coachingAssignments.kind, kind),
            eq(coachingAssignments.targetId, targetId),
            inArray(coachingAssignments.coachUserId, toDeactivate),
          ),
        );
    }

    if (wanted.size > 0) {
      const rows = Array.from(wanted, ([coachUserId, role]) => ({
        organizationId,
        coachUserId,
        kind,
        targetId,
        role,
        active: true,
        createdByUserId,
      }));

      await tx
        .insert(coachingAssignments)
        .values(rows)
        .onConflictDoUpdate({
          target: [
            coachingAssignments.coachUserId,
            coachingAssignments.kind,
            coachingAssignments.targetId,
          ],
          set: {
            // `excluded` holds the row that lost the conflict — one batched
            // upsert instead of a per-coach loop.
            role: sql`excluded.role`,
            active: true,
            updatedAt: new Date(),
          },
        });
    }
  };

  if (opts.dbOrTx) {
    await run(opts.dbOrTx);
  } else {
    await getDb().transaction((tx) => run(tx));
  }
}

/** Active coaches staffed on one (kind, targetId), most-recently-assigned
 *  role information plus the coach's display name for roster/UI surfaces. */
export async function getCoachesFor(
  kind: CoachingAssignmentKind,
  targetId: string,
): Promise<Array<{ coachUserId: string; role: "lead" | "assistant"; name: string }>> {
  const rows = await getDb()
    .select({
      coachUserId: coachingAssignments.coachUserId,
      role: coachingAssignments.role,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(coachingAssignments)
    .innerJoin(users, eq(users.id, coachingAssignments.coachUserId))
    .where(
      and(
        eq(coachingAssignments.kind, kind),
        eq(coachingAssignments.targetId, targetId),
        eq(coachingAssignments.active, true),
      ),
    );

  return rows.map((row) => ({
    coachUserId: row.coachUserId,
    role: row.role,
    name: [row.firstName, row.lastName].filter(Boolean).join(" ") || "Unknown coach",
  }));
}
