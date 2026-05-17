import { describe, it, expect } from "vitest";
import {
  extractSchemaEffects,
  resolveEffects,
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
});
