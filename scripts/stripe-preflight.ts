/**
 * Stripe pre-flight check.
 *
 * Run this against any environment's STRIPE_* env vars to confirm the wiring
 * is correct BEFORE customers find out the hard way. Designed to be run:
 *   - locally against .env (sanity check before pushing config changes)
 *   - against prod env vars (right after the Netlify env swap, before live traffic)
 *   - in CI as a deploy gate (future)
 *
 * Reports on:
 *   1. Secret key present + parseable as test/live
 *   2. Publishable key in the SAME mode as the secret key (catches the
 *      classic test-secret + live-publishable mistake)
 *   3. Stripe account: live mode? activated for charges + payouts?
 *      restricted? Required capabilities enabled?
 *   4. Webhook endpoints: is there one pointing at
 *      `<PUBLIC_APP_URL>/api/webhooks/stripe`? Does it subscribe to the
 *      events the handler expects?
 *   5. Connect webhook endpoint (only if STRIPE_CONNECT_WEBHOOK_SECRET set)
 *   6. PUBLIC_APP_URL set + reachable-shaped
 *
 * Exits 0 if all green, 1 if any FAIL. WARN-only items don't fail the run.
 *
 * Usage:
 *   tsx scripts/stripe-preflight.ts
 *   # or with .env loaded:
 *   node -r dotenv/config ./node_modules/.bin/tsx scripts/stripe-preflight.ts
 */
import Stripe from "stripe";

const SECRET = process.env.STRIPE_SECRET_KEY;
const PUBLISHABLE = process.env.STRIPE_PUBLISHABLE_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const CONNECT_WEBHOOK_SECRET = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
const APP_URL = process.env.PUBLIC_APP_URL;
const CRON_SECRET = process.env.CRON_SECRET;

// Events the main webhook handler dispatches on. Keep in sync with
// src/pages/api/webhooks/stripe.ts and package.json `stripe:listen`.
const REQUIRED_MAIN_EVENTS = [
  "checkout.session.completed",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
];

type CheckLevel = "pass" | "warn" | "fail";
interface Check {
  level: CheckLevel;
  label: string;
  detail?: string;
}

const checks: Check[] = [];
function pass(label: string, detail?: string) {
  checks.push({ level: "pass", label, detail });
}
function warn(label: string, detail?: string) {
  checks.push({ level: "warn", label, detail });
}
function fail(label: string, detail?: string) {
  checks.push({ level: "fail", label, detail });
}

function keyMode(key: string | undefined): "test" | "live" | null {
  if (!key) return null;
  if (key.startsWith("sk_test_") || key.startsWith("pk_test_")) return "test";
  if (key.startsWith("sk_live_") || key.startsWith("pk_live_")) return "live";
  // Restricted keys: rk_test_/rk_live_
  if (key.startsWith("rk_test_")) return "test";
  if (key.startsWith("rk_live_")) return "live";
  return null;
}

async function main() {
  // ── 1. Key shape + mode parity ─────────────────────────────────────
  const secretMode = keyMode(SECRET);
  const pubMode = keyMode(PUBLISHABLE);

  if (!SECRET) {
    fail("STRIPE_SECRET_KEY is not set");
  } else if (secretMode === null) {
    fail(
      "STRIPE_SECRET_KEY format unrecognized",
      `expected sk_test_… / sk_live_… / rk_*, got prefix: ${SECRET.slice(0, 10)}…`,
    );
  } else {
    pass(`STRIPE_SECRET_KEY present (${secretMode} mode)`);
  }

  if (!PUBLISHABLE) {
    warn("STRIPE_PUBLISHABLE_KEY is not set — client-side Stripe.js will fail");
  } else if (pubMode === null) {
    fail("STRIPE_PUBLISHABLE_KEY format unrecognized");
  } else if (secretMode && pubMode !== secretMode) {
    fail(
      "Secret/publishable mode mismatch",
      `secret is ${secretMode}, publishable is ${pubMode} — Stripe.js + webhook will be in different modes`,
    );
  } else {
    pass(`STRIPE_PUBLISHABLE_KEY present (${pubMode} mode, matches secret)`);
  }

  if (!WEBHOOK_SECRET) {
    fail(
      "STRIPE_WEBHOOK_SECRET is not set",
      "webhook signature verification will reject every event with 400",
    );
  } else if (!WEBHOOK_SECRET.startsWith("whsec_")) {
    fail(
      "STRIPE_WEBHOOK_SECRET format unrecognized",
      `expected whsec_…, got prefix: ${WEBHOOK_SECRET.slice(0, 10)}…`,
    );
  } else {
    pass("STRIPE_WEBHOOK_SECRET present");
  }

  if (CONNECT_WEBHOOK_SECRET) {
    if (!CONNECT_WEBHOOK_SECRET.startsWith("whsec_")) {
      fail("STRIPE_CONNECT_WEBHOOK_SECRET format unrecognized");
    } else {
      pass("STRIPE_CONNECT_WEBHOOK_SECRET present (Connect enabled)");
    }
  } else {
    warn("STRIPE_CONNECT_WEBHOOK_SECRET not set — Connect payouts disabled");
  }

  if (!APP_URL) {
    fail(
      "PUBLIC_APP_URL is not set",
      "Stripe Checkout success_url/cancel_url will be wrong",
    );
  } else if (!APP_URL.startsWith("http")) {
    fail(`PUBLIC_APP_URL malformed: ${APP_URL}`);
  } else if (secretMode === "live" && APP_URL.includes("localhost")) {
    fail(
      "Live secret but PUBLIC_APP_URL points to localhost",
      "Stripe will redirect customers back to a URL that doesn't exist",
    );
  } else {
    pass(`PUBLIC_APP_URL = ${APP_URL}`);
  }

  if (!CRON_SECRET) {
    warn(
      "CRON_SECRET is not set",
      "rental hold-expiry sweep will fail in production",
    );
  } else {
    pass("CRON_SECRET present");
  }

  // ── 2. Stripe account reachability + capabilities ─────────────────
  if (SECRET && secretMode) {
    const stripe = new Stripe(SECRET, { typescript: true });
    try {
      const account = await stripe.accounts.retrieve();
      const liveAccountMode = (account as Stripe.Account & { livemode?: boolean })
        .livemode;
      // Note: account.retrieve() returns the same account for both modes,
      // but the `livemode` flag tells us which view we got.
      pass(
        `Stripe account reachable (id=${account.id}, livemode=${liveAccountMode})`,
      );

      if (account.charges_enabled) {
        pass("Account: charges_enabled");
      } else {
        fail(
          "Account is NOT charges_enabled",
          account.requirements?.disabled_reason
            ? `reason: ${account.requirements.disabled_reason}`
            : "complete activation in Stripe dashboard before live traffic",
        );
      }

      if (account.payouts_enabled) {
        pass("Account: payouts_enabled");
      } else {
        warn(
          "Account is NOT payouts_enabled",
          "Stripe will hold funds. Acceptable short-term, link a bank account to release.",
        );
      }

      // Requirements that Stripe wants completed before unlocking the account.
      const dueNow = account.requirements?.currently_due ?? [];
      if (dueNow.length > 0) {
        warn(
          `Account has ${dueNow.length} currently_due requirement(s)`,
          dueNow.join(", "),
        );
      }
    } catch (err) {
      fail(
        "Stripe account.retrieve() failed",
        err instanceof Error ? err.message : String(err),
      );
    }

    // ── 3. Webhook endpoints ──────────────────────────────────────────
    try {
      const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
      const expectedMainUrl = APP_URL
        ? `${APP_URL.replace(/\/$/, "")}/api/webhooks/stripe`
        : null;
      const expectedConnectUrl = APP_URL
        ? `${APP_URL.replace(/\/$/, "")}/api/webhooks/stripe-connect`
        : null;

      const mainEndpoint = endpoints.data.find(
        (e) => e.url === expectedMainUrl,
      );
      if (!mainEndpoint) {
        fail(
          "No webhook endpoint matches PUBLIC_APP_URL/api/webhooks/stripe",
          `expected: ${expectedMainUrl} — configured endpoints: ${endpoints.data
            .map((e) => e.url)
            .join(", ") || "(none)"}`,
        );
      } else {
        pass(
          `Webhook endpoint configured: ${mainEndpoint.url}`,
          `status=${mainEndpoint.status}, events=${mainEndpoint.enabled_events.length}`,
        );
        if (mainEndpoint.status !== "enabled") {
          fail(
            `Main webhook endpoint is ${mainEndpoint.status}, not enabled`,
          );
        }
        // Check event subscription. enabled_events of ["*"] matches everything.
        const subscribesAll = mainEndpoint.enabled_events.includes("*");
        const missing = subscribesAll
          ? []
          : REQUIRED_MAIN_EVENTS.filter(
              (e) => !mainEndpoint.enabled_events.includes(e),
            );
        if (missing.length > 0) {
          fail(
            `Main webhook missing event subscriptions: ${missing.join(", ")}`,
          );
        } else {
          pass(
            `Main webhook subscribes to all required events (${REQUIRED_MAIN_EVENTS.join(", ")})`,
          );
        }
      }

      if (CONNECT_WEBHOOK_SECRET) {
        const connectEndpoint = endpoints.data.find(
          (e) => e.url === expectedConnectUrl,
        );
        if (!connectEndpoint) {
          fail(
            "Connect webhook secret set but no Connect endpoint found",
            `expected: ${expectedConnectUrl}`,
          );
        } else {
          pass(`Connect webhook endpoint configured: ${connectEndpoint.url}`);
        }
      }
    } catch (err) {
      fail(
        "stripe.webhookEndpoints.list() failed",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // ── Report ────────────────────────────────────────────────────────
  const fails = checks.filter((c) => c.level === "fail").length;
  const warns = checks.filter((c) => c.level === "warn").length;
  const passes = checks.filter((c) => c.level === "pass").length;

  console.log("");
  console.log("─── Stripe pre-flight ───────────────────────────────────");
  for (const c of checks) {
    const icon =
      c.level === "pass" ? "✓" : c.level === "warn" ? "⚠" : "✗";
    console.log(`  ${icon} ${c.label}`);
    if (c.detail) console.log(`      ${c.detail}`);
  }
  console.log("─────────────────────────────────────────────────────────");
  console.log(`  ${passes} passed   ${warns} warning   ${fails} failed`);
  console.log("");

  if (fails > 0) {
    console.error(
      "Pre-flight FAILED — do not put live traffic through this config.",
    );
    process.exit(1);
  }
  if (warns > 0) {
    console.warn(
      "Pre-flight passed with warnings — read each ⚠ line and decide if acceptable.",
    );
  } else {
    console.log("Pre-flight clean.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Pre-flight crashed:", err);
  process.exit(2);
});
