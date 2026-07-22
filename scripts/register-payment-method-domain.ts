/**
 * Register payment-method domains with Stripe for Apple Pay / Google Pay support.
 *
 * Stripe requires an Apple Pay domain-association file to be served at
 * /.well-known/apple-developer-merchantid-domain-association on each domain
 * before Stripe can validate the domain. This script registers each domain
 * with Stripe and calls the validate API, which confirms the file is live.
 *
 * ─── DEPLOY-ORDER RUNBOOK (Wave 3 PR body) ────────────────────────────────
 * The domain-association file must be LIVE on the domain before Stripe can
 * validate a registration. Sequence:
 *   1. Merge PR (includes public/.well-known/apple-developer-merchantid-domain-association)
 *   2. Wait for deploy to prod (Netlify auto-deploy on push to main)
 *   3. Run this script with the test key: ./scripts/with-bws.sh npx tsx scripts/register-payment-method-domain.ts
 *      (creates/finds domains in test mode; domains stay inactive until validated)
 *   4. Run with live key (after owner runs `stripe login`):
 *      STRIPE_SECRET_KEY=sk_live_… npx tsx scripts/register-payment-method-domain.ts
 *      (validates domains once the file is live on prod)
 * ─── END RUNBOOK ──────────────────────────────────────────────────────────
 *
 * Usage:
 *   ./scripts/with-bws.sh npx tsx scripts/register-payment-method-domain.ts
 *   # or override domains:
 *   STRIPE_SECRET_KEY=sk_test_… npx tsx scripts/register-payment-method-domain.ts domain1.com domain2.com
 *
 * Reads: STRIPE_SECRET_KEY from env (via bws or .env)
 * Args: domain names (defaults: aspiresportsohio.com, www.gosoccerone.com)
 *
 * Output: per-domain status { domain, enabled, apple_pay, google_pay, link }
 * Exit: 0 (success or validation warnings), 1 (missing key or API error)
 */
import "dotenv/config";
import Stripe from "stripe";

const SECRET = process.env.STRIPE_SECRET_KEY;
const DEFAULT_DOMAINS = [
  "aspiresportsohio.com",
  "www.gosoccerone.com",
];

if (!SECRET) {
  console.error("STRIPE_SECRET_KEY is required in env");
  process.exit(1);
}

const args = process.argv.slice(2);
const domains = args.length > 0 ? args : DEFAULT_DOMAINS;

async function main() {
  const stripe = new Stripe(SECRET as string, { typescript: true });

  console.log(`\nRegistering payment-method domains with Stripe…\n`);

  for (const domain of domains) {
    console.log(`─ ${domain}`);

    try {
      // List existing domains to find or reuse.
      let paymentMethodDomain: Stripe.PaymentMethodDomain | null = null;
      let created = false;

      const existingList = await stripe.paymentMethodDomains.list({
        domain_name: domain,
      });

      if (existingList.data.length > 0) {
        paymentMethodDomain = existingList.data[0];
        console.log(`  Found existing domain record (id=${paymentMethodDomain.id})`);
      } else {
        // Create if not found.
        paymentMethodDomain = await stripe.paymentMethodDomains.create({
          domain_name: domain,
        });
        created = true;
        console.log(`  Created new domain record (id=${paymentMethodDomain.id})`);
      }

      // Attempt validation. The file must be live at https://{domain}/.well-known/apple-developer-merchantid-domain-association
      // Stripe returns 200 with status fields set to "inactive" if the file isn't reachable yet.
      let validationWarning: string | null = null;
      try {
        const validated = await stripe.paymentMethodDomains.validate(
          paymentMethodDomain.id,
        );
        paymentMethodDomain = validated;

        // Inspect the returned validation statuses. apple_pay is the authoritative check.
        if (paymentMethodDomain.apple_pay?.status !== "active") {
          const errorDetail =
            paymentMethodDomain.apple_pay?.status_details?.error_message
            ?? "association file not yet reachable";
          validationWarning = `apple_pay ${paymentMethodDomain.apple_pay?.status ?? "unknown"} — ${errorDetail}`;
          console.log(
            `  ⚠ ${domain}: ${validationWarning}; re-run after deploy to validate`,
          );
        } else {
          console.log(`  ✓ Validated successfully`);
        }
      } catch (err) {
        // Defensive catch for genuine API/auth errors.
        if (err instanceof Stripe.errors.StripeError) {
          throw err;
        }
        throw err;
      }

      // Report status.
      const status = {
        domain,
        enabled: paymentMethodDomain.enabled ?? false,
        apple_pay: paymentMethodDomain.apple_pay?.status ?? "inactive",
        google_pay: paymentMethodDomain.google_pay?.status ?? "inactive",
        link: paymentMethodDomain.link?.status ?? "inactive",
      };
      console.log(`  Status: ${JSON.stringify(status)}\n`);
    } catch (err) {
      console.error(
        `  ✗ Error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(1);
    }
  }

  console.log("Done. If any domain shows validation warnings, re-run after deploy.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nScript failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
