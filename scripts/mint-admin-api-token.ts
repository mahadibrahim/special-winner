/**
 * Mint a scoped admin API token for the admin MCP.
 *
 * Usage (against staging first, then prod via the Railway proxy URL):
 *   DATABASE_URL=... npx tsx scripts/mint-admin-api-token.ts \
 *     --org aspire-sports --user owner@example.com \
 *     --name "owner-macbook admin MCP" \
 *     --scopes catalog:read,catalog:write --expires-days 180
 *
 * Prints the raw token EXACTLY ONCE — only the sha256 hash is stored.
 * Revoke by setting revoked_at on the row (see README in tools/admin-mcp).
 */
import { randomBytes } from "node:crypto";
import { eq, or, ilike } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { adminApiTokens, organizations, users } from "../src/lib/db/schema";
import { hashAdminApiToken, ADMIN_TOKEN_SCOPES } from "../src/lib/auth/admin-api-token";

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const orgArg = arg("org");
  const userArg = arg("user");
  const name = arg("name");
  const scopesArg = arg("scopes");
  const expiresDays = arg("expires-days");

  if (!orgArg || !userArg || !name || !scopesArg) {
    console.error(
      "Required: --org <slug|uuid> --user <email|uuid> --name <label> --scopes <s1,s2> [--expires-days N]",
    );
    process.exit(1);
  }

  const scopes = scopesArg.split(",").map((s) => s.trim());
  const invalid = scopes.filter((s) => !(ADMIN_TOKEN_SCOPES as readonly string[]).includes(s));
  if (invalid.length) {
    console.error(`Unknown scope(s): ${invalid.join(", ")}. Valid: ${ADMIN_TOKEN_SCOPES.join(", ")}`);
    process.exit(1);
  }

  const db = getDb();
  const [org] = await db
    .select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(or(eq(organizations.id, safeUuid(orgArg)), eq(organizations.slug, orgArg)))
    .limit(1);
  if (!org) {
    console.error(`Organization not found: ${orgArg}`);
    process.exit(1);
  }

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(or(eq(users.id, safeUuid(userArg)), ilike(users.email, userArg)))
    .limit(1);
  if (!user) {
    console.error(`User not found: ${userArg}`);
    process.exit(1);
  }

  const raw = `aspire_admin_${randomBytes(32).toString("base64url")}`;
  const expiresAt = expiresDays
    ? new Date(Date.now() + Number(expiresDays) * 86_400_000)
    : null;

  await db.insert(adminApiTokens).values({
    organizationId: org.id,
    name,
    tokenHash: hashAdminApiToken(raw),
    scopes,
    createdByUserId: user.id,
    expiresAt,
  });

  console.log(`\nMinted admin API token for org "${org.name}" (${org.slug})`);
  console.log(`  acts as: ${user.email}`);
  console.log(`  scopes:  ${scopes.join(", ")}`);
  console.log(`  expires: ${expiresAt ? expiresAt.toISOString() : "never"}`);
  console.log(`\n  ${raw}\n`);
  console.log("Store it now (Keychain/Bitwarden) — it cannot be recovered, only re-minted.");
  process.exit(0);
}

/** Non-UUID input must not crash the eq(uuid) comparison — map to nil UUID. */
function safeUuid(v: string): string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    ? v
    : "00000000-0000-0000-0000-000000000000";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
