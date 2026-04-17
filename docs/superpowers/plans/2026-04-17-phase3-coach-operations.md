# Phase 3: Coach Operations Stabilization & Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Audit, fix, and test every coach API — teams/roster, games/scores, attendance, practice sessions, assessments, and resources.

**Architecture:** Same pattern — API integration tests hit the running dev server. Coach tests authenticate as `coach@test.aspiresports.com` / `TestCoach123!`.

---

### Task 16: Coach Teams & Roster API Tests

**Files:** Create `tests/api/coach/teams-roster.test.ts`

Tests:
1. GET /api/coach/teams — lists coach's assigned teams (200, array)
2. GET /api/coach/teams/:teamId/roster — returns roster for a team (200)
3. Rejects unauthenticated (401)

---

### Task 17: Coach Games & Scores API Tests

**Files:** Create `tests/api/coach/games-scores.test.ts`

Tests:
1. GET /api/coach/teams/:teamId/games — lists games (200)
2. PUT /api/coach/games/:gameId/score — updates score (200) — use an existing game
3. Rejects unauthenticated (401)

---

### Task 18: Coach Attendance API Tests

**Files:** Create `tests/api/coach/attendance.test.ts`

Tests:
1. GET /api/coach/attendance?teamId=X — lists attendance records (200)
2. POST /api/coach/attendance — records attendance (201 or 200)
3. Rejects unauthenticated (401)

---

### Task 19: Coach Practices API Tests

**Files:** Create `tests/api/coach/practices.test.ts`

Tests:
1. GET /api/coach/sessions — lists practice sessions (200)
2. POST /api/coach/sessions — creates a session (201)
3. GET /api/coach/sessions/:id — gets single session (200)
4. PUT /api/coach/sessions/:id — updates session (200)
5. Rejects unauthenticated (401)

---

### Task 20: Coach Assessments & Resources API Tests

**Files:** Create `tests/api/coach/assessments.test.ts`

Tests:
1. GET /api/coach/assessments — lists assessments (200)
2. GET /api/coach/skills — lists skills (200)
3. GET /api/coach/skills/domains — lists skill domains (200)
4. GET /api/coach/resources — lists resources (200)
5. GET /api/coach/templates — lists practice templates (200)
6. Rejects unauthenticated (401)

---

### Task 21: Run Full Phase 3 Suite

Run all Phase 1 + 2 + 3 tests together. Fix any regressions. Final commit.
