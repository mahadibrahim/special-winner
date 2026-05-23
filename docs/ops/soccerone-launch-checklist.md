# SoccerOne launch checklist

Step-by-step ops sequence to take `www.gosoccerone.com` from "code merged"
to "real traffic served." Run in order — no step can be skipped without
risking either silent Aspire content on the SoccerOne domain (the regression
spec §4 forbids) or broken SoccerOne routing.

---

## Stage 1 — Code merged

Pre-condition: the Phase 1 PR is merged into `main`. The middleware
knows how to rewrite SoccerOne marketing roots and 301 the Aspire-side
/soccerone/* paths. But no `domain_mappings` rows exist in prod yet, so
nothing actually serves SoccerOne content anywhere.

At this point, `curl https://www.gosoccerone.com/` (if DNS pointed there)
would hit Aspire's Netlify site and the **unmapped-host guard returns
404** — by design. We don't want the unmapped host silently serving
Aspire content.

## Stage 2 — Staging provisioning

Goal: prove the SoccerOne tenant resolves and the marketing pages render,
before touching DNS.

- [ ] **Run the provisioning script against staging:**
  ```bash
  cd /path/to/web-app
  DATABASE_URL=<staging-url> npx tsx scripts/seed-soccerone-org.ts
  ```
  Expected: clean idempotent run, creating org / locations / domain_mappings.

- [ ] **Test routing via subdomain on staging.** The resolver matches
  the org by slug for any `<slug>.<base-domain>` request — so we don't
  need DNS for `soccerone.aspiresports.com` until later. Visit:
  ```
  https://soccerone.<staging-host>/
  https://soccerone.<staging-host>/leagues
  https://soccerone.<staging-host>/rent
  https://soccerone.<staging-host>/pickup
  https://soccerone.<staging-host>/memberships
  ```
  Each should render the SoccerOne-branded marketing page. The
  `SoccerOneHeader` / `SoccerOneFooter` should appear; the Aspire
  navigation should NOT.

- [ ] **Verify Aspire is untouched on staging.** From staging's main
  host (not the subdomain), check:
  ```
  https://<staging-host>/
  https://<staging-host>/programs
  https://<staging-host>/events
  https://<staging-host>/sports
  https://<staging-host>/locations
  ```
  Aspire pages should be byte-identical to pre-Phase-1.

- [ ] **Verify the reverse 301 on Aspire:**
  ```bash
  curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" \
    https://<staging-host>/soccerone
  curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" \
    https://<staging-host>/soccerone/leagues
  ```
  Expected: `301 https://www.gosoccerone.com/` and
  `301 https://www.gosoccerone.com/leagues`.

## Stage 3 — Netlify domain aliases

Goal: tell Netlify that `gosoccerone.com` + `www.gosoccerone.com` should
serve from the production Aspire site.

- [ ] **In the Netlify dashboard for the production site:**
  Settings → Domain management → Production domains → Add domain alias.
  Add `www.gosoccerone.com` first (canonical). Then `gosoccerone.com`
  (apex). Mark `www.gosoccerone.com` as the **primary alias** so Netlify
  301-redirects the apex to it.

- [ ] **Confirm Netlify shows "DNS configuration: needs verification"**
  for each new alias. That's expected — we haven't configured DNS yet.

## Stage 4 — DNS

Goal: route public DNS for `gosoccerone.com` (and `www`) to Netlify.

- [ ] **At the domain registrar for `gosoccerone.com`:**
  - For `www`: add a `CNAME` record pointing to Netlify's edge
    hostname (Netlify shows the exact target — usually
    `<sitename>.netlify.app` or `apex-loadbalancer.netlify.com`).
  - For the apex (`@`): add an `ALIAS` / `ANAME` record pointing to
    the same Netlify target. If the registrar doesn't support
    ALIAS/ANAME, use the four `A` records Netlify provides.

- [ ] **Wait for DNS propagation:** typically 5–30 minutes.
  Confirm with:
  ```bash
  dig +short www.gosoccerone.com
  dig +short gosoccerone.com
  ```
  Both should resolve to Netlify's edge.

## Stage 5 — SSL

- [ ] **In Netlify dashboard:** the domain entries should auto-progress
  from "needs verification" → "DNS configured" → "Provisioning
  certificate" → "Certificate active." Wait until both show
  "Certificate active." Usually a few minutes after DNS propagates.

## Stage 6 — Prod provisioning

Goal: insert the SoccerOne org row + locations + domain_mappings into
prod. Until this runs, the prod DB has no SoccerOne tenant, and the
unmapped-host guard returns 404 for `www.gosoccerone.com`.

- [ ] **Run the provisioning script against prod** with the explicit
  opt-in flag:
  ```bash
  cd /path/to/web-app
  DATABASE_URL=<prod-url> npx tsx scripts/seed-soccerone-org.ts --prod
  ```
  Expected: same idempotent run as staging.

## Stage 7 — Flip domain_mappings to ssl_active

Goal: tell the resolver that the hostnames are live.

- [ ] **Via psql against prod** (or the admin UI when implemented):
  ```sql
  UPDATE domain_mappings
  SET status = 'ssl_active'
  WHERE domain IN ('gosoccerone.com', 'www.gosoccerone.com');
  ```
  From this moment on, `www.gosoccerone.com` resolves to the SoccerOne
  org in the middleware, and the rewrite branch serves the marketing
  pages.

- [ ] **(Recommended) Set `PUBLIC_GTM_CONTAINER_SOCCERONE`** in the
  Netlify production env if Marketing has provisioned a SoccerOne-specific
  GTM container. Without this env var, SoccerOne traffic will load the
  Aspire GTM container (functionally fine, but analytics will conflate
  brands). Netlify will rebuild on env-var save.

## Stage 8 — Smoke test prod

- [ ] **Visit `https://www.gosoccerone.com/`** — should render the
  SoccerOne home page (the video hero + two-facility selector).
- [ ] **Visit `https://gosoccerone.com/`** — should 301 to
  `https://www.gosoccerone.com/`.
- [ ] **Visit `https://www.gosoccerone.com/leagues`** etc. — each
  marketing root should render.
- [ ] **Verify Aspire is untouched:** `https://aspiresports.com/` (or
  whatever the prod Aspire host is) should be byte-identical to
  pre-launch.
- [ ] **Verify the reverse 301:** `https://<aspire-host>/soccerone`
  should 301 to `https://www.gosoccerone.com/`.

## Canonical-domain caveat (rare)

The `domain_mappings` table has a partial unique index
(`domain_mappings_org_primary_uniq`) that allows at most one row with
`is_primary = true` per org. The provisioning script sets
`www.gosoccerone.com` as primary and `gosoccerone.com` as not-primary.
If you ever need to flip the canonical from `www` to apex, do it in a
**single transaction** that clears the existing primary first to avoid
the partial-unique-index conflict:

```sql
BEGIN;
UPDATE domain_mappings SET is_primary = false WHERE domain = 'www.gosoccerone.com';
UPDATE domain_mappings SET is_primary = true  WHERE domain = 'gosoccerone.com';
COMMIT;
```

## Rollback

If anything looks wrong in Stage 8:

- **Quick rollback (preserves the org):** UPDATE the
  `domain_mappings.status` for both rows back to `pending`. The
  unmapped-host guard kicks in again and SoccerOne traffic gets a 404
  while you investigate. Aspire is unaffected.
- **Full rollback:** in Netlify, remove the domain aliases. The DNS
  records can stay (harmless) or be removed. Aspire is unaffected.

## After-launch cleanup

Once SoccerOne traffic is stable (say, 7 days):

- [ ] **Delete the branch-specific provisioning script:**
  ```bash
  git rm scripts/seed-soccerone-org.ts
  git commit -m "chore: drop one-off SoccerOne provisioning script"
  ```
  Per CLAUDE.md "Database write surface."
