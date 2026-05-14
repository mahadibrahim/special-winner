/**
 * Guard wrapper for `drizzle-kit push`.
 *
 * `drizzle-kit push` diffs the live database against schema.ts and
 * applies the delta DIRECTLY — no migration file, no row in
 * drizzle.__drizzle_migrations. That is exactly how the production
 * schema drift behind the 0024 incident happened: prod ended up with
 * the `user_gender` enum + `users.gender` column (pushed ad-hoc) but no
 * corresponding migration tracking, so the next `db:migrate` collided
 * with "type already exists".
 *
 * Push is for LOCAL / throwaway iteration only. For any shared database
 * (staging, prod) the path is `db:generate` → commit the migration →
 * `db:migrate`.
 *
 * This guard refuses to run unless DATABASE_URL clearly points at a
 * local database, or the operator explicitly opts in for a remote one
 * with ALLOW_REMOTE_PUSH=yes.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "";

if (!url) {
  console.error("db:push refused — DATABASE_URL is not set.");
  process.exit(1);
}

// Only a local host is auto-allowed. Anything remote (staging OR prod)
// must opt in explicitly — pattern-matching "staging" is unreliable
// (Railway proxy hostnames don't contain it), and "refuse unless local"
// is the safe default.
const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:\/]/.test(url);

if (!isLocal && process.env.ALLOW_REMOTE_PUSH !== "yes") {
  console.error(
    [
      "db:push refused — DATABASE_URL does not point at a local database.",
      "",
      "  `drizzle-kit push` applies schema changes directly, with no",
      "  migration file and no tracking row. Pushing to a shared database",
      "  causes drift (see the 0024 production incident).",
      "",
      "  • For staging / prod: use `npm run db:generate` to create a",
      "    migration, commit it, and let `db:migrate` apply it.",
      "  • If you genuinely mean to push to this remote database, re-run:",
      "      ALLOW_REMOTE_PUSH=yes npm run db:push",
      "",
      `  (DATABASE_URL host: ${url.replace(/^.*@/, "").replace(/[/?].*$/, "") || "unknown"})`,
    ].join("\n"),
  );
  process.exit(2);
}

const result = spawnSync("npx", ["drizzle-kit", "push"], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
