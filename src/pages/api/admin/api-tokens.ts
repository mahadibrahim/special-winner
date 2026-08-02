// Admin API token management — the UI counterpart of
// scripts/mint-admin-api-token.ts (which remains the break-glass path).
//
// SESSION-ONLY BY DESIGN: this endpoint uses requireOrgWideAdminAccess, never
// requireAdminScopedAccess — a machine token must not be able to mint, list,
// or revoke tokens. Keep it that way.
import type { APIRoute } from "astro";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { adminApiTokens } from "@/lib/db/schema";
import { requireOrgWideAdminAccess } from "@/lib/auth";
import { hashAdminApiToken, ADMIN_TOKEN_SCOPES } from "@/lib/auth/admin-api-token";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** List: everything EXCEPT the hash — the raw token is unrecoverable by design. */
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgWideAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const rows = await getDb()
    .select({
      id: adminApiTokens.id,
      name: adminApiTokens.name,
      scopes: adminApiTokens.scopes,
      createdAt: adminApiTokens.createdAt,
      expiresAt: adminApiTokens.expiresAt,
      lastUsedAt: adminApiTokens.lastUsedAt,
      revokedAt: adminApiTokens.revokedAt,
    })
    .from(adminApiTokens)
    .where(eq(adminApiTokens.organizationId, auth.organizationId))
    .orderBy(desc(adminApiTokens.createdAt));

  return json(200, { tokens: rows });
};

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z
    .array(z.enum(ADMIN_TOKEN_SCOPES))
    .min(1, "Pick at least one scope")
    // de-dupe defensively; the DB column is a plain array
    .transform((s) => [...new Set(s)]),
  /** Days until expiry; omitted/null = never expires. */
  expiresDays: z.number().int().min(1).max(365).nullable().optional(),
});

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgWideAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const body = await context.request.json().catch(() => null);
  const result = createSchema.safeParse(body);
  if (!result.success) {
    return json(400, { error: "Validation failed", details: result.error.flatten().fieldErrors });
  }

  const raw = `aspire_admin_${randomBytes(32).toString("base64url")}`;
  const expiresAt = result.data.expiresDays
    ? new Date(Date.now() + result.data.expiresDays * 86_400_000)
    : null;

  const [row] = await getDb()
    .insert(adminApiTokens)
    .values({
      organizationId: auth.organizationId,
      name: result.data.name,
      tokenHash: hashAdminApiToken(raw),
      scopes: result.data.scopes,
      createdByUserId: auth.user.id,
      expiresAt,
    })
    .returning({
      id: adminApiTokens.id,
      name: adminApiTokens.name,
      scopes: adminApiTokens.scopes,
      createdAt: adminApiTokens.createdAt,
      expiresAt: adminApiTokens.expiresAt,
    });

  // The raw token appears in this response and NOWHERE else — the UI shows
  // it once with a copy button; only the hash is stored.
  return json(201, { token: raw, row });
};

const revokeSchema = z.object({ id: z.string().uuid() });

/** Revoke (soft): sets revoked_at so the row stays as an audit record. */
export const PATCH: APIRoute = async (context) => {
  const auth = await requireOrgWideAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const body = await context.request.json().catch(() => null);
  const result = revokeSchema.safeParse(body);
  if (!result.success) {
    return json(400, { error: "Validation failed" });
  }

  const [row] = await getDb()
    .update(adminApiTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(adminApiTokens.id, result.data.id),
        // org pin — an admin can only revoke their own org's tokens
        eq(adminApiTokens.organizationId, auth.organizationId),
      ),
    )
    .returning({ id: adminApiTokens.id, revokedAt: adminApiTokens.revokedAt });

  if (!row) return json(404, { error: "Token not found" });
  return json(200, { revoked: row });
};
