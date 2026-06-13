import { describe, it, expect } from "vitest";
import {
  extractSchemaEffects,
  resolveEffects,
  planExistingRowAction,
  type RawEffect,
} from "../../../scripts/db-migrate-bootstrap";

describe("extractSchemaEffects", () => {
  it("parses CREATE TABLE", () => {
    const sql = `CREATE TABLE "users" (\n  "id" uuid PRIMARY KEY\n);`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "create-table", name: "users" },
    ]);
  });

  it("parses CREATE TABLE IF NOT EXISTS", () => {
    const sql = `CREATE TABLE IF NOT EXISTS "sessions" ("id" uuid);`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "create-table", name: "sessions" },
    ]);
  });

  it("parses ALTER TABLE ADD COLUMN", () => {
    const sql = `ALTER TABLE "users" ADD COLUMN "email" text NOT NULL;`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "add-column", table: "users", column: "email" },
    ]);
  });

  it("parses ALTER TABLE ADD COLUMN IF NOT EXISTS", () => {
    const sql = `ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "is_test" boolean DEFAULT false NOT NULL;`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "add-column", table: "programs", column: "is_test" },
    ]);
  });

  it("parses DROP TABLE without CASCADE", () => {
    const sql = `DROP TABLE "password_reset_tokens";`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "drop-table", name: "password_reset_tokens" },
    ]);
  });

  it("parses DROP TABLE with CASCADE", () => {
    const sql = `DROP TABLE "password_reset_tokens" CASCADE;`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "drop-table", name: "password_reset_tokens" },
    ]);
  });

  it("parses DROP TABLE IF EXISTS", () => {
    const sql = `DROP TABLE IF EXISTS "old_table" CASCADE;`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "drop-table", name: "old_table" },
    ]);
  });

  it("parses ALTER TABLE DROP COLUMN", () => {
    const sql = `ALTER TABLE "users" DROP COLUMN "legacy_field";`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "drop-column", table: "users", column: "legacy_field" },
    ]);
  });

  it("parses ALTER TABLE DROP COLUMN IF EXISTS", () => {
    const sql = `ALTER TABLE "teams" DROP COLUMN IF EXISTS "old_col";`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "drop-column", table: "teams", column: "old_col" },
    ]);
  });

  // ── Regression suite: 2026-05-17 incident ──────────────────────────
  // Migration 0029_drop_unused_bookings_tables.sql used
  // `DROP TABLE IF EXISTS public.bookings CASCADE;` (unquoted,
  // schema-qualified). The quote-only regex returned no effects → bootstrap
  // logged "no detectable schema effects … left un-applied" → drizzle's
  // migrator then silently skipped 0029 because a later migration in
  // __drizzle_migrations carried a higher `when` timestamp. Result: prod
  // kept the phantom tables for a full deploy cycle. These tests pin the
  // bootstrap's tolerance for the four identifier shapes drizzle emits
  // (quoted, unquoted, and schema-qualified variants of either).

  it("parses unquoted DROP TABLE", () => {
    const sql = `DROP TABLE bookings CASCADE;`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "drop-table", name: "bookings" },
    ]);
  });

  it("parses schema-qualified unquoted DROP TABLE", () => {
    const sql = `DROP TABLE IF EXISTS public.bookings CASCADE;`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "drop-table", name: "bookings" },
    ]);
  });

  it("parses schema-qualified quoted DROP TABLE", () => {
    const sql = `DROP TABLE IF EXISTS "public"."bookings";`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "drop-table", name: "bookings" },
    ]);
  });

  it("parses unquoted CREATE TABLE", () => {
    const sql = `CREATE TABLE IF NOT EXISTS bookings ("id" uuid);`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "create-table", name: "bookings" },
    ]);
  });

  it("parses schema-qualified CREATE TABLE", () => {
    const sql = `CREATE TABLE public.bookings ("id" uuid);`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "create-table", name: "bookings" },
    ]);
  });

  it("parses unquoted ALTER TABLE ADD COLUMN", () => {
    const sql = `ALTER TABLE users ADD COLUMN email text;`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "add-column", table: "users", column: "email" },
    ]);
  });

  it("parses schema-qualified ALTER TABLE DROP COLUMN", () => {
    const sql = `ALTER TABLE public.users DROP COLUMN IF EXISTS legacy_field;`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "drop-column", table: "users", column: "legacy_field" },
    ]);
  });

  it("parses 0029's exact body (regression for the original bug)", () => {
    const sql = [
      `DROP TABLE IF EXISTS public.bookings CASCADE;`,
      `--> statement-breakpoint`,
      `DROP TABLE IF EXISTS public.bookable_resources CASCADE;`,
    ].join("\n");
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "drop-table", name: "bookings" },
      { kind: "drop-table", name: "bookable_resources" },
    ]);
  });

  // ── Regression suite: 2026-06-12 incident ──────────────────────────
  // Migration 0043_numerous_terrax.sql (PR #185) was index-only. The parser
  // saw zero effects → bootstrap flagged it "hashless" and DELETED the
  // tracking row drizzle's migrator had legitimately written on the previous
  // deploy → the migrator re-ran 0043 on the NEXT push to main and died on
  // `CREATE INDEX … already exists`, failing migrate-prod and migrate-staging
  // (hotfixed by #187 making 0043 idempotent). These tests pin index-effect
  // parsing so index-only migrations are verifiable.

  it("parses CREATE INDEX with USING btree", () => {
    const sql = `CREATE INDEX "age_groups_org_idx" ON "age_groups" USING btree ("organization_id");`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "create-index", name: "age_groups_org_idx", table: "age_groups" },
    ]);
  });

  it("parses CREATE UNIQUE INDEX with a partial WHERE clause", () => {
    const sql = `CREATE UNIQUE INDEX "memberships_one_active_per_user_org" ON "memberships" USING btree ("user_id","organization_id") WHERE status IN ('active', 'paused');`;
    expect(extractSchemaEffects(sql)).toEqual([
      {
        kind: "create-index",
        name: "memberships_one_active_per_user_org",
        table: "memberships",
      },
    ]);
  });

  it("parses CREATE INDEX IF NOT EXISTS split across lines", () => {
    const sql = `CREATE INDEX IF NOT EXISTS "idx_staff_notification_conversation"\n  ON "staff_notifications" ("conversation_id");`;
    expect(extractSchemaEffects(sql)).toEqual([
      {
        kind: "create-index",
        name: "idx_staff_notification_conversation",
        table: "staff_notifications",
      },
    ]);
  });

  it("parses CREATE INDEX on a schema-qualified table", () => {
    const sql = `CREATE INDEX "foo_idx" ON public.foo USING btree ("bar");`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "create-index", name: "foo_idx", table: "foo" },
    ]);
  });

  it("parses DROP INDEX IF EXISTS", () => {
    const sql = `DROP INDEX IF EXISTS "payments_stripe_charge_idx";`;
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "drop-index", name: "payments_stripe_charge_idx" },
    ]);
  });

  it("parses 0043's exact body (regression for the original bug)", () => {
    const sql = [
      `CREATE INDEX "age_groups_org_idx" ON "age_groups" USING btree ("organization_id");--> statement-breakpoint`,
      `CREATE INDEX "idx_magic_links_expires_at" ON "magic_links" USING btree ("expires_at");`,
    ].join("\n");
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "create-index", name: "age_groups_org_idx", table: "age_groups" },
      { kind: "create-index", name: "idx_magic_links_expires_at", table: "magic_links" },
    ]);
  });

  it("parses multiple effects from a single migration", () => {
    const sql = [
      `CREATE TABLE "foo" ("id" uuid PRIMARY KEY);`,
      `CREATE TABLE "bar" ("id" uuid PRIMARY KEY);`,
      `ALTER TABLE "baz" ADD COLUMN "col1" text;`,
      `DROP TABLE "old_foo" CASCADE;`,
      `ALTER TABLE "qux" DROP COLUMN "legacy";`,
    ].join("\n");
    expect(extractSchemaEffects(sql)).toEqual([
      { kind: "create-table", name: "foo" },
      { kind: "create-table", name: "bar" },
      { kind: "add-column", table: "baz", column: "col1" },
      { kind: "drop-table", name: "old_foo" },
      { kind: "drop-column", table: "qux", column: "legacy" },
    ]);
  });
});

describe("resolveEffects", () => {
  it("marks a created table expectPresent:true when no later migration drops it", () => {
    const allEffects: RawEffect[][] = [
      [{ kind: "create-table", name: "users" }],
      [{ kind: "add-column", table: "users", column: "email" }],
    ];
    const resolved = resolveEffects(0, allEffects);
    expect(resolved).toEqual([
      { kind: "create-table", name: "users", expectPresent: true },
    ]);
  });

  it("marks a created table expectPresent:false when a later migration drops it", () => {
    const allEffects: RawEffect[][] = [
      [{ kind: "create-table", name: "password_reset_tokens" }],
      [{ kind: "drop-table", name: "password_reset_tokens" }],
    ];
    const resolved = resolveEffects(0, allEffects);
    expect(resolved).toEqual([
      {
        kind: "create-table",
        name: "password_reset_tokens",
        expectPresent: false,
      },
    ]);
  });

  it("marks an added column expectPresent:false when a later migration drops the parent table", () => {
    const allEffects: RawEffect[][] = [
      [{ kind: "add-column", table: "tokens", column: "expires_at" }],
      [{ kind: "drop-table", name: "tokens" }],
    ];
    const resolved = resolveEffects(0, allEffects);
    expect(resolved).toEqual([
      {
        kind: "add-column",
        table: "tokens",
        column: "expires_at",
        expectPresent: false,
      },
    ]);
  });

  it("marks an added column expectPresent:false when a later migration drops that column", () => {
    const allEffects: RawEffect[][] = [
      [{ kind: "add-column", table: "users", column: "legacy_field" }],
      [{ kind: "drop-column", table: "users", column: "legacy_field" }],
    ];
    const resolved = resolveEffects(0, allEffects);
    expect(resolved).toEqual([
      {
        kind: "add-column",
        table: "users",
        column: "legacy_field",
        expectPresent: false,
      },
    ]);
  });

  it("does not include drop effects from the migration itself in resolved output", () => {
    // Migration that creates one table and drops another.
    const allEffects: RawEffect[][] = [
      [
        { kind: "create-table", name: "new_table" },
        { kind: "drop-table", name: "old_table" },
      ],
    ];
    const resolved = resolveEffects(0, allEffects);
    // Only create-table and add-column effects appear in resolved; drop effects are omitted.
    expect(resolved).toEqual([
      { kind: "create-table", name: "new_table", expectPresent: true },
    ]);
  });

  it("only considers migrations strictly AFTER the current index for the dropped-by check", () => {
    // Migration 1 creates "foo". Migration 0 (earlier!) drops "foo".
    // When resolving migration 1, migration 0 is not a "later" migration.
    const allEffects: RawEffect[][] = [
      [{ kind: "drop-table", name: "foo" }], // migration 0
      [{ kind: "create-table", name: "foo" }], // migration 1
    ];
    const resolved = resolveEffects(1, allEffects);
    // No migrations after index 1 drop "foo", so expectPresent: true.
    expect(resolved).toEqual([
      { kind: "create-table", name: "foo", expectPresent: true },
    ]);
  });

  it("handles migration with multiple creates where only one is later dropped", () => {
    const allEffects: RawEffect[][] = [
      [
        { kind: "create-table", name: "table_a" },
        { kind: "create-table", name: "table_b" },
      ],
      [{ kind: "drop-table", name: "table_a" }],
    ];
    const resolved = resolveEffects(0, allEffects);
    expect(resolved).toEqual([
      { kind: "create-table", name: "table_a", expectPresent: false },
      { kind: "create-table", name: "table_b", expectPresent: true },
    ]);
  });

  it("marks a created index expectPresent:true when nothing later drops it", () => {
    const allEffects: RawEffect[][] = [
      [{ kind: "create-index", name: "users_email_idx", table: "users" }],
    ];
    expect(resolveEffects(0, allEffects)).toEqual([
      { kind: "create-index", name: "users_email_idx", expectPresent: true },
    ]);
  });

  it("marks a created index expectPresent:false when a later migration drops it", () => {
    // The real 0031 shape: an earlier migration created payments_stripe_charge_idx,
    // 0031 drops it and creates a *_uniq replacement.
    const allEffects: RawEffect[][] = [
      [{ kind: "create-index", name: "payments_stripe_charge_idx", table: "payments" }],
      [{ kind: "drop-index", name: "payments_stripe_charge_idx" }],
    ];
    expect(resolveEffects(0, allEffects)).toEqual([
      { kind: "create-index", name: "payments_stripe_charge_idx", expectPresent: false },
    ]);
  });

  it("marks a created index expectPresent:false when a later migration drops its table", () => {
    const allEffects: RawEffect[][] = [
      [{ kind: "create-index", name: "bookings_user_idx", table: "bookings" }],
      [{ kind: "drop-table", name: "bookings" }],
    ];
    expect(resolveEffects(0, allEffects)).toEqual([
      { kind: "create-index", name: "bookings_user_idx", expectPresent: false },
    ]);
  });
});

describe("planExistingRowAction", () => {
  // Pins the 2026-06-12 incident fix: the reconciler must never delete a
  // tracking row written by drizzle's migrator for a migration it cannot
  // parse — deleting it makes the migrator re-run that migration on the
  // next deploy (fatal when it's the journal tail and non-idempotent).
  const expectedApplied = new Map([["hash-a", { tag: "0001_a", when: 100 }]]);
  const hashlessByHash = new Map([["hash-z", { tag: "0002_z", when: 200 }]]);

  it("rewrites rows in the expected-applied set", () => {
    expect(planExistingRowAction("hash-a", expectedApplied, hashlessByHash)).toBe(
      "rewrite",
    );
  });

  it("preserves rows for hashless (unparseable) journal entries", () => {
    expect(planExistingRowAction("hash-z", expectedApplied, hashlessByHash)).toBe(
      "preserve",
    );
  });

  it("deletes rows matching no current journal entry (true drift)", () => {
    expect(
      planExistingRowAction("hash-unknown", expectedApplied, hashlessByHash),
    ).toBe("delete");
  });
});
