# League Season Metadata Enablement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the adult-soccer league pages light up by (A) letting admins set season league-metadata (`term_slug`, `term_label`, `division_gender`, `skill_level`, `day_of_week`, `start_time`, `end_time`) and (B) bulk-backfilling those fields onto the 88 existing Fall 2026 → Spring 2027 catalog seasons.

**Architecture:** Three edits, no new architecture — extend the admin seasons API zod schema + insert/update, extend the admin season form UI, and extend the idempotent catalog seed to declare + persist metadata (insert for new rows, UPDATE for existing). Columns already exist (migration 0052). `day_of_week`/`start_time`/`end_time` are admin-only for now (left null by the backfill).

**Tech Stack:** Astro API routes, Drizzle ORM, React (admin form), Zod, a standalone `postgres` ops script, Vitest (API test).

**Spec:** `docs/superpowers/specs/2026-06-17-league-season-metadata-design.md`.

**⚠️ Environment note:** external volume — the editor cache can diverge from disk. After each edit, verify on disk (`grep`/`git diff`) and prove via `npx tsc --noEmit`. Use absolute paths; the shell cwd is the worktree.

---

## File Structure

**Modify:**
- `src/pages/api/admin/seasons.ts` — add 7 fields to `seasonSchema`, the POST insert, and the PUT update.
- `src/components/admin/seasons-list.tsx` — add the 7 fields to `Season` type, `formData`, the dialog UI, `handleSubmit`, `openEditDialog`.
- `scripts/seed-2026-27-catalog.ts` — add `gender`/`skill` to `DivSpec` + each division; set metadata columns on insert; UPDATE metadata on existing rows.

**Create:**
- `tests/api/admin-season-metadata.test.ts` — admin create/edit persists the new fields.

---

## Task 1: Admin endpoint accepts + persists the 7 fields

**Files:**
- Modify: `src/pages/api/admin/seasons.ts`

- [ ] **Step 1: Add the fields to `seasonSchema`**

In `src/pages/api/admin/seasons.ts`, inside the `seasonSchema = z.object({ ... })`, immediately after the `scheduleNotes: z.string().optional().nullable(),` line, add:

```ts
  termSlug: z.string().max(64).optional().nullable(),
  termLabel: z.string().max(64).optional().nullable(),
  divisionGender: z.enum(["coed", "mens", "womens"]).optional().nullable(),
  skillLevel: z.enum(["a", "b", "c", "d", "open"]).optional().nullable(),
  dayOfWeek: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]).optional().nullable(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM").optional().nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM").optional().nullable(),
```

- [ ] **Step 2: Persist in the POST insert**

In the POST handler's `tx.insert(seasons).values({ ... })`, immediately after the `scheduleNotes: data.scheduleNotes || null,` line, add:

```ts
          termSlug: data.termSlug || null,
          termLabel: data.termLabel || null,
          divisionGender: data.divisionGender || null,
          skillLevel: data.skillLevel || null,
          dayOfWeek: data.dayOfWeek || null,
          startTime: data.startTime || null,
          endTime: data.endTime || null,
```

- [ ] **Step 3: Persist in the PUT update**

In the PUT handler's `.update(seasons).set({ ... })`, immediately after the `scheduleNotes: validData.scheduleNotes || null,` line (before `updatedAt: new Date(),`), add:

```ts
        termSlug: validData.termSlug || null,
        termLabel: validData.termLabel || null,
        divisionGender: validData.divisionGender || null,
        skillLevel: validData.skillLevel || null,
        dayOfWeek: validData.dayOfWeek || null,
        startTime: validData.startTime || null,
        endTime: validData.endTime || null,
```

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors. (The `seasons` schema already has these columns; `time` columns accept `"HH:MM"` strings.)

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/seasons.ts
git commit -m "feat(admin): accept league metadata fields on season create/update"
```

---

## Task 2: Admin endpoint API test

**Files:**
- Create: `tests/api/admin-season-metadata.test.ts`

- [ ] **Step 1: Find the admin-auth test helper**

Run: `grep -rn "signIn\|adminCookie\|test.aspiresports\|TestAdmin" tests/api/ tests/utils/ | grep -i admin | head`
Identify how existing API tests authenticate as an admin (a helper that signs in `admin@test.aspiresports.com` / `TestAdmin123!` and returns a cookie, or a shared `signInAs("admin")`). Read one existing `tests/api/admin-*.test.ts` to copy the exact auth + request pattern (base URL, headers, how it picks a program id).

- [ ] **Step 2: Write the test (mirror the existing admin-test pattern)**

Create `tests/api/admin-season-metadata.test.ts`. Use the SAME auth helper + program-lookup approach the neighboring admin season tests use. The test must: sign in as admin; POST a new season including the 7 metadata fields; assert 201 and that the returned season echoes them; then PUT a change to `skillLevel`/`dayOfWeek` and assert it persists. Concretely (adapt the auth/import lines to match the repo's helper found in Step 1):

```ts
import { describe, it, expect, beforeAll } from "vitest";
// adjust to the repo's actual helper (from Step 1):
import { signInAsAdmin, apiFetch, getAnyProgramId } from "../utils/api-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("admin seasons — league metadata fields", () => {
  let cookie: string;
  let programId: string;
  beforeAll(async () => {
    cookie = await signInAsAdmin();
    programId = await getAnyProgramId(cookie); // a program owned by the admin's org
  });

  it("persists metadata on create and update", async () => {
    const slug = `meta-test-${Date.now()}`;
    const createRes = await fetch(`${BASE}/api/admin/seasons`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        programId, name: "Meta Test", slug,
        startDate: "2026-09-14", endDate: "2026-11-08",
        priceCents: 12000, signupModes: ["individual"], status: "draft",
        termSlug: "fall-2026", termLabel: "Fall 2026",
        divisionGender: "coed", skillLevel: "c",
        dayOfWeek: "tue", startTime: "18:00", endTime: "20:00",
      }),
    });
    expect(createRes.status).toBe(201);
    const { season } = await createRes.json();
    expect(season.termSlug).toBe("fall-2026");
    expect(season.divisionGender).toBe("coed");
    expect(season.skillLevel).toBe("c");
    expect(season.dayOfWeek).toBe("tue");

    const putRes = await fetch(`${BASE}/api/admin/seasons`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({
        id: season.id, programId, name: "Meta Test", slug,
        startDate: "2026-09-14", endDate: "2026-11-08",
        priceCents: 12000, signupModes: ["individual"], status: "draft",
        skillLevel: "b", dayOfWeek: "wed",
      }),
    });
    expect(putRes.status).toBe(200);
    const { season: updated } = await putRes.json();
    expect(updated.skillLevel).toBe("b");
    expect(updated.dayOfWeek).toBe("wed");
  });
});
```

If the repo has no reusable `signInAsAdmin`/`getAnyProgramId`, inline the sign-in (POST `/api/auth/signin` with the admin test creds, capture the `set-cookie`) and program lookup (GET `/api/admin/seasons` or a programs endpoint) following the closest existing admin test. Do not invent helpers that don't exist.

- [ ] **Step 2b: Type check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit** (the live run happens in CI `test-api`)

```bash
git add tests/api/admin-season-metadata.test.ts
git commit -m "test(admin): season metadata persists on create/update"
```

---

## Task 3: Admin form — surface the fields

**Files:**
- Modify: `src/components/admin/seasons-list.tsx`

- [ ] **Step 1: Extend the `Season` type**

Find the `Season` type/interface in `src/components/admin/seasons-list.tsx` (the shape fetched from `/api/admin/seasons`). Add these optional fields so `openEditDialog` can read them:

```ts
  termSlug?: string | null;
  termLabel?: string | null;
  divisionGender?: "coed" | "mens" | "womens" | null;
  skillLevel?: "a" | "b" | "c" | "d" | "open" | null;
  dayOfWeek?: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun" | null;
  startTime?: string | null;
  endTime?: string | null;
```

Then run `grep -n "from(seasons)\|select(" src/pages/api/admin/seasons.ts` to confirm the admin GET returns the full season row (it selects the `seasons` table, so the new columns are already included). If it uses an explicit column list, add the 7 columns to that select.

- [ ] **Step 2: Add to `formData` state**

In the `useState({ ... })` for `formData`, after `scheduleNotes: "",` add:

```ts
    termSlug: "",
    termLabel: "",
    divisionGender: "",
    skillLevel: "",
    dayOfWeek: "",
    startTime: "",
    endTime: "",
```

- [ ] **Step 3: Populate on edit**

In `openEditDialog`, in the `setFormData({ ... })`, after `scheduleNotes: season.scheduleNotes || "",` add:

```ts
      termSlug: season.termSlug || "",
      termLabel: season.termLabel || "",
      divisionGender: season.divisionGender || "",
      skillLevel: season.skillLevel || "",
      dayOfWeek: season.dayOfWeek || "",
      startTime: season.startTime || "",
      endTime: season.endTime || "",
```

- [ ] **Step 4: Send in the submit payload**

In `handleSubmit`'s `body` object, after `scheduleNotes: formData.scheduleNotes || null,` add:

```ts
        termSlug: formData.termSlug || null,
        termLabel: formData.termLabel || null,
        divisionGender: formData.divisionGender || null,
        skillLevel: formData.skillLevel || null,
        dayOfWeek: formData.dayOfWeek || null,
        startTime: formData.startTime || null,
        endTime: formData.endTime || null,
```

- [ ] **Step 5: Add the UI section**

In the dialog form JSX, after the `scheduleNotes` field block (and before the submit buttons), add a "League page metadata" section. Match the file's existing markup (it uses shadcn `Label`, `Input`, `Select`/`SelectTrigger`/`SelectContent`/`SelectItem`, and `grid grid-cols-2 gap-4` wrappers — mirror the age-group `Select` and the deposit `Input` exactly):

```tsx
              <div className="border-t border-border pt-4 mt-2">
                <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-3">
                  League page metadata (optional)
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="termLabel">Term label</Label>
                    <Input id="termLabel" value={formData.termLabel}
                      onChange={(e) => setFormData((p) => ({ ...p, termLabel: e.target.value }))}
                      placeholder="Fall 2026" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="termSlug">Term slug</Label>
                    <Input id="termSlug" value={formData.termSlug}
                      onChange={(e) => setFormData((p) => ({ ...p, termSlug: e.target.value }))}
                      placeholder="fall-2026" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label>Division gender</Label>
                    <Select value={formData.divisionGender || "none"}
                      onValueChange={(v) => setFormData((p) => ({ ...p, divisionGender: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="coed">Coed</SelectItem>
                        <SelectItem value="mens">Men's</SelectItem>
                        <SelectItem value="womens">Women's</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Skill level</Label>
                    <Select value={formData.skillLevel || "none"}
                      onValueChange={(v) => setFormData((p) => ({ ...p, skillLevel: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        <SelectItem value="a">A · Elite</SelectItem>
                        <SelectItem value="b">B · Competitive</SelectItem>
                        <SelectItem value="c">C · Rec+</SelectItem>
                        <SelectItem value="d">D · Beginner</SelectItem>
                        <SelectItem value="open">Open</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Night</Label>
                    <Select value={formData.dayOfWeek || "none"}
                      onValueChange={(v) => setFormData((p) => ({ ...p, dayOfWeek: v === "none" ? "" : v }))}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {["mon","tue","wed","thu","fri","sat","sun"].map((d) => (
                          <SelectItem key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="startTime">Start time</Label>
                    <Input id="startTime" type="time" value={formData.startTime}
                      onChange={(e) => setFormData((p) => ({ ...p, startTime: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endTime">End time</Label>
                    <Input id="endTime" type="time" value={formData.endTime}
                      onChange={(e) => setFormData((p) => ({ ...p, endTime: e.target.value }))} />
                  </div>
                </div>
              </div>
```

If `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `Label`, `Input` aren't already imported at the top of the file, they are (the existing age-group select + deposit input use them) — confirm with `grep -n "Select\|Label\|Input" src/components/admin/seasons-list.tsx | head`.

- [ ] **Step 6: Type check + build**

Run: `npx tsc --noEmit` (zero errors). Then `npm run build` — success. NOTE: a pre-existing build error in `src/pages/guides/baseball.astro` (null DB without local `DATABASE_URL`) is expected and NOT a failure; any error in `seasons-list.tsx`/`admin/seasons.ts` is real.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/seasons-list.tsx
git commit -m "feat(admin): league metadata fields in the season form"
```

---

## Task 4: Catalog seed — declare + backfill metadata

**Files:**
- Modify: `scripts/seed-2026-27-catalog.ts`

- [ ] **Step 1: Extend `DivSpec` and declare gender/skill on every division**

Change the `DivSpec` type to add `gender` and `skill`:

```ts
type DivSpec = {
  prog: string; label: string; age: string; kind: Kind;
  gender: "coed" | "mens" | "womens" | null;
  skill: "a" | "b" | "c" | "d" | "open" | null;
};
```

Set `gender`/`skill` on each entry in the `DIVISIONS` array per this mapping (age-bracket divisions get `skill: null`; youth get both `null`):

```ts
const DIVISIONS: DivSpec[] = [
  { prog: "dt-coed", label: "Co-Ed D",     age: "Adult Co-Ed",  kind: "adult", gender: "coed", skill: "d" },
  { prog: "dt-coed", label: "Co-Ed C",     age: "Adult Co-Ed",  kind: "adult", gender: "coed", skill: "c" },
  { prog: "dt-coed", label: "Co-Ed B",     age: "Adult Co-Ed",  kind: "adult", gender: "coed", skill: "b" },
  { prog: "dt-mens", label: "Open / A",    age: "Adult Open",   kind: "adult", gender: "mens", skill: "a" },
  { prog: "wo-coed", label: "Co-Ed B",     age: "Adult Co-Ed",  kind: "adult", gender: "coed", skill: "b" },
  { prog: "wo-coed", label: "Co-Ed C",     age: "Adult Co-Ed",  kind: "adult", gender: "coed", skill: "c" },
  { prog: "wo-coed", label: "Co-Ed D",     age: "Adult Co-Ed",  kind: "adult", gender: "coed", skill: "d" },
  { prog: "wo-coed", label: "Co-Ed 30+",   age: "Adult Over 30",kind: "adult", gender: "coed", skill: null },
  { prog: "wo-coed", label: "Co-Ed 40+",   age: "Adult Over 40",kind: "adult", gender: "coed", skill: null },
  { prog: "wo-mens", label: "Men's C",     age: "Adult Open",   kind: "adult", gender: "mens", skill: "c" },
  { prog: "wo-mens", label: "Men's D",     age: "Adult Open",   kind: "adult", gender: "mens", skill: "d" },
  { prog: "wo-mens", label: "Men's 30+",   age: "Adult Over 30",kind: "adult", gender: "mens", skill: null },
  { prog: "wo-womens", label: "Women's Open", age: "Adult Open",kind: "adult", gender: "womens", skill: "open" },
  { prog: "wo-futsal", label: "Co-Ed Rec", age: "Adult Co-Ed",  kind: "futsal", gender: "coed", skill: "d" },
  { prog: "wo-futsal", label: "Men's B",   age: "Adult Open",   kind: "futsal", gender: "mens", skill: "b" },
  { prog: "wo-futsal", label: "Co-Ed Comp",age: "Adult Co-Ed",  kind: "futsal", gender: "coed", skill: "b" },
  { prog: "wo-futsal", label: "Men's A",   age: "Adult Open",   kind: "futsal", gender: "mens", skill: "a" },
  { prog: "wo-youth", label: "U6",  age: "U6",  kind: "youth", gender: null, skill: null },
  { prog: "wo-youth", label: "U8",  age: "U8",  kind: "youth", gender: null, skill: null },
  { prog: "wo-youth", label: "U10", age: "U10", kind: "youth", gender: null, skill: null },
  { prog: "wo-youth", label: "U12", age: "U12", kind: "youth", gender: null, skill: null },
  { prog: "wo-youth-futsal", label: "U7-U8", age: "U8", kind: "youth", gender: null, skill: null },
];
```

(Keep the existing comment lines/grouping if present; only add the two fields per entry.)

- [ ] **Step 2: Set metadata columns on INSERT**

In the `insert into seasons (...)` statement, add the 4 columns to the column list and the 4 values. Change the column list to include `term_slug, term_label, division_gender, skill_level` and append the values `${s.key}, ${s.label}, ${d.gender}, ${d.skill}`:

```ts
      await sql`
        insert into seasons (program_id, age_group_id, name, slug, start_date, end_date,
          registration_opens, registration_closes, early_bird_deadline,
          price_cents, team_price_cents, early_bird_price_cents, deposit_cents, allow_deposit,
          signup_modes, pricing_mode, status,
          term_slug, term_label, division_gender, skill_level)
        values (${pid}, ${agId}, ${name}, ${slug}, ${s.start}, ${s.end},
          ${ts(s.regOpen)}, ${ts(s.regClose)}, ${ts(s.eb)},
          ${indiv}, ${team}, ${teamEB}, ${deposit}, ${deposit !== null},
          ${sql.array(modes)}, ${pricingMode}, 'draft',
          ${s.key}, ${s.label}, ${d.gender}, ${d.skill})`;
```

- [ ] **Step 3: Backfill metadata on EXISTING rows (the key change)**

The current on-exists branch skips. Replace it so existing rows get their metadata updated (this is what backfills the 88 already-created prod rows). Find:

```ts
      const existing = await sql`select id from seasons where program_id=${pid} and slug=${slug} limit 1`;
      if (existing.length) { skipped++; if (!COMMIT) console.log(`  [dry-run] SKIP (exists): ${name}`); continue; }
```

Replace with:

```ts
      const existing = await sql`select id from seasons where program_id=${pid} and slug=${slug} limit 1`;
      if (existing.length) {
        if (COMMIT) {
          await sql`update seasons set
            term_slug=${s.key}, term_label=${s.label},
            division_gender=${d.gender}, skill_level=${d.skill}
            where id=${existing[0].id}`;
          backfilled++;
        } else {
          console.log(`  [dry-run] would BACKFILL metadata: ${name}  (term=${s.key}, gender=${d.gender ?? "—"}, level=${d.skill ?? "—"})`);
        }
        skipped++;
        continue;
      }
```

Add a `let backfilled = 0;` next to the existing `let created = 0, skipped = 0, planned = 0;` declaration, and include it in the final `=== SUMMARY ===` log (e.g. add `console.log(\`Backfilled metadata: ${backfilled}\`);`).

- [ ] **Step 4: Dry-run review (the test for this ops script)**

Run the script in dry-run (default, no DB writes — but it needs a DB to read existing rows; against staging):
`railway run bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/seed-2026-27-catalog.ts'` (against the **staging** project)
Expected: the log shows `would BACKFILL metadata:` lines for the existing seasons with correct `term`/`gender`/`level` per the table (e.g. `Fall 2026 — Co-Ed B  (term=fall-2026, gender=coed, level=b)`). Eyeball a few against the mapping. If `railway`/staging access isn't available to the implementer, STOP and report — the maintainer runs this step.

- [ ] **Step 5: Type check + commit**

Run: `npx tsc --noEmit` (zero errors — the script is standalone but still type-checked).
```bash
git add scripts/seed-2026-27-catalog.ts
git commit -m "feat(catalog): populate + backfill season league metadata"
```

---

## Task 5: Verify + PR + operational backfill

- [ ] **Step 1: Local gate**

Run: `npx tsc --noEmit` (zero errors). Run any existing unit suite quickly to ensure nothing broke: `npx vitest run tests/unit 2>&1 | tail -5` (the only expected failure is the pre-existing DB-dependent `soccerone/venues.test.ts`).

- [ ] **Step 2: Push + PR**

```bash
git push -u origin <branch>
gh pr create --fill
```

- [ ] **Step 3: Watch CI to green.** `test-api` runs the new admin-metadata test; `build`/`typecheck` cover the rest. Not done until CI is green; if `test-api` fails, read the log, fix, push, re-watch.

- [ ] **Step 4: Post-merge operational backfill (maintainer step — document in the PR).** After merge, run the catalog seed against prod to backfill the 88 rows:
  - Dry-run: `railway run bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/seed-2026-27-catalog.ts'` — review the `would BACKFILL` lines.
  - Commit: `railway run bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/seed-2026-27-catalog.ts --commit'`.
  - Then in `/admin/seasons`, flip the desired term's seasons to `open`/`forming` per schedule (Fall on ~Jul 13) and confirm `/adult/leagues/soccer/fall-2026` renders the finder. (This step is operational, not part of CI.)

---

## Self-Review notes

- **Spec coverage:** Part A admin fields → Tasks 1–3; Part B catalog backfill (insert + update-on-exists + explicit gender/skill) → Task 4; verification + operational run → Task 5. `day`/`time` left null by the backfill (admin-only) — matches spec. Summer 2026 untouched — matches spec.
- **Type consistency:** field names (`termSlug`, `divisionGender`, `skillLevel`, `dayOfWeek`, `startTime`, `endTime`) match the Drizzle schema (camelCase) and the API/form; the catalog uses the snake_case DB columns (`term_slug`, etc.) directly in raw SQL — correct for that standalone script.
- **Age-bracket divisions:** `skill: null` (folds into "open" display) per the spec's open item; no `"age"` enum introduced.
- **Testing limits:** the catalog ops script is verified by dry-run review + staging run (it's a side-effecting standalone script, not unit-testable without refactor); the admin endpoint is covered by the CI API test.
