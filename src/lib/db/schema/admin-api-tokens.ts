import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Scoped machine tokens for the admin MCP (and future machine callers).
 *
 * Design constraints (deliberate — see PR that introduced this):
 * - Raw tokens are NEVER stored; only a sha256 hash. Minting prints the raw
 *   token exactly once (scripts/mint-admin-api-token.ts).
 * - A token is pinned to ONE organization. The auth helper additionally
 *   requires the request's resolved host org to match the token org, so a
 *   token for one brand cannot be replayed against another tenant.
 * - `scopes` is an explicit allowlist checked per endpoint. Current scopes:
 *   catalog:read, catalog:write, ops:read. There is intentionally no scope
 *   that reaches registrations mutation, refunds, payments, deletes, users,
 *   or messaging — those stay session-only.
 * - Tokens are only honored by endpoints that explicitly call
 *   requireAdminScopedAccess(); every other admin endpoint keeps its
 *   session-only guard and rejects token traffic by construction.
 */
export const adminApiTokens = pgTable(
  "admin_api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Human label, e.g. "owner-macbook admin MCP". */
    name: varchar("name", { length: 100 }).notNull(),
    /** sha256 hex of the raw token. */
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    /** Allowlisted scopes, e.g. {catalog:read,catalog:write}. */
    scopes: varchar("scopes", { length: 50 }).array().notNull(),
    /**
     * The admin user this token acts as — used for audit fields on writes.
     * Deleting that user revokes the token (cascade).
     */
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** Null = no expiry. */
    expiresAt: timestamp("expires_at"),
    lastUsedAt: timestamp("last_used_at"),
    /** Set to revoke; checked on every request. */
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    uniqueIndex("admin_api_tokens_hash_idx").on(table.tokenHash),
    index("admin_api_tokens_org_idx").on(table.organizationId),
  ],
);
