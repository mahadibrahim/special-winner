/**
 * Guard against test fixtures ever running against production.
 *
 * The API-test helpers in this directory (registration-context.ts,
 * admin-org-game-context.ts, dropin-helpers.ts, …) do raw INSERTs against
 * whatever `DATABASE_URL` the process holds. On 2026-07-08 a local run with
 * a prod `DATABASE_URL` override wrote random test orgs/locations
 * ("Loc g00dqku7") straight into production, where they rendered and got
 * indexed by Google.
 *
 * This mirrors the e2e-seed guard (`assertNotProduction` in
 * src/lib/db/seeds/seed-e2e-tests.ts) but ALSO allows a localhost DB — CI's
 * `test-api` job runs against a throwaway Postgres container
 * (`postgresql://…@localhost:5432/aspire_ci`) and does not set
 * ALLOW_E2E_SEED during the test step.
 *
 * Allowed (not prod): localhost/127.0.0.1, any URL containing "staging", or
 * an explicit `ALLOW_E2E_SEED=yes` override. Everything else is refused.
 */
export function assertTestDatabase(opts?: {
  databaseUrl?: string;
  allowE2eSeed?: string;
}): void {
  const url = opts?.databaseUrl ?? process.env.DATABASE_URL ?? "";
  const explicitlyAllowed =
    (opts?.allowE2eSeed ?? process.env.ALLOW_E2E_SEED) === "yes";
  const looksLikeStaging = /staging/i.test(url);
  const isLocal = /(@|\/\/)(localhost|127\.0\.0\.1)([:/]|$)/.test(url);

  if (explicitlyAllowed || looksLikeStaging || isLocal) return;

  // Never echo the full connection string (it carries credentials); show
  // only the host for diagnosis.
  const host = url.replace(/^.*@/, "").replace(/[/?].*$/, "") || "(unset)";
  throw new Error(
    `REFUSED: test fixtures would run against a non-local, non-staging DATABASE_URL ` +
      `(host: ${host}). This looks like production. Test fixture inserts must never ` +
      `reach prod. Point DATABASE_URL at a localhost or "staging" database, or set ` +
      `ALLOW_E2E_SEED=yes to override intentionally.`,
  );
}
