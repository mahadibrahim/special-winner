import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { shootSessions } from "@/lib/db/schema/media";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import {
  requireSameOrgShootSession,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { logMediaAction } from "@/lib/media/audit";
import { notifyAssignment } from "@/lib/media/notifications";
import {
  checkSessionPublishConsent,
  isMediaAuthHardBlockEnabled,
} from "@/lib/consents/publish-check";

const patchSchema = z.object({
  assignedUserId: z.string().uuid().optional(),
  scheduledStart: z.string().datetime().optional(),
  scheduledEnd: z.string().datetime().optional(),
  locationId: z.string().uuid().nullable().optional(),
  venueId: z.string().uuid().nullable().optional(),
  gameId: z.string().uuid().nullable().optional(),
  rateType: z.enum(["per_game", "per_day", "flat"]).optional(),
  rateCents: z.number().int().nonnegative().optional(),
  notes: z.string().nullable().optional(),
  intendedScope: z.enum(["internal", "promotional", "public"]).optional(),
  status: z
    .enum([
      "assigned",
      "confirmed",
      "checked_in",
      "uploading",
      "uploaded",
      "tagging",
      "ready",
      "published",
      "cancelled",
    ])
    .optional(),
});

export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;
  const id = context.params.id!;
  const ownership = await requireSameOrgShootSession(
    orgContext.organizationId,
    id,
  );
  if (!ownership.ok) return ownershipDeniedResponse();
  return new Response(JSON.stringify({ session: ownership.row }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const PATCH: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const id = context.params.id!;
  const body = await context.request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      }),
      { status: 400 }
    );
  }

  const ownership = await requireSameOrgShootSession(
    orgContext.organizationId,
    id,
  );
  if (!ownership.ok) return ownershipDeniedResponse();
  const before = ownership.row;

  // Publish-time consent enforcement. When the admin transitions a session to
  // 'published', verify that every tagged participant has an active media
  // authorization for the session's intendedScope.
  if (parsed.data.status === "published" && before.status !== "published") {
    const intendedScope =
      (parsed.data.intendedScope ?? before.intendedScope) ?? "internal";
    const check = await checkSessionPublishConsent(
      getDb(),
      id,
      intendedScope as "internal" | "promotional" | "public",
      orgContext.organizationId,
    );
    if (!check.canPublish) {
      // Two independent, distinguishable blockers — surfaced separately so
      // callers (and the audit log) can tell "nobody signed the waiver yet"
      // apart from "someone opted out of being featured." An individual can
      // appear in `doNotPublish` even when they're NOT in `missing` (they
      // have a granted consent row) — opt-out wins over a stale "yes".
      console.warn(
        `[media-publish] session ${id} blocked: ${check.missing.length}/${check.totalTagged} tagged participants missing ${intendedScope} media-auth consent, ${check.doNotPublish.length} opted out of publish`,
        {
          missing: check.missing.map((m) => `${m.firstName} ${m.lastName}`),
          doNotPublish: check.doNotPublish.map((m) => `${m.firstName} ${m.lastName}`),
        },
      );
      if (isMediaAuthHardBlockEnabled()) {
        return new Response(
          JSON.stringify({
            error: "Cannot publish: missing media authorization and/or an individual opt-out for tagged participants",
            intendedScope,
            missing: check.missing,
            doNotPublish: check.doNotPublish,
          }),
          {
            status: 422,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      // Soft-warn path: log + record the violation in the audit trail, but
      // allow the publish to proceed.
      await logMediaAction({
        actorUserId: auth.user.id,
        entityType: "session",
        entityId: id,
        action: "publish",
        diff: {
          softWarn: "missing_media_auth_consent_or_do_not_publish",
          intendedScope,
          missingCount: check.missing.length,
          totalTagged: check.totalTagged,
          missing: check.missing,
          doNotPublishCount: check.doNotPublish.length,
          doNotPublish: check.doNotPublish,
        },
      });
    }
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    if (k === "scheduledStart" || k === "scheduledEnd") {
      patch[k] = new Date(v as string);
    } else {
      patch[k] = v;
    }
  }

  const [updated] = await getDb()
    .update(shootSessions)
    .set(patch)
    .where(eq(shootSessions.id, id))
    .returning();

  await logMediaAction({
    actorUserId: auth.user.id,
    entityType: "session",
    entityId: id,
    action: "update",
    diff: { before, after: updated },
  });

  // Reassignment triggers a notification to the new photographer.
  if (
    parsed.data.assignedUserId &&
    parsed.data.assignedUserId !== before.assignedUserId
  ) {
    await notifyAssignment(updated, parsed.data.assignedUserId);
  }

  return new Response(JSON.stringify({ session: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
