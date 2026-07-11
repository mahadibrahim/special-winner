/**
 * POST /api/coach/sessions/[id]/captures
 *
 * The single flush target for the field-mode offline queue: quick captures,
 * attendance marks, and capture-consumption stamps in one envelope, all
 * idempotent so the client can retry aggressively (coach session lifecycle
 * spec). Whole-batch validation before any write.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { sessionPlans, teams, rosters, attendance } from "@/lib/db/schema";
import { sessionCaptures } from "@/lib/db/schema/session-lifecycle";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireCoachPortalAccess } from "@/lib/auth";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function verifyCoachAccess(userId: string, sessionId: string) {
  const [session] = await getDb()
    .select({
      id: sessionPlans.id,
      teamId: sessionPlans.teamId,
      scheduledDate: sessionPlans.scheduledDate,
      coachUserId: teams.coachUserId,
      assistantCoachUserId: teams.assistantCoachUserId,
    })
    .from(sessionPlans)
    .innerJoin(teams, eq(sessionPlans.teamId, teams.id))
    .where(eq(sessionPlans.id, sessionId));
  if (!session) return null;
  if (session.coachUserId !== userId && session.assistantCoachUserId !== userId) return null;
  return session;
}

const envelopeSchema = z.object({
  captures: z
    .array(
      z.object({
        clientId: z.string().min(1).max(64),
        rosterId: z.string().uuid(),
        kind: z.enum(["glow", "observation"]),
        skillId: z.string().uuid().nullable().optional(),
        note: z.string().max(280).nullable().optional(),
      }),
    )
    .max(80)
    .default([]),
  attendance: z
    .array(
      z.object({
        rosterId: z.string().uuid(),
        status: z.enum(["present", "absent", "late", "excused"]),
      }),
    )
    .max(80)
    .default([]),
  consumedClientIds: z.array(z.string().min(1).max(64)).max(200).default([]),
});

export const POST: APIRoute = async (context) => {
  try {
    const { params, request } = context;
    const auth = await requireCoachPortalAccess(context);
    if (!auth.authorized) return auth.response;

    const { id } = params;
    if (!id) return json({ error: "Session ID required" }, 400);

    const access = await verifyCoachAccess(auth.user.id, id);
    if (!access) return json({ error: "Access denied" }, 403);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const validation = envelopeSchema.safeParse(body);
    if (!validation.success) {
      return json(
        { error: "Validation failed", details: validation.error.flatten().fieldErrors },
        400,
      );
    }
    const envelope = validation.data;

    // Whole-batch roster validation BEFORE any write.
    const referencedRosterIds = [
      ...new Set([
        ...envelope.captures.map((c) => c.rosterId),
        ...envelope.attendance.map((a) => a.rosterId),
      ]),
    ];
    if (referencedRosterIds.length > 0) {
      const onTeam = await getDb()
        .select({ id: rosters.id })
        .from(rosters)
        .where(and(inArray(rosters.id, referencedRosterIds), eq(rosters.teamId, access.teamId)));
      if (onTeam.length !== referencedRosterIds.length) {
        return json({ error: "One or more players are not on this session's roster" }, 400);
      }
    }

    const result = await getDb().transaction(async (tx) => {
      // Captures: insert-or-return-existing on (sessionPlanId, clientId).
      const captureResults: Array<{ id: string; clientId: string }> = [];
      for (const c of envelope.captures) {
        const inserted = await tx
          .insert(sessionCaptures)
          .values({
            sessionPlanId: id,
            rosterId: c.rosterId,
            kind: c.kind,
            skillId: c.skillId ?? null,
            note: c.note ?? null,
            clientId: c.clientId,
          })
          .onConflictDoNothing()
          .returning({ id: sessionCaptures.id });
        if (inserted.length > 0) {
          captureResults.push({ id: inserted[0].id, clientId: c.clientId });
        } else {
          const [existing] = await tx
            .select({ id: sessionCaptures.id })
            .from(sessionCaptures)
            .where(
              and(eq(sessionCaptures.sessionPlanId, id), eq(sessionCaptures.clientId, c.clientId)),
            );
          captureResults.push({ id: existing.id, clientId: c.clientId });
        }
      }

      // Attendance: atomic upsert on the partial unique index
      // attendance_roster_session_uniq (rosterId, sessionPlanId WHERE
      // session_plan_id IS NOT NULL) — race-safe under concurrent flushes,
      // unlike select-then-insert. Standalone-tracker rows (null
      // sessionPlanId) sit outside the index and are untouched.
      let attendanceUpdated = 0;
      for (const a of envelope.attendance) {
        await tx
          .insert(attendance)
          .values({
            teamId: access.teamId,
            rosterId: a.rosterId,
            sessionPlanId: id,
            eventDate: access.scheduledDate,
            eventType: "practice",
            status: a.status,
            recordedByUserId: auth.user.id,
          })
          .onConflictDoUpdate({
            target: [attendance.rosterId, attendance.sessionPlanId],
            targetWhere: sql`session_plan_id IS NOT NULL`,
            set: { status: a.status },
          });
        attendanceUpdated += 1;
      }

      // Consumption: stamp consumedAt once (idempotent — already-stamped
      // rows are left alone so the first consumption time survives).
      let consumed = 0;
      if (envelope.consumedClientIds.length > 0) {
        // Report the full match count (so the client sees "yes, consumed"
        // on every retry) but only WRITE consumedAt on rows that aren't
        // already stamped, so the first consumption time survives repeated
        // flushes of the same envelope.
        const matched = await tx
          .select({ id: sessionCaptures.id })
          .from(sessionCaptures)
          .where(
            and(
              eq(sessionCaptures.sessionPlanId, id),
              inArray(sessionCaptures.clientId, envelope.consumedClientIds),
            ),
          );
        consumed = matched.length;
        await tx
          .update(sessionCaptures)
          .set({ consumedAt: new Date() })
          .where(
            and(
              eq(sessionCaptures.sessionPlanId, id),
              inArray(sessionCaptures.clientId, envelope.consumedClientIds),
              isNull(sessionCaptures.consumedAt),
            ),
          );
      }

      return { captures: captureResults, attendanceUpdated, consumed };
    });

    return json(result, 201);
  } catch (error) {
    console.error("Error flushing session captures:", error);
    return json({ error: "Internal server error" }, 500);
  }
};
