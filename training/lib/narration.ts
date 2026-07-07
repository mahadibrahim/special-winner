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
  "Review the session plan structure":
    "Scroll through the plan to see how each session breaks down into activity blocks.",
  "Open the post-session reflection form (not saved)":
    "After a session wraps, you'd fill out a quick reflection here. We're not saving this one — just showing you where it lives.",
  // admin-hire-compliance
  "Applications — hiring pipeline fallback view":
    "Let's look at the Applications page — this is the fallback view for the hiring pipeline.",
  "Mark the training applicant hired":
    "Here's Mark Hired in action — one click moves an applicant into hired status.",
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
  "Enter the final score": "Start with the final score for each side.",
  "Log an ejection as a red-card incident":
    "If there was an ejection, log it as an incident — red card is the closest match to an ejection in today's incident types, so note the player, minute, and what happened.",
  "Submit the match report": "Submit the report — that's the whole match record, ejections included, filed in one step.",
  // venue-manager
  "Venue command center — today's overview":
    "Welcome to the venue command center — your run-of-show for everything happening today.",
  "Open an activity's roster panel": "Tap any scheduled activity to open its roster panel.",
  "Player/team check-in station": "This is the check-in station, where players and teams check in as they arrive.",
  "Walk-up registration form":
    "If a family walks up without registering ahead of time, this is where you sign them up on the spot — waiver, payment, and roster in one form.",
  "Games — cross-season list": "Over on Games, you'll find every scheduled match across every season.",
  "Referee assignment and stipend log for a match":
    "Open a match's Refs panel to see who's assigned, their fee, and whether they've been paid — this is also where payroll hand-off gets logged.",
  "Media shoots list": "Media Shoots lists every photo and video assignment for the day.",
  "Photographer check-in status for a shoot":
    "Open a shoot to see its check-in status — that's the signature that starts the photographer's pay clock once they sign in on site.",
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
