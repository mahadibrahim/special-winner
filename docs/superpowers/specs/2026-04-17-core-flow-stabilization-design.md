# Core Flow Stabilization & Test Suite

**Date:** 2026-04-17
**Scope:** Wide — every feature with a UI
**Approach:** Fix as we go, test as we go (Option B)
**Test Style:** Layered — API integration tests (Vitest) + targeted E2E (Playwright)

---

## Flow Inventory & Priority Order

Each flow is audited, fixed, and tested before moving to the next.

### Phase 1 — Admin Setup (foundation)
1. Sports CRUD
2. Locations CRUD
3. Venues CRUD
4. Age Groups CRUD
5. Programs CRUD
6. Seasons CRUD
7. Teams CRUD
8. Users & Roles management

### Phase 2 — Parent Revenue Path
9. Sign up / Sign in / Sign out
10. Browse programs (public seasons API)
11. Family member management
12. Registration flow
13. Parent dashboard

### Phase 3 — Coach Operations
14. Coach dashboard
15. Roster management
16. Game schedule & score entry
17. Attendance tracking
18. Practice planning
19. Player assessments
20. Coach resources

### Phase 4 — Admin Operations
21. Registrations management
22. Payments & refunds
23. Games management
24. Announcements
25. Discount codes
26. Waitlist management
27. Walk-up registration
28. Re-registration campaigns
29. Reports (revenue, registrations, attendance)
30. Curriculum management
31. Settings

---

## Test Architecture

### API Integration Tests (Vitest)

One test file per entity/flow. Each file tests:
- Happy path CRUD (create → read → update → delete)
- Validation errors (missing fields, invalid formats)
- Auth errors (unauthenticated, wrong role)
- Constraint errors (delete with dependencies, duplicate slugs)

```
tests/
  api/
    admin/
      sports.test.ts
      locations.test.ts
      venues.test.ts
      programs.test.ts
      seasons.test.ts
      age-groups.test.ts
      teams.test.ts
      users.test.ts
      registrations.test.ts
      payments.test.ts
      games.test.ts
      announcements.test.ts
      discount-codes.test.ts
      waitlist.test.ts
      walk-up-registration.test.ts
      reports.test.ts
      curriculum.test.ts
      settings.test.ts
    auth/
      signup-signin.test.ts
      password-reset.test.ts
    parent/
      family-members.test.ts
      registration.test.ts
      dashboard.test.ts
    coach/
      teams-roster.test.ts
      games-scores.test.ts
      attendance.test.ts
      practices.test.ts
      assessments.test.ts
    public/
      seasons.test.ts
  setup/
    test-db.ts          # DB connection + cleanup helpers
    test-auth.ts        # Create sessions, get auth cookies
    test-fixtures.ts    # Seed minimal data per test
```

Each test:
- Uses the real dev database
- Creates its own test data and cleans up after
- Runs in sequence within a file (create → read → update → delete)
- Is independent of other test files
- Verifies both status codes and response body shapes

### E2E Tests (Playwright)

~8-10 multi-step user journey tests:

- **Parent journey:** sign up → browse programs → register child → view dashboard
- **Coach journey:** sign in → view roster → take attendance → enter game score
- **Admin journey:** sign in → create sport → create program → create season → view registrations
- **Auth flows:** sign in → sign out → redirect to login on protected route
- **Public pages:** homepage loads → programs section → program cards link to registration

These are smoke tests only. Edge cases are covered by API tests.

---

## Fix Patterns

### API Fixes
- Missing error handling → add try/catch with specific messages
- Missing validation → add zod schema
- Missing auth → add requireAdminAccess / requireCoachAccess
- Broken queries → fix joins, null handling, org scoping
- Missing endpoints → create if a UI depends on them

### UI Fixes
- Only fix things that prevent flow completion (crashes, broken links, non-functional buttons)
- Don't redesign, restyle, or add features
- Document unbuilt features rather than building them

### What We Don't Test
- React component rendering (no unit tests for UI)
- CSS/styling
- Browser-specific behavior beyond E2E smoke tests
- Third-party integrations (Stripe, Twilio) — mocked

---

## Infrastructure Setup

### Vitest Configuration
- Install vitest + @vitest/coverage-v8
- Configure to use the project's TypeScript paths (@/ aliases)
- Test timeout: 10s per test
- Run with: `npm run test:api`

### Test Helpers
- `test-auth.ts`: Functions to create admin/coach/parent sessions and return auth cookies
- `test-db.ts`: getDb() wrapper, cleanup utilities (delete test data by known prefixes)
- `test-fixtures.ts`: Minimal seed functions (createTestSport, createTestSeason, etc.)

### CI Integration
- Add `test:api` and `test:e2e` scripts to package.json
- API tests run on every PR (fast, ~30s)
- E2E tests run on merge to main (slower, ~2min)

---

## Success Criteria

- Every admin CRUD operation works (create, read, update, delete)
- Every flow a parent needs for registration works end-to-end
- Every flow a coach needs to run a season works
- All API endpoints return appropriate errors for bad input, missing auth, and constraint violations
- API test suite passes in <60 seconds
- E2E test suite passes in <3 minutes
- Zero known crashes or hangs on any page
