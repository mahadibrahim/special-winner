import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, emailVerificationTokens, sessions } from "@/lib/db/schema";
import { hashToken } from "./token-hash";

/**
 * Single source of truth for consuming an email-verification token.
 *
 * History: the consumption logic lived in TWO places that drifted apart — the
 * live path `src/pages/verify-email/[token].astro` looked the token up by its
 * RAW value, while `src/pages/api/auth/verify-email.ts` (dead code) hashed it.
 * Since send-verification.ts stores only `hashToken(token)`, the raw lookup
 * never matched and every verification link failed with "invalid or has
 * expired." Both consumers now call this one function so they cannot diverge
 * again.
 *
 * Storage stores the SHA-256 digest, never the plaintext (see
 * send-verification.ts / token-hash.ts), so we hash the presented token before
 * lookup. On success we also refresh the user's sessions: signin caps
 * unverified sessions to 1 hour (see signin.ts) and relies on verification to
 * extend them back to the normal 30-day lifetime.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Boundary to the persistence layer — injected so the orchestration is unit-testable. */
export interface EmailVerificationStore {
  /** Look up a non-expired token by its stored id (the SHA-256 digest). */
  findValidToken(tokenId: string): Promise<{ userId: string } | null>;
  /** Mark the user verified, drop their tokens, and refresh their sessions to 30 days. */
  markVerifiedAndRefreshSessions(userId: string): Promise<void>;
}

export interface ConsumeResult {
  ok: boolean;
}

/**
 * Verify and consume a token. Hashes the presented (raw) token, looks it up,
 * and — only on a match — marks the account verified and refreshes sessions.
 */
export async function consumeEmailVerificationToken(
  rawToken: string,
  store: EmailVerificationStore = createDbEmailVerificationStore(),
): Promise<ConsumeResult> {
  const row = await store.findValidToken(hashToken(rawToken));
  if (!row) return { ok: false };
  await store.markVerifiedAndRefreshSessions(row.userId);
  return { ok: true };
}

/** Drizzle-backed store used in production. */
export function createDbEmailVerificationStore(): EmailVerificationStore {
  return {
    async findValidToken(tokenId) {
      const rows = await getDb()
        .select({ userId: emailVerificationTokens.userId })
        .from(emailVerificationTokens)
        .where(
          and(
            eq(emailVerificationTokens.id, tokenId),
            gt(emailVerificationTokens.expiresAt, new Date()),
          ),
        )
        .limit(1);
      return rows.length ? { userId: rows[0].userId } : null;
    },

    async markVerifiedAndRefreshSessions(userId) {
      const db = getDb();
      await db
        .update(users)
        .set({ emailVerified: true, updatedAt: new Date() })
        .where(eq(users.id, userId));

      // Delete the used token and any other tokens for this user.
      await db
        .delete(emailVerificationTokens)
        .where(eq(emailVerificationTokens.userId, userId));

      // Sessions created pre-verification were capped at 1 hour; extend them
      // back to the normal 30-day window so the user isn't logged out.
      await db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() + THIRTY_DAYS_MS) })
        .where(eq(sessions.userId, userId));
    },
  };
}
