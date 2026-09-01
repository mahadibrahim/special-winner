import { createHash } from "node:crypto";
import { and, desc, eq, isNull, or, gt, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  consents,
  waivers,
  type Consent,
  type Waiver,
} from "@/lib/db/schema";

export type ConsentType =
  | "parental"
  | "age_confirmation"
  | "liability"
  | "media_authorization";

export type MediaAuthScope = "internal" | "promotional" | "public";

export const ALL_MEDIA_AUTH_SCOPES: ReadonlyArray<MediaAuthScope> = [
  "internal",
  "promotional",
  "public",
];

/**
 * How long one liability signature is good for. THE source of the number —
 * `src/lib/consents/liability.ts` re-exports it as `WAIVER_VALID_DAYS` and
 * derives its validity window from it, so the write-side expiry and the
 * read-side predicate can never fork. Defined here rather than in
 * liability.ts because liability.ts imports this module (the reverse would
 * be circular).
 */
export const LIABILITY_VALIDITY_DAYS = 365;

/** A transaction handle — callers wrap consent + related writes so they land as one. */
export type ConsentTx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | ConsentTx;

interface RecordConsentInput {
  db: Db;
  familyMemberId: string;
  registrationId?: string | null;
  organizationId?: string | null;
  type: ConsentType;
  scope?: MediaAuthScope;
  status?: "granted" | "revoked";
  signedByUserId: string;
  signedByName: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  notes?: string | null;
}

export interface RecordedConsent {
  id: string;
  expiresAt: Date | null;
  waiverId: string | null;
  contentHash: string | null;
}

/**
 * Single chokepoint for inserting consent rows. Looks up the active waiver
 * for liability and media_authorization types (caller doesn't need to know
 * about waiver versioning), computes the content hash and expiry window,
 * and writes one row.
 */
export async function recordConsent(
  input: RecordConsentInput,
): Promise<RecordedConsent> {
  if (input.type === "media_authorization" && !input.scope) {
    throw new Error(
      "recordConsent: scope is required for type='media_authorization'",
    );
  }
  if (input.type !== "media_authorization" && input.scope) {
    throw new Error(
      "recordConsent: scope must be omitted for non-media-authorization consents",
    );
  }

  let waiverId: string | null = null;
  let contentHash: string | null = null;

  if (input.type === "liability" || input.type === "media_authorization") {
    const waiverType =
      input.type === "liability" ? "liability" : "media_authorization";
    const waiver = await getCurrentWaiver(
      input.db,
      input.organizationId ?? null,
      waiverType,
    );
    if (waiver) {
      waiverId = waiver.id;
      contentHash = sha256(waiver.content);
    }
    // If no waiver row exists yet (e.g. org hasn't published one and there's
    // no global default), we still record the consent — admin compliance
    // view will flag it. Avoids blocking registration on a missing waiver.
  }

  const expiresAt =
    input.type === "liability"
      ? new Date(Date.now() + LIABILITY_VALIDITY_DAYS * 24 * 60 * 60 * 1000)
      : null;

  const [row] = await input.db
    .insert(consents)
    .values({
      familyMemberId: input.familyMemberId,
      // The owning organization of the legal release. Was accepted and used
      // only to pick the waiver document; persisting it is what makes the
      // org-scoped annual-liability predicate work (see ./liability.ts).
      organizationId: input.organizationId ?? null,
      registrationId: input.registrationId ?? null,
      waiverId,
      type: input.type,
      scope: input.scope ?? null,
      status: input.status ?? "granted",
      signedByUserId: input.signedByUserId,
      signedByName: input.signedByName,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      contentHash,
      notes: input.notes ?? null,
      expiresAt,
    })
    .returning({ id: consents.id });

  return { id: row.id, expiresAt, waiverId, contentHash };
}

/**
 * Resolve the active waiver for an org+type, falling back to the global
 * default (organizationId IS NULL) if the org hasn't published its own.
 */
export async function getCurrentWaiver(
  db: Db,
  organizationId: string | null,
  type: "liability" | "media_authorization",
): Promise<Waiver | null> {
  // Prefer the org's own waiver; fall back to the global default.
  const candidates = await db
    .select()
    .from(waivers)
    .where(
      and(
        eq(waivers.type, type),
        isNull(waivers.supersededAt),
        organizationId
          ? or(eq(waivers.organizationId, organizationId), isNull(waivers.organizationId))
          : isNull(waivers.organizationId),
      ),
    )
    .orderBy(desc(waivers.organizationId), desc(waivers.version));

  // Org-specific row sorts before global-NULL because non-null > null in
  // PostgreSQL's default ordering. desc(waivers.organizationId) puts org-
  // specific first, NULLS LAST is the default for desc, so global comes
  // after. Take the first row.
  return candidates[0] ?? null;
}

/**
 * Determine whether a family member has an active (granted, not expired,
 * not superseded by a revocation) consent of the given type/scope.
 */
export async function hasActiveConsent(
  db: Db,
  familyMemberId: string,
  type: ConsentType,
  scope?: MediaAuthScope,
): Promise<boolean> {
  const c = await getMostRecentConsent(db, familyMemberId, type, scope);
  if (!c) return false;
  if (c.status !== "granted") return false;
  if (c.expiresAt && c.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

/**
 * Get the most recent consent row for a (family_member, type, scope) tuple,
 * regardless of status. Used both by `hasActiveConsent` and by the admin
 * compliance view.
 */
export async function getMostRecentConsent(
  db: Db,
  familyMemberId: string,
  type: ConsentType,
  scope?: MediaAuthScope,
): Promise<Consent | null> {
  const rows = await db
    .select()
    .from(consents)
    .where(
      and(
        eq(consents.familyMemberId, familyMemberId),
        eq(consents.type, type),
        scope === undefined
          ? sql`true`
          : scope === null
            ? isNull(consents.scope)
            : eq(consents.scope, scope),
      ),
    )
    .orderBy(desc(consents.signedAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Convenience: record all 3 media-auth scopes as granted (the default for
 * new registrations — opt-out, not opt-in). Caller passes `optOutScopes`
 * to skip writing rows for scopes the user explicitly disabled.
 */
export async function recordDefaultMediaAuth(
  input: Omit<RecordConsentInput, "type" | "scope" | "status"> & {
    optOutScopes?: ReadonlyArray<MediaAuthScope>;
  },
): Promise<ReadonlyArray<RecordedConsent>> {
  const optOut = new Set(input.optOutScopes ?? []);
  const results: RecordedConsent[] = [];
  for (const scope of ALL_MEDIA_AUTH_SCOPES) {
    if (optOut.has(scope)) continue;
    results.push(
      await recordConsent({
        db: input.db,
        familyMemberId: input.familyMemberId,
        registrationId: input.registrationId,
        organizationId: input.organizationId,
        type: "media_authorization",
        scope,
        signedByUserId: input.signedByUserId,
        signedByName: input.signedByName,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        notes: input.notes,
      }),
    );
  }
  return results;
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// Re-export for legacy comparisons in callers that haven't switched yet.
export { gt };
