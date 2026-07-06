// Training deck view — renders a self-contained HTML slide deck per worker
// role from the ops catalog. Reuses role-manual.ts's phase/involvement
// matching but presents activities as slides instead of markdown sections,
// and adds deck-only sections (checklists, safety/escalation rollup, "your
// tools" portal pages, a help slide). See the Phase 1 plan's Design
// Decisions for why decks are NOT skipped for hand_authored roles, unlike
// generateAllRoleManuals.

import type { Catalog } from "../loader";
import type { Activity } from "../types/activity";
import { PHASE_ORDER, involvementOf, type Involvement } from "./role-manual";

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function activitySlug(activityId: string): string {
  return activityId.replace(/^act\./, "");
}

// Deck output always lives at docs/operations/artifacts/training/role.<id>.deck.html.
// Phase 2's walkthrough screenshots land at the repo-root training/screenshots/<role>/
// directory (gitignored build artifacts, not docs content) — four directory levels up
// from the deck's own directory. If the deck output path ever moves, update this too.
const SCREENSHOT_RELATIVE_PREFIX = "../../../../training/screenshots";

function screenshotSlotHtml(
  roleId: string,
  slug: string,
  screenshots: Map<string, string> | undefined,
): string {
  const embedded = screenshots?.get(slug);
  if (embedded) {
    return `<div class="screenshot-frame"><img class="screenshot" src="${embedded}" alt="Screenshot: ${escapeHtml(slug)}" /></div>`;
  }
  const roleSlug = roleId.replace(/^role\./, "");
  const relPath = `${SCREENSHOT_RELATIVE_PREFIX}/${roleSlug}/${slug}.png`;
  return `<div class="screenshot-frame"><img class="screenshot" src="${relPath}" alt="Screenshot: ${escapeHtml(slug)}" onerror="this.parentElement.classList.add('screenshot-missing')" /></div>`;
}

// ---------------------------------------------------------------------------
// Deck shell: design tokens (copied from src/styles/globals.css — decks are
// standalone files, so tokens are copied, not imported), nav script, print CSS.
// ---------------------------------------------------------------------------

const DECK_CSS = `
  :root {
    --cream: oklch(0.972 0.008 80);
    --cream-2: oklch(0.955 0.012 78);
    --cream-3: oklch(0.935 0.018 76);
    --ink: oklch(0.18 0.008 260);
    --ink-2: oklch(0.26 0.012 260);
    --ink-muted: oklch(0.42 0.01 260);
    --navy: oklch(0.24 0.06 260);
    --navy-deep: oklch(0.18 0.07 262);
    --primary: oklch(0.66 0.21 35);
    --ochre: oklch(0.75 0.12 75);
    --sage: oklch(0.52 0.08 155);
    --paper: oklch(0.99 0.003 80);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--cream);
    color: var(--ink);
    font-family: "IBM Plex Sans", -apple-system, "Segoe UI", sans-serif;
  }
  h1, h2 {
    font-family: "Newsreader", Georgia, "Times New Roman", serif;
    font-style: italic;
    color: var(--navy-deep);
  }
  code {
    font-family: "IBM Plex Mono", "SF Mono", Consolas, monospace;
    background: var(--cream-2);
    padding: 0.1em 0.4em;
    border-radius: 3px;
  }
  .slide {
    display: none;
    min-height: 100vh;
    padding: 8vh 10vw;
    flex-direction: column;
    justify-content: center;
  }
  .slide.active { display: flex; }
  .slide-kicker {
    color: var(--ink-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.8rem;
  }
  .subtitle {
    color: var(--primary);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.15em;
  }
  .nav-controls {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    display: flex;
    gap: 0.5rem;
  }
  .nav-controls button {
    background: var(--navy);
    color: var(--cream);
    border: none;
    border-radius: 4px;
    padding: 0.5rem 1rem;
    cursor: pointer;
    font-family: "IBM Plex Sans", sans-serif;
  }
  .progress {
    position: fixed;
    bottom: 1.5rem;
    left: 1.5rem;
    color: var(--ink-muted);
    font-size: 0.85rem;
  }
  .screenshot-frame { margin-top: 1.5rem; }
  .screenshot-frame img {
    max-width: 100%;
    border: 1px solid var(--cream-3);
    border-radius: 6px;
  }
  .screenshot-frame.screenshot-missing { display: none; }
  .checklist li, .phase-overview li, .escalation-list li { margin-bottom: 0.4rem; }
  .empty-note { color: var(--ink-muted); font-style: italic; }
  .tools-table { border-collapse: collapse; width: 100%; }
  .tools-table td {
    border-bottom: 1px solid var(--cream-3);
    padding: 0.5rem 0.75rem;
    text-align: left;
    vertical-align: top;
  }
  @media print {
    .nav-controls, .progress { display: none; }
    .slide {
      display: flex !important;
      page-break-after: always;
      min-height: 0;
      height: 100vh;
    }
  }
`;

const NAV_SCRIPT = `
  (function () {
    var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
    var index = 0;
    var progressEl = document.querySelector(".progress");
    function render() {
      slides.forEach(function (slide, i) {
        slide.classList.toggle("active", i === index);
      });
      if (progressEl) progressEl.textContent = (index + 1) + " / " + slides.length;
    }
    function go(delta) {
      index = Math.max(0, Math.min(slides.length - 1, index + delta));
      render();
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    });
    var prevBtn = document.querySelector("[data-nav='prev']");
    var nextBtn = document.querySelector("[data-nav='next']");
    if (prevBtn) prevBtn.addEventListener("click", function () { go(-1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { go(1); });
    render();
  })();
`;

function renderDeckShell(role: Catalog["roles"][number], slideBodies: string[]): string {
  const slidesHtml = slideBodies
    .map((body, i) => `<section class="slide" data-index="${i}">${body}</section>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(role.name)} — Training Deck</title>
<style>${DECK_CSS}</style>
</head>
<body>
${slidesHtml}
<div class="nav-controls">
  <button type="button" data-nav="prev">&larr; Prev</button>
  <button type="button" data-nav="next">Next &rarr;</button>
</div>
<div class="progress"></div>
<script>${NAV_SCRIPT}</script>
</body>
</html>
`;
}

function renderTitleSlide(role: Catalog["roles"][number]): string {
  return `
    <h1>${escapeHtml(role.name)}</h1>
    <p class="subtitle">Training deck</p>
    <p class="role-description">${escapeHtml(role.description.trim())}</p>
  `.trim();
}

interface MatchedActivity {
  activity: Activity;
  involvement: Involvement;
}

function matchActivities(catalog: Catalog, roleId: string): MatchedActivity[] {
  const matched: MatchedActivity[] = [];
  for (const activity of catalog.activities) {
    const involvement = involvementOf(activity, roleId);
    if (involvement) matched.push({ activity, involvement });
  }
  // Sort by id for determinism independent of catalog load/file order.
  matched.sort((a, b) => a.activity.id.localeCompare(b.activity.id));
  return matched;
}

function renderPhaseOverviewSlide(phase: Activity["phase"], entries: MatchedActivity[]): string {
  const items = entries
    .map(
      ({ activity, involvement }) =>
        `<li>${escapeHtml(activity.name)} — <em>${escapeHtml(involvement)}</em></li>`,
    )
    .join("");
  return `
    <h2>Your day: ${escapeHtml(phase.replace(/_/g, " "))}</h2>
    <ul class="phase-overview">${items}</ul>
  `.trim();
}

function sopBodyToBullets(sopBody: string): string[] {
  return sopBody
    .trim()
    .split("\n")
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter((line) => line.length > 0);
}

function renderActivitySlide(
  roleId: string,
  activity: Activity,
  involvement: Involvement,
  screenshots: Map<string, string> | undefined,
): string {
  const bullets = sopBodyToBullets(activity.sop_body);
  const stepsHtml = bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("");
  const slug = activitySlug(activity.id);

  return `
    <h2>${escapeHtml(activity.name)}</h2>
    <p class="slide-kicker">${escapeHtml(involvement)} &middot; <code>${escapeHtml(activity.id)}</code></p>
    <div class="activity-meta">
      <p><strong>Trigger:</strong> ${escapeHtml(activity.trigger)}</p>
      <p><strong>Tracking:</strong> ${escapeHtml(activity.tracking_method)}</p>
      <p><strong>Escalation:</strong> ${escapeHtml(activity.escalation_path.trim())}</p>
    </div>
    <ol class="steps">${stepsHtml}</ol>
    ${screenshotSlotHtml(roleId, slug, screenshots)}
  `.trim();
}

function collectChecklistTemplateIds(matched: MatchedActivity[]): string[] {
  const ids = new Set<string>();
  for (const { activity } of matched) {
    if (activity.tracking_method !== "checklist") continue;
    const ta = activity.tracking_artifact as Record<string, unknown>;
    const templateId = typeof ta.template_id === "string" ? ta.template_id : undefined;
    if (templateId) ids.add(templateId);
  }
  return [...ids].sort();
}

function renderChecklistSlide(catalog: Catalog, templateId: string): string | null {
  const template = catalog.artifacts.find((a) => a.id === templateId);
  if (!template || template.kind !== "checklist") return null;
  const items = template.items.map((item) => `<li>${escapeHtml(item.label)}</li>`).join("");
  return `
    <h2>Checklist: ${escapeHtml(templateId)}</h2>
    <ul class="checklist">${items}</ul>
  `.trim();
}

function renderSafetySlide(catalog: Catalog, matched: MatchedActivity[]): string {
  const escalations = new Set<string>();
  const mentionedRoleIds = new Set<string>();
  const roleMentionRe = /role\.[a-z][a-z0-9_]*/g;

  for (const { activity } of matched) {
    const text = activity.escalation_path.trim();
    escalations.add(text);
    for (const m of text.matchAll(roleMentionRe)) {
      mentionedRoleIds.add(m[0]);
    }
  }

  const roleNames = [...mentionedRoleIds]
    .map((id) => catalog.roles.find((r) => r.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .sort();

  const escalationItems = [...escalations]
    .sort()
    .map((e) => `<li>${escapeHtml(e)}</li>`)
    .join("");
  const contactsHtml =
    roleNames.length > 0
      ? `<p><strong>You may need to escalate to:</strong> ${roleNames.map((n) => escapeHtml(n)).join(", ")}</p>`
      : "";

  return `
    <h2>Safety &amp; escalation</h2>
    <ul class="escalation-list">${escalationItems}</ul>
    ${contactsHtml}
  `.trim();
}

interface PortalPage {
  path: string;
  description: string;
}

// Hand-curated against the real route tree in src/pages/ (see Design Decision
// 2 in the Phase 1 plan). Not derived from the catalog — nothing in the
// schema ties an activity to a UI route today.
const PORTAL_PAGES: Record<string, PortalPage[]> = {
  "role.coach": [
    { path: "/coach", description: "Dashboard — today at a glance, incl. your onboarding checklist while incomplete" },
    { path: "/coach/teams", description: "Your team assignments" },
    { path: "/coach/roster/[teamId]", description: "Team roster" },
    { path: "/coach/schedule", description: "Practices and games" },
    { path: "/coach/practices", description: "Practice planner — build and reuse session plans (sequences)" },
    { path: "/coach/attendance/[teamId]", description: "Attendance per session" },
    { path: "/coach/assessments", description: "Assessments due across your teams" },
    { path: "/coach/assess/[playerId]", description: "Record a player assessment" },
    { path: "/coach/messages", description: "Team messaging to families" },
    { path: "/coach/standings", description: "League standings" },
    { path: "/coach/resources", description: "Coaching guides by sport, domain, and skill" },
  ],
  "role.ref": [
    { path: "/referee", description: "Today's assigned matches — check in here" },
    { path: "/referee/matches/[gameId]", description: "Live score entry and final score attestation" },
    { path: "/referee/pay", description: "Your match pay history" },
  ],
  "role.venue_manager": [
    { path: "/admin/venue", description: "Venue command center — today's event-day overview" },
    { path: "/admin/venue/day/[date]", description: "Run-of-show for a specific event day" },
    { path: "/admin/venue/check-in", description: "Player/team check-in" },
    { path: "/admin/venue/walk-up", description: "Walk-on registration" },
    { path: "/admin/venue/rosters", description: "Team rosters for the day" },
    { path: "/admin/venue/reports", description: "End-of-day reports" },
  ],
  "role.front_of_house": [
    { path: "/admin/check-in", description: "Player/family check-in" },
    { path: "/admin/venue/walk-up", description: "Walk-on registration and payment" },
  ],
  "role.event_lead": [
    { path: "/admin/game-day/today", description: "Run-of-show for today's matches" },
    { path: "/admin/check-in", description: "Check-in support" },
  ],
  "role.photographer": [
    { path: "/media", description: "Media dashboard" },
    { path: "/media/queue", description: "Capture queue for today's assignments" },
    { path: "/media/jobs", description: "Your assigned media jobs" },
    { path: "/media/tag/[session_id]", description: "Tag captured media to players/teams" },
  ],
  "role.team_captain": [
    { path: "/team/[token]", description: "Your team's roster and conduct tools" },
  ],
  "role.director": [
    { path: "/admin", description: "Organization dashboard" },
    { path: "/admin/reports", description: "Cross-venue reporting" },
    { path: "/admin/curriculum", description: "Curriculum oversight" },
  ],
  "role.facilities": [],
};

function renderToolsSlide(roleId: string): string {
  const pages = PORTAL_PAGES[roleId] ?? [];
  if (pages.length === 0) {
    return `
      <h2>Your tools</h2>
      <p class="empty-note">No dedicated portal pages yet for this role — coordinate through your venue manager or director until one ships.</p>
    `.trim();
  }
  const rows = pages
    .map(
      (p) =>
        `<tr><td><code>${escapeHtml(p.path)}</code></td><td>${escapeHtml(p.description)}</td></tr>`,
    )
    .join("");
  return `
    <h2>Your tools</h2>
    <table class="tools-table"><tbody>${rows}</tbody></table>
  `.trim();
}

function renderHelpSlide(catalog: Catalog): string {
  const director = catalog.roles.find((r) => r.id === "role.director");
  const directorLine = director
    ? `${escapeHtml(director.name)} is the final escalation tier for anything unresolved.`
    : "Escalate through your standard chain for anything unresolved.";
  return `
    <h2>Where to get help</h2>
    <ol>
      <li>Check this deck's Safety &amp; escalation slide for your activity's specific chain.</li>
      <li>Escalate per that chain first — most issues have a named next step.</li>
      <li>${directorLine}</li>
    </ol>
  `.trim();
}

export interface TrainingDeckOptions {
  intro?: string;
  screenshots?: Map<string, string>;
}

export function renderTrainingDeck(
  catalog: Catalog,
  roleId: string,
  opts: TrainingDeckOptions = {},
): string {
  const role = catalog.roles.find((r) => r.id === roleId);
  if (!role) {
    throw new Error(`Unknown role "${roleId}"`);
  }

  const matched = matchActivities(catalog, roleId);
  const slides: string[] = [];
  slides.push(renderTitleSlide(role));

  for (const phase of PHASE_ORDER) {
    const entries = matched.filter((m) => m.activity.phase === phase);
    if (entries.length === 0) continue;
    slides.push(renderPhaseOverviewSlide(phase, entries));
    for (const { activity, involvement } of entries) {
      slides.push(renderActivitySlide(roleId, activity, involvement, opts.screenshots));
    }
  }

  for (const templateId of collectChecklistTemplateIds(matched)) {
    const slide = renderChecklistSlide(catalog, templateId);
    if (slide) slides.push(slide);
  }

  slides.push(renderSafetySlide(catalog, matched));
  slides.push(renderToolsSlide(roleId));
  slides.push(renderHelpSlide(catalog));

  return renderDeckShell(role, slides);
}

export function generateAllTrainingDecks(
  catalog: Catalog,
  optsByRole: Record<string, TrainingDeckOptions> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const role of catalog.roles) {
    if (role.kind !== "worker") continue;
    out[role.id] = renderTrainingDeck(catalog, role.id, optsByRole[role.id] ?? {});
  }
  return out;
}
