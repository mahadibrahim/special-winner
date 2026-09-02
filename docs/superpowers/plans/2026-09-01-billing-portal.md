# Billing Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parents fix their own failed cards (and self-cancel at period end) via Stripe's hosted Customer Portal — one endpoint, one code-managed portal configuration, two dashboard surfaces.

**Architecture:** No schema or webhook changes. `src/lib/memberships/billing-portal.ts` owns configuration bootstrap + session creation; `POST /api/memberships/billing-portal` exposes it; `family-classes-card.tsx` (past_due banner/button + active link) and `MembershipCard.tsx` (same) consume it.

**Spec:** `docs/superpowers/specs/2026-09-01-billing-portal-design.md` (owner decisions: build now; self-cancel at period end; pause/updates stay in-app).

## Global Constraints

- Worktree `/Volumes/MahadData/Aspire-Sports/web-app/.claude/worktrees/youth-classes-ux`, branch `billing-portal`. Absolute paths; never checkout/stash.
- `return_url` from an ALLOW-LIST of dashboard paths + env-aware origin (`originForBrand`/`env.PUBLIC_APP_URL` pattern — never hardcoded, never client-free-form).
- Customer id resolution: newest `memberships` row with `stripeCustomerId` set, explicit `orderBy(desc(createdAt))`.
- Portal config: find-by-metadata (`aspire_config: "v1"`) or create; features EXACTLY per spec (cancel at_period_end enabled; pause + update disabled; payment_method_update + invoice_history enabled). Module-level cache.
- Stripe-dependent tests behind `itWithStripe`; the CI-has-no-Stripe lesson applies to every success-shape assertion.
- API tests via `./scripts/with-bws.sh env TEST_BASE_URL=http://localhost:4321 npx vitest run <file> --config vitest.config.ts --project api`; dev server env `E2E_TEST_ENDPOINTS=yes R2_MOCK=1 CRON_SECRET=sdd-local-cron`.
- `npx tsc --noEmit` zero before every commit; Claude trailer on every commit.

---

### Task 0: Portal library + endpoint

**Files:**
- Create: `src/lib/memberships/billing-portal.ts`, `src/pages/api/memberships/billing-portal.ts`
- Test: `tests/api/memberships-billing-portal.test.ts`

**Interfaces:**
- Produces (from `@/lib/memberships/billing-portal`):

```ts
/** Find-or-create the code-managed portal configuration (metadata
 *  aspire_config: "v1"). Cached per process. */
export async function ensureBillingPortalConfiguration(): Promise<string>;

export const BILLING_RETURN_PATHS = ["/dashboard/family", "/dashboard"] as const;

/** Create a portal session for the customer; returnPath must be one of
 *  BILLING_RETURN_PATHS (defaults to the first). */
export async function createBillingPortalSession(opts: {
  customerId: string;
  returnPath?: string;
  origin: string;
}): Promise<{ url: string }>;
```

- Endpoint `POST /api/memberships/billing-portal` body `{ returnPath? }`: 401 unauthed; resolve customer id per the Global Constraint (query `memberships` where `userId` + `stripeCustomerId IS NOT NULL`, newest first); none → 404 `{ error: "no_billing_account", message: "No billing account found — subscribe first or contact us." }`; invalid returnPath → 422; success → `{ url }`. Origin via the same env-aware derivation the email templates use (`originForBrand("aspire") ?? env.PUBLIC_APP_URL` — read `src/lib/classes/block-nudge.ts` or trial-convert for the exact helper import).

- [ ] TDD per the spec's API list (config-created-once test: call ensure twice, then `stripe.billingPortal.configurations.list` filtered by metadata → exactly one; gate Stripe-dependent cases with `itWithStripe`; 401/404/422 run unconditionally) → implement → green → `npx tsc --noEmit` → commit `feat(memberships): stripe billing portal endpoint + code-managed configuration`.

### Task 1: Dashboard surfaces

**Files:**
- Modify: `src/components/dashboard/family-classes-card.tsx` (past_due state: banner "Your card needs updating" + button "Update payment method"; active membership: "Manage billing" link), `src/components/dashboard/MembershipCard.tsx` (same two states)
- Test: extend the components' existing test surface per repo convention (API-shape tests if none exist component-level; E2E covers interaction in Task 2)

**Interfaces:**
- Consumes: `POST /api/memberships/billing-portal` → `{ url }` then `window.location.assign(url)`. Error handling per the file's existing shape-tolerant pattern (toast).
- The family card's past_due state today is contact-only copy — find it (`past_due` string search) and replace the dead-end with the action while keeping the explanatory copy.

- [ ] TDD-appropriate coverage → implement both surfaces → browser-check both states (seed a past_due membership row directly; restore after) → `npx tsc --noEmit` → commit `feat(dashboard): self-serve billing portal entry points`.

### Task 2: E2E + ship gates

**Files:**
- Extend: the dashboard E2E spec family (`tests/e2e/` — find the membership/dashboard spec; else add scenarios to class-pack-purchase.spec.ts per its fixture conventions)

- [ ] E2E: seeded past_due membership → family dashboard renders "Update payment method"; click → POST to `/api/memberships/billing-portal` fires (stubbed response `{url}` per the file's stubbed-POST pattern; assert the redirect attempt via the stub — never drive real Stripe). Active-membership state shows "Manage billing".
- [ ] Ship gates: full unit suite; memberships + dashboard + classes API suites; Playwright class/dashboard specs; `./scripts/with-bws.sh npm run build`; `npx tsc --noEmit`; e2e sweep of touched surfaces.
- [ ] Commit `test(memberships): billing-portal E2E + ship gates`.

## Orchestrator notes

- Order: 0 → 1 → 2 (serial). Models: T0 Opus, T1/T2 Sonnet.
- Dev server must be started before T0's API tests with the documented env; implementers must not restart it (stale-Vite lesson).
- The `past_due` UI change touches `family-classes-card.tsx` — freshly merged by #602; read the CURRENT file, don't assume pre-#602 line numbers.
