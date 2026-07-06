import type { APIRoute } from "astro";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  coachCredentials,
  jobApplications,
  roles,
  userRoles,
  users,
} from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireUserInOrg,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import {
  REQUIRED_COACH_CREDENTIALS,
  EXPIRING_SOON_DAYS,
  effectiveCredentialStatus,
  requiredCredentialGaps,
} from "@/lib/compliance/coach-credentials";

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * GET  — compliance grid data: every coach holding an org-scoped `coach`
 *        role in the caller's org, with their credential rows (org rows +
 *        NULL-org globals), effective statuses, required-credential gaps,
 *        and the free-text certifications from their hired application as a
 *        starting reference.
 * POST — admin upsert keyed on (userId, organizationId, credentialType).
 *        status='valid' stamps verifiedByUserId with the acting admin; any
 *        other status clears it.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const db = getDb();

  const coachRows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(roles.name, "coach"),
        eq(userRoles.scopeType, "organization"),
        eq(userRoles.scopeId, auth.organizationId),
      ),
    )
    .orderBy(asc(users.lastName), asc(users.firstName), asc(users.id));

  const seen = new Set<string>();
  const uniqueCoaches = coachRows.filter((c) =>
    seen.has(c.id) ? false : (seen.add(c.id), true),
  );
  const coachIds = uniqueCoaches.map((c) => c.id);

  const credentialRows =
    coachIds.length > 0
      ? await db
          .select()
          .from(coachCredentials)
          .where(
            and(
              inArray(coachCredentials.userId, coachIds),
              or(
                eq(coachCredentials.organizationId, auth.organizationId),
                isNull(coachCredentials.organizationId),
              ),
            ),
          )
      : [];

  const hiredApplications =
    coachIds.length > 0
      ? await db
          .select({
            hiredUserId: jobApplications.hiredUserId,
            certifications: jobApplications.certifications,
          })
          .from(jobApplications)
          .where(
            and(
              eq(jobApplications.organizationId, auth.organizationId),
              inArray(jobApplications.hiredUserId, coachIds),
            ),
          )
          .orderBy(desc(jobApplications.createdAt))
      : [];
  const certsByUser = new Map<string, string>();
  for (const a of hiredApplications) {
    if (a.hiredUserId && a.certifications && !certsByUser.has(a.hiredUserId)) {
      certsByUser.set(a.hiredUserId, a.certifications);
    }
  }

  const now = new Date();
  const coaches = uniqueCoaches.map((c) => {
    const rows = credentialRows.filter((r) => r.userId === c.id);
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      applicationCertifications: certsByUser.get(c.id) ?? null,
      credentials: rows.map((r) => ({
        id: r.id,
        credentialType: r.credentialType,
        status: r.status,
        effectiveStatus: effectiveCredentialStatus(r, now),
        issuedAt: r.issuedAt,
        expiresAt: r.expiresAt,
        documentKey: r.documentKey,
        notes: r.notes,
        verifiedByUserId: r.verifiedByUserId,
      })),
      gaps: requiredCredentialGaps(rows, now),
    };
  });

  return json(200, {
    coaches,
    requiredTypes: REQUIRED_COACH_CREDENTIALS,
    expiringSoonDays: EXPIRING_SOON_DAYS,
  });
};

// "YYYY-MM-DD" | null | absent → Date | null (UTC midnight, house
// convention: store UTC, display in org timezone).
const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .nullish()
  .transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null));

const upsertSchema = z.object({
  userId: z.string().uuid(),
  credentialType: z.enum([
    "safesport",
    "background_check",
    "cpr_first_aid",
    "concussion_protocol",
    "coaching_license",
    "other",
  ]),
  status: z.enum(["pending", "valid", "expired", "rejected"]),
  issuedAt: dateField,
  expiresAt: dateField,
  notes: z.string().max(2000).nullable().optional(),
});

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  let parsed;
  try {
    parsed = upsertSchema.safeParse(await context.request.json());
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!parsed.success) {
    return json(400, {
      error: "Validation failed",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  // Tenant pin: the target user must be visible to the caller's org.
  const ownership = await requireUserInOrg(
    auth.organizationId,
    parsed.data.userId,
  );
  if (!ownership.ok) return ownershipDeniedResponse();

  const db = getDb();
  const [existing] = await db
    .select()
    .from(coachCredentials)
    .where(
      and(
        eq(coachCredentials.userId, parsed.data.userId),
        eq(coachCredentials.organizationId, auth.organizationId),
        eq(coachCredentials.credentialType, parsed.data.credentialType),
      ),
    )
    .orderBy(asc(coachCredentials.createdAt))
    .limit(1);

  const values = {
    status: parsed.data.status,
    issuedAt: parsed.data.issuedAt,
    expiresAt: parsed.data.expiresAt,
    notes: parsed.data.notes ?? null,
    verifiedByUserId: parsed.data.status === "valid" ? auth.user.id : null,
  };

  let credential;
  if (existing) {
    [credential] = await db
      .update(coachCredentials)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(coachCredentials.id, existing.id))
      .returning();
  } else {
    [credential] = await db
      .insert(coachCredentials)
      .values({
        userId: parsed.data.userId,
        organizationId: auth.organizationId,
        credentialType: parsed.data.credentialType,
        ...values,
      })
      .returning();
  }

  return json(200, { credential });
};
