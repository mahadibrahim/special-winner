// Scoped machine-token auth for the admin MCP.
//
// requireAdminScopedAccess(context, scope) is the ONLY entry point that
// honors `x-admin-token`. Endpoints that don't call it keep their
// session-only guards, so token traffic is rejected everywhere else by
// construction — the "no refunds / no deletes / no registrations mutation"
// boundary is the absence of wiring, not a permission bit.
//
// Token requests are additionally pinned two ways:
// - the token row carries an organizationId, and
// - the request's host-resolved org must MATCH it (403 otherwise), so a
//   token minted for one brand can't be replayed against another tenant.
import { createHash, timingSafeEqual } from "node:crypto";
import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { adminApiTokens } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "./roles";

export const ADMIN_TOKEN_SCOPES = ["catalog:read", "catalog:write", "ops:read"] as const;
export type AdminTokenScope = (typeof ADMIN_TOKEN_SCOPES)[number];

export function hashAdminApiToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export interface AdminTokenRowForValidation {
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
  organizationId: string;
}

/**
 * Pure validation of a looked-up token row against the required scope and
 * the request's resolved org. Returns null when valid, else the failure
 * reason (kept out of client responses; useful for logs/tests).
 */
export function validateAdminTokenRow(
  row: AdminTokenRowForValidation,
  scope: AdminTokenScope,
  resolvedOrgId: string | null | undefined,
  now: Date = new Date(),
): "revoked" | "expired" | "missing_scope" | "org_mismatch" | null {
  if (row.revokedAt) return "revoked";
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return "expired";
  if (!row.scopes.includes(scope)) return "missing_scope";
  if (!resolvedOrgId || row.organizationId !== resolvedOrgId) return "org_mismatch";
  return null;
}

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export type AdminScopedAuth =
  | { authorized: false; response: Response }
  | {
      authorized: true;
      /** "token" for x-admin-token requests, "session" for logged-in admins. */
      via: "token" | "session";
      /** User id that audit fields should record (token's minting admin). */
      actingUserId: string;
      organizationId: string;
      /** Session role list; empty for tokens — role branches then fail CLOSED
       *  (e.g. the cross-org-venue super_admin allowance never applies). */
      roles: { name: string; scopeType: string; scopeId: string | null }[];
      locationScope: "all" | string[];
    };

/**
 * Accept EITHER a valid scoped machine token (x-admin-token header) or a
 * normal admin session (delegates to requireOrgAdminAccess). Use only on
 * endpoints that the admin MCP is meant to reach.
 */
export async function requireAdminScopedAccess(
  context: APIContext,
  scope: AdminTokenScope,
): Promise<AdminScopedAuth> {
  const raw = context.request.headers.get("x-admin-token");

  if (raw) {
    const hash = hashAdminApiToken(raw);
    const [row] = await getDb()
      .select()
      .from(adminApiTokens)
      .where(eq(adminApiTokens.tokenHash, hash))
      .limit(1);

    // Constant-shape failure: unknown token and invalid token read the same
    // to the caller (401), and the hash comparison above is an indexed
    // lookup — timingSafeEqual re-check guards against driver short-circuit
    // comparisons on the hex string.
    if (
      !row ||
      !timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(row.tokenHash, "hex"))
    ) {
      return { authorized: false, response: json(401, "Invalid admin token") };
    }

    const failure = validateAdminTokenRow(row, scope, context.locals.organization?.id);
    if (failure === "missing_scope") {
      return { authorized: false, response: json(403, "Token lacks required scope") };
    }
    if (failure === "org_mismatch") {
      return { authorized: false, response: json(403, "Token not valid for this organization") };
    }
    if (failure) {
      return { authorized: false, response: json(401, "Invalid admin token") };
    }

    // Best-effort usage stamp — never block the request on it.
    void (async () => {
      try {
        await getDb()
          .update(adminApiTokens)
          .set({ lastUsedAt: new Date() })
          .where(eq(adminApiTokens.id, row.id));
      } catch {
        // stamp is advisory only
      }
    })();

    return {
      authorized: true,
      via: "token",
      actingUserId: row.createdByUserId,
      organizationId: row.organizationId,
      roles: [],
      locationScope: "all",
    };
  }

  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth;
  return {
    authorized: true,
    via: "session",
    actingUserId: auth.user.id,
    organizationId: auth.organizationId,
    roles: auth.roles,
    locationScope: auth.locationScope,
  };
}
