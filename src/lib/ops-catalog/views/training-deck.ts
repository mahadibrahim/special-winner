// Training deck view — renders a self-contained HTML slide deck per worker
// role from the ops catalog. Reuses role-manual.ts's phase/involvement
// matching but presents activities as slides instead of markdown sections,
// and adds deck-only sections (checklists, safety/escalation rollup, "your
// tools" portal pages, a help slide). See the Phase 1 plan's Design
// Decisions for why decks are NOT skipped for hand_authored roles, unlike
// generateAllRoleManuals.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Catalog } from "../loader";
import type { Activity } from "../types/activity";
import { PHASE_ORDER, involvementOf, type Involvement } from "./role-manual";

// ---------------------------------------------------------------------------
// Brand asset embedding. Decks are self-contained HTML files (no CDN, no
// relative asset links that could go stale) — so the brand fonts and the
// logo marks are embedded as base64 data URIs, read once at module load
// from committed repo assets. This is the one place this view touches the
// filesystem (every other view/helper in this file stays pure); it's a
// deliberate, narrow exception for physically-large static binary assets
// that are impractical to inline as literal source strings, not a return to
// ad hoc fs access — reads are synchronous, happen once per process, and
// are fully deterministic (same committed bytes in, same output every
// time), so byte-stable double-render still holds.
//
// Paths are resolved from this module's own location via import.meta.url
// rather than process.cwd(), so rendering doesn't depend on the caller's
// working directory (mirrors the repo-root resolution pattern already used
// in scripts/bws-load-secrets.mjs).
// ---------------------------------------------------------------------------

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "../../../..");

interface FontSpec {
  family: string;
  weight: 400 | 500 | 600;
  style: "normal" | "italic";
  file: string;
}

// Newsreader (400/500/600, incl. italic), IBM Plex Sans (400/500/600), IBM
// Plex Mono (400/500) — see training/assets/fonts/README.md for provenance
// and license (both families SIL OFL).
const FONT_SPECS: FontSpec[] = [
  { family: "Newsreader", weight: 400, style: "normal", file: "newsreader-normal-400.woff2" },
  { family: "Newsreader", weight: 500, style: "normal", file: "newsreader-normal-500.woff2" },
  { family: "Newsreader", weight: 600, style: "normal", file: "newsreader-normal-600.woff2" },
  { family: "Newsreader", weight: 400, style: "italic", file: "newsreader-italic-400.woff2" },
  { family: "Newsreader", weight: 500, style: "italic", file: "newsreader-italic-500.woff2" },
  { family: "Newsreader", weight: 600, style: "italic", file: "newsreader-italic-600.woff2" },
  { family: "IBM Plex Sans", weight: 400, style: "normal", file: "ibmplexsans-400.woff2" },
  { family: "IBM Plex Sans", weight: 500, style: "normal", file: "ibmplexsans-500.woff2" },
  { family: "IBM Plex Sans", weight: 600, style: "normal", file: "ibmplexsans-600.woff2" },
  { family: "IBM Plex Mono", weight: 400, style: "normal", file: "ibmplexmono-400.woff2" },
  { family: "IBM Plex Mono", weight: 500, style: "normal", file: "ibmplexmono-500.woff2" },
];

function buildFontFaceCss(): string {
  const fontsDir = path.join(REPO_ROOT, "training/assets/fonts");
  return FONT_SPECS.map((spec) => {
    const bytes = fs.readFileSync(path.join(fontsDir, spec.file));
    const base64 = bytes.toString("base64");
    return `  @font-face {
    font-family: "${spec.family}";
    font-style: ${spec.style};
    font-weight: ${spec.weight};
    font-display: swap;
    src: url(data:font/woff2;base64,${base64}) format("woff2");
  }`;
  }).join("\n");
}

const FONT_FACE_CSS = buildFontFaceCss();

function svgDataUri(fileName: string): string {
  const svg = fs.readFileSync(path.join(REPO_ROOT, "public/images", fileName), "utf8");
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

// public/images/logo.svg and logo-dark.svg are named for the WORDMARK'S OWN
// ink color, not the background it's meant for: logo.svg's letterforms are
// cream/white (built to sit on the navy sidebar/footer — see
// portal-layout.tsx and footer.tsx), while logo-dark.svg's letterforms are
// near-black ink (built to sit on the cream/light nav — see
// navigation.tsx). The poster slide is the deck's one navy surface, so it
// needs the LIGHT-lettered logo.svg to stay visible; every other (cream)
// slide's footer needs the DARK-lettered logo-dark.svg. Both variants are
// embedded once and swapped per slide via CSS (see `.touchline-logo--*`),
// so the poster's print mode (cream/ink, see print CSS below) can swap back
// without a second asset read.
const LOGO_LIGHT_DATA_URI = svgDataUri("logo.svg");
const LOGO_DARK_DATA_URI = svgDataUri("logo-dark.svg");

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

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Role-id token resolution. Catalog free text (escalation_path, trigger, ...)
// embeds role ids in two shapes: the dotted catalog id ("role.director") and
// a bare snake_case mention of the same role without the "role." prefix
// ("If venue_manager unreachable, ..."). Both need resolving to the role's
// display name wherever they appear in trainee-facing text — not just on the
// safety slide, which used to be the only place this happened.
// ---------------------------------------------------------------------------

function createRoleTokenResolver(catalog: Catalog): (text: string) => string {
  const byId = new Map(catalog.roles.map((r) => [r.id, r.name]));
  // Longest slug first so e.g. "front_of_house" doesn't get shadowed by a
  // shorter, unrelated slug matching a substring (defensive; not currently
  // possible given the catalog's role ids, but cheap to guard against).
  const bareSlugs = [...catalog.roles]
    .map((r) => ({ slug: r.id.replace(/^role\./, ""), name: r.name }))
    .sort((a, b) => b.slug.length - a.slug.length);

  return function resolveRoleTokens(text: string): string {
    let result = text.replace(/\brole\.[a-z][a-z0-9_]*\b/g, (token) => byId.get(token) ?? token);
    for (const { slug, name } of bareSlugs) {
      result = result.replace(new RegExp(`\\b${escapeRegExp(slug)}\\b`, "g"), name);
    }
    return result;
  };
}

// Roles mentioned (by either token shape) in a piece of free text, resolved
// to display names — used to build the safety slide's escalation contact
// list.
function mentionedRoleNames(catalog: Catalog, text: string): string[] {
  const names: string[] = [];
  for (const role of catalog.roles) {
    const slug = role.id.replace(/^role\./, "");
    const dottedRe = new RegExp(`\\b${escapeRegExp(role.id)}\\b`);
    const bareRe = new RegExp(`\\b${escapeRegExp(slug)}\\b`);
    if (dottedRe.test(text) || bareRe.test(text)) {
      names.push(role.name);
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// Trigger phrasing cleanup. Catalog triggers are written in a terse ops-log
// shorthand ("48h before event window", "T+24h after ..."); trainees read
// this as a sentence, so spell out shorthand rather than showing it raw.
// ---------------------------------------------------------------------------

function humanizeTrigger(text: string): string {
  return text
    .replace(/^~/, "About ")
    .replace(/\bT[+-](?=\d)/g, "")
    .replace(/(\d+)h\b/g, "$1 hours")
    .replace(/(\d+)min\b/g, "$1 minutes")
    .replace(/\bbefore event window\b/g, "before the event")
    .replace(/\bafter event window\b/g, "after the event");
}

// ---------------------------------------------------------------------------
// RACI involvement -> plain-English sentence.
// ---------------------------------------------------------------------------

function involvementToSentence(involvement: Involvement): string {
  return involvement === "Responsible" ? "You're part of this" : "You own this";
}

// Short, uppercase chip label for the meta-chip row (see renderActivitySlide)
// — distinct from involvementToSentence's narrative-sentence form used
// elsewhere (phase overview/divider lists, etc.).
function involvementToChipLabel(involvement: Involvement): string {
  return involvement === "Responsible" ? "You assist" : "You own this";
}

// ---------------------------------------------------------------------------
// Catalog stub procedure detection. Activities not yet authored by the
// operating team carry a fixed placeholder sop_body (see any act.*.yaml with
// "Procedure to be authored by the operating team" — as of this writing,
// most of the catalog). That placeholder must never reach a trainee slide
// verbatim; render a natural fallback instead.
// ---------------------------------------------------------------------------

const STUB_SOP_BODY =
  "Procedure to be authored by the operating team. This activity is defined\n" +
  "in the catalog; full step-by-step SOP content will be added in a\n" +
  "follow-up PR.";

const PROCEDURE_FALLBACK_TEXT =
  "Your lead will walk you through this step by step during your first shift.";

function isStubProcedure(sopBody: string): boolean {
  return sopBody.trim() === STUB_SOP_BODY;
}

function renderProcedureHtml(sopBody: string): string {
  if (isStubProcedure(sopBody)) {
    return `<p class="procedure-fallback">${escapeHtml(PROCEDURE_FALLBACK_TEXT)}</p>`;
  }
  const steps = parseProcedureSteps(sopBody);
  if (steps.length > 0) {
    const stepsHtml = steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
    return `<ol class="steps">${stepsHtml}</ol>`;
  }
  // No numbered steps detected — freeform procedure text (not currently used
  // by any real catalog activity, but the schema doesn't require numbering,
  // so this path must render something sane rather than an empty <ol>).
  // Preserve intentional paragraph breaks (blank lines between paragraphs)
  // rather than collapsing everything into one block or, worse, splitting on
  // every line break the way the old renderer did for numbered steps.
  const paragraphs = sopBody
    .trim()
    .split(/\n{2,}/)
    .map((p) => normalizeWhitespace(p))
    .filter((p) => p.length > 0);
  return paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
}

// ---------------------------------------------------------------------------
// Minimal markdown-to-HTML for hand-authored intro.md content. Supports only
// what intro authors need: "## " slide-boundary headings, blank-line
// paragraphs, "- " bullet lists, and **bold** inline spans. Anything fancier
// belongs in the hand-authored role manuals, not intro slides.
// ---------------------------------------------------------------------------

function inlineMarkdown(escaped: string): string {
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function mdBodyToHtml(body: string): string {
  const blocks = body
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  return blocks
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim());
      const isList = lines.length > 0 && lines.every((l) => l.startsWith("- "));
      if (isList) {
        const items = lines
          .map((l) => `<li>${inlineMarkdown(escapeHtml(l.slice(2)))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${inlineMarkdown(escapeHtml(lines.join(" ")))}</p>`;
    })
    .join("\n");
}

interface IntroSlide {
  title: string;
  bodyHtml: string;
}

function parseIntroSlides(introMarkdown: string): IntroSlide[] {
  const normalized = introMarkdown.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];

  const headingRe = /^##\s+(.+)$/gm;
  const matches = [...normalized.matchAll(headingRe)];

  if (matches.length === 0) {
    return [{ title: "Welcome", bodyHtml: mdBodyToHtml(normalized) }];
  }

  const slides: IntroSlide[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const title = match[1].trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? normalized.length) : normalized.length;
    const body = normalized.slice(start, end).trim();
    slides.push({ title, bodyHtml: mdBodyToHtml(body) });
  }
  return slides;
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
${FONT_FACE_CSS}
  :root {
    /* Tokens copied verbatim from src/styles/globals.css (:root, light
       mode) — decks are standalone files with no shared stylesheet, so
       these are copied, not imported. --primary matches the semantic
       --primary token (which resolves to --primary-orange, not the
       brighter --primary-orange-bright variant some earlier deck drafts
       used) since this is the single hot-spot accent, not a UI-state
       color. */
    --cream: oklch(0.972 0.008 80);
    --cream-2: oklch(0.955 0.012 78);
    --cream-3: oklch(0.935 0.018 76);
    --ink: oklch(0.18 0.008 260);
    --ink-2: oklch(0.26 0.012 260);
    --ink-muted: oklch(0.42 0.01 260);
    --navy: oklch(0.24 0.06 260);
    --navy-deep: oklch(0.18 0.07 262);
    --primary: oklch(0.58 0.19 35);
    --ochre: oklch(0.75 0.12 75);
    --sage: oklch(0.52 0.08 155);
    --paper: oklch(0.99 0.003 80);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--cream);
    color: var(--ink);
    font-family: "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  h1, h2 {
    font-family: "Newsreader", "Source Serif 4", Georgia, "Times New Roman", serif;
    font-style: italic;
    font-weight: 600;
    color: var(--navy-deep);
  }
  code {
    font-family: "IBM Plex Mono", ui-monospace, "SF Mono", Consolas, monospace;
    background: var(--cream-2);
    padding: 0.1em 0.4em;
    border-radius: 3px;
  }
  a { color: var(--primary); }
  button:focus-visible, a:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
  /* Slides are stacked full-viewport and cross-faded via opacity rather
     than display:none/flex, so the active slide change can transition —
     display can't be animated, opacity can. */
  .slide {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 8vh 10vw;
    background: var(--cream);
    color: var(--ink);
    opacity: 0;
    pointer-events: none;
    transition: opacity 150ms ease;
    /* Defensive: a long numbered procedure plus its escalation footnote can
       exceed the available height on some slides — scroll rather than
       silently overflow into (or under) the touchline footer. */
    overflow-y: auto;
  }
  .slide.active {
    opacity: 1;
    pointer-events: auto;
    z-index: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .slide { transition: none; }
  }
  /* Hairline warm-gray rule under every heading, except the poster (its
     own reversed treatment has no rule). */
  .slide:not([data-kind="poster"]) h1,
  .slide:not([data-kind="poster"]) h2 {
    padding-bottom: 0.75rem;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid var(--cream-3);
  }
  /* Informative label, not a decorative kicker — italic + muted rather
     than the small-caps treatment reserved for the poster's role label
     (the deck's only small-caps label; see the poster styles below). */
  .slide-kicker {
    color: var(--ink-muted);
    font-style: italic;
    font-size: 0.95rem;
  }
  /* Meta-chip row (activity slides) — a compact one-line strip of data
     labels directly under the title: WHEN, YOU OWN THIS/YOU ASSIST, and
     (when the activity has one) CHECKLIST. Replaces the old floating
     top-right time-rail chip, the old italic ownership caption line, and
     the old "checklist exists" filler sentence. Text keeps its natural
     sentence case in the DOM; uppercase is a pure display transform so the
     underlying value stays intact/greppable. */
  .meta-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0 0 1.75rem;
  }
  .meta-chip {
    display: inline-flex;
    align-items: center;
    padding: 0.3rem 0.65rem;
    background: var(--cream-2);
    border: 1px solid var(--cream-3);
    border-radius: 3px;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .meta-chip--owner {
    color: var(--navy-deep);
    border-color: var(--ochre);
  }
  .nav-controls {
    position: fixed;
    /* Cleared above the touchline footer's row (bottom: 5vh + its own line
       height) so the "NN / total" counter never sits underneath these
       buttons. */
    bottom: calc(5vh + 3rem);
    right: 1.5rem;
    z-index: 2;
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
  .screenshot-frame { margin-top: 1.5rem; }
  .screenshot-frame img {
    max-width: 100%;
    border: 1px solid var(--cream-3);
    border-radius: 6px;
  }
  .screenshot-frame.screenshot-missing { display: none; }
  .checklist li, .phase-overview li, .escalation-list li, .walkthrough-list li { margin-bottom: 0.4rem; }
  .phase-overview li::marker { color: var(--ochre); }
  .empty-note { color: var(--ink-muted); font-style: italic; }
  /* Numbered procedure steps — comfortable spacing between steps and a
     styled (accent-colored, monospace) number, instead of the browser's
     tight default <ol> rendering. */
  ol.steps {
    margin: 0 0 1.75rem;
    padding-left: 1.5rem;
  }
  ol.steps li {
    margin-bottom: 1rem;
    padding-left: 0.4rem;
    line-height: 1.55;
  }
  /* Ochre, not the primary accent — .phase-overview li::marker already uses
     ochre for list markers elsewhere in the deck, and the single hot-spot
     accent (--primary) stays reserved for the poster quote mark, focus
     states, links, and the touchline tick (see the brand design pass test
     in training-deck.test.ts). */
  ol.steps li::marker {
    color: var(--ochre);
    font-weight: 600;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
  }
  /* Escalation footnote — a visually distinct block (dashed rule + smaller
     muted text) that trails the procedure/screenshot, not a mid-slide meta
     line next to the title. Deliberately NOT pinned to the viewport bottom
     via margin-top: auto — a long multi-step procedure plus a long
     escalation sentence can exceed the slide's available height, and an
     auto-margin push would then force it to visually collide with the
     touchline footer instead of just flowing naturally after the content
     (verified against the real act.weather_pre_check 6-step slide, which is
     long enough to hit exactly this). */
  .escalation-footnote {
    margin-top: 1.75rem;
    padding-top: 1rem;
    max-width: 68ch;
    border-top: 1px dashed var(--cream-3);
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--ink-muted);
  }
  .escalation-footnote strong { color: var(--ink-2); }
  /* Chapter divider slides (agenda's per-phase dividers + the checklist
     appendix divider) — a big Newsreader chapter name distinct from a
     normal content slide's h2, so it reads as a section break when
     flipping through the deck. */
  .divider-title {
    margin: 0 0 2rem;
    font-family: "Newsreader", "Source Serif 4", Georgia, serif;
    font-style: italic;
    font-weight: 600;
    font-size: 3rem;
    line-height: 1.15;
    color: var(--navy-deep);
  }
  /* Agenda slide ("Your day at a glance") — one row per phase with its
     activity count, right-aligned in mono like the other data labels. */
  .agenda-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-width: 46ch;
  }
  .agenda-list li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.7rem 0;
    border-bottom: 1px solid var(--cream-3);
  }
  .agenda-phase {
    font-family: "Newsreader", "Source Serif 4", Georgia, serif;
    font-style: italic;
    font-weight: 600;
    font-size: 1.3rem;
    color: var(--navy-deep);
  }
  .agenda-count {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 0.8rem;
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .belief { margin-top: 1.25rem; }
  .belief h3 {
    margin: 0 0 0.25rem;
    color: var(--navy-deep);
    font-family: "IBM Plex Sans", sans-serif;
    font-size: 1.05rem;
    font-weight: 600;
  }
  /* "Your job" role-summary slide. */
  .role-summary-flow { margin-top: 1rem; }
  .role-summary-clusters { margin-top: 1.5rem; }
  .role-summary-clusters h3 {
    margin: 0 0 0.5rem;
    color: var(--navy-deep);
    font-family: "IBM Plex Sans", sans-serif;
    font-size: 1.05rem;
    font-weight: 600;
  }
  .role-summary-clusters ul { margin: 0; padding-left: 1.25rem; }
  .role-summary-clusters li { margin-bottom: 0.4rem; }
  .tools-table { border-collapse: collapse; width: 100%; }
  .tools-table td {
    border-bottom: 1px solid var(--cream-3);
    padding: 0.5rem 0.75rem;
    text-align: left;
    vertical-align: top;
  }
  /* Readable measure — body copy tops out around 68 characters, headings
     and the tools table (needs its full width) are exempt. */
  .slide p,
  .slide li {
    max-width: 68ch;
  }
  /* Checklist slides — clipboard-card treatment, sage tick squares that
     stay empty (not checked) since this is a training reference, not a
     live tracker. */
  .clipboard-card {
    background: var(--paper);
    border: 1px solid var(--cream-3);
    border-radius: 10px;
    padding: 2.5rem 3rem;
    box-shadow: 0 8px 24px oklch(0.2 0.02 260 / 0.08);
  }
  .checklist--ticks { list-style: none; margin: 0; padding: 0; }
  .checklist--ticks li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    max-width: none;
  }
  .checklist--ticks li::before {
    content: "";
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    border: 2px solid var(--sage);
    border-radius: 3px;
    background: transparent;
  }
  /* Locker-room poster — the purpose slide, the deck's one non-cream
     slide. */
  [data-kind="poster"] {
    background: linear-gradient(160deg, var(--navy) 0%, var(--navy-deep) 100%);
    color: var(--cream);
  }
  .poster-role-label {
    margin: 0 0 3rem;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 0.8rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.25em;
    color: oklch(0.85 0.02 80 / 0.65);
  }
  .poster-statement-wrap {
    position: relative;
    max-width: 34ch;
  }
  .poster-quote {
    position: absolute;
    top: -3.5rem;
    left: -2rem;
    z-index: 0;
    font-family: "Newsreader", "Source Serif 4", Georgia, serif;
    font-style: italic;
    font-size: 15rem;
    line-height: 1;
    color: var(--primary);
    opacity: 0.4;
    pointer-events: none;
  }
  .poster-statement {
    position: relative;
    z-index: 1;
    margin: 0;
    max-width: none;
    font-family: "Newsreader", "Source Serif 4", Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: 2.5rem;
    line-height: 1.35;
    color: var(--cream);
  }
  /* Touchline footer — sits on every slide, baked in per-slide at render
     time (not via JS) so the counter and tick position are deterministic
     static HTML/CSS. */
  .touchline {
    position: absolute;
    left: 10vw;
    right: 10vw;
    bottom: 5vh;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding-top: 0.85rem;
  }
  .touchline::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 1px;
    background: var(--cream-3);
  }
  .touchline-tick {
    position: absolute;
    top: -3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--primary);
    transform: translateX(-50%);
  }
  /* Logo wordmarks are embedded once here as background-images (not per-slide
     <img src="data:..."> tags) — with 15-40 slides per deck, repeating a
     ~9KB data URI per slide would multiply into hundreds of KB of pure
     duplication. One CSS rule, reused via class, keeps each variant's bytes
     in the document exactly once. */
  .touchline-logo {
    /* Modestly larger than the original 16x36 footer mark (see the hero-scale
       treatment on the title slide's .hero-logo below for the "big" logo). */
    height: 20px;
    width: 45px;
    display: block;
    background-repeat: no-repeat;
    background-position: left center;
    background-size: contain;
  }
  /* Hero-scale wordmark — title slide only. The poster (purpose) slide
     keeps its existing treatment (no logo); this is a much bigger lockup
     reusing the same dark-lettered mark since the title slide sits on the
     cream background. */
  .hero-logo {
    width: 260px;
    height: 72px;
    margin: 0 0 3rem;
    background-repeat: no-repeat;
    background-position: left center;
    background-size: contain;
    background-image: url(${LOGO_DARK_DATA_URI});
  }
  .touchline-logo--dark { background-image: url(${LOGO_DARK_DATA_URI}); }
  .touchline-logo--light { background-image: url(${LOGO_LIGHT_DATA_URI}); display: none; }
  [data-kind="poster"] .touchline-logo--dark { display: none; }
  [data-kind="poster"] .touchline-logo--light { display: block; }
  .touchline-counter {
    margin-left: auto;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    color: var(--ink-muted);
  }
  [data-kind="poster"] .touchline-counter { color: oklch(0.85 0.02 80 / 0.65); }
  @media print {
    .nav-controls { display: none; }
    .slide {
      position: static;
      opacity: 1 !important;
      pointer-events: auto;
      display: flex !important;
      page-break-after: always;
      min-height: 0;
      height: 100vh;
    }
    /* The poster is the only non-cream slide on screen, but printed pages
       shouldn't burn toner on a full-bleed navy background — reverse back
       to the standard cream/ink palette for print only. */
    [data-kind="poster"] {
      background: var(--cream) !important;
      color: var(--ink) !important;
    }
    [data-kind="poster"] .poster-role-label { color: var(--ink-muted); }
    [data-kind="poster"] .poster-statement { color: var(--navy-deep); }
    [data-kind="poster"] .poster-quote { opacity: 0.25; }
    [data-kind="poster"] .touchline-counter { color: var(--ink-muted) !important; }
    [data-kind="poster"] .touchline-logo--dark { display: block !important; }
    [data-kind="poster"] .touchline-logo--light { display: none !important; }
  }
`;

const NAV_SCRIPT = `
  (function () {
    var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
    var index = 0;
    function render() {
      slides.forEach(function (slide, i) {
        slide.classList.toggle("active", i === index);
      });
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

interface SlideEntry {
  html: string;
  kind?: "poster" | "divider";
}

// Touchline footer: a full-width hairline with a small position tick baked
// in per slide (index/total known at render time), plus the brand wordmark
// (dark-lettered variant by default; the poster swaps to the light-lettered
// variant via CSS, see [data-kind="poster"] rules) and a "NN / total" mono
// counter. Deterministic — no client JS involved in producing it.
function renderTouchlineFooter(index: number, total: number): string {
  const current = index + 1;
  const counter = `${String(current).padStart(2, "0")} / ${total}`;
  const percent = total > 0 ? (current / total) * 100 : 0;
  return `<footer class="touchline">
      <span class="touchline-logo touchline-logo--dark" role="img" aria-label="Aspire Sports"></span>
      <span class="touchline-logo touchline-logo--light" role="img" aria-label="Aspire Sports"></span>
      <span class="touchline-counter">${counter}</span>
      <span class="touchline-tick" style="left: ${percent.toFixed(3)}%"></span>
    </footer>`;
}

function renderDeckShell(role: Catalog["roles"][number], slides: SlideEntry[]): string {
  const total = slides.length;
  const slidesHtml = slides
    .map((slide, i) => {
      const kindAttr = slide.kind ? ` data-kind="${slide.kind}"` : "";
      return `<section class="slide" data-index="${i}"${kindAttr}>${slide.html}${renderTouchlineFooter(i, total)}</section>`;
    })
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
<script>${NAV_SCRIPT}</script>
</body>
</html>
`;
}

function renderTitleSlide(
  role: Catalog["roles"][number],
  resolveRoleTokens: (text: string) => string,
): string {
  return `
    <div class="hero-logo" role="img" aria-label="Aspire Sports"></div>
    <h1>${escapeHtml(role.name)}</h1>
    <p class="role-description">${escapeHtml(resolveRoleTokens(role.description.trim()))}</p>
  `.trim();
}

// ---------------------------------------------------------------------------
// Role purpose slide — rendered as a locker-room poster, the deck's one
// full-bleed navy slide (see [data-kind="poster"] in DECK_CSS and the "kind"
// passed at the push site in renderTrainingDeck). Training must cover the
// WHY, not just the mechanics — this slide answers "why does this role
// exist" in one user-reviewed sentence, immediately after the title slide,
// before any activity content. Statements are verbatim as reviewed; do not
// rephrase without re-review. Roles not yet covered here (defensive — every
// current worker role has an entry) skip the slide gracefully rather than
// showing a placeholder.
// ---------------------------------------------------------------------------

const ROLE_PURPOSE: Record<string, string> = {
  "role.coach":
    "You develop people. Every practice is a chance to help a child get better at the game and more confident in themselves — development over winning, always.",
  "role.ref":
    "You guarantee fair play. You control the game so it stays safe, honest, and worth playing — kids can't fall in love with a sport they can't trust.",
  "role.venue_manager":
    "You make the whole day work. From unlock to lock-up, every family's experience runs through the venue you run — smooth, safe, end to end.",
  "role.event_lead":
    "You own the event experience. Check-ins, briefings, and the moments in between — you make game day feel organized to every coach, ref, and family who walks in.",
  "role.facilities":
    "You set the stage. Safe fields, staged equipment, clean grounds — the play can only be as good as the place you prepare.",
  "role.front_of_house":
    "You are the first hello and the last impression. Registration, concessions, lost-and-found — families judge the whole organization by how you treat them.",
  "role.director":
    "You hold the standard. The judgment calls — refunds, reschedules, safety reviews — set the tone for what this organization actually values.",
  "role.photographer":
    "You capture the proof. The memories families keep — and you guard the trust behind every photo of someone's child.",
  "role.team_captain":
    "You lead from inside the game. Your teammates take their cues from how you compete, communicate, and treat the other side.",
};

function renderRolePurposeSlide(role: Catalog["roles"][number]): string | null {
  const purpose = ROLE_PURPOSE[role.id];
  if (!purpose) return null;
  return `
    <p class="poster-role-label">${escapeHtml(role.name)}</p>
    <div class="poster-statement-wrap">
      <span class="poster-quote" aria-hidden="true">&#8220;</span>
      <p class="poster-statement">${escapeHtml(purpose)}</p>
    </div>
  `.trim();
}

// ---------------------------------------------------------------------------
// Role summary ("Your job") slide — immediately after the purpose poster,
// before the philosophy section. The poster answers WHY the role exists in
// one line; this slide answers WHAT the job is and HOW the day goes,
// concretely, so a new hire gets a real orientation instead of jumping
// straight from "why" to a phase-by-phase activity list.
//
// The orienting paragraph below is hand-drafted per role from the REAL
// catalog data — each role's `description` field plus its actual
// accountable/responsible activities grouped by phase (dumped and reviewed
// against docs/operations/catalog/activities/*.yaml while authoring this).
// It intentionally does not claim any duty the catalog doesn't assign to the
// role — draft copy, editable later, not a marketing statement like
// ROLE_PURPOSE above. role.team_captain has no matched activities in the
// catalog today (hand-authored manual, no act.* rows reference it), so its
// paragraph says so rather than inventing day-of duties.
// ---------------------------------------------------------------------------

const ROLE_SUMMARY_PARAGRAPH: Record<string, string> = {
  "role.coach":
    "You run one team's sessions from open to close. You start and end each class or camp session, rotate group activities during camp play, and support the pregame briefing before youth league matches. Attendance, conduct, and compliance for your team run through you.",
  "role.ref":
    "You officiate the matches you're assigned. Once you check in, you keep live score, track time, and make the final score attestation — and you log any ejections after the match. Your call is the call.",
  "role.venue_manager":
    "You run the venue from unlock to lock-up. Across the day you confirm staffing and check the weather ahead of time, open the facility and brief your team, run the pregame weather and rainout call, handle incidents as they happen, and close everything down — walkthrough, lock, alarm, staff clock-out, and debrief. You're the person everything on site routes through.",
  "role.event_lead":
    "You own the run-of-show for a match or event slot within the venue. You confirm referees ahead of time, check in coaches, referees, photographers, and teams before kickoff, brief coaches pregame, and enforce the code of conduct and respond to incidents once play starts. After the match, you log referee stipends and run the staff debrief.",
  "role.facilities":
    "You keep the field, court, and equipment ready all day. You check equipment ahead of time, stage gear, set up parking and signage, prep the field or court and check lines before each match, then turn the field over and reset it between matches, log any field damage, and store equipment and handle trash at the end of the day.",
  "role.front_of_house":
    "You run check-in, concessions, and the front-of-house experience for the day. You set up and count concessions inventory in the morning, handle walk-on registrations before games, manage spectators during play, and reconcile cash and lost-and-found at the end of the day.",
  "role.director":
    "You hold organization-wide accountability rather than day-of duties. When something needs a final call — a rainout refund or reschedule decision, or a weekly safety review — it lands with you. You own the catalog and standards every other role works from, and you're the last stop when an issue can't be resolved on site.",
  "role.photographer":
    "You capture and deliver media for your assigned matches. You check in before the game, hand off your raw footage once it ends, and it feeds into the day's photo publish.",
  "role.team_captain":
    "Your team doesn't have a coach, so you're the one who keeps the roster and conduct organized for the group.",
};

function lowerFirst(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

// Oxford-comma join: "a", "a and b", "a, b, and c".
function joinNaturally(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function renderRoleSummarySlide(
  role: Catalog["roles"][number],
  phaseGroups: Array<{ phase: Activity["phase"]; entries: MatchedActivity[] }>,
): string | null {
  const paragraph = ROLE_SUMMARY_PARAGRAPH[role.id];
  if (!paragraph) return null;

  if (phaseGroups.length === 0) {
    return `
      <h2>Your job</h2>
      <p>${escapeHtml(paragraph)}</p>
      <p class="empty-note">Day-of specifics for this role aren't in the catalog yet — check with your venue manager or director.</p>
    `.trim();
  }

  const flowLine = joinNaturally(phaseGroups.map(({ phase }) => lowerFirst(humanizePhase(phase))));

  // "What you're responsible for" is about ownership, not assistance — only
  // Accountable (incl. Accountable | Responsible) entries count as a
  // cluster the trainee "owns"; Responsible-only (assist) activities belong
  // on the agenda/activity slides, not this summary. One cluster per phase,
  // in phase order — no arbitrary truncation. In practice this lands at
  // 3-5 clusters for nearly every role (PHASE_ORDER caps out at 7 phases
  // total, and most roles own activities in only a handful of them); the
  // one real-catalog exception is role.venue_manager, who owns something in
  // every single phase — truncating there would silently drop End of
  // day/Post day (lock-up, debrief, follow-up) right after a summary
  // paragraph that explicitly promises "unlock to lock-up", which would
  // make the slide contradict itself. Showing the true count is more
  // honest than hitting an arbitrary cap.
  const ownedClusters = phaseGroups
    .map(({ phase, entries }) => ({
      phase,
      names: entries
        .filter(({ involvement }) => involvement !== "Responsible")
        .map(({ activity }) => lowerFirst(activity.name)),
    }))
    .filter((g) => g.names.length > 0);

  const clustersHtml =
    ownedClusters.length > 0
      ? `<div class="role-summary-clusters">
      <h3>What you're responsible for</h3>
      <ul>${ownedClusters
        .map(
          ({ phase, names }) =>
            `<li><strong>${escapeHtml(humanizePhase(phase))}:</strong> ${escapeHtml(joinNaturally(names))}</li>`,
        )
        .join("")}</ul>
    </div>`
      : "";

  return `
    <h2>Your job</h2>
    <p>${escapeHtml(paragraph)}</p>
    <p class="role-summary-flow"><strong>How the day flows for you:</strong> ${escapeHtml(flowLine)}.</p>
    ${clustersHtml}
  `.trim();
}

// ---------------------------------------------------------------------------
// Company philosophy section. Shared, identical across every deck regardless
// of role — trainees should come away from this section with the same
// picture of what the organization believes, no matter which role they're
// training for. Distilled by hand from src/data/coaching-philosophy.ts
// (coachingPhilosophy.coreBeliefs, .doubleGoalCoach, .elmFramework) — that
// file is the source of record for the underlying research; this is
// slide-sized copy in plain language (no unexplained framework acronyms),
// hardcoded here rather than imported so this view stays dependency-free and
// deterministic. If the source philosophy changes, update this by hand.
// ---------------------------------------------------------------------------

const COMPANY_PHILOSOPHY_SLIDES: string[] = [
  `
    <h2>What we believe</h2>
    <p>These four beliefs shape every practice plan, every sideline conversation, and every call we make about a kid.</p>
    <div class="belief">
      <h3>Development Over Winning</h3>
      <p>We measure success by effort, improvement, and enjoyment — not the scoreboard. Winning takes care of itself when kids develop the right way.</p>
    </div>
    <div class="belief">
      <h3>Every Child Can Improve</h3>
      <p>There's no such thing as a "non-athletic" kid. With the right environment and encouragement, every child can grow their abilities — talent is built, not discovered.</p>
    </div>
  `.trim(),
  `
    <h2>What we believe (continued)</h2>
    <div class="belief">
      <h3>Long-Term Athlete Development</h3>
      <p>We're building athletes for age 25, not just age 8. We never trade away a child's long-term growth for a short-term result.</p>
    </div>
    <div class="belief">
      <h3>Holistic Growth</h3>
      <p>Sport develops the whole child — skills, game understanding, fitness, and confidence together. We pay attention to all of it, not just the physical side.</p>
    </div>
  `.trim(),
  `
    <h2>How that shows up day to day</h2>
    <p>We coach to two goals at once: compete to win, and grow every player's character and competence. When those two pull in different directions, character comes first.</p>
    <p>Day to day, that means we praise effort, learning, and bouncing back from mistakes — the things a kid actually controls — over results they can't always control.</p>
    <p><strong>Whatever your role, this is what families should feel from us.</strong></p>
  `.trim(),
];

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

function humanizePhase(phase: Activity["phase"]): string {
  const words = phase.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ---------------------------------------------------------------------------
// Chapter dividers. The deck is organized into chapters — an agenda slide
// ("Your day at a glance"), then one divider + activity-slide group per
// phase, then an appendix divider + checklist slides. Dividers share one
// rendering shape (kicker + big Newsreader chapter name + a list of what's
// inside), rendered with data-kind="divider" so DECK_CSS can give them a
// distinct, bigger treatment than a normal content slide.
// ---------------------------------------------------------------------------

function renderDividerSlide(kicker: string, title: string, items: string[]): SlideEntry {
  const itemsHtml = items.map((item) => `<li>${item}</li>`).join("");
  return {
    html: `
    <p class="slide-kicker">${escapeHtml(kicker)}</p>
    <p class="divider-title">${escapeHtml(title)}</p>
    <ul class="phase-overview">${itemsHtml}</ul>
  `.trim(),
    kind: "divider",
  };
}

function renderPhaseDividerSlide(
  phase: Activity["phase"],
  entries: MatchedActivity[],
  phaseNumber: number,
  totalPhases: number,
): SlideEntry {
  const items = entries.map(
    ({ activity, involvement }) =>
      `${escapeHtml(activity.name)} — <em>${escapeHtml(involvementToSentence(involvement))}</em>`,
  );
  return renderDividerSlide(`Phase ${phaseNumber} of ${totalPhases}`, humanizePhase(phase), items);
}

function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function renderAgendaSlide(phaseGroups: Array<{ phase: Activity["phase"]; entries: MatchedActivity[] }>): string {
  const items = phaseGroups
    .map(
      ({ phase, entries }) =>
        `<li><span class="agenda-phase">${escapeHtml(humanizePhase(phase))}</span><span class="agenda-count">${escapeHtml(pluralize(entries.length, "activity", "activities"))}</span></li>`,
    )
    .join("");
  return `
    <h2>Your day at a glance</h2>
    <ul class="agenda-list">${items}</ul>
  `.trim();
}

// ---------------------------------------------------------------------------
// Procedure step parsing. sop_body is authored as a numbered list in a YAML
// block scalar, but long steps wrap across multiple source lines for
// readability (see docs/operations/catalog/activities/act.weather_pre_check.yaml
// for the canonical example: 6 numbered steps whose sentences wrap across 16
// physical lines). A continuation line belongs to the PREVIOUS step, not a
// new one — so splitting naively on "\n" (the old behavior) turned every
// physical line into its own renumbered <li>, mangling a 6-step procedure
// into 16 fragments. Parse by finding step-start boundaries ("^<n>. ") and
// folding every line up to the next boundary into that step.
// ---------------------------------------------------------------------------

const STEP_START_RE = /^\d+\.\s+/;

function parseProcedureSteps(sopBody: string): string[] {
  const lines = sopBody
    .replace(/\r\n/g, "\n")
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const steps: string[] = [];
  let current: string[] | null = null;
  let sawStepMarker = false;

  for (const line of lines) {
    if (STEP_START_RE.test(line)) {
      sawStepMarker = true;
      if (current !== null) steps.push(current.join(" "));
      current = [line.replace(STEP_START_RE, "")];
    } else if (current !== null) {
      // Continuation of the step currently being accumulated.
      current.push(line);
    }
    // else: text appears before any numbered step marker — not part of a
    // numbered procedure; handled by the freeform fallback in
    // renderProcedureHtml, which re-reads the raw sopBody rather than this
    // partial state.
  }
  if (current !== null) steps.push(current.join(" "));

  return sawStepMarker ? steps : [];
}

function checklistTemplateIdFor(activity: Activity): string | undefined {
  if (activity.tracking_method !== "checklist") return undefined;
  const ta = activity.tracking_artifact as Record<string, unknown>;
  return typeof ta.template_id === "string" ? ta.template_id : undefined;
}

// Round-2 slide anatomy: a compact meta-chip row directly under the title
// (WHEN / YOU OWN THIS-or-YOU ASSIST / CHECKLIST), replacing both the
// floating top-right time-rail chip and the italic "You own this"
// slide-kicker line, plus the "There's a checklist for this — see the
// checklist slides" filler sentence (the checklist chip already says so).
// Escalation moves out of the meta area entirely into a visually distinct
// footnote block at the bottom of the slide (see .escalation-footnote),
// not mid-slide next to the steps.
function renderActivitySlide(
  roleId: string,
  activity: Activity,
  involvement: Involvement,
  screenshots: Map<string, string> | undefined,
  resolveRoleTokens: (text: string) => string,
): string {
  const slug = activitySlug(activity.id);
  const when = humanizeTrigger(resolveRoleTokens(normalizeWhitespace(activity.trigger)));
  const escalation = resolveRoleTokens(normalizeWhitespace(activity.escalation_path));

  const chips: string[] = [
    `<span class="meta-chip meta-chip--when">When: ${escapeHtml(when)}</span>`,
    `<span class="meta-chip meta-chip--owner">${escapeHtml(involvementToChipLabel(involvement))}</span>`,
  ];
  const checklistTemplateId = checklistTemplateIdFor(activity);
  if (checklistTemplateId) {
    chips.push(
      `<span class="meta-chip meta-chip--checklist">Checklist: ${escapeHtml(deriveArtifactTitle(checklistTemplateId))}</span>`,
    );
  }

  return `
    <h2>${escapeHtml(activity.name)}</h2>
    <div class="meta-chip-row">${chips.join("")}</div>
    ${renderProcedureHtml(activity.sop_body)}
    ${screenshotSlotHtml(roleId, slug, screenshots)}
    <div class="escalation-footnote"><strong>If something goes wrong:</strong> ${escapeHtml(escalation)}</div>
  `.trim();
}

// ---------------------------------------------------------------------------
// Checklist title resolution. ArtifactTemplate (see
// src/lib/ops-catalog/types/artifact-template.ts) has no name/title field on
// ChecklistTemplateSchema or FormTemplateSchema today — only
// SignatureTemplateSchema/SystemEventTemplateSchema/CounterTemplateSchema
// carry free-text ("prompt"/"description"), and none carry a display name.
// Adding one would mean a schema change (small) PLUS authoring real names
// into all ~36 checklist/form template YAML files (content work, not a
// mechanical rename) — deferred rather than done here; this derives a
// human title from the id instead: strip the "chk."/"frm."/etc. prefix,
// replace underscores with spaces, and capitalize the first letter only
// (sentence case, matching the deck's other headings).
// ---------------------------------------------------------------------------

function deriveArtifactTitle(templateId: string): string {
  const slug = templateId.replace(/^[a-z]+\./, "");
  const words = slug.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function collectChecklistTemplateIds(matched: MatchedActivity[]): string[] {
  const ids = new Set<string>();
  for (const { activity } of matched) {
    const templateId = checklistTemplateIdFor(activity);
    if (templateId) ids.add(templateId);
  }
  return [...ids].sort();
}

function renderChecklistAppendixDividerSlide(catalog: Catalog, templateIds: string[]): SlideEntry {
  const items = templateIds.map((id) => escapeHtml(deriveArtifactTitle(id)));
  return renderDividerSlide("Appendix", "Checklists", items);
}

function renderChecklistSlide(catalog: Catalog, templateId: string): string | null {
  const template = catalog.artifacts.find((a) => a.id === templateId);
  if (!template || template.kind !== "checklist") return null;
  const items = template.items.map((item) => `<li>${escapeHtml(item.label)}</li>`).join("");
  return `
    <div class="clipboard-card">
      <h2>${escapeHtml(deriveArtifactTitle(templateId))}</h2>
      <ul class="checklist checklist--ticks">${items}</ul>
    </div>
  `.trim();
}

function renderSafetySlide(
  catalog: Catalog,
  matched: MatchedActivity[],
  resolveRoleTokens: (text: string) => string,
): string {
  const escalations = new Set<string>();
  const mentionedNames = new Set<string>();

  for (const { activity } of matched) {
    const raw = normalizeWhitespace(activity.escalation_path);
    escalations.add(resolveRoleTokens(raw));
    for (const name of mentionedRoleNames(catalog, raw)) {
      mentionedNames.add(name);
    }
  }

  const escalationItems = [...escalations]
    .sort()
    .map((e) => `<li>${escapeHtml(e)}</li>`)
    .join("");
  const contactsHtml =
    mentionedNames.size > 0
      ? `<p><strong>You may need to escalate to:</strong> ${[...mentionedNames].sort().map((n) => escapeHtml(n)).join(", ")}</p>`
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
  presentNarrationWorkflows?: string[];
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
  const resolveRoleTokens = createRoleTokenResolver(catalog);
  // Computed once, up front, so both the "Your job" summary slide and the
  // agenda/phase-divider chapters below can share the same grouping.
  const phaseGroups = PHASE_ORDER.map((phase) => ({
    phase,
    entries: matched.filter((m) => m.activity.phase === phase),
  })).filter((group) => group.entries.length > 0);

  const slides: SlideEntry[] = [];
  slides.push({ html: renderTitleSlide(role, resolveRoleTokens) });

  const purposeSlide = renderRolePurposeSlide(role);
  if (purposeSlide) slides.push({ html: purposeSlide, kind: "poster" });

  const summarySlide = renderRoleSummarySlide(role, phaseGroups);
  if (summarySlide) slides.push({ html: summarySlide });

  for (const philosophySlide of COMPANY_PHILOSOPHY_SLIDES) {
    slides.push({ html: philosophySlide });
  }

  if (opts.intro) {
    for (const introSlide of parseIntroSlides(opts.intro)) {
      slides.push({ html: `<h2>${escapeHtml(introSlide.title)}</h2>\n${introSlide.bodyHtml}` });
    }
  }

  // Chapters: agenda -> one phase-divider + its activity slides per phase ->
  // a checklist appendix chapter (its own divider) -> safety/tools/help.
  if (phaseGroups.length > 0) {
    slides.push({ html: renderAgendaSlide(phaseGroups) });
  }

  phaseGroups.forEach(({ phase, entries }, i) => {
    slides.push(renderPhaseDividerSlide(phase, entries, i + 1, phaseGroups.length));
    for (const { activity, involvement } of entries) {
      slides.push({
        html: renderActivitySlide(roleId, activity, involvement, opts.screenshots, resolveRoleTokens),
      });
    }
  });

  const checklistTemplateIds = collectChecklistTemplateIds(matched);
  if (checklistTemplateIds.length > 0) {
    slides.push(renderChecklistAppendixDividerSlide(catalog, checklistTemplateIds));
    for (const templateId of checklistTemplateIds) {
      const slide = renderChecklistSlide(catalog, templateId);
      if (slide) slides.push({ html: slide });
    }
  }

  slides.push({ html: renderSafetySlide(catalog, matched, resolveRoleTokens) });
  slides.push({ html: renderToolsSlide(roleId) });
  slides.push({ html: renderHelpSlide(catalog) });

  const walkthroughsSlide = renderWalkthroughsSlide(roleId, opts.presentNarrationWorkflows);
  if (walkthroughsSlide) slides.push({ html: walkthroughsSlide });

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
