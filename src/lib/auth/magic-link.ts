import crypto from "node:crypto";
import { and, eq, isNull, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  magicLinks,
  MAGIC_LINK_PURPOSE,
  type MagicLinkPurpose,
} from "@/lib/db/schema/magic-links";

/**
 * Magic-link module
 *
 * Generalized, single-use, short-lived signed tokens bound to a specific user and action.
 * Tokens are 32 bytes of entropy, base64url-encoded (~43 chars plaintext). The plaintext
 * token is returned to the caller exactly once — we only persist the SHA-256 hash, so a
 * database dump cannot be used to forge consumptions.
 *
 * Usage:
 *   const token = await createMagicLink({ userId, purpose: 'pay_invoice', ... });
 *   // Deliver token via SMS/email
 *
 *   // Later, in /m/[token] handler:
 *   const result = await consumeMagicLink(tokenFromUrl);
 *   // Create Lucia session for result.userId, redirect per result.purpose
 */

// Default expirations per purpose. Tunable per call via opts.expiresInSeconds.
const DEFAULT_EXPIRATIONS: Record<MagicLinkPurpose, number> = {
  // Fast-expiring (sensitive login / payment)
  login: 15 * 60, // 15 min
  password_reset_login: 15 * 60, // 15 min
  pay_invoice: 60 * 60, // 1 hour
  register_for_season: 72 * 60 * 60, // 72 hours — re-registration campaigns need a wide window
  update_medical_info: 60 * 60, // 1 hour
  update_phone: 30 * 60, // 30 min

  // Low-sensitivity read-only
  view_development_report: 24 * 60 * 60, // 24 hours
  view_season_summary: 72 * 60 * 60, // 72 hours
};

export interface CreateMagicLinkInput {
  userId: string;
  organizationId?: string;
  purpose: MagicLinkPurpose;
  purposeContext?: Record<string, unknown>;
  expiresInSeconds?: number;
  deliveredChannel?: "sms" | "email" | "telegram" | "web";
  deliveredTo?: string;
}

export interface CreateMagicLinkResult {
  /**
   * Plaintext token. This is the only time this value exists in memory outside
   * of the token-URL the caller delivers. NEVER log this.
   */
  token: string;
  /** Database row id (useful for audit logs, not security-sensitive). */
  id: string;
  /** Expiration timestamp. */
  expiresAt: Date;
}

export type ConsumeMagicLinkResult =
  | {
      ok: true;
      userId: string;
      organizationId: string | null;
      purpose: MagicLinkPurpose;
      purposeContext: Record<string, unknown> | null;
    }
  | {
      ok: false;
      reason: "not_found" | "expired" | "already_consumed" | "malformed";
    };

/**
 * Generate a new magic-link token, persist its hash, and return the plaintext
 * token for delivery. The plaintext token exists only in the return value of
 * this function — the caller is responsible for delivering it via the chosen
 * channel and discarding the value immediately after.
 */
export async function createMagicLink(
  input: CreateMagicLinkInput,
): Promise<CreateMagicLinkResult> {
  const plaintext = generateToken();
  const tokenHash = hashToken(plaintext);

  const expiresInSeconds =
    input.expiresInSeconds ?? DEFAULT_EXPIRATIONS[input.purpose];
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);

  const [row] = await getDb()
    .insert(magicLinks)
    .values({
      organizationId: input.organizationId ?? null,
      userId: input.userId,
      tokenHash,
      purpose: input.purpose,
      purposeContext: input.purposeContext ?? null,
      expiresAt,
      deliveredChannel: input.deliveredChannel ?? null,
      deliveredTo: input.deliveredTo ?? null,
    })
    .returning({ id: magicLinks.id, expiresAt: magicLinks.expiresAt });

  return {
    token: plaintext,
    id: row.id,
    expiresAt: row.expiresAt,
  };
}

/**
 * Atomically consume a magic link. Returns the associated userId and purpose
 * context on success. The update is a single SQL statement that only succeeds
 * if the token exists, has not expired, and has not already been consumed —
 * preventing race conditions where the same token could be consumed twice.
 */
export async function consumeMagicLink(
  plaintextToken: string,
): Promise<ConsumeMagicLinkResult> {
  if (!plaintextToken || typeof plaintextToken !== "string") {
    return { ok: false, reason: "malformed" };
  }

  const tokenHash = hashToken(plaintextToken);
  const now = new Date();

  const db = getDb();

  // Look up first to distinguish expired / already-consumed / not-found for
  // better error messages. The actual consumption is an atomic UPDATE below.
  const existing = await db
    .select({
      id: magicLinks.id,
      userId: magicLinks.userId,
      organizationId: magicLinks.organizationId,
      purpose: magicLinks.purpose,
      purposeContext: magicLinks.purposeContext,
      expiresAt: magicLinks.expiresAt,
      consumedAt: magicLinks.consumedAt,
    })
    .from(magicLinks)
    .where(eq(magicLinks.tokenHash, tokenHash))
    .limit(1);

  if (existing.length === 0) {
    return { ok: false, reason: "not_found" };
  }

  const link = existing[0];

  if (link.consumedAt !== null) {
    return { ok: false, reason: "already_consumed" };
  }

  if (link.expiresAt < now) {
    return { ok: false, reason: "expired" };
  }

  // Atomic consumption — fails safely if the link was consumed between the
  // lookup and the update.
  const updated = await db
    .update(magicLinks)
    .set({ consumedAt: now })
    .where(
      and(
        eq(magicLinks.id, link.id),
        isNull(magicLinks.consumedAt),
        gte(magicLinks.expiresAt, now),
      ),
    )
    .returning({ id: magicLinks.id });

  if (updated.length === 0) {
    return { ok: false, reason: "already_consumed" };
  }

  // Validate purpose against known constants (defensive — catches drift
  // between schema and code).
  const purpose = link.purpose as MagicLinkPurpose;
  if (!MAGIC_LINK_PURPOSE.includes(purpose)) {
    return { ok: false, reason: "malformed" };
  }

  return {
    ok: true,
    userId: link.userId,
    organizationId: link.organizationId,
    purpose,
    purposeContext: link.purposeContext as Record<string, unknown> | null,
  };
}

/**
 * Purge expired and fully-consumed magic links older than `olderThanDays`.
 * Intended to be called from a cron job. Not security-critical (expired links
 * can't be consumed anyway) — this is for keeping the table small.
 */
export async function purgeOldMagicLinks(olderThanDays = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const result = await getDb()
    .delete(magicLinks)
    .where(sql`${magicLinks.expiresAt} < ${cutoff}`);
  return (result as { rowCount?: number }).rowCount ?? 0;
}

/**
 * Build the full URL a parent taps to redeem a magic link.
 * Honors MAGIC_LINK_BASE_URL override if set, else uses `${PUBLIC_APP_URL}/m`.
 */
export function buildMagicLinkUrl(plaintextToken: string): string {
  const base =
    import.meta.env.MAGIC_LINK_BASE_URL ||
    `${import.meta.env.PUBLIC_APP_URL || "http://localhost:4321"}/m`;
  return `${base.replace(/\/$/, "")}/${plaintextToken}`;
}

// ------------------------------------------------------------
// Internal helpers
// ------------------------------------------------------------

function generateToken(): string {
  // 32 bytes → 256 bits of entropy → base64url (~43 chars)
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}
