import { describe, it, expect } from "vitest";
import {
  statementsToRun,
  pendingMigrations,
} from "../../../scripts/db-migrate";

describe("statementsToRun", () => {
  it("keeps every non-blank statement chunk, in order", () => {
    const migration = { sql: ["CREATE TABLE a();", "ALTER TABLE a ADD COLUMN b int;"] };
    expect(statementsToRun(migration)).toEqual([
      "CREATE TABLE a();",
      "ALTER TABLE a ADD COLUMN b int;",
    ]);
  });

  it("drops whitespace-only chunks (e.g. a trailing statement-breakpoint)", () => {
    const migration = { sql: ["CREATE TABLE a();", "\n", "   ", ""] };
    expect(statementsToRun(migration)).toEqual(["CREATE TABLE a();"]);
  });

  it("preserves internal whitespace/formatting of a real statement", () => {
    const stmt = "DO $$ BEGIN\n  CREATE TYPE x AS ENUM('a');\nEXCEPTION WHEN duplicate_object THEN null; END $$;";
    expect(statementsToRun({ sql: [stmt] })).toEqual([stmt]);
  });
});

describe("pendingMigrations", () => {
  const migrations = [
    { sql: ["a"], bps: true, folderMillis: 1, hash: "hash-a" },
    { sql: ["b"], bps: true, folderMillis: 2, hash: "hash-b" },
    { sql: ["c"], bps: true, folderMillis: 3, hash: "hash-c" },
  ];

  it("returns every migration when nothing is applied", () => {
    expect(pendingMigrations(migrations, new Set())).toEqual(migrations);
  });

  it("returns nothing when every hash is already applied", () => {
    const applied = new Set(["hash-a", "hash-b", "hash-c"]);
    expect(pendingMigrations(migrations, applied)).toEqual([]);
  });

  it("returns only the migrations whose hash is not yet applied, preserving order", () => {
    // Simulates a mixed history: hash-a was applied by the OLD single-tx
    // drizzle migrate() in an earlier deploy; hash-b and hash-c are new.
    const applied = new Set(["hash-a"]);
    expect(pendingMigrations(migrations, applied)).toEqual([
      migrations[1],
      migrations[2],
    ]);
  });

  it("is hash-based, not position/watermark-based", () => {
    // A hash present out of journal order (contrived, but proves the
    // filter doesn't assume a contiguous prefix) is still skipped.
    const applied = new Set(["hash-c"]);
    expect(pendingMigrations(migrations, applied)).toEqual([
      migrations[0],
      migrations[1],
    ]);
  });
});
