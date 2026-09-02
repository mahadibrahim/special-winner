/**
 * Stripe Customer Portal — code-managed configuration + session creation.
 *
 * The portal is how a parent fixes a failed card themselves (memberships
 * bill monthly per child; a declined card silently churns the enrollment
 * otherwise) and how they self-cancel at period end.
 *
 * CODE-MANAGED CONFIGURATION. The portal's feature set is defined here, not
 * hand-set in the Stripe Dashboard, so it is reviewable, identical in test
 * and live mode, and reproducible on a fresh account:
 *   - payment_method_update: enabled — the whole point.
 *   - invoice_history: enabled — parents ask for receipts constantly.
 *   - subscription_cancel: enabled, `at_period_end`, prorations `none` —
 *     owner decision. The period-end cancel arrives as
 *     `customer.subscription.deleted` at the end of the paid window, which
 *     the existing webhook already handles (membership cancelled,
 *     enrollments ended, seats released).
 *   - subscription_update: DISABLED — tier changes stay in-app, where the
 *     sibling-discount and annual-fee logic lives. Stripe's portal would
 *     swap a price without any of it.
 *   - Pause is DISABLED BY OMISSION: pause is no longer a portal feature in
 *     the pinned API version (there is no `features.subscription_pause` to
 *     send), and we would disable it regardless — `/api/memberships/pause`
 *     already owns pausing, and two pause paths would fight over
 *     `memberships.paused_at`.
 *
 * FIND-BEFORE-CREATE. Configurations have no natural key and Stripe's list
 * endpoint takes no metadata filter, so `ensureBillingPortalConfiguration`
 * pages the active configurations and matches on
 * `metadata.aspire_config === BILLING_PORTAL_CONFIG_VERSION`. Without that
 * leg, every cold serverless process would mint a new configuration. The
 * resolved id is cached module-level (with in-flight de-duplication, so two
 * concurrent requests on one cold process can't both create). Test and live
 * mode each get their own configuration on first use — the same accepted
 * posture as the rest of our Stripe reconciliation code.
 *
 * BUMP `BILLING_PORTAL_CONFIG_VERSION` whenever the feature set below
 * changes: the lookup is by that exact string, so a new version creates a
 * fresh configuration instead of silently serving the old feature set to
 * every process that already cached the old id.
 *
 * RETURN URL. `return_url` is composed here from an ALLOW-LIST of dashboard
 * paths plus a caller-supplied origin — never a client-supplied URL (an
 * open redirect through Stripe's hosted page otherwise). The origin itself
 * is derived env-aware by the caller (`originForBrand(brand) ??
 * env.PUBLIC_APP_URL`); never hardcode a production host here (see
 * bee1b4f9, where a hardcoded prod origin sent staging traffic to prod).
 */
import { getBrandTheme } from "@/lib/branding/themes";
import { membershipsStripe } from "./stripe";

/** Metadata stamp used to find OUR configuration. Bump on any feature change. */
export const BILLING_PORTAL_CONFIG_VERSION = "v1";

/** The only paths a portal session may return to. Index 0 is the default. */
export const BILLING_RETURN_PATHS = ["/dashboard/family", "/dashboard"] as const;

export type BillingReturnPath = (typeof BILLING_RETURN_PATHS)[number];

/** Exact-match allow-list check — no prefixes, no query strings. */
export function isBillingReturnPath(value: unknown): value is BillingReturnPath {
  return (
    typeof value === "string" &&
    (BILLING_RETURN_PATHS as readonly string[]).includes(value)
  );
}

/** Portal headline, from the brand name (classes/memberships are Aspire-only). */
const BUSINESS_HEADLINE = `${getBrandTheme("aspire").displayName} memberships`;

/** Resolved configuration id for this process. */
let cachedConfigurationId: string | null = null;
/** In-flight bootstrap, so concurrent cold-start callers share one create. */
let inFlight: Promise<string> | null = null;

async function findExistingConfiguration(): Promise<string | null> {
  const s = membershipsStripe();
  // No metadata filter on this endpoint — page and match client-side.
  for await (const config of s.billingPortal.configurations.list({
    active: true,
    limit: 100,
  })) {
    if (config.metadata?.aspire_config === BILLING_PORTAL_CONFIG_VERSION) {
      return config.id;
    }
  }
  return null;
}

async function createConfiguration(): Promise<string> {
  const s = membershipsStripe();
  const config = await s.billingPortal.configurations.create({
    business_profile: { headline: BUSINESS_HEADLINE },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
      },
      subscription_update: { enabled: false },
    },
    metadata: { aspire_config: BILLING_PORTAL_CONFIG_VERSION },
  });
  return config.id;
}

/**
 * Find-or-create the code-managed portal configuration (metadata
 * `aspire_config: BILLING_PORTAL_CONFIG_VERSION`). Cached per process.
 */
export async function ensureBillingPortalConfiguration(): Promise<string> {
  if (cachedConfigurationId) return cachedConfigurationId;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const existing = await findExistingConfiguration();
    return existing ?? (await createConfiguration());
  })();

  try {
    const id = await inFlight;
    cachedConfigurationId = id;
    return id;
  } finally {
    inFlight = null;
  }
}

/**
 * Create a hosted portal session for a Stripe customer.
 *
 * `returnPath` must be one of {@link BILLING_RETURN_PATHS} (defaults to the
 * first); anything else throws before Stripe is touched, so an endpoint can
 * turn it into a 422 without needing Stripe configured at all.
 */
export async function createBillingPortalSession(opts: {
  customerId: string;
  returnPath?: string;
  origin: string;
}): Promise<{ url: string }> {
  const returnPath = opts.returnPath ?? BILLING_RETURN_PATHS[0];
  if (!isBillingReturnPath(returnPath)) {
    throw new Error(`Unsupported returnPath: ${returnPath}`);
  }

  const configuration = await ensureBillingPortalConfiguration();
  const session = await membershipsStripe().billingPortal.sessions.create({
    customer: opts.customerId,
    configuration,
    return_url: `${opts.origin.replace(/\/+$/, "")}${returnPath}`,
  });

  if (!session.url) {
    throw new Error("Stripe billing portal session has no URL");
  }
  return { url: session.url };
}
