# Phase 4: Admin Operations Stabilization & Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Audit, fix, and test all remaining admin operations — registrations, payments, refunds, games, announcements, discount codes, waitlist, walk-up registration, re-registration campaigns, reports, curriculum, and settings.

**Architecture:** Same pattern — API integration tests hit the running dev server. Admin tests authenticate as `admin@test.aspiresports.com` / `TestAdmin123!`.

---

### Task 22: Admin Registrations API Tests

**Files:** Create `tests/api/admin/registrations.test.ts`

Tests:
1. GET /api/admin/registrations — lists with pagination (200)
2. GET with ?search= filter (200)
3. GET with ?status= filter (200)
4. Rejects unauthenticated (401)

---

### Task 23: Admin Payments & Refunds API Tests

**Files:** Create `tests/api/admin/payments.test.ts`

Tests:
1. GET /api/admin/payments — lists payments (200)
2. GET /api/admin/refunds — lists refund requests (200)
3. Rejects unauthenticated (401)

---

### Task 24: Admin Games API Tests

**Files:** Create `tests/api/admin/games.test.ts`

Tests:
1. GET /api/admin/games — lists games (200)
2. POST /api/admin/games — creates a game (201) — needs seasonId, two teamIds, venueId
3. DELETE /api/admin/games?id= — deletes game (200)
4. Rejects unauthenticated (401)

---

### Task 25: Admin Announcements API Tests

**Files:** Create `tests/api/admin/announcements.test.ts`

Tests:
1. GET /api/admin/announcements — lists (200)
2. POST /api/admin/announcements — creates (201)
3. DELETE /api/admin/announcements?id= — deletes (200)
4. Rejects unauthenticated (401)

---

### Task 26: Admin Discount Codes API Tests

**Files:** Create `tests/api/admin/discount-codes.test.ts`

Tests:
1. GET /api/admin/discount-codes — lists (200)
2. POST /api/admin/discount-codes — creates (201)
3. DELETE /api/admin/discount-codes?id= — deletes (200)
4. Rejects unauthenticated (401)

---

### Task 27: Admin Waitlist + Walk-Up + Re-Reg API Tests

**Files:** Create `tests/api/admin/operations.test.ts`

Tests:
1. GET /api/admin/waitlist — lists waitlisted registrations (200)
2. POST /api/admin/walk-up-registration — creates walk-up reg (201 or 200)
3. GET /api/admin/re-registration-campaign — lists campaigns (200)
4. Rejects unauthenticated (401)

---

### Task 28: Admin Reports API Tests

**Files:** Create `tests/api/admin/reports.test.ts`

Tests:
1. GET /api/admin/reports/revenue — returns revenue data (200)
2. GET /api/admin/reports/registrations — returns registration stats (200)
3. GET /api/admin/reports/attendance — returns attendance data (200)
4. Rejects unauthenticated (401)

---

### Task 29: Admin Curriculum API Tests

**Files:** Create `tests/api/admin/curriculum.test.ts`

Tests:
1. GET /api/admin/curriculum/skills — lists skills (200)
2. GET /api/admin/curriculum/activities — lists activities (200)
3. GET /api/admin/curriculum/templates — lists templates (200)
4. Rejects unauthenticated (401)

---

### Task 30: Run Full Suite (All 4 Phases)

Run all tests. Fix regressions. Final commit for the complete stabilization effort.
