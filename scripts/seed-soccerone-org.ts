/**
 * TEST-FIXTURE provisioning script: create the "soccerone" fixture
 * organization, its locations, and domain_mappings rows.
 *
 * ⚠️ Single-org cutover (2026-06-11): in prod, SoccerOne is a brand skin
 * over the Aspire org — NOT a tenant — and gosoccerone.com's
 * domain_mappings point at the Aspire org. Do NOT run this against prod.
 * The script survives only because test fixtures depend on the
 * "soccerone" slug org as "an org with tiers/venues configured" for
 * multi-tenant coverage (seed-e2e Stages 12/13, membership API tests,
 * tests/unit/soccerone/venues.test.ts).
 *
 * Idempotent — safe to re-run. Each insert is "select-by-slug,
 * insert-if-missing." No deletes.
 *
 * Usage (staging / switchyard / local only):
 *   npx tsx scripts/seed-soccerone-org.ts
 *
 * Refuses to run unless DATABASE_URL contains "staging", "switchyard",
 * or "localhost" (legacy --prod override retained but should not be used).
 */
import "dotenv/config";
import { getDb } from "../src/lib/db";
import {
  organizations,
  locations,
  domainMappings,
} from "../src/lib/db/schema/organizations";
import { fieldRentalRateCard } from "../src/lib/db/schema/field-rentals";
import { eq } from "drizzle-orm";

const SAFE_HOST_FRAGMENTS = ["localhost", "switchyard", "staging"];
const PROD_OPT_IN = process.argv.includes("--prod");

function assertSafeTarget() {
  const url = process.env.DATABASE_URL ?? "";
  if (PROD_OPT_IN) {
    console.log("⚠️  --prod flag set; allowing potentially-prod DATABASE_URL.");
    return;
  }
  if (!SAFE_HOST_FRAGMENTS.some((frag) => url.includes(frag))) {
    console.error(
      "❌ DATABASE_URL does not look like a safe (staging/local) target.",
    );
    console.error(`   Got: ${url.replace(/:[^@]+@/, ":***@")}`);
    console.error("   Pass --prod to override.");
    process.exit(1);
  }
}

async function main() {
  assertSafeTarget();
  const db = getDb();
  if (!db) {
    throw new Error("Could not initialize DB client");
  }

  console.log("1. Creating SoccerOne organization...");
  let [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "soccerone"))
    .limit(1);

  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({
        name: "SoccerOne",
        slug: "soccerone",
        legalName: "SoccerOne LLC",
        status: "active",
        // IMPORTANT: NOT "headquarters" — Aspire is the HQ org. SoccerOne
        // is a partner/franchise tenant. The default-org resolver picks
        // the oldest HQ org, so SoccerOne being a non-HQ guarantees
        // Aspire stays the fallback default.
        organizationType: "franchise",
        timezone: "America/New_York",
        country: "US",
        city: "Columbus",
        state: "OH",
        website: "https://www.gosoccerone.com",
      })
      .returning();
    console.log(`   ✓ Created org ${org.id}`);
  } else {
    console.log(`   ✓ Org already exists: ${org.id}`);
  }

  console.log("\n2. Creating Downtown location...");
  let [downtown] = await db
    .select()
    .from(locations)
    .where(eq(locations.slug, "soccerone-downtown"))
    .limit(1);

  if (!downtown) {
    [downtown] = await db
      .insert(locations)
      .values({
        organizationId: org.id,
        name: "SoccerOne Downtown",
        slug: "soccerone-downtown",
        city: "Columbus",
        state: "OH",
        country: "US",
        timezone: "America/New_York",
        active: true,
        sortOrder: 1,
      })
      .returning();
    console.log(`   ✓ Created location ${downtown.id}`);
  } else {
    console.log(`   ✓ Downtown location already exists: ${downtown.id}`);
  }

  console.log("\n3. Creating Worthington location...");
  let [worthington] = await db
    .select()
    .from(locations)
    .where(eq(locations.slug, "soccerone-worthington"))
    .limit(1);

  if (!worthington) {
    [worthington] = await db
      .insert(locations)
      .values({
        organizationId: org.id,
        name: "SoccerOne Worthington",
        slug: "soccerone-worthington",
        city: "Worthington",
        state: "OH",
        country: "US",
        timezone: "America/New_York",
        active: true,
        sortOrder: 2,
      })
      .returning();
    console.log(`   ✓ Created location ${worthington.id}`);
  } else {
    console.log(`   ✓ Worthington location already exists: ${worthington.id}`);
  }

  console.log("\n4. Creating domain_mappings rows...");
  // Both rows are inserted with status='pending'. The founder flips them
  // to 'ssl_active' from the admin UI / DB after Netlify confirms SSL
  // for each hostname. Until then, the resolver does not match these
  // hostnames (status != ssl_active), so the middleware's SoccerOne
  // branch does not fire on gosoccerone.com — the unmapped-host guard
  // returns 404 instead.
  //
  // www.gosoccerone.com is isPrimary=true (canonical); bare apex is
  // isPrimary=false. The domain_mappings_org_primary_uniq partial index
  // allows only one isPrimary=true per org, so the apex row must be false.
  const domainRows: Array<{ domain: string; isPrimary: boolean }> = [
    { domain: "www.gosoccerone.com", isPrimary: true },
    { domain: "gosoccerone.com", isPrimary: false },
  ];

  for (const { domain, isPrimary } of domainRows) {
    const [existing] = await db
      .select()
      .from(domainMappings)
      .where(eq(domainMappings.domain, domain))
      .limit(1);

    if (!existing) {
      const [row] = await db
        .insert(domainMappings)
        .values({
          domain,
          organizationId: org.id,
          // locationId intentionally null — this domain maps to the org
          // as a whole, not a specific location. The resolver can narrow
          // to a location via subdomain or path if needed later.
          status: "pending",
          isPrimary,
        })
        .returning();
      console.log(
        `   ✓ Created domain_mapping ${domain} → ${row.id} (status: pending, isPrimary: ${isPrimary})`,
      );
    } else {
      console.log(
        `   ✓ ${domain} already mapped (status: ${existing.status}, isPrimary: ${existing.isPrimary})`,
      );
    }
  }

  console.log("\n5. Ensuring field_rental_rate_card (cancelWindowHours=336, 14-day window)...");
  const [existingRateCard] = await db
    .select()
    .from(fieldRentalRateCard)
    .where(eq(fieldRentalRateCard.organizationId, org.id))
    .limit(1);

  if (!existingRateCard) {
    const [rateCard] = await db
      .insert(fieldRentalRateCard)
      .values({
        organizationId: org.id,
        cancelWindowHours: 336, // 14 days × 24 h
        // All other columns left to schema defaults:
        //   defaultHourlyRateCents: 8000 (tiered engine overrides at runtime)
        //   bookingIncrementMinutes: 60
        //   minDurationMinutes: 60
        //   maxDurationMinutes: 240
        //   checkInWindowMinutes: 60
      })
      .returning();
    console.log(`   ✓ Created rate card ${rateCard.id} (cancelWindowHours: ${rateCard.cancelWindowHours})`);
  } else if (existingRateCard.cancelWindowHours !== 336) {
    const [updated] = await db
      .update(fieldRentalRateCard)
      .set({ cancelWindowHours: 336, updatedAt: new Date() })
      .where(eq(fieldRentalRateCard.organizationId, org.id))
      .returning();
    console.log(
      `   ✓ Updated rate card ${updated.id}: cancelWindowHours ${existingRateCard.cancelWindowHours} → ${updated.cancelWindowHours}`,
    );
  } else {
    console.log(
      `   ✓ Rate card already correct (cancelWindowHours: ${existingRateCard.cancelWindowHours})`,
    );
  }

  console.log("\n✅ SoccerOne provisioning complete.");
  console.log(
    "\nNext steps (see docs/ops/soccerone-launch-checklist.md once created):",
  );
  console.log(
    "  • Test routing via http://soccerone.aspiresports.com (subdomain resolver matches by org slug).",
  );
  console.log(
    "  • Add gosoccerone.com + www.gosoccerone.com as Netlify domain aliases.",
  );
  console.log("  • Point DNS at the registrar.");
  console.log("  • Wait for Netlify SSL.");
  console.log(
    "  • Flip domain_mappings.status to 'ssl_active' for both rows.",
  );
}

main().catch((err) => {
  console.error("❌ provisioning failed:", err);
  process.exit(1);
});
