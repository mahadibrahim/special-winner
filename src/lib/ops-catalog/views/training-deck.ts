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

  const slides: string[] = [];
  slides.push(renderTitleSlide(role));

  return renderDeckShell(role, slides);
}
