# SoccerOne — how the second brand is wired

**Audience:** anyone (human or agent) about to change SoccerOne, add a brand, or
debug why `gosoccerone.com` shows the wrong thing.

**One-line summary:** SoccerOne is **not a separate app or site**. It's a second
tenant (a `franchise` org) of the one shared Aspire web-app, served on
`gosoccerone.com` by domain-based routing in middleware. Same codebase, same
deploy, same database, same Stripe account — different skin + content.

> For the *why* (and the planned cleanup), see the architecture decision in
> `docs/architecture/` history and the launch runbook
> `docs/ops/soccerone-launch-checklist.md`. This doc is the *how it works today*.

---

## Request lifecycle (what happens on a hit to `gosoccerone.com`)

```
Browser → gosoccerone.com
  │
  ▼ DNS  (Netlify-managed zone for gosoccerone.com → the prod site's IPs)
Netlify production site  "sage-lollipop-3c5d35"  (the SAME site as aspiresportsohio.com)
  │   gosoccerone.com + www are domain ALIASES on it; aspiresportsohio.com stays the primary
  ▼
Astro SSR function → src/middleware.ts
  │
  1. resolveOrganizationFromHost(host)   [src/lib/organization/domain-resolver.ts]
  │     looks up domain_mappings WHERE domain = host AND status IN ('active','ssl_active')
  │     → sets context.locals.organization = SoccerOne org   (5-min in-memory cache per host)
  │
  2. SoccerOne routing branches            [src/middleware.ts, "SoccerOne routing"]
  │     Branch 1 — host is a SoccerOne host but org ≠ soccerone → 404 (no silent Aspire leak)
  │     Branch 2 — Aspire host + /soccerone/* path → 301 to canonical gosoccerone.com
  │     Branch 3 — org IS soccerone → REWRITE the path into the /soccerone/* subtree
  │
  ▼ Branch 3: rewriteSoccerOnePath('/') → '/soccerone'  → renders src/pages/soccerone/index.astro
Page renders with locals.organization = SoccerOne (org-scoped data, branding)
```

The crucial move is **Branch 3's rewrite**: `gosoccerone.com/leagues` is internally
served by `src/pages/soccerone/leagues.astro`, without the URL changing.

---

## The files that matter

| File | Role |
|---|---|
| `src/lib/organization/soccerone-routing.ts` | The constants + pure rewrite logic. `SOCCERONE_HOSTS` (gosoccerone.com, www), `SOCCERONE_ORG_SLUG = "soccerone"`, `SOCCERONE_CANONICAL_HOST`, and **`SOCCERONE_MARKETING_REWRITES`** (the path map). Unit-tested in `tests/unit/organization/soccerone-routing.test.ts`. |
| `src/middleware.ts` | Resolves the org per request, then runs the 3 SoccerOne branches before the normal Aspire logic. |
| `src/lib/organization/domain-resolver.ts` | Maps a hostname → org via `domain_mappings`. Matches status `active` **or** `ssl_active`. 5-minute in-memory cache (`CACHE_TTL`); `clearDomainCache()` exists but is per-instance. |
| `src/pages/soccerone/*.astro` | The SoccerOne marketing pages (the rewrite targets). All `prerender = false`. |
| `src/lib/db/schema/organizations.ts` | `organizations` + `domain_mappings` tables. |
| `src/lib/branding/resolver.ts` + `brand_profiles` table | Per-domain theme/content (logo, color tokens, hero/footer copy). Resolved independently of org in middleware (`locals.brand`). Underused today — the lever for the future theme-driven refactor. |
| `scripts/seed-soccerone-org.ts` | One-off provisioning: creates the org, locations, and `domain_mappings` (status `pending`). `--prod` flag required to target prod. |

### The rewrite map (this is the table you edit to add a marketing page)

`src/lib/organization/soccerone-routing.ts` → `SOCCERONE_MARKETING_REWRITES`:

```
"/"            → "/soccerone"
"/leagues"     → "/soccerone/leagues"
"/rent"        → "/soccerone/rent"
"/pickup"      → "/soccerone/pickup"
"/memberships" → "/soccerone/memberships"
"/downtown"    → "/soccerone/downtown"
"/worthington" → "/soccerone/worthington"
```

---

## Critical constraints / gotchas (read before changing anything)

1. **Brand-rewritable marketing pages MUST be SSR (`prerender = false`).**
   A prerendered (static) page is served by Netlify's CDN by path for *every*
   host and **bypasses middleware**, so the rewrite never runs and the brand
   domain shows Aspire. This bit us at launch: `index.astro` and `leagues.astro`
   were prerendered and `gosoccerone.com/` showed Aspire while the SSR pages
   worked. If you add a key to the rewrite map, the **Aspire source page for that
   path must be SSR.** (Fixed in the PR that made `/` and `/leagues` SSR.)

2. **`domain_mappings.status` must be `active` or `ssl_active`** for the resolver
   to match. The seed creates rows as `pending` (a safety state that 404s the
   domain). Going live = flipping to `ssl_active`. Reversing = back to `pending`.

3. **5-minute resolver cache.** After flipping status (or any domain_mappings
   change) the live site can lag up to 5 minutes per warm serverless instance.
   Don't conclude "it's broken" before the TTL passes.

4. **Netlify: gosoccerone is an ALIAS, not a separate site.** Never point it at a
   new/standalone site, and never make it the site's *primary* domain (that would
   301 all Aspire traffic to it). The old `soccerone-partner-demo.netlify.app` is
   a stale separate deploy — ignore it.

5. **One shared Stripe account, no Connect for SoccerOne.** Every charge carries
   `organization_id` metadata for brand attribution. Membership subscriptions
   settle on the platform account, so their lifecycle webhooks are handled by the
   platform endpoint (`/api/webhooks/stripe` → `handle-stripe-event.ts`), not the
   Connect endpoint.

6. **Empty states until content is seeded.** A freshly-provisioned SoccerOne org
   has no programs/seasons/venues/drop-in sessions/membership tiers. The branded
   pages render but their dynamic sections are empty until you create that data
   (org-scoped) via `/admin/*`.

---

## Production facts

- Netlify prod site: **`sage-lollipop-3c5d35`** (`site_id 3280af1b-d29a-41e4-8d87-8699131efedd`), primary `aspiresportsohio.com`, aliases `www.gosoccerone.com` (primary alias) + `gosoccerone.com`. DNS is a Netlify-managed zone.
- SoccerOne org id (prod): **`7c205ebe-8810-49c7-b801-63b80239d3d7`**, slug `soccerone`, type `franchise`, status `active`. Locations: Downtown + Worthington.
- `domain_mappings` (prod): `www.gosoccerone.com` (primary) + `gosoccerone.com`, both `ssl_active`.
- **Prod DB access:** Railway, project `aspire-sports-prod` / env `production` / service `Postgres`. The internal `DATABASE_URL` (`postgres.railway.internal`) is unreachable from outside; use the public proxy:
  ```bash
  railway run bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npx tsx <script>'
  ```

---

## Runbooks

### Add a new SoccerOne marketing page
1. Create the page at `src/pages/soccerone/<name>.astro` (`prerender = false`).
2. Add a key to `SOCCERONE_MARKETING_REWRITES`: `"/<name>": "/soccerone/<name>"`.
3. Ensure the Aspire source path is **not** prerendered (SSR), or there's no
   Aspire page at that path at all (then middleware intercepts it cleanly).
4. Add/extend the unit test in `tests/unit/organization/soccerone-routing.test.ts`.

### Verify what gosoccerone.com is serving
```bash
for p in / /leagues /rent /pickup /memberships; do
  curl -s -L "https://www.gosoccerone.com$p" | grep -oiE '<title>[^<]*</title>'
done
# SoccerOne titles = wired correctly; an "Aspire Sports …" title = that page is
# prerendered (gotcha #1) or the domain_mapping isn't ssl_active (gotcha #2).
```

### Stand up another brand domain (the pattern, e.g. a future basketball brand)
1. Add the domain as an alias on the prod Netlify site (additive; never touch the primary).
2. Confirm DNS resolves + TLS cert reissues to cover it.
3. Seed the org + `domain_mappings` in prod (status `pending`).
4. Flip `domain_mappings.status` to `ssl_active`.
5. Build the brand's marketing pages + rewrite map entries (all SSR).
   — **This step is what the planned theme-driven refactor removes**: instead of a
   hand-coded `/<brand>/*` page tree per brand, render shared templates from the
   `brand_profiles` config. See the architecture decision. Until then, each brand
   is a hand-coded page tree like `/soccerone/*`.

---

## Where this is heading (so "improve SoccerOne" has context)

The brands differ **aesthetically only** (theme + content); the core functions
(booking, registration/classes, memberships) are shared. The intended end-state
is **theme-driven branding**: one set of SSR marketing templates rendered
per-host from `brand_profiles`, retiring the hand-coded `/soccerone/*` tree and
the rewrite map. Do that refactor **before** adding the third (basketball) brand;
until then, improving SoccerOne means editing the `/soccerone/*` pages and
seeding the SoccerOne org's content through `/admin/*`.
