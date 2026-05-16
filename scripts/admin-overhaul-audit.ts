/**
 * Stale-data audit for the admin overhaul page consolidations.
 *
 * Read-only. Identifies orphan rows that the new merged pages would
 * surface awkwardly — sports with zero programs, age groups with zero
 * programs, teams not tied to a season, etc.
 *
 * Run against staging (or a prod replica), NEVER prod. Refuses to run
 * if DATABASE_URL points at a Railway host without an explicit
 * ALLOW_PROD_AUDIT=yes opt-in.
 *
 * Usage:
 *   tsx scripts/admin-overhaul-audit.ts
 *   tsx scripts/admin-overhaul-audit.ts > docs/superpowers/specs/2026-05-16-admin-overhaul-audit-output.md
 *
 * Output is markdown-friendly so it can be redirected straight into a
 * doc for founder review.
 */

import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";

function guardDatabaseUrl(): void {
  const url = process.env.DATABASE_URL ?? "";
  const looksProd = /rlwy\.net|railway\.app/.test(url);
  if (looksProd && process.env.ALLOW_PROD_AUDIT !== "yes") {
    console.error(
      "REFUSED: DATABASE_URL looks like prod (Railway). Set ALLOW_PROD_AUDIT=yes to override (do not do this against the real prod DB).",
    );
    process.exit(2);
  }
}

const QUERIES: { name: string; sql: string }[] = [
  {
    name: "Sports with zero programs",
    sql: `SELECT s.id, s.name FROM sports s LEFT JOIN programs p ON p.sport_id = s.id WHERE p.id IS NULL ORDER BY s.name`,
  },
  {
    name: "Age groups with zero seasons (age_group_id lives on seasons, not programs)",
    sql: `SELECT ag.id, ag.name FROM age_groups ag LEFT JOIN seasons s ON s.age_group_id = ag.id WHERE s.id IS NULL ORDER BY ag.name`,
  },
  {
    name: "Programs with zero seasons (review — may be intentional drafts)",
    sql: `SELECT p.id, p.name FROM programs p LEFT JOIN seasons s ON s.program_id = p.id WHERE s.id IS NULL ORDER BY p.name`,
  },
  {
    name: "Teams not tied to any season (should be impossible per schema)",
    sql: `SELECT t.id, t.name FROM teams t WHERE t.season_id IS NULL`,
  },
  {
    name: "Games with no associated season (should be impossible per schema)",
    sql: `SELECT g.id FROM games g WHERE g.season_id IS NULL`,
  },
  {
    name: "Drop-in sessions orphaned from a venue",
    sql: `SELECT ds.id FROM drop_in_sessions ds LEFT JOIN venues v ON v.id = ds.venue_id WHERE v.id IS NULL`,
  },
  {
    name: "Venues with no parent location (should be impossible)",
    sql: `SELECT v.id, v.name FROM venues v LEFT JOIN locations l ON l.id = v.location_id WHERE l.id IS NULL`,
  },
  {
    name: "user_organization_access for missing/suspended/inactive orgs",
    sql: `SELECT uoa.id, uoa.user_id, uoa.organization_id, o.status FROM user_organization_access uoa LEFT JOIN organizations o ON o.id = uoa.organization_id WHERE o.id IS NULL OR o.status IN ('suspended', 'inactive')`,
  },
  {
    name: "Test-pattern Programs (name starts with 'Test Program')",
    sql: `SELECT p.id, p.name, p.created_at FROM programs p WHERE p.name LIKE 'Test Program%' OR p.name LIKE 'test-%' ORDER BY p.created_at`,
  },
  {
    name: "Test-pattern Age groups (name matches U10-1778… or Test-AG…)",
    sql: `SELECT ag.id, ag.name FROM age_groups ag WHERE ag.name ~ '^(U[0-9]+|Adult)-1[0-9]{12}-' OR ag.name LIKE 'Test-AG-%' ORDER BY ag.name`,
  },
  {
    name: "Test-pattern Seasons (name starts with 'Season 1778…')",
    sql: `SELECT s.id, s.name, s.status FROM seasons s WHERE s.name ~ '^Season 1[0-9]{12}-' ORDER BY s.created_at`,
  },
  {
    name: "Test-pattern Sports (anything with -1778… suffix)",
    sql: `SELECT sp.id, sp.name FROM sports sp WHERE sp.name ~ '-1[0-9]{12}-' ORDER BY sp.name`,
  },
  {
    name: "is_test=true programs",
    sql: `SELECT p.id, p.name, p.created_at FROM programs p WHERE p.is_test = true ORDER BY p.created_at`,
  },
  {
    name: "Programs created in the last hour (recent test churn)",
    sql: `SELECT p.id, p.name, p.created_at FROM programs p WHERE p.created_at > NOW() - INTERVAL '1 hour' ORDER BY p.created_at DESC LIMIT 50`,
  },
  {
    name: "family_members with both parent and self null (DB CHECK enforces this — should always be 0)",
    sql: `SELECT id FROM family_members WHERE parent_user_id IS NULL AND self_user_id IS NULL`,
  },
];

async function main() {
  guardDatabaseUrl();
  const db = getDb();

  console.log("# Admin Overhaul stale-data audit\n");
  console.log(`Run at: ${new Date().toISOString()}`);
  console.log(`DATABASE_URL host: ${(process.env.DATABASE_URL ?? "").replace(/\/\/[^@]*@/, "//***@")}\n`);

  for (const q of QUERIES) {
    console.log(`## ${q.name}\n`);
    try {
      const rows = await db.execute(sql.raw(q.sql));
      const data: any[] = Array.isArray(rows) ? rows : ((rows as any).rows ?? []);
      if (data.length === 0) {
        console.log("(none)\n");
      } else {
        const columns = Object.keys(data[0]);
        console.log("| " + columns.join(" | ") + " |");
        console.log("| " + columns.map(() => "---").join(" | ") + " |");
        for (const row of data) {
          console.log(
            "| " + columns.map((c) => String((row as any)[c] ?? "")).join(" | ") + " |",
          );
        }
        console.log("");
      }
    } catch (e) {
      console.error(`ERROR running query: ${(e as Error).message}\n`);
    }
  }

  console.log("---\nFounder review: annotate each row as 'delete' or 'keep'. Phase 4.2 turns the 'delete' set into a single explicit SQL migration.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
