# Phase 3 — Narration Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/plans/2026-07-06-training-content-pipeline.md`, "Global Constraints" and "Phase 3 — Narration scripts (+ optional TTS)". The TTS stretch (`training/scripts/tts-mux.ts`, `TRAINING_TTS_API_KEY`) is explicitly OUT — no such key exists, do not build it. Phase 1 (`src/lib/ops-catalog/views/training-deck.ts`, `scripts/ops-catalog/index.ts`) and Phase 2 (`training/lib/tour.ts`, `training/walkthroughs/*.walkthrough.ts`, `training/playwright.config.ts`) are already merged to `main` and present in this worktree.

**Goal:** `npm run training:narration` reads every `training/output/<workflow>/captions.json` that exists and writes a natural-sounding, timestamped voiceover script to `training/narration/<workflow>.md` (committed repo content). Each worker-role training deck gains a final "Watch the walkthroughs" slide listing the workflows relevant to that role, driven by a static, deterministic workflow→role map — never by probing the filesystem from inside the pure view.

**Architecture:** A new pure module `training/lib/narration.ts` (mirrors `training/lib/tour.ts`'s "pure core + thin CLI wrapper" split) exports `renderNarrationScript(workflow, captions)` — a hand-authored, per-caption lookup table of spoken-register lines (not a robotic echo of UI captions), with a graceful fallback transform for any caption not in the table — and `generateAllNarrationScripts(rootDir)`, which walks the six known workflow names, reads each `captions.json` if present, and writes the `.md` file. `training/scripts/generate-narration.ts` is the thin CLI entrypoint (`npm run training:narration`), printing which workflows were written vs. skipped and always exiting 0. `src/lib/ops-catalog/views/training-deck.ts` gets a new static `WALKTHROUGHS: Record<string, { roles: string[]; label: string }>` map plus a `renderWalkthroughsSlide()` helper that is a pure function of `(roleId, presentNarrationWorkflows)` — the CLI shim (`scripts/ops-catalog/index.ts`) is the only thing that stats `training/narration/*.md` on disk, exactly mirroring how it already stats `training/screenshots/**` for the embed step.

**Tech Stack:** Existing only — plain Node `fs`/`path`, Vitest for unit tests. No new dependencies.

## Global Constraints

Copied from the spec; every task's requirements implicitly include these:

- `training/narration/<workflow>.md` generated from each walkthrough's captions JSON (`npm run training:narration`) — numbered, timestamped voiceover script per video, written for a human reader or TTS input.
- A deck appendix slide linking each workflow's video + script.
- TTS muxing is explicitly out of scope — do not build `tts-mux.ts` or gate anything behind `TRAINING_TTS_API_KEY`.
- Acceptance: every video has a narration script whose steps match its captions; regenerating after a walkthrough change updates the script.
- `training/output/` is gitignored (build artifacts); `training/narration/` and `training/screenshots/` ARE committed repo content.
- Decks must stay self-contained HTML, byte-stable for unchanged input; the ops-catalog CI check (`.github/workflows/ops-catalog.yml`) diffs `docs/operations/artifacts/**` after running `npm run catalog:render` and fails the build on any diff.
- Standard repo rules: `npx tsc --noEmit` zero errors; no schema/migration changes; no tenant-scoping concerns (this phase touches no API routes).

## Scouting Findings (read before touching code)

1. **Real captions vary by runtime UI state.** Every `*.walkthrough.ts` file guards several steps behind `if ((await locator.count()) > 0)` (e.g. `coach-core`'s "Open a team roster", "Mark a player present (not saved)"; `admin-hire-compliance`'s either/or "Mark the training applicant hired" vs. "The training applicant shows as hired"). A real `captions.json` may therefore contain any subset of a workflow's possible captions. The narration lookup table must cover every caption string any walkthrough can produce today, confirmed by reading all six files in full (see the table in Task 1).
2. **`CaptionEntry` shape** (from `training/lib/tour.ts`): `{ index: number; caption: string; timestampMs: number; screenshot: string; deckSlug?: string }`. `captions.json` is `CaptionEntry[]`, pretty-printed with a trailing newline (`JSON.stringify(this.captions, null, 2) + "\n"`).
3. **Real worker roles with decks today** (`docs/operations/catalog/roles/*.yaml`, `kind: worker`): `role.coach`, `role.director`, `role.event_lead`, `role.facilities`, `role.front_of_house`, `role.photographer`, `role.ref`, `role.team_captain`, `role.venue_manager` — 9 roles, each already rendering `docs/operations/artifacts/training/role.<id>.deck.html`. Per `training/README.md`'s own workflow table, the six workflows map to only 4 of those 9 roles (`coach`, `director`, `ref`, `venue_manager`); `event_lead`, `facilities`, `front_of_house`, `photographer`, `team_captain` have no relevant workflow and their decks must stay byte-stable through this whole phase.
4. **The CLI shim's existing screenshot-embed pattern is the template to copy** (`scripts/ops-catalog/index.ts`'s `render` command): it does one `fs.readdir` per role's screenshot directory inside a `try`/catch that swallows `ENOENT`, and only the shim (never `src/lib/ops-catalog/views/training-deck.ts`) touches the filesystem. The narration-presence probe follows the exact same shape, but only needs one `fs.readdir` total (`training/narration/`), reused for every role.
5. **Fixture catalog roles available for training-deck tests** (`tests/unit/ops-catalog/fixtures/inline-catalog.ts`): `role.venue_manager` (worker), `role.coach` (worker), `role.parent` (customer). These ids happen to exactly match two of the four real `WALKTHROUGHS` role targets (`role.coach`, `role.venue_manager`), so no new fixture roles are needed to test the appendix slide — `role.director`/`role.ref` map entries are exercised indirectly (their `roles` arrays are checked not to match the fixture's `role.coach`/`role.venue_manager` fixture ids). A worker role with zero mapped workflows (`role.team_captain`, `kind: worker`, absent from `WALKTHROUGHS`) already appears in `tests/unit/ops-catalog/views/training-deck.test.ts` as an ad-hoc injected fixture role (see its `"does NOT skip hand_authored worker roles"` test) — reuse that same pattern for the byte-stability test.
6. **Current unit test baseline:** `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog` passes 77 tests across 13 files today. This phase adds new `it()` blocks to `tests/unit/ops-catalog/views/training-deck.test.ts` and a new `tests/unit/training/narration.test.ts` file — total must stay green throughout.
7. **Dev server port 4321 is free** at planning time (`lsof -i :4321` returned nothing). Task 4 assumes this; if it's occupied when that task runs, use `npm run dev -- --port 4322` and `TRAINING_BASE_URL=http://localhost:4322`.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `training/lib/narration.ts` | Create | Pure `renderNarrationScript()` + `generateAllNarrationScripts()`; the hand-authored caption→spoken-line table. |
| `tests/unit/training/fixtures/coach-core.captions.json` | Create | Fixture `CaptionEntry[]` matching `tour.ts`'s real shape, for `coach-core`. |
| `tests/unit/training/fixtures/referee-gameday.captions.json` | Create | Fixture `CaptionEntry[]` including `deckSlug`, for `referee-gameday`. |
| `tests/unit/training/narration.test.ts` | Create | Unit tests for the narration module. |
| `training/scripts/generate-narration.ts` | Create | Thin CLI entrypoint for `npm run training:narration`. |
| `package.json` | Modify | Add `"training:narration"` script. |
| `src/lib/ops-catalog/views/training-deck.ts` | Modify | Add `WALKTHROUGHS` map, `renderWalkthroughsSlide()`, `TrainingDeckOptions.presentNarrationWorkflows`, wire into `renderTrainingDeck()`, add `.walkthrough-list` to the existing list-spacing CSS rule. |
| `tests/unit/ops-catalog/views/training-deck.test.ts` | Modify | New tests for the appendix slide (relevant workflows shown, irrelevant ones filtered, byte-stability for unmapped roles, default-omitted behavior). |
| `scripts/ops-catalog/index.ts` | Modify | Probe `training/narration/*.md`, pass the resulting workflow-slug list into every role's `TrainingDeckOptions`. |
| `training/README.md` | Modify | Add a "Generating narration scripts" section. |
| `training/narration/coach-core.md` … `venue-manager.md` | Generate + commit | The six real narration scripts (Task 5). |
| `docs/operations/artifacts/training/role.*.deck.html` | Regenerate + commit | Re-rendered decks once narration files exist (Task 6). |

---

### Task 1: Narration core module + unit tests

**Files:**
- Create: `training/lib/narration.ts`
- Create: `tests/unit/training/fixtures/coach-core.captions.json`
- Create: `tests/unit/training/fixtures/referee-gameday.captions.json`
- Test: `tests/unit/training/narration.test.ts`

**Interfaces:**
- Consumes: `CaptionEntry` type from `training/lib/tour.ts` (`{ index: number; caption: string; timestampMs: number; screenshot: string; deckSlug?: string }`).
- Produces: `WORKFLOWS: readonly string[]`, `renderNarrationScript(workflow: string, captions: CaptionEntry[]): string`, `generateAllNarrationScripts(rootDir: string): Promise<{ written: string[]; missing: string[] }>` — all consumed by Task 2's CLI script.

Every caption string any of the six `training/walkthroughs/*.walkthrough.ts` files can produce today (confirmed by reading all six in full):

```
coach-core: "Coach dashboard — today at a glance", "My teams", "Open a team roster",
  "Open the add-note UI for a player (not submitted)", "Open the attendance tracker",
  "Mark a player present (not saved)", "Player assessments overview",
  "Open a player's assessment detail", "Open the record-assessment form (not submitted)"
coach-practices: "Practice sessions — list and sequence progress", "Open a practice session",
  "Review the session plan structure", "Open the post-session reflection form (not saved)"
admin-hire-compliance: "Applications — hiring pipeline fallback view",
  "Mark the training applicant hired", "The training applicant shows as hired",
  "Coach compliance grid", "Open the SafeSport credential editor",
  "Record the credential as verified"
admin-sequencing: "Curriculum sequence library", "Open the training fixture sequence",
  "Choose the season and generate practice-plan drafts"
referee-gameday: "My matches — the referee's assignment list", "Open the training fixture match",
  "Enter the final score, log an incident, and submit the report"
venue-manager: "Venue command center — today's overview", "Open an activity's roster panel",
  "Player/team check-in station", "End-of-day reports"
```

- [x] **Step 1: Write the fixture JSON files**

`tests/unit/training/fixtures/coach-core.captions.json`:

```json
[
  {
    "index": 0,
    "caption": "Coach dashboard — today at a glance",
    "timestampMs": 0,
    "screenshot": "00-coach-dashboard-today-at-a-glance.png"
  },
  {
    "index": 1,
    "caption": "My teams",
    "timestampMs": 3120,
    "screenshot": "01-my-teams.png"
  },
  {
    "index": 2,
    "caption": "Open a team roster",
    "timestampMs": 6980,
    "screenshot": "02-open-a-team-roster.png"
  }
]
```

`tests/unit/training/fixtures/referee-gameday.captions.json`:

```json
[
  {
    "index": 0,
    "caption": "My matches — the referee's assignment list",
    "timestampMs": 0,
    "screenshot": "00-my-matches-the-referee-s-assignment-list.png",
    "deckSlug": "ref_check_in"
  },
  {
    "index": 1,
    "caption": "Open the training fixture match",
    "timestampMs": 4210,
    "screenshot": "01-open-the-training-fixture-match.png"
  },
  {
    "index": 2,
    "caption": "Enter the final score, log an incident, and submit the report",
    "timestampMs": 9870,
    "screenshot": "02-enter-the-final-score-log-an-incident-and-submit-the-report.png",
    "deckSlug": "score_reporting_final"
  }
]
```

- [x] **Step 2: Write the failing test**

`tests/unit/training/narration.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  renderNarrationScript,
  generateAllNarrationScripts,
  WORKFLOWS,
} from "../../../training/lib/narration";
import coachCoreCaptions from "./fixtures/coach-core.captions.json";
import refereeGamedayCaptions from "./fixtures/referee-gameday.captions.json";

describe("renderNarrationScript", () => {
  it("renders a numbered, timestamped script with spoken-register lines, not raw captions", () => {
    const script = renderNarrationScript("coach-core", coachCoreCaptions);

    expect(script).toContain("# Coach Core");
    expect(script).toContain("training/output/coach-core/video.webm");
    expect(script).toMatch(/^1\. \[00:00\] /m);
    expect(script).toMatch(/^2\. \[00:03\] /m);
    expect(script).toMatch(/^3\. \[00:07\] /m);
    // Spoken register, not a verbatim echo of the UI caption string.
    expect(script).not.toContain("Coach dashboard — today at a glance\n");
    expect(script).toContain("today's schedule and tasks");
  });

  it("keeps output ordered by caption index even if input is out of order", () => {
    const shuffled = [...coachCoreCaptions].reverse();
    const script = renderNarrationScript("coach-core", shuffled);
    const lines = script.split("\n").filter((l) => /^\d+\. \[/.test(l));
    expect(lines[0]).toMatch(/^1\. \[00:00\]/);
    expect(lines[2]).toMatch(/^3\. \[00:07\]/);
  });

  it("never leaks internal UI markers like '(not submitted)' into the fallback transform", () => {
    const script = renderNarrationScript("coach-core", [
      {
        index: 0,
        caption: "Some brand-new step not in the lookup table (not submitted)",
        timestampMs: 1000,
        screenshot: "00-x.png",
      },
    ]);
    expect(script).not.toContain("(not submitted)");
    expect(script).toContain("1. [00:01]");
  });

  it("renders every deckSlug-tagged caption from the referee-gameday fixture too (deckSlug is ignored, not required)", () => {
    const script = renderNarrationScript("referee-gameday", refereeGamedayCaptions);
    expect(script).toContain("1. [00:00]");
    expect(script).toContain("2. [00:04]");
    expect(script).toContain("3. [00:10]");
  });
});

describe("generateAllNarrationScripts", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "narration-test-"));
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it("writes a .md file only for workflows with a captions.json present, and lists the rest as missing", async () => {
    const coachCoreDir = path.join(rootDir, "output", "coach-core");
    await fs.mkdir(coachCoreDir, { recursive: true });
    await fs.writeFile(
      path.join(coachCoreDir, "captions.json"),
      JSON.stringify(coachCoreCaptions),
    );

    const result = await generateAllNarrationScripts(rootDir);

    expect(result.written).toEqual(["coach-core"]);
    expect(result.missing).toEqual(WORKFLOWS.filter((w) => w !== "coach-core"));

    const written = await fs.readFile(
      path.join(rootDir, "narration", "coach-core.md"),
      "utf8",
    );
    expect(written).toContain("# Coach Core");
  });

  it("returns every workflow as missing and writes nothing when no output dirs exist", async () => {
    const result = await generateAllNarrationScripts(rootDir);
    expect(result.written).toEqual([]);
    expect(result.missing).toEqual([...WORKFLOWS]);
    await expect(fs.stat(path.join(rootDir, "narration"))).rejects.toThrow();
  });
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/training/narration.test.ts`
Expected: FAIL — `Cannot find module '../../../training/lib/narration'`.

- [x] **Step 4: Implement `training/lib/narration.ts`**

```typescript
// Phase 3 narration generator — pure core. Reads a workflow's captions.json
// (written by training/lib/tour.ts) and renders a numbered, timestamped
// voiceover script in natural spoken language, not a verbatim echo of the
// terse UI captions used for on-screen labeling. Kept side-effect-free
// except for generateAllNarrationScripts, which is the one function that
// touches the filesystem — mirrors tour.ts's split between the unit-tested
// Tour class and the Playwright-only registerVideoCapture().
import fs from "node:fs/promises";
import path from "node:path";
import type { CaptionEntry } from "./tour";

export const WORKFLOWS = [
  "coach-core",
  "coach-practices",
  "admin-hire-compliance",
  "admin-sequencing",
  "referee-gameday",
  "venue-manager",
] as const;

export type WorkflowName = (typeof WORKFLOWS)[number];

const WORKFLOW_TITLES: Record<WorkflowName, string> = {
  "coach-core": "Coach Core: Roster, Attendance & Assessments",
  "coach-practices": "Coach Practices: Sessions & Reflection",
  "admin-hire-compliance": "Admin Hiring & Compliance",
  "admin-sequencing": "Admin Curriculum Sequencing",
  "referee-gameday": "Referee Game Day",
  "venue-manager": "Venue Manager Command Center",
};

// Hand-written spoken-register line for every caption string any of the six
// training/walkthroughs/*.walkthrough.ts files can produce today, including
// conditional/optional steps (several walkthrough steps are gated on
// `if ((await locator.count()) > 0)`, so a real recording may or may not
// include them). Keyed by the caption text verbatim — this is a translation
// table reviewed against the real walkthrough source, not a heuristic.
const SPOKEN_LINES: Record<string, string> = {
  // coach-core
  "Coach dashboard — today at a glance":
    "Let's start on the coach dashboard. This is the first thing you see when you log in — today's schedule and tasks at a glance.",
  "My teams": "From here, tap My Teams to see every team you're coaching this season.",
  "Open a team roster": "Pick a team to open its roster and see your full player list.",
  "Open the add-note UI for a player (not submitted)":
    "Next to any player you can add a quick note for yourself — here's what that looks like. We won't save this one, just showing you where it lives.",
  "Open the attendance tracker": "From the roster, jump into the attendance tracker for today's session.",
  "Mark a player present (not saved)":
    "Marking someone present is just a tap. We're not saving this demo change, but that's all it takes on game day.",
  "Player assessments overview":
    "Now let's check Assessments — this shows every player due for a skill evaluation across your teams.",
  "Open a player's assessment detail": "Tap a player's name to open their assessment detail and history.",
  "Open the record-assessment form (not submitted)":
    "From here you'd record a new assessment. We'll leave this one unsaved for the demo — you'll fill in real skill levels during an actual session.",
  // coach-practices
  "Practice sessions — list and sequence progress":
    "This is your Practices tab — every planned session, plus a progress bar showing how far along your team's curriculum sequence is.",
  "Open a practice session": "Click into a session to see its full plan.",
  "Review the session plan structure": "Scroll through the plan to see how each session breaks down into activity blocks.",
  "Open the post-session reflection form (not saved)":
    "After a session wraps, you'd fill out a quick reflection here. We're not saving this one — just showing you where it lives.",
  // admin-hire-compliance
  "Applications — hiring pipeline fallback view":
    "Let's look at the Applications page — this is the fallback view for the hiring pipeline.",
  "Mark the training applicant hired": "Here's Mark Hired in action — one click moves an applicant into hired status.",
  "The training applicant shows as hired":
    "This applicant is already marked hired — that's exactly the state you'll see right after clicking Mark Hired.",
  "Coach compliance grid": "Now over to the Coach Compliance grid, where every coach's required credentials live.",
  "Open the SafeSport credential editor": "Click into a coach's row to open their SafeSport credential editor.",
  "Record the credential as verified":
    "Set the status to Valid, add the issue date, and save — that's how you record a verified credential.",
  // admin-sequencing
  "Curriculum sequence library":
    "This is the curriculum sequence library — every reusable practice sequence your organization has built.",
  "Open the training fixture sequence": "Open a sequence to see its full detail.",
  "Choose the season and generate practice-plan drafts":
    "Pick the season, set the first practice date, and hit Attach & Generate — that creates a draft practice plan for every date in the sequence.",
  // referee-gameday
  "My matches — the referee's assignment list":
    "This is My Matches — every game you're assigned to referee. Check-in starts right here.",
  "Open the training fixture match": "Tap into a match to open live scoring.",
  "Enter the final score, log an incident, and submit the report":
    "Enter the final score, log any incidents, and submit — that's the whole match report in three steps.",
  // venue-manager
  "Venue command center — today's overview":
    "Welcome to the venue command center — your run-of-show for everything happening today.",
  "Open an activity's roster panel": "Tap any scheduled activity to open its roster panel.",
  "Player/team check-in station": "This is the check-in station, where players and teams check in as they arrive.",
  "End-of-day reports": "Once the day wraps up, End-of-Day Reports gives you the full summary.",
};

// Fallback for any caption not in SPOKEN_LINES (e.g. a walkthrough edited
// after this table was written). Strips UI-only markers rather than reading
// them aloud, and never throws — the generator must degrade gracefully.
function fallbackSpokenLine(caption: string): string {
  const cleaned = caption
    .replace(/\(not (submitted|saved)\)/gi, "")
    .replace(/\s+—\s+/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  const lower = cleaned.length > 0 ? cleaned.charAt(0).toLowerCase() + cleaned.slice(1) : cleaned;
  return `Now let's look at ${lower}.`;
}

function spokenLineFor(caption: string): string {
  return SPOKEN_LINES[caption] ?? fallbackSpokenLine(caption);
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Renders a numbered, timestamped voiceover script for one workflow. */
export function renderNarrationScript(workflow: string, captions: CaptionEntry[]): string {
  const title = WORKFLOW_TITLES[workflow as WorkflowName] ?? workflow;
  const ordered = [...captions].sort((a, b) => a.index - b.index);
  const lines = ordered.map(
    (c, i) => `${i + 1}. [${formatTimestamp(c.timestampMs)}] ${spokenLineFor(c.caption)}`,
  );

  return [
    `# ${title} — Narration Script`,
    "",
    `Source video: \`training/output/${workflow}/video.webm\``,
    "",
    ...lines,
    "",
  ].join("\n");
}

export interface GenerateResult {
  written: string[];
  missing: string[];
}

/**
 * For each known workflow, reads <rootDir>/output/<workflow>/captions.json
 * if present and writes <rootDir>/narration/<workflow>.md. Never throws on a
 * missing output directory — that's the normal "haven't recorded this
 * workflow yet" state, reported via `missing` instead.
 */
export async function generateAllNarrationScripts(rootDir: string): Promise<GenerateResult> {
  const written: string[] = [];
  const missing: string[] = [];

  for (const workflow of WORKFLOWS) {
    const captionsPath = path.join(rootDir, "output", workflow, "captions.json");
    let raw: string;
    try {
      raw = await fs.readFile(captionsPath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        missing.push(workflow);
        continue;
      }
      throw err;
    }

    const captions: CaptionEntry[] = JSON.parse(raw);
    const script = renderNarrationScript(workflow, captions);
    const narrationDir = path.join(rootDir, "narration");
    await fs.mkdir(narrationDir, { recursive: true });
    await fs.writeFile(path.join(narrationDir, `${workflow}.md`), script);
    written.push(workflow);
  }

  return { written, missing };
}
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/training/`
Expected: PASS (all `narration.test.ts` + existing `tour.test.ts` tests green).

- [x] **Step 6: Commit**

```bash
git add training/lib/narration.ts tests/unit/training/fixtures/coach-core.captions.json tests/unit/training/fixtures/referee-gameday.captions.json tests/unit/training/narration.test.ts
git commit -m "$(cat <<'EOF'
feat(training): add narration script generator core

Pure renderNarrationScript()/generateAllNarrationScripts() with a
hand-authored caption-to-spoken-line table covering every caption string
the six walkthroughs can produce, plus a graceful fallback transform.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: CLI entrypoint (`npm run training:narration`)

**Files:**
- Create: `training/scripts/generate-narration.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `generateAllNarrationScripts(rootDir: string)` from Task 1.
- Produces: `npm run training:narration` — no return value consumed elsewhere; this is a leaf CLI command.

- [x] **Step 1: Write `training/scripts/generate-narration.ts`**

```typescript
#!/usr/bin/env tsx
// CLI entrypoint for `npm run training:narration`. Thin wrapper around
// training/lib/narration.ts's generateAllNarrationScripts — mirrors the
// scripts/ops-catalog/index.ts "thin shim, real logic lives in a lib" split.
import path from "node:path";
import { generateAllNarrationScripts } from "../lib/narration";

async function main() {
  const rootDir = path.join(process.cwd(), "training");
  const { written, missing } = await generateAllNarrationScripts(rootDir);

  for (const workflow of written) {
    console.log(`Wrote training/narration/${workflow}.md`);
  }
  if (missing.length > 0) {
    console.log(
      `No captions.json found for: ${missing.join(", ")} — run "npm run training:videos" first.`,
    );
  }
  if (written.length === 0) {
    console.log(
      "No narration scripts generated — no training/output/<workflow>/captions.json found.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [x] **Step 2: Add the npm script**

In `package.json`, add next to `"training:videos"`:

```json
    "training:narration": "tsx training/scripts/generate-narration.ts",
```

- [x] **Step 3: Run it against the current (empty) `training/output/`**

Run: `npm run training:narration`
Expected: exit code 0, output listing all six workflows as missing (no `training/output/` exists yet), e.g.:
```
No captions.json found for: coach-core, coach-practices, admin-hire-compliance, admin-sequencing, referee-gameday, venue-manager — run "npm run training:videos" first.
```

- [x] **Step 4: Commit**

```bash
git add training/scripts/generate-narration.ts package.json
git commit -m "$(cat <<'EOF'
feat(training): wire up npm run training:narration CLI

Thin CLI shim over generateAllNarrationScripts(); exits 0 and reports
missing workflows gracefully when no captions.json exists yet.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Deck appendix slide — pure view + tests

**Files:**
- Modify: `src/lib/ops-catalog/views/training-deck.ts`
- Test: `tests/unit/ops-catalog/views/training-deck.test.ts`

**Interfaces:**
- Consumes: nothing new from other tasks (self-contained view change).
- Produces: `WALKTHROUGHS: Record<string, { roles: string[]; label: string }>` (exported for Task 4's CLI-shim wiring to reference workflow names, if useful, though the shim only needs filenames), `TrainingDeckOptions.presentNarrationWorkflows?: string[]`, consumed by `renderTrainingDeck()`. Task 4 (`scripts/ops-catalog/index.ts`) passes this option in.

- [x] **Step 1: Write the failing tests**

Add to `tests/unit/ops-catalog/views/training-deck.test.ts` (new `describe` block at the end of the file, before the final closing):

```typescript
describe("renderTrainingDeck — walkthrough appendix slide", () => {
  it("omits the appendix slide entirely when presentNarrationWorkflows is not passed", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach);
    expect(html).not.toContain("Watch the walkthroughs");
  });

  it("lists only the workflows relevant to this role, ignoring workflows mapped to other roles", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach, {
      presentNarrationWorkflows: ["coach-core", "coach-practices", "admin-hire-compliance"],
    });
    expect(html).toContain("Watch the walkthroughs");
    expect(html).toContain("training/narration/coach-core.md");
    expect(html).toContain("training/narration/coach-practices.md");
    // admin-hire-compliance maps to role.director, not role.coach.
    expect(html).not.toContain("admin-hire-compliance");
  });

  it("lists a venue-manager-relevant workflow on the venue manager deck", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.venueManager, {
      presentNarrationWorkflows: ["venue-manager"],
    });
    expect(html).toContain("Watch the walkthroughs");
    expect(html).toContain("training/narration/venue-manager.md");
  });

  it("omits a workflow from the appendix when it is mapped but not yet present on disk", () => {
    const html = renderTrainingDeck(buildInlineCatalog(), fixtureIds.roles.coach, {
      presentNarrationWorkflows: ["admin-hire-compliance"],
    });
    expect(html).not.toContain("Watch the walkthroughs");
    expect(html).not.toContain("training/narration/coach-core.md");
  });

  it("is byte-stable for a worker role with no mapped workflows, regardless of presentNarrationWorkflows", () => {
    const catalog = buildInlineCatalog();
    const teamCaptain: Role = {
      id: "role.team_captain",
      name: "Team Captain",
      tier: "field_side",
      kind: "worker",
      description: "Worker role with no mapped training walkthrough.",
      manual_target: "hand_authored",
    };
    const withCatalog = { ...catalog, roles: [...catalog.roles, teamCaptain] };

    const withoutFlag = renderTrainingDeck(withCatalog, "role.team_captain");
    const withAllWorkflows = renderTrainingDeck(withCatalog, "role.team_captain", {
      presentNarrationWorkflows: [
        "coach-core",
        "coach-practices",
        "admin-hire-compliance",
        "admin-sequencing",
        "referee-gameday",
        "venue-manager",
      ],
    });

    expect(withoutFlag).toBe(withAllWorkflows);
    expect(withoutFlag).not.toContain("Watch the walkthroughs");
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/views/training-deck.test.ts`
Expected: FAIL — `renderTrainingDeck` doesn't recognize `presentNarrationWorkflows` yet (tests assert on absent content, so failures will show as the "should contain" assertions failing).

- [x] **Step 3: Implement the appendix slide in `src/lib/ops-catalog/views/training-deck.ts`**

Add this block after `PORTAL_PAGES` and before `renderToolsSlide` (around line 566, right after the `PORTAL_PAGES` const closes):

```typescript
// ---------------------------------------------------------------------------
// Phase 3: walkthrough narration appendix. Static, deterministic map from a
// training walkthrough's workflow slug (matches
// training/walkthroughs/<slug>.walkthrough.ts and training/narration/<slug>.md)
// to the worker role(s) whose deck should list it. Kept as a literal map —
// not derived from the catalog, same rationale as PORTAL_PAGES above — so
// this pure view never touches the filesystem. scripts/ops-catalog/index.ts
// is the only thing that stats training/narration/*.md, and passes the
// resulting list of present workflow slugs in via
// opts.presentNarrationWorkflows.
// ---------------------------------------------------------------------------

interface WalkthroughInfo {
  roles: string[];
  label: string;
}

const WALKTHROUGHS: Record<string, WalkthroughInfo> = {
  "coach-core": { roles: ["role.coach"], label: "Roster, attendance, and player assessments" },
  "coach-practices": { roles: ["role.coach"], label: "Practice sessions and post-session reflection" },
  "admin-hire-compliance": {
    roles: ["role.director"],
    label: "Hiring pipeline and coach credential compliance",
  },
  "admin-sequencing": { roles: ["role.director"], label: "Curriculum sequencing and season attachment" },
  "referee-gameday": { roles: ["role.ref"], label: "Match assignment, scoring, and final report" },
  "venue-manager": { roles: ["role.venue_manager"], label: "Venue command center, check-in, and reports" },
};

function renderWalkthroughsSlide(roleId: string, presentWorkflows: string[] | undefined): string | null {
  if (!presentWorkflows || presentWorkflows.length === 0) return null;
  const present = new Set(presentWorkflows);
  const entries = Object.entries(WALKTHROUGHS)
    .filter(([workflow, info]) => present.has(workflow) && info.roles.includes(roleId))
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return null;

  const items = entries
    .map(
      ([workflow, info]) =>
        `<li>${escapeHtml(info.label)} — <code>training/narration/${escapeHtml(workflow)}.md</code></li>`,
    )
    .join("");
  return `
    <h2>Watch the walkthroughs</h2>
    <p>Every workflow below has a short recorded walkthrough and a written narration script you can read alongside it.</p>
    <ul class="walkthrough-list">${items}</ul>
  `.trim();
}
```

Update `TrainingDeckOptions` (currently just above `renderTrainingDeck`):

```typescript
export interface TrainingDeckOptions {
  intro?: string;
  screenshots?: Map<string, string>;
  presentNarrationWorkflows?: string[];
}
```

Inside `renderTrainingDeck()`, after `slides.push(renderHelpSlide(catalog));` and before the closing `return renderDeckShell(role, slides);`:

```typescript
  slides.push(renderHelpSlide(catalog));

  const walkthroughsSlide = renderWalkthroughsSlide(roleId, opts.presentNarrationWorkflows);
  if (walkthroughsSlide) slides.push(walkthroughsSlide);

  return renderDeckShell(role, slides);
```

Add `.walkthrough-list` to the existing shared list-spacing rule in `DECK_CSS`:

```css
  .checklist li, .phase-overview li, .escalation-list li, .walkthrough-list li { margin-bottom: 0.4rem; }
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/`
Expected: PASS, 82 tests (77 existing + 5 new) across 13 files.

- [x] **Step 5: Confirm the appendix slide itself is unaffected (no narration files exist yet); regenerate decks**

Run: `npm run catalog:render && git status --porcelain docs/operations/artifacts/`

Deviation from the original expectation: this shows all 9 deck files as modified — but the diff is a one-line CSS selector addition only (`.walkthrough-list` appended to the shared list-spacing rule in `DECK_CSS`, which every deck embeds verbatim regardless of role, since it's a shell constant, not per-role content). Confirm with:

```bash
git diff docs/operations/artifacts/training/role.facilities.deck.html
grep -l "Watch the walkthroughs" docs/operations/artifacts/training/*.deck.html; echo "exit: $?"
```

Expected: the diff is exactly the one CSS line; the `grep -l` finds no matches (exit 1) — no deck shows appendix *content* yet, since `presentNarrationWorkflows` isn't wired into the CLI shim until Task 4. Commit these regenerated decks alongside the code change so the CI up-to-date check stays green.

- [x] **Step 6: Commit**

```bash
git add src/lib/ops-catalog/views/training-deck.ts tests/unit/ops-catalog/views/training-deck.test.ts
git commit -m "$(cat <<'EOF'
feat(ops-catalog): add walkthrough appendix slide to training decks

Static WALKTHROUGHS workflow-to-role map + renderWalkthroughsSlide(),
gated on a new opts.presentNarrationWorkflows so the pure view never
touches the filesystem. No visible effect yet — the CLI shim wiring
that actually populates the option lands in the next commit.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Wire the CLI shim to probe `training/narration/`

**Files:**
- Modify: `scripts/ops-catalog/index.ts`

**Interfaces:**
- Consumes: `TrainingDeckOptions.presentNarrationWorkflows` from Task 3.
- Produces: nothing new consumed elsewhere — this is the last piece of the appendix feature's wiring.

- [ ] **Step 1: Add the narration-presence probe**

In `scripts/ops-catalog/index.ts`'s `render` command, immediately before the `for (const role of catalog.roles) {` loop that builds `optsByRole` (the loop already reading intros and screenshots), add:

```typescript
      // Phase 3: appendix slide data — which workflow narration scripts
      // exist. Mirrors the screenshot-embed probe below: this is the only
      // place that touches the filesystem for this feature: the pure view
      // (src/lib/ops-catalog/views/training-deck.ts) only sees the resulting
      // list. training/narration/ is committed content, so decks always
      // reflect whatever is currently on disk — same rule as screenshots.
      let presentNarrationWorkflows: string[] = [];
      const narrationDir = path.join(process.cwd(), "training/narration");
      try {
        const narrationFiles = await fs.readdir(narrationDir);
        presentNarrationWorkflows = narrationFiles
          .filter((f) => f.endsWith(".md"))
          .map((f) => f.slice(0, -".md".length))
          .sort();
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }

```

Then change the final assignment inside the loop from:

```typescript
        optsByRole[role.id] = { intro, screenshots };
```

to:

```typescript
        optsByRole[role.id] = { intro, screenshots, presentNarrationWorkflows };
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Confirm render is still a no-op (no narration files exist yet)**

Run: `npm run catalog:render && git status --porcelain docs/operations/artifacts/`
Expected: empty output — `training/narration/` still doesn't exist, `fs.readdir` still hits `ENOENT`, `presentNarrationWorkflows` is still `[]` for every role, and `renderWalkthroughsSlide` already treats `[]` identically to `undefined`.

- [ ] **Step 4: Commit**

```bash
git add scripts/ops-catalog/index.ts
git commit -m "$(cat <<'EOF'
feat(ops-catalog): probe training/narration for the appendix slide

CLI shim reads training/narration/*.md once per render and passes the
present workflow slugs into every role's deck options. No visible
render change yet — no narration files exist on disk until Task 6.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Generate real captions by running the walkthrough pipeline

**Files:** none (produces `training/output/**`, gitignored, not committed).

**Interfaces:**
- Consumes: `npm run training:videos` (Phase 2, already merged).
- Produces: `training/output/<workflow>/captions.json` for all six workflows, consumed by Task 6.

- [ ] **Step 1: Confirm the dev server port is free**

Run: `lsof -i :4321`
Expected: no output (free). If occupied, use `--port 4322` and set `TRAINING_BASE_URL=http://localhost:4322` in every command below.

- [ ] **Step 2: Start the dev server in the background**

Run (background):
```bash
R2_MOCK=1 CRON_SECRET=test E2E_TEST_ENDPOINTS=yes ./scripts/with-bws.sh npm run dev
```

- [ ] **Step 3: Wait for the server to be ready**

Poll until `/api/auth/me` responds (any status, including 401 — just confirms the server is up):
```bash
until curl -sf -o /dev/null -w '%{http_code}' http://localhost:4321/api/auth/me; do sleep 2; done
```

- [ ] **Step 4: Re-seed e2e fixtures**

Run: `./scripts/with-bws.sh npm run db:seed:e2e`
Expected: exits 0; seeds/resets the training fixtures the walkthroughs depend on (training applicant back to un-hired, training match back to unreported, etc. — see `training/README.md`'s Prerequisites section).

- [ ] **Step 5: Run all six walkthroughs**

Run: `npm run training:videos`
Expected: exits 0, six `training/output/<workflow>/` directories created, each containing `video.webm` + `captions.json` + per-step screenshots.

- [ ] **Step 6: Verify all six captions.json files exist**

Run:
```bash
for w in coach-core coach-practices admin-hire-compliance admin-sequencing referee-gameday venue-manager; do
  test -f "training/output/$w/captions.json" && echo "OK: $w" || echo "MISSING: $w"
done
```
Expected: `OK: <workflow>` for all six. If any is missing, investigate that workflow's Playwright output before continuing (do not skip to Task 6 with a gap).

- [ ] **Step 7: Stop the dev server**

Kill the background `npm run dev` process (e.g. `kill %1` or the PID printed when it was started).

No commit for this task — `training/output/` is gitignored build output.

---

### Task 6: Generate + commit narration scripts, re-render decks, verify byte-stability

**Files:**
- Generate + commit: `training/narration/coach-core.md`, `training/narration/coach-practices.md`, `training/narration/admin-hire-compliance.md`, `training/narration/admin-sequencing.md`, `training/narration/referee-gameday.md`, `training/narration/venue-manager.md`
- Regenerate + commit: `docs/operations/artifacts/training/role.*.deck.html` (whichever of the 9 actually change — expect `role.coach`, `role.director`, `role.ref`, `role.venue_manager`)
- Modify: `training/README.md`

**Interfaces:**
- Consumes: `training/output/<workflow>/captions.json` from Task 5, `npm run training:narration` from Task 2, `npm run catalog:render` (existing).
- Produces: final committed deliverables — nothing downstream depends on this task within this plan.

- [ ] **Step 1: Generate the narration scripts**

Run: `npm run training:narration`
Expected: `Wrote training/narration/<workflow>.md` for all six workflows, no "missing" line.

- [ ] **Step 2: Spot-check one script for quality**

Run: `cat training/narration/coach-core.md`
Expected: a `# Coach Core...` heading, a `Source video:` line, and numbered `N. [MM:SS] <spoken line>` entries reading as natural spoken language (not raw UI captions) — confirm the actual step count/order matches what Task 5's real run recorded (some conditional steps may or may not appear depending on runtime UI state, per Scouting Finding 1).

- [ ] **Step 3: Re-render the decks**

Run: `npm run catalog:render`
Expected: exits 0. Roles with a mapped, now-present workflow (`role.coach`, `role.director`, `role.ref`, `role.venue_manager`) should now include a "Watch the walkthroughs" slide; run:
```bash
grep -l "Watch the walkthroughs" docs/operations/artifacts/training/*.deck.html
```
Expected output: exactly `docs/operations/artifacts/training/role.coach.deck.html`, `role.director.deck.html`, `role.ref.deck.html`, `role.venue_manager.deck.html`.

- [ ] **Step 4: Verify double-render byte-stability**

Run:
```bash
npm run catalog:render
git status --porcelain docs/operations/artifacts/
npm run catalog:render
git status --porcelain docs/operations/artifacts/
```
Expected: the first render shows the real diff (new appendix slides); the second render (re-running against the now-unchanged inputs) shows an empty `git status --porcelain` — i.e., re-running `catalog:render` twice in a row after the first commit produces zero further diff.

- [ ] **Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 6: Run the full ops-catalog and training unit suites**

Run: `npx vitest run --config vitest.config.ts --project unit tests/unit/ops-catalog/ tests/unit/training/`
Expected: PASS, 82+ ops-catalog tests, all training tests green.

- [ ] **Step 7: Update `training/README.md`**

Add a new section after "## Feeding the training decks" and before "## Workflows":

```markdown
## Generating narration scripts

After a video regen, turn each workflow's `captions.json` into a
human-readable voiceover script:

```bash
npm run training:narration
```

Writes `training/narration/<workflow>.md` for every workflow that has a
`training/output/<workflow>/captions.json` — numbered, timestamped lines in
natural spoken language, not a raw echo of the on-screen captions. Skips
(and reports) any workflow with no recorded captions yet; always exits 0.

Unlike `training/output/`, **`training/narration/` IS committed content** —
commit the regenerated `.md` files alongside the video regen.

Re-run `npm run catalog:render` afterward: any worker role with a relevant,
now-present narration script (coach, director, referee, venue manager — see
the `WALKTHROUGHS` map in `src/lib/ops-catalog/views/training-deck.ts`) gets
a final "Watch the walkthroughs" slide linking each workflow's narration
script path.
```

- [ ] **Step 8: Commit**

```bash
git add training/narration/ docs/operations/artifacts/training/ training/README.md
git commit -m "$(cat <<'EOF'
feat(training): generate + commit narration scripts, re-render decks

Real captions.json from a full npm run training:videos pass, turned
into six narration scripts via npm run training:narration. Re-rendered
decks now show the "Watch the walkthroughs" appendix slide for coach,
director, referee, and venue manager. Double-render confirmed
byte-stable.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** narration script generator (Task 1–2), deck appendix slide (Task 3–4), real generated + committed scripts (Task 5–6), decks re-rendered and byte-stable (Task 6), TTS stretch explicitly untouched, `training/README.md` updated (Task 6). All Phase 3 acceptance criteria from the spec are covered.
- **No placeholders:** every step above contains complete, real code or exact shell commands — no "TODO"/"similar to Task N" shorthand.
- **Type consistency:** `CaptionEntry` (Task 1) matches `training/lib/tour.ts`'s real export; `TrainingDeckOptions.presentNarrationWorkflows` (Task 3) is produced and consumed with the same name/type in Task 4's CLI shim; `WORKFLOWS`/`generateAllNarrationScripts` (Task 1) are the exact names Task 2's CLI script imports.
