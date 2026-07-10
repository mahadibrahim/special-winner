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

// Same graceful-degrade shape as screenshotSlotHtml above (embedded data URI
// when present, else a relative path with an onerror fallback), but reads
// from the "Using the system" product tour's own screenshot slot —
// training/screenshots/<role>/tour/<slug>.png, a sibling of (not the same
// directory as) the per-activity slot above. Kept as a separate function
// rather than an extra parameter on screenshotSlotHtml so the two concepts
// (an activity's illustrative screenshot vs. a tour step's screenshot) stay
// textually distinct at every call site. The "--tour" modifier class gets
// the large, framed treatment product-tour slides need (see .screenshot-frame--tour
// in DECK_CSS) instead of the smaller inline treatment activity slides use.
function tourScreenshotSlotHtml(
  roleId: string,
  slug: string,
  tourScreenshots: Map<string, string> | undefined,
): string {
  const embedded = tourScreenshots?.get(slug);
  if (embedded) {
    return `<div class="screenshot-frame screenshot-frame--tour"><img class="screenshot" src="${embedded}" alt="Screenshot: ${escapeHtml(slug)}" /></div>`;
  }
  const roleSlug = roleId.replace(/^role\./, "");
  const relPath = `${SCREENSHOT_RELATIVE_PREFIX}/${roleSlug}/tour/${slug}.png`;
  return `<div class="screenshot-frame screenshot-frame--tour"><img class="screenshot" src="${relPath}" alt="Screenshot: ${escapeHtml(slug)}" onerror="this.parentElement.classList.add('screenshot-missing')" /></div>`;
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
    /* "safe center": center vertically when content fits (the common
       case), but fall back to start-alignment when content is taller than
       the frame (e.g. a role with many activities on the "Your toolkit"
       slide) — plain "center" on overflowing flex content makes the top of
       the content inaccessible via scroll (scrollTop can't go negative),
       silently hiding the heading. */
    justify-content: safe center;
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
    /* Round-3 composition pass: a slightly larger base size + wider measure
       (see the .slide p/.slide li rule below) so single-column slides use
       more of the 16:9 frame instead of a narrow left-pinned column of body
       text with the whole right side sitting empty. */
    font-size: 1.05rem;
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
  /* Round-3 two-column composition system — shared by the activity slide
     (steps + a meta/tools rail), the agenda and "how time works" slides
     (a list + a stat callout), and the toolkit slide (two tool-category
     panels side by side). One grid + one paper-surface panel style reused
     everywhere there's a natural "main content + companion data" shape,
     instead of a bespoke layout per slide. */
  .frame-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
    gap: 3.5rem;
    align-items: stretch;
    margin-top: 0.25rem;
  }
  .frame-main {
    min-width: 0;
  }
  /* Round-4 crowding pass: continuation pages of a paginated activity (see
     renderActivitySlides) drop the two-column .frame-layout grid entirely
     (no meta/tools panel repeats, no escalation until the last page) and
     render the remaining steps as a solo block. Capped to the same width
     the procedure column would have inside the two-column grid (measured
     ~609px at the deck's 1280px design width) so continuation pages read
     as a visual continuation of the same column, not a sudden full-width
     reflow, and so the pagination estimator's per-line budget (calibrated
     at that column width) stays valid. */
  .frame-main--continuation {
    max-width: 610px;
  }
  .frame-panel {
    background: var(--paper);
    border: 1px solid var(--cream-3);
    border-radius: 10px;
    padding: 1.75rem 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-width: 0;
  }
  .frame-panel-heading {
    margin: 0;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .frame-stat { display: flex; flex-direction: column; gap: 0.2rem; }
  .frame-stat-value {
    margin: 0;
    font-family: "Newsreader", "Source Serif 4", Georgia, serif;
    font-style: italic;
    font-weight: 600;
    font-size: 2.25rem;
    line-height: 1;
    color: var(--navy-deep);
  }
  .frame-stat-label {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink-muted);
  }
  /* Activity slide's right-rail panel — vertically stacked meta rows
     (replaces the old horizontal meta-chip row: WHEN / ownership /
     CHECKLIST used to sit as inline chips directly under the title; the
     two-column composition pass moves them into labeled rows in the paper
     panel so the panel — not a thin chip strip — is what carries that
     data, freeing the title area and giving the right column real content). */
  .panel-meta { display: flex; flex-direction: column; gap: 1.1rem; }
  .panel-meta-row { display: flex; flex-direction: column; gap: 0.2rem; }
  .panel-meta-label {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .panel-meta-value { font-size: 0.95rem; color: var(--ink-2); }
  .panel-meta-row--owner .panel-meta-value { color: var(--navy-deep); font-weight: 600; }
  .panel-tools {
    padding-top: 1.25rem;
    border-top: 1px solid var(--cream-3);
  }
  .panel-tools-label {
    margin: 0 0 0.75rem;
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .panel-tools-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6rem; }
  .panel-tools-list li {
    position: relative;
    padding-left: 1.1rem;
    max-width: none;
    font-size: 0.9rem;
    line-height: 1.45;
    color: var(--ink-2);
  }
  .panel-tools-list li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.55em;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ochre);
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
  /* Round-4 crowding pass: per-activity screenshots previously had no
     height cap (only max-width:100%), so a tall/portrait-ish capture could
     push an already-long procedure well past the frame. Capping height and
     letting object-fit:contain scale the image down (same technique as the
     tour treatment's .screenshot-frame--tour below) keeps every activity
     screenshot's contribution to slide height bounded and predictable —
     which the pagination estimator in the JS below relies on (see
     SCREENSHOT_BLOCK_PX). */
  .screenshot-frame img {
    display: block;
    max-width: 100%;
    max-height: 260px;
    object-fit: contain;
    border: 1px solid var(--cream-3);
    border-radius: 6px;
  }
  .screenshot-frame.screenshot-missing { display: none; }
  /* Product-tour slides — the screenshot IS the slide (a visual how-to,
     not an activity procedure with an inline screenshot alongside a meta
     panel), so it gets a much larger, framed treatment:
     centered, a real drop shadow, capped height so a tall screen capture
     never pushes the caption below the fold. */
  .screenshot-frame--tour {
    margin: 1.5rem auto 0;
    max-width: 900px;
  }
  .screenshot-frame--tour img {
    display: block;
    width: 100%;
    max-height: 56vh;
    object-fit: contain;
    object-position: top center;
    border-radius: 8px;
    box-shadow: 0 12px 32px oklch(0.2 0.02 260 / 0.14);
  }
  .tour-step-kicker { margin-bottom: 0.5rem; }
  .tour-caption {
    margin: 1.5rem auto 0;
    max-width: 68ch;
    font-size: 1.15rem;
    line-height: 1.55;
    color: var(--ink-2);
    text-align: center;
  }
  .tour-empty-note {
    margin-top: 1.5rem;
    text-align: center;
  }
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
    margin-top: 2rem;
    padding-top: 1.25rem;
    max-width: 78ch;
    border-top: 1px dashed var(--cream-3);
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--ink-muted);
  }
  .escalation-footnote strong { color: var(--ink-2); }
  /* Chapter divider slides (agenda's per-phase dividers + the checklist
     appendix divider) — a big Newsreader chapter name distinct from a
     normal content slide's h2, so it reads as a section break when
     flipping through the deck. Sized up considerably in the round-3
     composition pass (3rem -> 5.5rem) so the phase name genuinely
     dominates the frame instead of sitting as a small headline over a
     mostly-empty slide. */
  .divider-title {
    margin: 0 0 2rem;
    font-family: "Newsreader", "Source Serif 4", Georgia, serif;
    font-style: italic;
    font-weight: 600;
    font-size: 5.5rem;
    line-height: 1.05;
    color: var(--navy-deep);
  }
  /* Textblock wrapper establishes its own stacking context (position +
     z-index) so it reliably paints above .divider-mark below — position:
     absolute elements otherwise paint above static in-flow content
     regardless of DOM order. */
  .divider-textblock {
    position: relative;
    z-index: 1;
    max-width: 64ch;
  }
  /* Giant translucent phase-number watermark, filling the right side of
     phase-divider slides that would otherwise be almost entirely empty —
     a short kicker + title + activity list is real content but doesn't
     come close to using a 16:9 frame on its own. Echoes the poster
     slide's big-quote-mark motif (a large translucent Newsreader glyph)
     so the two "mostly typographic" slide kinds in the deck share one
     visual language. */
  .divider-mark {
    position: absolute;
    z-index: 0;
    right: 4vw;
    top: 50%;
    transform: translateY(-50%);
    font-family: "Newsreader", "Source Serif 4", Georgia, serif;
    font-style: italic;
    font-weight: 600;
    font-size: 26rem;
    line-height: 1;
    color: var(--ochre);
    opacity: 0.16;
    pointer-events: none;
  }
  /* Agenda slide ("Your day at a glance") — one row per phase with its
     activity count, right-aligned in mono like the other data labels.
     Lives in the shared .frame-layout grid alongside a stat panel (total
     phases/activities) so the list's companion data fills the right
     column instead of leaving it empty. */
  .agenda-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .agenda-list li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem 0;
    border-bottom: 1px solid var(--cream-3);
  }
  .agenda-phase {
    font-family: "Newsreader", "Source Serif 4", Georgia, serif;
    font-style: italic;
    font-weight: 600;
    font-size: 1.5rem;
    color: var(--navy-deep);
  }
  .agenda-count {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 0.85rem;
    color: var(--ink-muted);
    white-space: nowrap;
  }
  /* "How time works on your day" timeline slide — a left rail line with a
     dot per stop, label + activity name per row. Lives in the shared
     .frame-layout grid next to a stat panel (see renderRoleTimelineSlide). */
  .timeline-list {
    list-style: none;
    margin: 0;
    padding: 0;
    position: relative;
  }
  .timeline-list::before {
    content: "";
    position: absolute;
    left: 9rem;
    top: 0.5rem;
    bottom: 0.5rem;
    width: 1px;
    background: var(--cream-3);
  }
  .timeline-row {
    position: relative;
    display: grid;
    grid-template-columns: 9rem 1fr;
    align-items: baseline;
    gap: 1.25rem;
    padding: 0.65rem 0 0.65rem 1.75rem;
  }
  .timeline-row::before {
    content: "";
    position: absolute;
    left: calc(9rem - 4px);
    top: 1rem;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--ochre);
  }
  /* Single-line labels ("72 hours before", "48 hours after") — the column
     is sized to fit the longest real label without wrapping; a wrapped
     second line would run under the rail dot positioned for one line. */
  .timeline-label {
    font-family: "IBM Plex Mono", ui-monospace, monospace;
    font-size: 0.7rem;
    font-weight: 500;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink-muted);
    max-width: none;
    white-space: nowrap;
  }
  .timeline-name {
    font-size: 1rem;
    color: var(--ink);
    max-width: none;
  }
  /* "Your toolkit" slide — two category panels side by side, reusing the
     .frame-panel paper-surface card so it shares the same visual language
     as the activity slide's meta/tools rail and the agenda/timeline stat
     panels. */
  .toolkit-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2.5rem;
    align-items: start;
    margin-top: 1.5rem;
  }
  .toolkit-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.55rem; }
  .toolkit-list li {
    position: relative;
    padding-left: 1.1rem;
    max-width: none;
    font-size: 0.88rem;
    line-height: 1.4;
    color: var(--ink-2);
  }
  .toolkit-list li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.55em;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ochre);
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
  /* Readable measure — body copy tops out around 74 characters (widened
     from 68 in the round-3 composition pass to use more of the frame),
     headings and the tools table (needs its full width) are exempt. */
  .slide p,
  .slide li {
    max-width: 74ch;
  }
  /* Checklist slides — clipboard-card treatment, sage tick squares that
     stay empty (not checked) since this is a training reference, not a
     live tracker. Widened and centered in the frame (round-3 composition
     pass) rather than left-pinned at a narrow content width — a checklist
     card is a standalone object on its own slide, so centering it reads
     as a deliberate poster-like composition instead of body text that
     happens to stop halfway across. */
  .clipboard-card {
    background: var(--paper);
    border: 1px solid var(--cream-3);
    border-radius: 10px;
    padding: 3rem 4rem;
    box-shadow: 0 8px 24px oklch(0.2 0.02 260 / 0.08);
    width: 100%;
    max-width: 760px;
    margin: 0 auto;
  }
  .clipboard-card .checklist--ticks li {
    font-size: 1.05rem;
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
  /* Round-3 composition pass: the poster previously read as a short
     left-pinned caption with the entire right ~60% of the navy frame
     empty. Pairs the existing opening quote mark with a big translucent
     CLOSING quote mark filling the right side — a classic magazine
     pull-quote bracket, not a bolted-on decoration — instead of just
     enlarging the opening mark in place (which at large sizes collided
     with the statement's first line). .poster-layout is a simple flex
     row so the statement keeps its own comfortable measure and the
     closing mark absorbs the remaining width. */
  .poster-layout {
    display: flex;
    align-items: center;
    gap: 3vw;
  }
  .poster-statement-wrap {
    position: relative;
    max-width: 40ch;
    flex: 0 0 auto;
  }
  .poster-quote {
    position: absolute;
    top: -4rem;
    left: -2.5rem;
    z-index: 0;
    font-family: "Newsreader", "Source Serif 4", Georgia, serif;
    font-style: italic;
    font-size: 16rem;
    line-height: 1;
    color: var(--primary);
    opacity: 0.35;
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
    font-size: 3.1rem;
    line-height: 1.3;
    color: var(--cream);
  }
  /* Round-4 crowding pass: at the full 3.1rem size, a purpose statement
     over ~125 characters wraps to 9+ lines in the narrow 40ch column and
     runs the statement's last line under the touchline footer (measured
     against every real ROLE_PURPOSE entry at the deck's 1280x720 design
     viewport — see renderRolePurposeSlide, which applies this class by
     length rather than shrinking every statement uniformly). Smaller size
     + slightly tighter line-height buys enough extra lines of headroom for
     the longest real statement (role.event_lead, 159 chars) to clear the
     footer with room to spare. */
  .poster-statement--long {
    font-size: 2.5rem;
    line-height: 1.28;
  }
  .poster-mark {
    flex: 1 1 auto;
    text-align: center;
    font-family: "Newsreader", "Source Serif 4", Georgia, serif;
    font-style: italic;
    font-weight: 600;
    font-size: 24rem;
    line-height: 1;
    color: var(--primary);
    opacity: 0.14;
    pointer-events: none;
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
     cream background. Sized up again in the round-3 composition pass
     (260x72 -> 360x100) — "genuinely large" per the redesign brief, not
     just modestly bigger than the footer mark. */
  .hero-logo {
    width: 360px;
    height: 100px;
    margin: 0 0 3rem;
    background-repeat: no-repeat;
    background-position: left center;
    background-size: contain;
    background-image: url(${LOGO_DARK_DATA_URI});
  }
  /* Title slide role name — explicit large size (h1 has no font-size of
     its own in this stylesheet otherwise, so it fell back to the browser
     default ~2rem) plus a wider description measure, so the title slide's
     text block is a real typographic statement rather than a small
     logo+heading pair floating in a mostly-empty frame. */
  .title-role-name {
    font-size: 4.5rem;
    line-height: 1.05;
  }
  .title-role-description {
    max-width: 52ch;
    font-size: 1.2rem;
    line-height: 1.5;
  }
  /* Title-slide layout — the logo/name/description block paired with a
     giant translucent initial letter filling the right side, the same
     "big translucent Newsreader glyph" motif as the poster's quote marks
     and the phase divider's numeral, so the deck's three mostly-typographic
     slide kinds read as one family instead of three unrelated treatments. */
  .title-layout {
    display: flex;
    align-items: center;
    gap: 3vw;
  }
  .title-layout > .title-main { flex: 0 0 auto; max-width: 60ch; }
  .title-mark {
    flex: 1 1 auto;
    text-align: center;
    font-family: "Newsreader", "Source Serif 4", Georgia, serif;
    font-style: italic;
    font-weight: 600;
    font-size: 26rem;
    line-height: 1;
    color: var(--ochre);
    opacity: 0.16;
    pointer-events: none;
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
    [data-kind="poster"] .poster-mark { opacity: 0.12; }
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
  const initial = role.name.trim().charAt(0).toUpperCase();
  return `
    <div class="title-layout">
      <div class="title-main">
        <div class="hero-logo" role="img" aria-label="Aspire Sports"></div>
        <h1 class="title-role-name">${escapeHtml(role.name)}</h1>
        <p class="role-description title-role-description">${escapeHtml(resolveRoleTokens(role.description.trim()))}</p>
      </div>
      <span class="title-mark" aria-hidden="true">${escapeHtml(initial)}</span>
    </div>
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

// Statements longer than this wrap to enough lines at the full 3.1rem size
// to run under the touchline footer at the deck's 1280x720 design viewport
// — see the .poster-statement--long comment in DECK_CSS for the measured
// basis. 125 was picked to include role.ref's 146-char statement (which
// fits at full size with essentially zero margin — a single extra word
// would tip it over) as well as every statement that measurably overflows.
const POSTER_STATEMENT_LONG_THRESHOLD = 125;

function renderRolePurposeSlide(role: Catalog["roles"][number]): string | null {
  const purpose = ROLE_PURPOSE[role.id];
  if (!purpose) return null;
  const statementClass =
    purpose.length > POSTER_STATEMENT_LONG_THRESHOLD ? "poster-statement poster-statement--long" : "poster-statement";
  return `
    <p class="poster-role-label">${escapeHtml(role.name)}</p>
    <div class="poster-layout">
      <div class="poster-statement-wrap">
        <span class="poster-quote" aria-hidden="true">&#8220;</span>
        <p class="${statementClass}">${escapeHtml(purpose)}</p>
      </div>
      <span class="poster-mark" aria-hidden="true">&#8221;</span>
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
// "Your toolkit" slide — placed right after "Your job", before the
// philosophy section. Dedupes activity.tools across every activity the role
// is Accountable or Responsible for (the same `matched` set the agenda/phase
// chapters use) into one orientation list, instead of only ever seeing tools
// scattered one activity at a time on individual activity slides.
//
// Categorization is a display heuristic, not authoritative: a tool string
// reads as "digital & platform" if it embeds a route path (contains "/") or
// one of a short list of software-shaped nouns (form, checklist, dashboard,
// ...); everything else is treated as "physical & on-site". Good enough to
// usefully sort ~170 free-text catalog tool strings; not worth a schema
// field for what is fundamentally a display grouping. Known miss: "Your own
// watch or stopwatch (there's no in-app clock)" contains "app" as a
// substring of "in-app" and gets misclassified as digital despite the
// sentence explicitly denying an app exists — an acceptable false positive
// for a heuristic this simple, not worth a special case for one activity.
// ---------------------------------------------------------------------------

const DIGITAL_TOOL_KEYWORDS = [
  "form",
  "checklist",
  "dashboard",
  "portal",
  "app",
  "page",
  "log",
  "queue",
  "job",
  "calendar",
  "record",
  "readback",
  "export",
  "consent",
  "webhook",
  "provider",
  "standings",
  "list",
  "plan",
  "schedule",
  "packet",
  "digest",
  "broadcast",
  "reminder",
  "rollup",
  "system",
  "signature",
  "attestation",
  "report",
  "channel",
  "email",
  "inbox",
  "station",
];

function isDigitalTool(tool: string): boolean {
  if (tool.includes("/")) return true;
  const lower = tool.toLowerCase();
  return DIGITAL_TOOL_KEYWORDS.some((keyword) => lower.includes(keyword));
}

interface RoleToolkit {
  digital: string[];
  physical: string[];
}

// ---------------------------------------------------------------------------
// Round-4 crowding pass: shared slide-frame constants. The deck's design
// viewport (see the deck-crowding-audit) is 1280x720; every slide shares the
// same 8vh top/bottom padding and the same h2-plus-hairline-rule header
// composition regardless of which slide type follows it, so the toolkit,
// timeline, and activity paginators below all budget against these same
// numbers rather than each re-deriving them.
// ---------------------------------------------------------------------------
const ACTIVITY_VIEWPORT_HEIGHT_PX = 720;
const ACTIVITY_BOTTOM_PADDING_PX = 58;
const ACTIVITY_SAFETY_MARGIN_PX = 24;
// h2 + its hairline rule/margin + the frame-layout's own small margin-top —
// fixed regardless of content since the title is always one line. Shared by
// the activity slide and the "How time works on your day" timeline slide,
// which both put a .frame-layout grid directly under the h2.
const FRAME_LAYOUT_TOP_PX = 146;

function buildRoleToolkit(matched: MatchedActivity[]): RoleToolkit {
  const seen = new Set<string>();
  const digital: string[] = [];
  const physical: string[] = [];
  for (const { activity } of matched) {
    for (const tool of activity.tools ?? []) {
      if (seen.has(tool)) continue;
      seen.add(tool);
      (isDigitalTool(tool) ? digital : physical).push(tool);
    }
  }
  digital.sort((a, b) => a.localeCompare(b));
  physical.sort((a, b) => a.localeCompare(b));
  return { digital, physical };
}

function renderToolkitCategory(heading: string, tools: string[]): string {
  const listHtml =
    tools.length > 0
      ? `<ul class="toolkit-list">${tools.map((tool) => `<li>${escapeHtml(tool)}</li>`).join("")}</ul>`
      : `<p class="empty-note">None catalogued yet.</p>`;
  return `
    <div class="frame-panel">
      <p class="frame-panel-heading">${escapeHtml(heading)}</p>
      ${listHtml}
    </div>
  `.trim();
}

function renderRoleToolkitSlide(matched: MatchedActivity[]): string | null {
  if (matched.length === 0) return null;
  const { digital, physical } = buildRoleToolkit(matched);

  if (digital.length === 0 && physical.length === 0) {
    return `
      <h2>Your toolkit</h2>
      <p class="empty-note">No tools are catalogued for your activities yet.</p>
    `.trim();
  }

  return `
    <h2>Your toolkit</h2>
    <p class="slide-kicker">Everything your activities call for, in one place.</p>
    <div class="toolkit-grid">
      ${renderToolkitCategory("Digital & platform tools", digital)}
      ${renderToolkitCategory("Physical & on-site tools", physical)}
    </div>
  `.trim();
}

// ---------------------------------------------------------------------------
// Round-4 crowding pass: toolkit pagination. role.venue_manager alone
// catalogues 40+ distinct tools across its matched activities (see the
// deck-crowding-audit) — comfortably more than the two-column toolkit grid
// fits on one 720px-tall slide. Same estimate-then-paginate approach as
// renderActivitySlides above: a conservative chars-per-line height estimate
// (calibrated against a real Playwright measurement of the venue_manager
// toolkit slide), producing "Your toolkit (i/N)" continuation slides only
// when the estimate says the full list won't fit — every role whose tools
// already fit on one slide renders byte-identical output to
// renderRoleToolkitSlide above.
const TOOLKIT_ITEM_LINE_HEIGHT_PX = 19.5;
const TOOLKIT_ITEM_GAP_PX = 8.8;
const TOOLKIT_CHARS_PER_LINE = 60;
// h2 + kicker + the grid's own margin-top, fixed regardless of content.
const TOOLKIT_GRID_TOP_PX = 216;
// A larger safety margin than the activity/timeline paginators' shared
// ACTIVITY_SAFETY_MARGIN_PX: the first calibration pass (see the
// deck-crowding-audit) under-budgeted here by 24-70px on every real
// multi-page toolkit (event_lead, facilities, ref, venue_manager) — the
// per-item estimate is close but not quite conservative enough once ~20+
// real tool strings are packed onto one page, so this pass carries its own,
// wider margin rather than nudging the shared constant (which the
// activity/timeline paginators verified fits fine at 24).
const TOOLKIT_SAFETY_MARGIN_PX = 120;
const TOOLKIT_PAGE_BUDGET_PX =
  ACTIVITY_VIEWPORT_HEIGHT_PX - TOOLKIT_GRID_TOP_PX - ACTIVITY_BOTTOM_PADDING_PX - TOOLKIT_SAFETY_MARGIN_PX;

function paginateToolkitCategory(tools: string[]): string[][] {
  if (tools.length === 0) return [[]];
  const pages: string[][] = [];
  let current: string[] = [];
  let currentHeight = 0;
  for (const tool of tools) {
    const itemHeight = estimateWrappedLines(tool, TOOLKIT_CHARS_PER_LINE) * TOOLKIT_ITEM_LINE_HEIGHT_PX;
    const gap = current.length > 0 ? TOOLKIT_ITEM_GAP_PX : 0;
    if (current.length > 0 && currentHeight + gap + itemHeight > TOOLKIT_PAGE_BUDGET_PX) {
      pages.push(current);
      current = [tool];
      currentHeight = itemHeight;
    } else {
      current.push(tool);
      currentHeight += gap + itemHeight;
    }
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

// Renders one category panel for a single toolkit page. `categoryHasItems`
// distinguishes "this role has zero tools in this category, period" (shows
// the original "None catalogued yet." empty-state note) from "this category
// simply ran out of items on an earlier page" (renders nothing extra —
// repeating an empty-state note on every trailing page would misleadingly
// suggest the whole category is empty).
function renderToolkitCategoryPage(heading: string, toolsChunk: string[], categoryHasItems: boolean): string {
  let listHtml: string;
  if (toolsChunk.length > 0) {
    listHtml = `<ul class="toolkit-list">${toolsChunk.map((tool) => `<li>${escapeHtml(tool)}</li>`).join("")}</ul>`;
  } else if (!categoryHasItems) {
    listHtml = `<p class="empty-note">None catalogued yet.</p>`;
  } else {
    listHtml = "";
  }
  return `
    <div class="frame-panel">
      <p class="frame-panel-heading">${escapeHtml(heading)}</p>
      ${listHtml}
    </div>
  `.trim();
}

function renderRoleToolkitSlides(matched: MatchedActivity[]): SlideEntry[] {
  const single = renderRoleToolkitSlide(matched);
  if (single === null) return [];

  const { digital, physical } = buildRoleToolkit(matched);
  if (digital.length === 0 && physical.length === 0) return [{ html: single }];

  const digitalPages = paginateToolkitCategory(digital);
  const physicalPages = paginateToolkitCategory(physical);
  const totalPages = Math.max(digitalPages.length, physicalPages.length);
  if (totalPages <= 1) return [{ html: single }];

  return Array.from({ length: totalPages }, (_, i) => {
    const title = `Your toolkit (${i + 1}/${totalPages})`;
    return {
      html: `
    <h2>${escapeHtml(title)}</h2>
    <p class="slide-kicker">Everything your activities call for, in one place.</p>
    <div class="toolkit-grid">
      ${renderToolkitCategoryPage("Digital & platform tools", digitalPages[i] ?? [], digital.length > 0)}
      ${renderToolkitCategoryPage("Physical & on-site tools", physicalPages[i] ?? [], physical.length > 0)}
    </div>
  `.trim(),
    };
  });
}

// ---------------------------------------------------------------------------
// "How time works on your day" slide — a vertical timeline built from the
// role's matched activities' `trigger` values (the same source as each
// activity slide's WHEN row), ordered chronologically. Triggers that name a
// clock-relative offset ("72h before event window", "60 minutes before
// first kickoff", the T+/- shorthand under expected_completion's influence)
// get a real "N hours/minutes before/after" label parsed straight from the
// humanized trigger text; triggers that are event-based rather than
// clock-based (e.g. "Immediately after facility unlock", "Incident observed
// or reported during the match") don't have a number to parse and group
// under "As it happens" instead of a fabricated time.
//
// Chronological order is anchored on the activity's catalog `phase`
// (PHASE_ORDER is already a reliable pre_day -> post_day sequence) as the
// primary sort key, with the parsed before/after minutes as a secondary,
// within-phase tiebreaker. Sorting on parsed minutes ALONE (ignoring phase)
// would be wrong: two activities' free-text triggers aren't on a shared
// numeric scale across phases (a pre_day "48h before" and a post_day event
// trigger with no number can't be meaningfully compared as raw numbers), so
// phase does the macro ordering and the parsed minutes only refine order
// among same-phase activities.
// ---------------------------------------------------------------------------

function parseTimeRelativeMinutes(humanizedTrigger: string): number | null {
  const beforeHours = humanizedTrigger.match(/(\d+)\s*hours?\s*before/i);
  if (beforeHours) return -parseInt(beforeHours[1], 10) * 60;
  const beforeMinutes = humanizedTrigger.match(/(\d+)\s*minutes?\s*before/i);
  if (beforeMinutes) return -parseInt(beforeMinutes[1], 10);
  const afterHours = humanizedTrigger.match(/(\d+)\s*hours?\s*after/i);
  if (afterHours) return parseInt(afterHours[1], 10) * 60;
  const afterMinutes = humanizedTrigger.match(/(\d+)\s*minutes?\s*after/i);
  if (afterMinutes) return parseInt(afterMinutes[1], 10);
  return null;
}

function timelineLabelFor(minutes: number | null): string {
  if (minutes === null) return "As it happens";
  if (minutes === 0) return "At kickoff";
  const abs = Math.abs(minutes);
  const useHours = abs >= 60 && abs % 60 === 0;
  const value = useHours ? abs / 60 : abs;
  const unit = useHours ? (value === 1 ? "hour" : "hours") : value === 1 ? "minute" : "minutes";
  return `${value} ${unit} ${minutes < 0 ? "before" : "after"}`;
}

interface TimelineEntry {
  activity: Activity;
  label: string;
  isTimeRelative: boolean;
}

// Second-pass fallback for event-based triggers phrased as "after <some
// other activity>" (e.g. "Immediately after facility unlock") — resolves
// the referenced activity's own numeric minutes (if it has one, from
// earlier in the same phase or an earlier phase) so the event-based
// activity sorts right after it, instead of defaulting to the phase
// midpoint and potentially landing chronologically before things that
// actually happen first. Word-overlap match on the sibling's name against
// the trigger text — good enough for the catalog's actual "after X" phrasing
// (single real match today: opening_walkthrough referencing "facility
// unlock"); anything that doesn't match falls through to the phase-midpoint
// default further down, which is still an honest "As it happens" label, just
// without the extra precision.
//
// Requires ALL of the sibling's significant words to appear in the trigger
// text (not just a majority) — several activity names in this catalog share
// a common lead word ("Facility unlock" / "Facility close walkthrough" /
// "Facility lock and alarm"), and a partial-overlap threshold matched
// "staff_debrief" (triggered "after facility close walkthrough...") against
// the wrong sibling ("Facility unlock") on the strength of "facility" alone.
// Requiring every word closes that false-positive without losing the one
// real match this exists for.
function resolveEventBasedMinutes(
  humanizedTrigger: string,
  ownPhaseIndex: number,
  resolved: Array<{ name: string; phaseIndex: number; minutes: number | null }>,
): number | null {
  if (!/\bafter\b/i.test(humanizedTrigger)) return null;
  const lowerTrigger = humanizedTrigger.toLowerCase();
  for (const sibling of resolved) {
    if (sibling.minutes === null || sibling.phaseIndex > ownPhaseIndex) continue;
    const words = sibling.name.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (words.length === 0) continue;
    const allWordsMatch = words.every((w) => lowerTrigger.includes(w));
    if (allWordsMatch) return sibling.minutes + 1;
  }
  return null;
}

function buildRoleTimeline(
  matched: MatchedActivity[],
  resolveRoleTokens: (text: string) => string,
): TimelineEntry[] {
  // Pass 1: parse whatever numeric before/after value each trigger has.
  const parsed = matched.map(({ activity }) => {
    const humanTrigger = humanizeTrigger(resolveRoleTokens(normalizeWhitespace(activity.trigger)));
    const minutes = parseTimeRelativeMinutes(humanTrigger);
    return {
      activity,
      humanTrigger,
      minutes,
      phaseIndex: PHASE_ORDER.indexOf(activity.phase),
    };
  });

  // Pass 2: for triggers with no numeric value, try to resolve "after
  // <sibling activity>" against the pass-1 results before falling back to
  // the phase midpoint (minutes = 0, relative to that phase).
  const withSortKeys = parsed.map((entry) => {
    if (entry.minutes !== null) {
      return { ...entry, sortMinutes: entry.minutes, isTimeRelative: true };
    }
    const resolvedMinutes = resolveEventBasedMinutes(
      entry.humanTrigger,
      entry.phaseIndex,
      parsed.map((p) => ({ name: p.activity.name, phaseIndex: p.phaseIndex, minutes: p.minutes })),
    );
    return { ...entry, sortMinutes: resolvedMinutes ?? 0, isTimeRelative: false };
  });

  withSortKeys.sort(
    (a, b) =>
      a.phaseIndex - b.phaseIndex ||
      a.sortMinutes - b.sortMinutes ||
      a.activity.id.localeCompare(b.activity.id),
  );
  return withSortKeys.map(({ activity, minutes, isTimeRelative }) => ({
    activity,
    label: timelineLabelFor(isTimeRelative ? minutes : null),
    isTimeRelative,
  }));
}

function renderRoleTimelineSlide(
  matched: MatchedActivity[],
  resolveRoleTokens: (text: string) => string,
): string | null {
  if (matched.length === 0) return null;
  const entries = buildRoleTimeline(matched, resolveRoleTokens);
  const eventBasedCount = entries.filter((entry) => !entry.isTimeRelative).length;

  const itemsHtml = entries
    .map(
      (entry) =>
        `<li class="timeline-row"><span class="timeline-label">${escapeHtml(entry.label)}</span><span class="timeline-name">${escapeHtml(entry.activity.name)}</span></li>`,
    )
    .join("");

  const eventStatHtml =
    eventBasedCount > 0
      ? `<div class="frame-stat">
          <p class="frame-stat-value">${eventBasedCount}</p>
          <p class="frame-stat-label">${escapeHtml(pluralize(eventBasedCount, "activity", "activities"))} triggered by events, not the clock</p>
        </div>`
      : "";

  return `
    <h2>How time works on your day</h2>
    <div class="frame-layout">
      <ol class="timeline-list">${itemsHtml}</ol>
      <div class="frame-panel">
        <p class="frame-panel-heading">At a glance</p>
        <div class="frame-stat">
          <p class="frame-stat-value">${entries.length}</p>
          <p class="frame-stat-label">${escapeHtml(pluralize(entries.length, "stop", "stops"))} across your day</p>
        </div>
        ${eventStatHtml}
      </div>
    </div>
  `.trim();
}

// Round-4 crowding pass: timeline pagination. role.venue_manager's day has
// 16 real stops (see the deck-crowding-audit) — every row renders at a
// fixed height (the label is single-line/nowrap by design, see
// .timeline-label in DECK_CSS, and real activity names are short enough
// never to wrap the .timeline-name column), so unlike the activity/toolkit
// estimators above, pagination here is a simple fixed-row-count budget, no
// per-text estimate needed. Produces "How time works on your day (i/N)"
// continuation slides only when entries.length exceeds one page's worth of
// rows; every role within that budget renders byte-identical output to
// renderRoleTimelineSlide above.
const TIMELINE_ROW_HEIGHT_PX = 41;
// h2 + the frame-layout's own margin-top, fixed regardless of content —
// same value as FRAME_LAYOUT_TOP_PX (both slides share the same h2/rule
// composition above the grid).
const TIMELINE_LIST_TOP_PX = FRAME_LAYOUT_TOP_PX;
// A wider safety margin than the shared ACTIVITY_SAFETY_MARGIN_PX: at that
// margin the last row of a full page sat right at the touchline hairline
// (0px overflow, but visually touching the footer rule) — see the
// deck-crowding-audit screenshots. One fewer row per page buys real
// breathing room above the footer.
const TIMELINE_SAFETY_MARGIN_PX = 64;
const TIMELINE_PAGE_BUDGET_PX =
  ACTIVITY_VIEWPORT_HEIGHT_PX - TIMELINE_LIST_TOP_PX - ACTIVITY_BOTTOM_PADDING_PX - TIMELINE_SAFETY_MARGIN_PX;
const TIMELINE_ROWS_PER_PAGE = Math.max(1, Math.floor(TIMELINE_PAGE_BUDGET_PX / TIMELINE_ROW_HEIGHT_PX));

function renderRoleTimelineSlides(
  matched: MatchedActivity[],
  resolveRoleTokens: (text: string) => string,
): SlideEntry[] {
  const single = renderRoleTimelineSlide(matched, resolveRoleTokens);
  if (single === null) return [];

  const entries = buildRoleTimeline(matched, resolveRoleTokens);
  if (entries.length <= TIMELINE_ROWS_PER_PAGE) return [{ html: single }];

  const eventBasedCount = entries.filter((entry) => !entry.isTimeRelative).length;
  const pages: TimelineEntry[][] = [];
  for (let i = 0; i < entries.length; i += TIMELINE_ROWS_PER_PAGE) {
    pages.push(entries.slice(i, i + TIMELINE_ROWS_PER_PAGE));
  }

  const eventStatHtml =
    eventBasedCount > 0
      ? `<div class="frame-stat">
          <p class="frame-stat-value">${eventBasedCount}</p>
          <p class="frame-stat-label">${escapeHtml(pluralize(eventBasedCount, "activity", "activities"))} triggered by events, not the clock</p>
        </div>`
      : "";

  return pages.map((pageEntries, i) => {
    const itemsHtml = pageEntries
      .map(
        (entry) =>
          `<li class="timeline-row"><span class="timeline-label">${escapeHtml(entry.label)}</span><span class="timeline-name">${escapeHtml(entry.activity.name)}</span></li>`,
      )
      .join("");
    const title = `How time works on your day (${i + 1}/${pages.length})`;
    return {
      html: `
    <h2>${escapeHtml(title)}</h2>
    <div class="frame-layout">
      <ol class="timeline-list">${itemsHtml}</ol>
      <div class="frame-panel">
        <p class="frame-panel-heading">At a glance</p>
        <div class="frame-stat">
          <p class="frame-stat-value">${entries.length}</p>
          <p class="frame-stat-label">${escapeHtml(pluralize(entries.length, "stop", "stops"))} across your day</p>
        </div>
        ${eventStatHtml}
      </div>
    </div>
  `.trim(),
    };
  });
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

// `mark` is an optional giant translucent numeral/glyph rendered behind the
// textblock, filling the right side of the frame (see .divider-mark) — used
// for phase dividers (the phase number) but left off the checklist appendix
// divider, which has no natural single-glyph equivalent.
function renderDividerSlide(kicker: string, title: string, items: string[], mark?: string): SlideEntry {
  const itemsHtml = items.map((item) => `<li>${item}</li>`).join("");
  const markHtml = mark ? `<span class="divider-mark" aria-hidden="true">${escapeHtml(mark)}</span>` : "";
  return {
    html: `
    ${markHtml}
    <div class="divider-textblock">
      <p class="slide-kicker">${escapeHtml(kicker)}</p>
      <p class="divider-title">${escapeHtml(title)}</p>
      <ul class="phase-overview">${itemsHtml}</ul>
    </div>
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
  return renderDividerSlide(
    `Phase ${phaseNumber} of ${totalPhases}`,
    humanizePhase(phase),
    items,
    String(phaseNumber).padStart(2, "0"),
  );
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
  const totalActivities = phaseGroups.reduce((sum, group) => sum + group.entries.length, 0);
  // Companion stat panel (shared .frame-layout/.frame-panel, see
  // renderActivitySlide) — the phase list alone left the whole right column
  // empty; a same-day totals callout is real, relevant data, not filler.
  return `
    <h2>Your day at a glance</h2>
    <div class="frame-layout">
      <ul class="agenda-list">${items}</ul>
      <div class="frame-panel">
        <p class="frame-panel-heading">Today, in total</p>
        <div class="frame-stat">
          <p class="frame-stat-value">${phaseGroups.length}</p>
          <p class="frame-stat-label">${escapeHtml(pluralize(phaseGroups.length, "phase"))}</p>
        </div>
        <div class="frame-stat">
          <p class="frame-stat-value">${totalActivities}</p>
          <p class="frame-stat-label">${escapeHtml(pluralize(totalActivities, "activity", "activities"))}</p>
        </div>
      </div>
    </div>
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

// Round-3 slide anatomy: a two-column composition (see .frame-layout in
// DECK_CSS). Left column (.frame-main, ~60-62% of the frame) carries the
// numbered procedure + screenshot slot; right column (.frame-panel, a
// paper-surface card with a hairline border) carries the activity's meta
// data — WHEN / accountability / checklist as labeled rows, then a "Tools"
// block listing activity.tools — so the previously-empty right column now
// fills with real per-activity data instead of a floating chip strip.
// Superseded anatomy, for history: round 2 put WHEN / YOU OWN THIS-or-YOU
// ASSIST / CHECKLIST in a horizontal meta-chip row directly under the
// title; that row is gone, replaced by the panel's vertical meta rows.
// Escalation stays a full-width footnote below the two-column region
// (tried inside the panel too — a full-width footnote reads better because
// it doesn't compete with the panel's tools list for a narrow column, and
// it gives the slide one more element spanning the full frame width).
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

  const metaRows: string[] = [
    `<div class="panel-meta-row"><span class="panel-meta-label">When</span><span class="panel-meta-value">${escapeHtml(when)}</span></div>`,
    `<div class="panel-meta-row panel-meta-row--owner"><span class="panel-meta-label">Accountability</span><span class="panel-meta-value">${escapeHtml(involvementToChipLabel(involvement))}</span></div>`,
  ];
  const checklistTemplateId = checklistTemplateIdFor(activity);
  if (checklistTemplateId) {
    metaRows.push(
      `<div class="panel-meta-row"><span class="panel-meta-label">Checklist</span><span class="panel-meta-value">${escapeHtml(deriveArtifactTitle(checklistTemplateId))}</span></div>`,
    );
  }

  const tools = activity.tools ?? [];
  const toolsHtml =
    tools.length > 0
      ? `<div class="panel-tools">
        <p class="panel-tools-label">Tools</p>
        <ul class="panel-tools-list">${tools.map((tool) => `<li>${escapeHtml(tool)}</li>`).join("")}</ul>
      </div>`
      : "";

  return `
    <h2>${escapeHtml(activity.name)}</h2>
    <div class="frame-layout">
      <div class="frame-main">
        ${renderProcedureHtml(activity.sop_body)}
        ${screenshotSlotHtml(roleId, slug, screenshots)}
      </div>
      <aside class="frame-panel">
        <div class="panel-meta">${metaRows.join("")}</div>
        ${toolsHtml}
      </aside>
    </div>
    <div class="escalation-footnote"><strong>If something goes wrong:</strong> ${escapeHtml(escalation)}</div>
  `.trim();
}

// ---------------------------------------------------------------------------
// Round-4 crowding pass: activity-slide pagination. A handful of real
// catalog activities (e.g. act.rainout_refund_decision, act.incident_response)
// have procedures long enough — sometimes paired with a real embedded
// screenshot (see SCREENSHOT_BLOCK_PX below) — that the two-column slide
// from renderActivitySlide above runs past the 720px-tall design frame and
// relies on .slide's overflow-y:auto to hide it, which is exactly the
// silent-scroll crowding this pass exists to catch and fix (see the
// deck-crowding-audit plan). renderTrainingDeck can't measure real rendered
// height (this module stays pure/synchronous, no browser at generation
// time — see the file-header comment), so pagination is decided by a
// character-count height ESTIMATE, calibrated against real Playwright
// measurements of every flagged deck at the deck's 1280x720 design
// viewport (see docs/superpowers/plans's crowding-audit notes). Constants
// are deliberately conservative (low chars-per-line, i.e. they predict
// MORE wrapped lines than most real text needs) so the estimator never
// UNDER-predicts height — the failure mode that would matter is silently
// leaving a slide un-split, not splitting a slide slightly earlier than
// strictly necessary.
//
// When the estimate says everything fits on one page, output is IDENTICAL
// to the single-page renderActivitySlide above (same function, called
// once) — this pass changes nothing for the ~190 real activity slides that
// were never crowded.
const STEP_LINE_HEIGHT_PX = 26;
const STEP_CHARS_PER_LINE = 56;
const STEP_GAP_PX = 16;
const STEPS_LIST_TRAILING_MARGIN_PX = 28;
const ESCALATION_MARGIN_TOP_PX = 32;
const ESCALATION_BASE_PX = 21;
const ESCALATION_LINE_HEIGHT_PX = 20;
const ESCALATION_CHARS_PER_LINE = 55;
// margin-top (1.5rem=24) + the CSS max-height cap (260px) added to
// .screenshot-frame img above — a real embedded screenshot's contribution
// to slide height is now bounded and known at generation time, which is
// exactly what makes accounting for it here possible.
const SCREENSHOT_BLOCK_PX = 284;
// Budget for a page's step-chunk height alone (panel/meta on page 1 is
// small enough in practice not to be the binding column — see the
// crowding-audit calibration notes — so it isn't separately modeled here).
const ACTIVITY_PAGE_BUDGET_PX =
  ACTIVITY_VIEWPORT_HEIGHT_PX - FRAME_LAYOUT_TOP_PX - ACTIVITY_BOTTOM_PADDING_PX - ACTIVITY_SAFETY_MARGIN_PX;

function estimateWrappedLines(text: string, charsPerLine: number): number {
  return Math.max(1, Math.ceil(text.length / charsPerLine));
}

function estimateStepHeight(step: string): number {
  return estimateWrappedLines(step, STEP_CHARS_PER_LINE) * STEP_LINE_HEIGHT_PX;
}

function estimateStepsBlockHeight(steps: string[]): number {
  if (steps.length === 0) return 0;
  const stepsHeight = steps.reduce((sum, s) => sum + estimateStepHeight(s), 0);
  return stepsHeight + (steps.length - 1) * STEP_GAP_PX + STEPS_LIST_TRAILING_MARGIN_PX;
}

function estimateEscalationHeight(text: string): number {
  const lines = estimateWrappedLines(text, ESCALATION_CHARS_PER_LINE);
  return ESCALATION_BASE_PX + lines * ESCALATION_LINE_HEIGHT_PX;
}

// Greedy bin-pack of procedure steps into pages, each page's estimated
// height capped at ACTIVITY_PAGE_BUDGET_PX. The true LAST page also has to
// carry the escalation footnote (always) and the screenshot (if any) — both
// only render once, at the end — so after the greedy pass, check whether
// the last page plus that reserve still fits; if not, peel steps off the
// end into further trailing pages (looped, not a single peel, in case a
// long final step + a long escalation still don't fit after one peel).
function paginateProcedureSteps(
  steps: string[],
  hasScreenshot: boolean,
  escalationHeight: number,
): string[][] {
  const pages: string[][] = [];
  let current: string[] = [];
  let currentHeight = 0;

  for (const step of steps) {
    const stepHeight = estimateStepHeight(step);
    const gap = current.length > 0 ? STEP_GAP_PX : 0;
    const prospective = currentHeight + gap + stepHeight;
    if (current.length > 0 && prospective + STEPS_LIST_TRAILING_MARGIN_PX > ACTIVITY_PAGE_BUDGET_PX) {
      pages.push(current);
      current = [step];
      currentHeight = stepHeight;
    } else {
      current.push(step);
      currentHeight = prospective;
    }
  }
  if (current.length > 0) pages.push(current);

  const reserve = ESCALATION_MARGIN_TOP_PX + escalationHeight + (hasScreenshot ? SCREENSHOT_BLOCK_PX : 0);
  while (pages.length > 0) {
    const last = pages[pages.length - 1];
    if (last.length <= 1) break;
    const lastHeight = estimateStepsBlockHeight(last);
    if (lastHeight + reserve <= ACTIVITY_PAGE_BUDGET_PX) break;
    const moved = last.pop();
    if (moved === undefined) break;
    pages.push([moved]);
  }
  return pages;
}

function renderActivityMetaRowsHtml(activity: Activity, when: string, involvement: Involvement): string {
  const metaRows: string[] = [
    `<div class="panel-meta-row"><span class="panel-meta-label">When</span><span class="panel-meta-value">${escapeHtml(when)}</span></div>`,
    `<div class="panel-meta-row panel-meta-row--owner"><span class="panel-meta-label">Accountability</span><span class="panel-meta-value">${escapeHtml(involvementToChipLabel(involvement))}</span></div>`,
  ];
  const checklistTemplateId = checklistTemplateIdFor(activity);
  if (checklistTemplateId) {
    metaRows.push(
      `<div class="panel-meta-row"><span class="panel-meta-label">Checklist</span><span class="panel-meta-value">${escapeHtml(deriveArtifactTitle(checklistTemplateId))}</span></div>`,
    );
  }
  return metaRows.join("");
}

function renderActivityToolsHtml(activity: Activity): string {
  const tools = activity.tools ?? [];
  if (tools.length === 0) return "";
  return `<div class="panel-tools">
        <p class="panel-tools-label">Tools</p>
        <ul class="panel-tools-list">${tools.map((tool) => `<li>${escapeHtml(tool)}</li>`).join("")}</ul>
      </div>`;
}

function renderEscalationFootnoteHtml(escalation: string): string {
  return `<div class="escalation-footnote"><strong>If something goes wrong:</strong> ${escapeHtml(escalation)}</div>`;
}

// Paginated replacement for a single renderActivitySlide call — returns 2+
// SlideEntry objects ("Activity name (i/N)") when the estimator says the
// procedure won't fit on one slide, or exactly 1 (byte-identical to
// renderActivitySlide's own output) when it fits, which is the common case.
function renderActivitySlides(
  roleId: string,
  activity: Activity,
  involvement: Involvement,
  screenshots: Map<string, string> | undefined,
  resolveRoleTokens: (text: string) => string,
): SlideEntry[] {
  const single = renderActivitySlide(roleId, activity, involvement, screenshots, resolveRoleTokens);

  // Stub/freeform procedures are short by construction (see
  // isStubProcedure/renderProcedureHtml) and are never numbered-step lists
  // pagination operates on — only a real parsed step list is eligible.
  const steps = parseProcedureSteps(activity.sop_body);
  if (isStubProcedure(activity.sop_body) || steps.length === 0) {
    return [{ html: single }];
  }

  const slug = activitySlug(activity.id);
  const hasScreenshot = Boolean(screenshots?.get(slug));
  const escalation = resolveRoleTokens(normalizeWhitespace(activity.escalation_path));
  const escalationHeight = estimateEscalationHeight(escalation);

  const pages = paginateProcedureSteps(steps, hasScreenshot, escalationHeight);
  if (pages.length <= 1) {
    return [{ html: single }];
  }

  const when = humanizeTrigger(resolveRoleTokens(normalizeWhitespace(activity.trigger)));
  const metaRowsHtml = renderActivityMetaRowsHtml(activity, when, involvement);
  const toolsHtml = renderActivityToolsHtml(activity);
  const total = pages.length;

  return pages.map((pageSteps, i) => {
    const isFirst = i === 0;
    const isLast = i === total - 1;
    const startIndex = pages.slice(0, i).reduce((n, p) => n + p.length, 0) + 1;
    const stepsHtml = `<ol class="steps" start="${startIndex}">${pageSteps
      .map((s) => `<li>${escapeHtml(s)}</li>`)
      .join("")}</ol>`;
    const screenshotHtml = isLast ? screenshotSlotHtml(roleId, slug, screenshots) : "";
    const escalationHtml = isLast ? renderEscalationFootnoteHtml(escalation) : "";
    const title = `${escapeHtml(activity.name)} (${i + 1}/${total})`;

    if (isFirst) {
      return {
        html: `
    <h2>${title}</h2>
    <div class="frame-layout">
      <div class="frame-main">
        ${stepsHtml}
        ${screenshotHtml}
      </div>
      <aside class="frame-panel">
        <div class="panel-meta">${metaRowsHtml}</div>
        ${toolsHtml}
      </aside>
    </div>
    ${escalationHtml}
  `.trim(),
      };
    }

    return {
      html: `
    <h2>${title}</h2>
    <div class="frame-main frame-main--continuation">
      ${stepsHtml}
      ${screenshotHtml}
    </div>
    ${escalationHtml}
  `.trim(),
    };
  });
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
  const { escalations, mentionedNames } = collectSafetySlideData(catalog, matched, resolveRoleTokens);
  const escalationItems = escalations.map((e) => `<li>${escapeHtml(e)}</li>`).join("");
  const contactsHtml = renderSafetyContactsHtml(mentionedNames);

  return `
    <h2>Safety &amp; escalation</h2>
    <ul class="escalation-list">${escalationItems}</ul>
    ${contactsHtml}
  `.trim();
}

function collectSafetySlideData(
  catalog: Catalog,
  matched: MatchedActivity[],
  resolveRoleTokens: (text: string) => string,
): { escalations: string[]; mentionedNames: string[] } {
  const escalations = new Set<string>();
  const mentionedNames = new Set<string>();
  for (const { activity } of matched) {
    const raw = normalizeWhitespace(activity.escalation_path);
    escalations.add(resolveRoleTokens(raw));
    for (const name of mentionedRoleNames(catalog, raw)) {
      mentionedNames.add(name);
    }
  }
  return { escalations: [...escalations].sort(), mentionedNames: [...mentionedNames].sort() };
}

function renderSafetyContactsHtml(mentionedNames: string[]): string {
  if (mentionedNames.length === 0) return "";
  return `<p><strong>You may need to escalate to:</strong> ${mentionedNames.map((n) => escapeHtml(n)).join(", ")}</p>`;
}

// ---------------------------------------------------------------------------
// Round-4 crowding pass: safety/escalation pagination. role.venue_manager
// alone has 13 distinct escalation paths (one per matched activity, several
// full sentences) — comfortably more than one slide fits (see the
// deck-crowding-audit). Same estimate-then-paginate shape as the toolkit/
// timeline paginators above: every real escalation-list item renders at
// either 1 or 2 lines (calibrated against a real Playwright measurement of
// the venue_manager slide, which has one 98-char item at 1 line and every
// longer item at 2), so a conservative chars-per-line estimate decides the
// split. The "You may need to escalate to" contacts line — a short summary,
// not a per-item entry — only ever appears on the LAST page, mirroring how
// the activity slide's escalation footnote and toolkit's tools panel each
// appear once rather than repeating per page.
const SAFETY_LIST_ITEM_LINE_HEIGHT_PX = 22;
const SAFETY_LIST_ITEM_CHARS_PER_LINE = 95;
const SAFETY_LIST_ITEM_GAP_PX = 6.4;
// h2 + its hairline rule/margin, fixed regardless of content — the
// escalation list sits directly under the h2 with no intervening kicker.
const SAFETY_LIST_TOP_PX = 158;
// ul's own margin-bottom + the contacts <p>'s own margin-top — both
// default UA margins, which do NOT collapse here since .slide is a flex
// container (flex-item siblings' margins never collapse, unlike normal
// block flow) — see the deck-crowding-audit calibration notes.
const SAFETY_CONTACTS_GAP_PX = 34;
const SAFETY_SAFETY_MARGIN_PX = 40;
const SAFETY_PAGE_BUDGET_PX =
  ACTIVITY_VIEWPORT_HEIGHT_PX - SAFETY_LIST_TOP_PX - ACTIVITY_BOTTOM_PADDING_PX - SAFETY_SAFETY_MARGIN_PX;

function paginateSafetyEscalations(escalations: string[]): string[][] {
  const pages: string[][] = [];
  let current: string[] = [];
  let currentHeight = 0;
  for (const item of escalations) {
    const itemHeight = estimateWrappedLines(item, SAFETY_LIST_ITEM_CHARS_PER_LINE) * SAFETY_LIST_ITEM_LINE_HEIGHT_PX;
    const gap = current.length > 0 ? SAFETY_LIST_ITEM_GAP_PX : 0;
    if (current.length > 0 && currentHeight + gap + itemHeight > SAFETY_PAGE_BUDGET_PX) {
      pages.push(current);
      current = [item];
      currentHeight = itemHeight;
    } else {
      current.push(item);
      currentHeight += gap + itemHeight;
    }
  }
  if (current.length > 0) pages.push(current);

  // The true last page also carries the contacts line — peel the final
  // item off onto a new trailing page if adding it would overflow.
  if (pages.length > 0) {
    const contactsHeight = SAFETY_LIST_ITEM_LINE_HEIGHT_PX + SAFETY_CONTACTS_GAP_PX;
    while (pages.length > 0) {
      const last = pages[pages.length - 1];
      if (last.length <= 1) break;
      const lastHeight =
        last.reduce((sum, item) => sum + estimateWrappedLines(item, SAFETY_LIST_ITEM_CHARS_PER_LINE) * SAFETY_LIST_ITEM_LINE_HEIGHT_PX, 0) +
        (last.length - 1) * SAFETY_LIST_ITEM_GAP_PX;
      if (lastHeight + contactsHeight <= SAFETY_PAGE_BUDGET_PX) break;
      const moved = last.pop();
      if (moved === undefined) break;
      pages.push([moved]);
    }
  }
  return pages.length > 0 ? pages : [[]];
}

function renderSafetySlides(
  catalog: Catalog,
  matched: MatchedActivity[],
  resolveRoleTokens: (text: string) => string,
): SlideEntry[] {
  const { escalations, mentionedNames } = collectSafetySlideData(catalog, matched, resolveRoleTokens);
  const pages = paginateSafetyEscalations(escalations);
  if (pages.length <= 1) {
    return [{ html: renderSafetySlide(catalog, matched, resolveRoleTokens) }];
  }

  const total = pages.length;
  return pages.map((pageItems, i) => {
    const isLast = i === total - 1;
    const title = `Safety & escalation (${i + 1}/${total})`;
    const itemsHtml = pageItems.map((e) => `<li>${escapeHtml(e)}</li>`).join("");
    const contactsHtml = isLast ? renderSafetyContactsHtml(mentionedNames) : "";
    return {
      html: `
    <h2>${escapeHtml(title)}</h2>
    <ul class="escalation-list">${itemsHtml}</ul>
    ${contactsHtml}
  `.trim(),
    };
  });
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

// ---------------------------------------------------------------------------
// "Using the system" product tour — a visual, screen-by-screen how-to
// chapter, distinct from the per-activity procedure slides above (those
// teach a catalogued SOP; this teaches the app itself). Hand-curated per
// role against the REAL route tree in src/pages/ (same verification standard
// as PORTAL_PAGES above) and the actual screens each role's real login
// reaches — not every PORTAL_PAGES entry gets a tour step, and not every
// tour step's route is literally under the role's own portal (see the
// role.photographer note below).
//
// Order matters: each array is the sequence a new hire would actually walk,
// not alphabetical or route-tree order.
// ---------------------------------------------------------------------------

interface TourStep {
  /** Screenshot filename stem — training/screenshots/<role>/tour/<slug>.png. */
  slug: string;
  /** Plain "how to" caption — a visual tutorial line, not an SOP step. */
  caption: string;
}

const PRODUCT_TOUR: Record<string, TourStep[]> = {
  "role.coach": [
    {
      slug: "dashboard",
      caption:
        "This is your dashboard — today's schedule and quick links at a glance. While you're new, an onboarding checklist walks you through setup here too; it disappears once every task is done.",
    },
    {
      slug: "teams",
      caption: "My teams — every team you coach this season. Tap one to open its roster.",
    },
    {
      slug: "roster",
      caption: "Team roster — every player on your team. Tap a name to open their card.",
    },
    {
      slug: "attendance",
      caption:
        "Attendance — mark who showed up for today's practice or game, one tap per player.",
    },
    {
      slug: "assess-player",
      caption:
        "Tap a player to open their card, then record a skill assessment on a 1–5 scale.",
    },
    {
      slug: "practices",
      caption:
        "Practice sessions — your planned sessions and how far along your curriculum sequence is.",
    },
    {
      slug: "resources",
      caption: "Coaching resources — sport guides and skill minibooks to help you plan and teach.",
    },
    {
      slug: "messages",
      caption: "Messages — send an update straight to your team's families.",
    },
  ],
  "role.ref": [
    {
      slug: "my-matches",
      caption: "My matches — every match assigned to you today. This is where your day starts.",
    },
    {
      slug: "match-detail",
      caption: "Open a match to get the live score entry and incident log for that game.",
    },
    {
      slug: "enter-score",
      caption: "Enter the score — type the running score for each team as the match plays out.",
    },
    {
      slug: "log-incident",
      caption:
        "Log an incident — record a card or ejection with the minute and a short note.",
    },
    {
      slug: "submit-report",
      caption: "Submit the report — file the final score and incidents once the match ends.",
    },
  ],
  "role.venue_manager": [
    {
      slug: "command-center",
      caption: "Venue command center — today's full event-day run-of-show in one view.",
    },
    {
      slug: "check-in",
      caption: "Check-in station — check players and teams in as they arrive.",
    },
    {
      slug: "walk-up",
      caption:
        "Walk-up registration — register and collect payment from a family that shows up without registering ahead.",
    },
  ],
  "role.director": [
    {
      slug: "applications",
      caption: "Applications — review coach and staff applicants and mark them hired.",
    },
    {
      slug: "coaches-credentials",
      caption: "Coach credentials — track SafeSport and background-check status for every coach.",
    },
    {
      slug: "curriculum",
      caption: "Curriculum — the skills, sequences, and templates every coach teaches from.",
    },
    {
      slug: "assessment-coverage",
      caption:
        "Assessment coverage — see which teams and players are falling behind on skill assessments.",
    },
  ],
  "role.photographer": [
    {
      slug: "my-jobs",
      caption: "My jobs — the shoots assigned to you, with date and location.",
    },
    {
      slug: "job-detail",
      caption: "Job detail — check in for the shoot and hand off your footage once it wraps.",
    },
    {
      slug: "tagging-queue",
      caption: "Tagging queue — sessions waiting to be tagged to the right players and teams.",
    },
    {
      slug: "tag-session",
      caption:
        "Tag a session — match each photo or clip to the players and teams in it before it publishes.",
    },
  ],
  "role.team_captain": [
    {
      slug: "team-page",
      caption:
        "Your team page — the link you share with teammates. It shows who's joined and their payment status.",
    },
  ],
};

// role.venue_manager's tour is copied into role.event_lead's own tour
// directory during screenshot capture (see training/walkthroughs' tour
// specs) — both roles run the exact same command-center/check-in/walk-up
// screens day-of, so role.event_lead reads the same PRODUCT_TOUR entry
// rather than duplicating the array.
PRODUCT_TOUR["role.event_lead"] = PRODUCT_TOUR["role.venue_manager"];

// Roles with genuinely no product surface — day-of work runs entirely off
// this deck's checklists, not a screen. A short honest note, not a silently
// missing chapter, so the omission reads as deliberate rather than an
// oversight.
const PRODUCT_TOUR_NO_SURFACE_NOTE: Record<string, string> = {
  "role.facilities":
    "You work off the checklists in this deck — there's no separate app screen for your day-of setup, field prep, and teardown work.",
};

function deriveTourStepLabel(slug: string): string {
  const words = slug.replace(/[-_]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function renderUsingSystemChapter(
  roleId: string,
  tourScreenshots: Map<string, string> | undefined,
): SlideEntry[] {
  const steps = PRODUCT_TOUR[roleId];
  if (steps && steps.length > 0) {
    const slides: SlideEntry[] = [
      renderDividerSlide(
        "Product tour",
        "Using the system",
        steps.map((s) => escapeHtml(deriveTourStepLabel(s.slug))),
      ),
    ];
    steps.forEach((step, i) => {
      slides.push({
        html: `
          <p class="slide-kicker tour-step-kicker">Using the system — step ${i + 1} of ${steps.length}</p>
          ${tourScreenshotSlotHtml(roleId, step.slug, tourScreenshots)}
          <p class="tour-caption">${escapeHtml(step.caption)}</p>
        `.trim(),
      });
    });
    return slides;
  }

  const note = PRODUCT_TOUR_NO_SURFACE_NOTE[roleId];
  if (note) {
    return [
      {
        html: `
          <h2>Using the system</h2>
          <p class="empty-note tour-empty-note">${escapeHtml(note)}</p>
        `.trim(),
      },
    ];
  }

  return [];
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
  /** "Using the system" product-tour screenshots — training/screenshots/<role>/tour/*.png,
   * keyed by slug (see PRODUCT_TOUR above). Deliberately separate from
   * `screenshots` (the per-activity slot), since a tour step and a catalog
   * activity are independent concepts. */
  tourScreenshots?: Map<string, string>;
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

  for (const slide of renderRoleToolkitSlides(matched)) {
    slides.push(slide);
  }

  for (const slide of renderRoleTimelineSlides(matched, resolveRoleTokens)) {
    slides.push(slide);
  }

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
      for (const slide of renderActivitySlides(roleId, activity, involvement, opts.screenshots, resolveRoleTokens)) {
        slides.push(slide);
      }
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

  for (const slide of renderSafetySlides(catalog, matched, resolveRoleTokens)) {
    slides.push(slide);
  }
  slides.push({ html: renderToolsSlide(roleId) });

  for (const usingSystemSlide of renderUsingSystemChapter(roleId, opts.tourScreenshots)) {
    slides.push(usingSystemSlide);
  }

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
