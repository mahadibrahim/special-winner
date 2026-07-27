/**
 * Lulu wraparound cover generator for Aspire Sports minibooks.
 *
 * Renders a single-page PDF containing back cover + spine + front cover side
 * by side, sized to Lulu's 6x9in perfect-bound trim + bleed + spine-width
 * spec for the `0600X0900BWSTDPB060UW444MXX` POD package (same package id as
 * `src/lib/lulu/formats.ts`'s "6x9_bw"). See
 * docs/superpowers/specs/2026-07-26-minibook-lulu-covers-design.md for the
 * full dimension derivation and the formula-vs-Lulu-API discrepancy this
 * script accounts for.
 *
 * ART DIRECTION — "pitch geometry" (approved concept C, see
 * pdfs/covers/concepts/concept-c.html for the original comp): near-black
 * sport-tinted ground, oversized condensed white title with an accent kicker,
 * subtitle, author line, a measured ruler band, and a top-down tactical
 * surface diagram carrying a glowing numbered 5-node chain into the goal. The
 * whole thing is parameterized off `book.meta` (title / subtitle / sport /
 * skill) so all 15 minibooks render from the same template: the sport swaps
 * the ground tint, the accent, and the playing-surface geometry (pitch /
 * court / rink / diamond).
 *
 * Usage:
 *   tsx scripts/generate-minibook-covers.ts --slug <minibook-slug> --pages <interior-page-count>
 *
 * Both flags are required. --pages is the interior page count reported by
 * `generate-minibook-pdfs.ts` for that slug (used for the spine-width formula
 * and the Lulu cover-dimensions API query).
 *
 * Env:
 *   COVER_GUIDES=1  overlay trim / safe-margin / barcode-reserve guides on the
 *                   rendered PDF (proofing only — never for a real upload).
 */
import { chromium } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { spineWidthInches } from "./pdf-profiles";

const execFileAsync = promisify(execFile);

const OUT_DIR = resolve(process.cwd(), "pdfs/covers");
const PREVIEW_DIR = resolve(process.cwd(), "pdfs/covers/previews");
const DATA_DIR = resolve(process.cwd(), "src/data/minibooks");

// Lulu POD minimum page count for this package. Warn-only: a cover can still
// be generated for local proofing below this, only an actual Lulu order
// attempt should hard-fail on it.
const LULU_MIN_PAGES = 32;

// Lulu's own guidance: spine text is unreliable/illegible below 80 pages on a
// 6x9 trade paperback, so the spine stays flat color under that.
const SPINE_TEXT_MIN_PAGES = 80;

/* ------------------------------------------------------------------ *
 * Geometry. All art/type coordinates below are "design px" at 300dpi
 * on a 6x9in TRIM canvas (1800 x 2700), which is the coordinate space
 * concept-c.html was drawn in — so the approved comp ports over 1:1.
 * `u()` converts design px to CSS inches, which is what actually gets
 * emitted (resolution-independent, so the PDF is vector).
 * ------------------------------------------------------------------ */
const DPI = 300;
const TRIM_W_IN = 6;
const TRIM_H_IN = 9;
const BLEED_IN = 0.125;
const SAFE_IN = 0.5;

const CANVAS_W = TRIM_W_IN * DPI; // 1800
const CANVAS_H = TRIM_H_IN * DPI; // 2700
const SAFE = SAFE_IN * DPI; // 150
const SAFE_R = CANVAS_W - SAFE; // 1650
const SAFE_B = CANVAS_H - SAFE; // 2550

/** Panel width for both the back and the front: 6in trim + 0.125in outer bleed. */
const PANEL_W_IN = TRIM_W_IN + BLEED_IN;

/** Barcode / ISBN reserve: 2.0 x 1.2in at the bottom-right of the back panel,
 *  inside the safe margins. Nothing is drawn here (no placeholder box) — the
 *  back cover's composition simply keeps clear of it. */
const BARCODE_W = 2.0 * DPI; // 600
const BARCODE_H = 1.2 * DPI; // 360
const BARCODE_X = SAFE_R - BARCODE_W; // 1050
const BARCODE_Y = SAFE_B - BARCODE_H; // 2190

/** Front cover vertical rhythm (design px on the trim canvas). */
const FRONT = {
  topRowY: SAFE, // logo + kicker
  titleTop: 352,
  titleBottomMax: 1230,
  subtitleTop: 1290,
  authorTop: 1400,
  rulerY: 1490,
  /** Target box for the tactical surface + chain. */
  surface: { x: SAFE, y: 1560, w: CANVAS_W - 2 * SAFE, h: 880 },
} as const;

/** Back cover: quieter echo of the same diagram, then the copy stack. */
const BACK = {
  topRowY: SAFE,
  echo: { x: 225, y: 400, w: 1350, h: 828 },
  copyTop: 1330,
  copyWidth: 1300,
} as const;

const u = (px: number): string => `${(px / DPI).toFixed(4)}in`;
/** design px -> CSS px (96/in), for the in-page auto-fit math. */
const cssPx = (px: number): number => Math.round((px / DPI) * 96 * 1000) / 1000;
const r3 = (n: number): number => Math.round(n * 1000) / 1000;

/* ------------------------------------------------------------------ *
 * Sport theming
 * ------------------------------------------------------------------ */

interface Theme {
  /** Brand primary / dark, sourced 1:1 from src/styles/print-guide.css's
   *  --{sport}-primary / --{sport}-dark custom properties. */
  primary: string;
  dark: string;
  /** Bright companion accent for the diagram + kickers (soccer's is the
   *  acid green from the approved comp). */
  accent: string;
  /** Near-black sport-tinted ground stops, top -> bottom. */
  ground: [string, string, string];
  /** Flat dark spine color — reads as a seam between the two dark panels. */
  spine: string;
  /** rgb triplet of `primary`, for the ground's radial glow. */
  glow: string;
  /** Ink used inside the chain nodes (matches the local ground). */
  nodeFill: string;
}

const SPORT_THEMES: Record<string, Theme> = {
  soccer: {
    primary: "#16a34a",
    dark: "#14532d",
    accent: "#d4ff3f",
    ground: ["#08190f", "#051009", "#020604"],
    spine: "#0d3a21",
    glow: "22,163,74",
    nodeFill: "#03100a",
  },
  basketball: {
    primary: "#ea580c",
    dark: "#7c2d12",
    accent: "#ffc23d",
    ground: ["#1c0c05", "#120703", "#060201"],
    spine: "#5e2210",
    glow: "234,88,12",
    nodeFill: "#150803",
  },
  hockey: {
    primary: "#2015B4",
    dark: "#1e1b4b",
    accent: "#4ecbff",
    ground: ["#0b0a20", "#07061a", "#030209"],
    spine: "#191645",
    glow: "32,21,180",
    nodeFill: "#05041a",
  },
  baseball: {
    primary: "#F12524",
    dark: "#7f1d1d",
    accent: "#ffb03d",
    ground: ["#1d0808", "#140505", "#070202"],
    spine: "#5f1616",
    glow: "241,37,36",
    nodeFill: "#160505",
  },
};

/* ------------------------------------------------------------------ *
 * Playing surfaces, all drawn in one canonical box so the same markup
 * can be re-fitted anywhere (big on the front, small + quiet on the
 * back) by a single SVG transform. Stroke/fill styling comes from the
 * wrapping <g>; `__DOTS__` is replaced with the per-panel pattern id.
 * ------------------------------------------------------------------ */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const CANON: Box = { x: 150, y: 1520, w: 1500, h: 920 };

const SURFACES: Record<string, string> = {
  // Vertically-oriented pitch (attacking up) abstracted into a landscape
  // frame — verbatim from concept-c.html.
  soccer: `
    <rect x="150" y="1520" width="1500" height="920" fill="url(#__DOTS__)" stroke="none"/>
    <rect x="150" y="1520" width="1500" height="920"/>
    <line x1="150" y1="1980" x2="1650" y2="1980"/>
    <circle cx="900" cy="1980" r="190"/>
    <rect x="600" y="1520" width="600" height="196"/>
    <rect x="600" y="2244" width="600" height="196"/>
    <rect x="762" y="1520" width="276" height="86"/>
    <rect x="762" y="2354" width="276" height="86"/>
    <circle cx="900" cy="1980" r="9" fill="#ffffff" fill-opacity=".3" stroke="none"/>`,
  // Full court, baskets at top and bottom center.
  basketball: `
    <rect x="150" y="1520" width="1500" height="920" fill="url(#__DOTS__)" stroke="none"/>
    <rect x="150" y="1520" width="1500" height="920"/>
    <line x1="150" y1="1980" x2="1650" y2="1980"/>
    <circle cx="900" cy="1980" r="120"/>
    <rect x="750" y="1520" width="300" height="230"/>
    <rect x="750" y="2210" width="300" height="230"/>
    <circle cx="900" cy="1750" r="120"/>
    <circle cx="900" cy="2210" r="120"/>
    <path d="M240 1520 L240 1700 Q900 1912 1560 1700 L1560 1520"/>
    <path d="M240 2440 L240 2260 Q900 2048 1560 2260 L1560 2440"/>
    <line x1="838" y1="1558" x2="962" y2="1558"/>
    <line x1="838" y1="2402" x2="962" y2="2402"/>
    <circle cx="900" cy="1584" r="21"/>
    <circle cx="900" cy="2376" r="21"/>
    <circle cx="900" cy="1980" r="9" fill="#ffffff" fill-opacity=".3" stroke="none"/>`,
  // Rink with rounded boards, nets behind the goal lines top and bottom.
  hockey: `
    <rect x="150" y="1520" width="1500" height="920" rx="200" ry="200" fill="url(#__DOTS__)" stroke="none"/>
    <rect x="150" y="1520" width="1500" height="920" rx="200" ry="200"/>
    <line x1="150" y1="1980" x2="1650" y2="1980"/>
    <line x1="176" y1="1800" x2="1624" y2="1800"/>
    <line x1="176" y1="2160" x2="1624" y2="2160"/>
    <line x1="180" y1="1620" x2="1620" y2="1620"/>
    <line x1="180" y1="2340" x2="1620" y2="2340"/>
    <circle cx="900" cy="1980" r="130"/>
    <circle cx="452" cy="1762" r="110"/>
    <circle cx="1348" cy="1762" r="110"/>
    <circle cx="452" cy="2198" r="110"/>
    <circle cx="1348" cy="2198" r="110"/>
    <path d="M838 1620 Q900 1704 962 1620"/>
    <path d="M838 2340 Q900 2256 962 2340"/>
    <rect x="855" y="1578" width="90" height="42"/>
    <rect x="855" y="2340" width="90" height="42"/>
    <circle cx="900" cy="1980" r="9" fill="#ffffff" fill-opacity=".3" stroke="none"/>`,
  // Infield diamond, home plate at bottom center, fence arcing across the top.
  baseball: `
    <rect x="150" y="1520" width="1500" height="920" fill="url(#__DOTS__)" stroke="none"/>
    <path d="M900 2356 L436 1892"/>
    <path d="M900 2356 L1364 1892"/>
    <path d="M436 1892 Q900 1556 1364 1892"/>
    <path d="M900 2318 L1160 2058 L900 1798 L640 2058 Z"/>
    <circle cx="900" cy="2058" r="56"/>
    <path d="M690 2168 Q900 2016 1110 2168"/>
    <circle cx="900" cy="2318" r="10" fill="#ffffff" fill-opacity=".3" stroke="none"/>`,
};

/** The 5-node chain, in canonical coordinates (from concept-c.html). */
const CHAIN_D = "M330 2350 L650 2246 L556 2032 L980 1900 L1300 1736 L1012 1608";
const CHAIN_NODES: Array<[number, number]> = [
  [330, 2350],
  [650, 2246],
  [556, 2032],
  [980, 1900],
  [1300, 1736],
];
const CHAIN_LABELS: Array<[number, number, string]> = [
  [266, 2418, "01"],
  [586, 2314, "02"],
  [492, 2100, "03"],
  [916, 1968, "04"],
  [1236, 1804, "05"],
];
const SUPPORT_LINES = [
  "M330 2350 L636 2412",
  "M650 2246 L946 2318",
  "M556 2032 L296 1938",
  "M980 1900 L1348 2024",
  "M1300 1736 L1528 1864",
  "M980 1900 L1188 2196",
  "M1300 1736 L1074 1900",
];
const DIRECTION_TICKS = [
  "M476 2302 L512 2290",
  "M610 2150 L596 2120",
  "M748 1972 L790 1959",
  "M1122 1827 L1158 1809",
  "M1174 1680 L1138 1664",
];

/** Uniform-scale + center-in-target transform from the canonical box. Uniform
 *  so circles stay circles and label glyphs stay unsquashed. */
function fitCanon(target: Box): string {
  const s = Math.min(target.w / CANON.w, target.h / CANON.h);
  const tx = target.x + (target.w - CANON.w * s) / 2 - CANON.x * s;
  const ty = target.y - CANON.y * s;
  return `translate(${r3(tx)},${r3(ty)}) scale(${r3(s)})`;
}

interface ChainOpts {
  ids: string;
  theme: Theme;
  /** Full front-cover treatment: glow, arrows, supports, numbers, annotations. */
  full: boolean;
  laneWidth: number;
  laneOpacity: number;
  nodeR: number;
  surfaceOpacity: number;
  surfaceWidth: number;
  labels: { mid: string; end: string };
}

function diagramSvg(sport: string, target: Box, o: ChainOpts): string {
  const t = o.theme;
  const surface = (SURFACES[sport] ?? SURFACES.soccer).replace(/__DOTS__/g, `dots-${o.ids}`);

  const supports = o.full
    ? `<g stroke="#ffffff" stroke-opacity=".24" stroke-width="4" stroke-dasharray="18 22" fill="none">
         ${SUPPORT_LINES.map((d) => `<path d="${d}"/>`).join("")}
       </g>`
    : "";

  const glow = o.full
    ? `<path d="${CHAIN_D}" stroke-opacity=".34" stroke-width="34" stroke-linejoin="round" filter="url(#soft-${o.ids})"/>`
    : "";

  const ticks = o.full
    ? `<g stroke="${t.accent}" stroke-width="7" fill="none" marker-end="url(#arrow-${o.ids})">
         ${DIRECTION_TICKS.map((d) => `<path d="${d}"/>`).join("")}
       </g>
       <path d="M584 2096 A 70 70 0 0 1 623 2011" fill="none" stroke="${t.accent}"
             stroke-opacity=".55" stroke-width="3"/>`
    : "";

  const nodeRing = CHAIN_NODES.map(
    ([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${o.nodeR}"/>`,
  ).join("");
  const nodeCore = CHAIN_NODES.map(
    ([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${Math.round(o.nodeR * 0.37)}"/>`,
  ).join("");

  const terminal = o.full
    ? `<circle cx="1012" cy="1608" r="74" fill="${t.accent}" opacity=".22" filter="url(#soft-${o.ids})"/>
       <circle cx="1012" cy="1608" r="42" fill="#ffffff"/>`
    : `<circle cx="1012" cy="1608" r="22" fill="#ffffff" fill-opacity=".55"/>`;

  const labels = o.full
    ? `<g fill="#ffffff" fill-opacity=".72" font-family="Inter" font-size="26" font-weight="700" letter-spacing="4">
         ${CHAIN_LABELS.map(([x, y, s]) => `<text x="${x}" y="${y}">${s}</text>`).join("")}
       </g>
       <g stroke="${t.accent}" stroke-opacity=".6" stroke-width="3" fill="none">
         <path d="M592 2030 L760 2030"/>
         <path d="M1338 1718 L1430 1670"/>
       </g>
       <g fill="${t.accent}" font-family="Inter" font-size="26" font-weight="800" letter-spacing="5">
         <text x="774" y="2040">${escapeHtml(o.labels.mid)}</text>
         <text x="1442" y="1662">${escapeHtml(o.labels.end)}</text>
       </g>`
    : "";

  return `<g transform="${fitCanon(target)}">
    <g stroke="#ffffff" fill="none" stroke-opacity="${o.surfaceOpacity}" stroke-width="${o.surfaceWidth}">
      ${surface}
    </g>
    ${supports}
    <g fill="none" stroke="${t.accent}">
      ${glow}
      <path d="${CHAIN_D}" stroke-width="${o.laneWidth}" stroke-opacity="${o.laneOpacity}" stroke-linejoin="round"/>
    </g>
    ${ticks}
    <g fill="${t.nodeFill}" stroke="${t.accent}" stroke-width="${o.full ? 7 : 4}" stroke-opacity="${o.laneOpacity}">
      ${nodeRing}
    </g>
    <g fill="${t.accent}" fill-opacity="${o.laneOpacity}">
      ${nodeCore}
    </g>
    ${terminal}
    ${labels}
  </g>`;
}

/** Shared <defs>: dot pattern, soft glow, arrowhead — id-suffixed per panel. */
function defsSvg(ids: string, accent: string, dotOpacity = 0.14): string {
  return `<defs>
    <pattern id="dots-${ids}" width="60" height="60" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="2.4" fill="#ffffff" fill-opacity="${dotOpacity}"/>
    </pattern>
    <filter id="soft-${ids}" x="-70%" y="-70%" width="240%" height="240%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
    <marker id="arrow-${ids}" viewBox="0 0 12 12" refX="8" refY="6" markerWidth="6" markerHeight="6"
            orient="auto-start-reverse">
      <path d="M1 1 L11 6 L1 11 z" fill="${accent}"/>
    </marker>
  </defs>`;
}

/** Measured ruler band above the diagram — ticks descend toward the surface. */
function rulerSvg(accent: string): string {
  const ticks: string[] = [];
  for (let i = 0; i < 13; i++) {
    const x = SAFE + i * 120;
    const len = i % 3 === 0 ? 34 : 18;
    ticks.push(`<line x1="${x}" y1="${FRONT.rulerY}" x2="${x}" y2="${FRONT.rulerY + len}"/>`);
  }
  return `<g stroke="${accent}" stroke-width="3">
    <line x1="${SAFE}" y1="${FRONT.rulerY}" x2="${SAFE_R}" y2="${FRONT.rulerY}" stroke-opacity=".26"/>
    <g stroke-opacity=".6">${ticks.join("")}</g>
  </g>`;
}

/* ------------------------------------------------------------------ *
 * CLI + data
 * ------------------------------------------------------------------ */

interface Args {
  slug: string;
  pages: number;
}

function parseArgs(argv: string[]): Args {
  let slug: string | null = null;
  let pages: number | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slug" && argv[i + 1]) {
      slug = argv[i + 1];
      i++;
    } else if (argv[i] === "--pages" && argv[i + 1]) {
      pages = parseInt(argv[i + 1], 10);
      i++;
    }
  }
  if (!slug || pages == null || Number.isNaN(pages)) {
    console.error(
      "usage: tsx scripts/generate-minibook-covers.ts --slug <minibook-slug> --pages <interior-page-count>\n" +
        "  both --slug and --pages are required.",
    );
    process.exit(64);
  }
  return { slug, pages };
}

interface BookMeta {
  title: string;
  subtitle: string;
  sport: string;
  skill?: string;
}

/**
 * Load the same book data object src/pages/minibooks/<slug>.astro imports
 * (e.g. `import { passingMiniBook } from '../../data/minibooks/soccer-passing'`)
 * — each src/data/minibooks/<slug>.ts file has exactly one named export, so
 * we don't need to know that export's name ahead of time.
 */
async function loadBookMeta(slug: string): Promise<BookMeta> {
  const path = resolve(DATA_DIR, `${slug}.ts`);
  let mod: Record<string, unknown>;
  try {
    mod = await import(pathToFileURL(path).href);
  } catch (err) {
    throw new Error(
      `no minibook data found for slug "${slug}" (expected ${path}): ${(err as Error).message}`,
    );
  }
  const book = Object.values(mod)[0] as { meta?: BookMeta } | undefined;
  if (!book?.meta?.title || !book.meta.sport) {
    throw new Error(`${path} did not export a book object with a .meta.{title,subtitle,sport}`);
  }
  return book.meta;
}

async function svgDataUri(filename: string): Promise<string> {
  const path = resolve(process.cwd(), "public/images", filename);
  const buf = await readFile(path);
  const mime = filename.endsWith(".svg") ? "image/svg+xml" : "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

interface Dims {
  widthIn: number;
  heightIn: number;
}

function formulaDims(pages: number): Dims {
  const spine = spineWidthInches(pages);
  return {
    widthIn: BLEED_IN + TRIM_W_IN + spine + TRIM_W_IN + BLEED_IN,
    heightIn: TRIM_H_IN + 2 * BLEED_IN,
  };
}

/**
 * Query Lulu's cover-dimensions calculator, if sandbox/live creds are
 * configured. Returns null (never throws) on any failure — this check is
 * advisory, not a build dependency.
 */
async function luluApiDims(pages: number): Promise<Dims | null> {
  const key = process.env.LULU_CLIENT_KEY;
  const secret = process.env.LULU_CLIENT_SECRET;
  const base = process.env.LULU_API_BASE ?? "https://api.lulu.com";
  if (!key || !secret) return null;

  try {
    const tokenRes = await fetch(`${base}/auth/realms/glasstree/protocol/openid-connect/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });
    const tokenJson = (await tokenRes.json().catch(() => null)) as { access_token?: string } | null;
    if (!tokenRes.ok || !tokenJson?.access_token) return null;

    const dimRes = await fetch(`${base}/cover-dimensions/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pod_package_id: "0600X0900BWSTDPB060UW444MXX",
        interior_page_count: pages,
      }),
    });
    const dimJson = (await dimRes.json().catch(() => null)) as
      | { width?: string; height?: string; unit?: string }
      | null;
    if (!dimRes.ok || !dimJson?.width || !dimJson.height) return null;

    const toIn = (v: string): number => {
      const n = parseFloat(v);
      return dimJson.unit === "pt" ? n / 72 : n; // API has only ever been observed to return "pt"
    };
    return { widthIn: toIn(dimJson.width), heightIn: toIn(dimJson.height) };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Type composition
 * ------------------------------------------------------------------ */

/**
 * Break the title into the stacked, measure-filling lines concept C is built
 * around. Every minibook is titled "The Path to Better <Skill>", which sets
 * up "THE PATH TO / BETTER / <SKILL WORDS...>" (one word per line, so the
 * skill reads as the loudest thing on the cover). Anything that doesn't match
 * falls back to a greedy wrap so an off-pattern title still composes.
 */
function titleLines(title: string): string[] {
  const m = title.match(/^(.*?\bbetter)\s+(.+)$/i);
  if (m) {
    const lead = m[1].trim().split(/\s+/);
    const last = lead.pop() as string; // "Better"
    return [lead.join(" "), last, ...m[2].trim().split(/\s+/)].filter(Boolean);
  }
  const words = title.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > 12) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function titleCase(s: string): string {
  return s.replace(/[-_]+/g, " ").trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------------ *
 * The cover document
 * ------------------------------------------------------------------ */

interface BuildOpts {
  widthIn: number;
  heightIn: number;
  spineIn: number;
  title: string;
  subtitle: string;
  sport: string;
  skill: string;
  author: string;
  showSpineText: boolean;
  logo: string;
  guides: boolean;
}

const BLURB =
  "Aspire Sports coaching guides turn evidence-based training science into simple, at-home " +
  "routines parents and coaches can run without a whistle or a playbook. Each mini-book distills " +
  "the research on skill acquisition into age-appropriate drills, so every rep at the park builds " +
  "toward real game intelligence. Built by coaches, backed by research, made for the driveway, the " +
  "backyard, and the ten minutes before practice.";

function buildHtml(o: BuildOpts): string {
  const t = SPORT_THEMES[o.sport] ?? SPORT_THEMES.soccer;
  const backLeft = 0;
  const spineLeft = PANEL_W_IN;
  const frontLeft = PANEL_W_IN + o.spineIn;

  const lines = titleLines(o.title);
  const isPassing = /pass/i.test(o.skill) || /pass/i.test(o.title);
  const diagramLabels = {
    mid: isPassing ? "SCAN → RECEIVE" : "SCAN → DECIDE",
    end: "RELEASE",
  };
  const laneLabel = isPassing ? "Pass lane" : "Primary lane";

  const ground = `radial-gradient(${u(1300)} ${u(1000)} at 56% 62%, rgba(${t.glow},.24), transparent 70%),
      linear-gradient(180deg, ${t.ground[0]} 0%, ${t.ground[1]} 52%, ${t.ground[2]} 100%)`;
  const backGround = `radial-gradient(${u(1100)} ${u(900)} at 22% 24%, rgba(${t.glow},.16), transparent 72%),
      linear-gradient(200deg, ${t.ground[1]} 0%, ${t.ground[2]} 74%)`;

  const guides = o.guides
    ? `<div class="guide" style="left:${u(0)};top:${u(0)};width:${u(CANVAS_W)};height:${u(CANVAS_H)}"></div>
       <div class="guide safe" style="left:${u(SAFE)};top:${u(SAFE)};width:${u(CANVAS_W - 2 * SAFE)};height:${u(CANVAS_H - 2 * SAFE)}"></div>`
    : "";
  const barcodeGuide = o.guides
    ? `<div class="guide barcode" style="left:${u(BARCODE_X)};top:${u(BARCODE_Y)};width:${u(BARCODE_W)};height:${u(BARCODE_H)}"></div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(o.title)} — cover</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Inter+Tight:wght@600;700;800;900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: ${o.widthIn}in; height: ${o.heightIn}in; background: #000;
    font-family: 'Inter Tight', 'Inter', system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .cover-page { position: relative; width: ${o.widthIn}in; height: ${o.heightIn}in; overflow: hidden; }
  .panel { position: absolute; top: 0; height: ${o.heightIn}in; overflow: hidden; }
  /* The 6x9in trim box inside a panel; all type/art is laid out in here. */
  .trim { position: absolute; top: ${BLEED_IN}in; width: ${TRIM_W_IN}in; height: ${TRIM_H_IN}in; }
  .trim > svg { position: absolute; left: 0; top: 0; width: ${TRIM_W_IN}in; height: ${TRIM_H_IN}in; }
  .grain {
    position: absolute; inset: 0; mix-blend-mode: overlay; opacity: .16;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/></filter><rect width='300' height='300' filter='url(%23n)' opacity='0.5'/></svg>");
    background-size: 1in 1in;
  }
  .dotfield {
    position: absolute; inset: 0;
    background-image: radial-gradient(circle at 10% 10%, rgba(255,255,255,.10) ${u(2.4)}, transparent ${u(3)});
    background-size: ${u(60)} ${u(60)};
    opacity: .5;
  }

  /* ---------------- back panel ---------------- */
  .panel-back { left: ${backLeft}in; width: ${PANEL_W_IN}in; background: ${backGround}; }
  .panel-back .trim { left: ${BLEED_IN}in; }

  /* ---------------- spine ---------------- */
  .panel-spine { left: ${spineLeft}in; width: ${o.spineIn}in; background: ${t.spine}; }
  .panel-spine .spine-text {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(90deg); transform-origin: center;
    color: #fff; font-weight: 700; font-size: ${u(58)}; white-space: nowrap; letter-spacing: .04em;
    text-transform: uppercase;
  }

  /* ---------------- front panel ---------------- */
  .panel-front { left: ${frontLeft}in; width: ${PANEL_W_IN}in; background: ${ground}; }
  .panel-front .trim { left: 0; } /* left edge of the front trim IS the spine seam */

  .row {
    position: absolute; left: ${u(SAFE)}; right: ${u(SAFE)};
    display: flex; justify-content: space-between; align-items: flex-start;
  }
  .logo { width: ${u(270)}; display: block; }
  .logo-sm { width: ${u(232)}; display: block; }
  .kicker {
    font-family: 'Inter'; font-weight: 700; font-size: ${u(26)}; letter-spacing: .28em;
    text-transform: uppercase; color: ${t.accent}; text-align: right; line-height: 1.6;
  }
  .kicker span { display: block; color: rgba(255,255,255,.45); }

  .title {
    position: absolute; left: ${u(SAFE)}; top: ${u(FRONT.titleTop)}; width: ${u(CANVAS_W - 2 * SAFE)};
    color: #fff; text-transform: uppercase; font-weight: 900; letter-spacing: -.04em;
  }
  .title .eb {
    display: block; font-family: 'Inter'; font-weight: 800; font-size: ${u(46)};
    letter-spacing: .3em; color: ${t.accent}; margin-bottom: ${u(36)};
  }
  /* line-height:0 kills the strut, so each line box is exactly the fitted
     glyph line — which is what the auto-fit's vertical budget assumes. */
  .title .ln { display: block; line-height: 0; }
  .title .ln > span { display: inline-block; line-height: .84; white-space: nowrap; }

  .subtitle {
    position: absolute; left: ${u(SAFE)}; top: ${u(FRONT.subtitleTop)}; width: ${u(CANVAS_W - 2 * SAFE)};
    font-family: 'Inter'; font-weight: 600; font-size: ${u(52)}; line-height: 1.2; color: rgba(255,255,255,.9);
  }
  .author {
    position: absolute; left: ${u(SAFE)}; top: ${u(FRONT.authorTop)};
    display: flex; align-items: center; gap: ${u(22)};
    font-family: 'Inter'; font-weight: 800; font-size: ${u(30)}; letter-spacing: .26em;
    text-transform: uppercase; color: rgba(255,255,255,.62);
  }
  .author i { display: block; width: ${u(64)}; height: ${u(5)}; background: ${t.accent}; opacity: .85; }

  .foot {
    position: absolute; left: ${u(SAFE)}; right: ${u(SAFE)}; bottom: ${u(SAFE)};
    display: flex; justify-content: space-between; align-items: flex-end;
    font-family: 'Inter'; font-weight: 700; font-size: ${u(25)}; letter-spacing: .24em;
    text-transform: uppercase; color: rgba(255,255,255,.52);
  }
  .legend { display: flex; gap: ${u(60)}; align-items: center; }
  .legend i { display: inline-block; width: ${u(54)}; height: 0; vertical-align: middle; margin-right: ${u(16)}; }
  .legend .a { border-top: ${u(7)} solid ${t.accent}; }
  .legend .b { border-top: ${u(4)} dashed rgba(255,255,255,.55); }

  /* ---------------- back copy ---------------- */
  .back-copy { position: absolute; left: ${u(SAFE)}; top: ${u(BACK.copyTop)}; width: ${u(BACK.copyWidth)}; }
  .back-copy h2 {
    font-size: ${u(68)}; font-weight: 900; line-height: 1.06; letter-spacing: -.03em;
    text-transform: uppercase; color: #fff;
  }
  .back-copy .rule { width: ${u(220)}; height: ${u(5)}; background: ${t.accent}; opacity: .8; margin: ${u(38)} 0 ${u(36)}; }
  .back-copy p {
    font-family: 'Inter'; font-weight: 400; font-size: ${u(45)}; line-height: 1.62;
    color: rgba(255,255,255,.84);
  }
  .back-foot { position: absolute; left: ${u(SAFE)}; bottom: ${u(SAFE)}; }
  .back-foot .by {
    font-family: 'Inter'; font-weight: 800; font-size: ${u(28)}; letter-spacing: .26em;
    text-transform: uppercase; color: rgba(255,255,255,.62); margin-bottom: ${u(44)};
  }
  .back-foot .mark { display: flex; align-items: center; gap: ${u(34)}; }
  .back-foot .domain {
    font-family: 'Inter'; font-weight: 700; font-size: ${u(25)}; letter-spacing: .24em;
    text-transform: uppercase; color: rgba(255,255,255,.52);
  }

  .guide { position: absolute; outline: ${u(3)} solid rgba(255,0,255,.85); }
  .guide.safe { outline-color: rgba(0,255,255,.8); }
  .guide.barcode { outline-color: rgba(255,120,0,.95); }
</style>
</head>
<body>
  <div class="cover-page">

    <!-- ============================ BACK ============================ -->
    <div class="panel panel-back">
      <div class="dotfield"></div>
      <div class="grain"></div>
      <div class="trim">
        <svg viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
          ${defsSvg("b", t.accent, 0.05)}
          ${diagramSvg(o.sport, BACK.echo, {
            ids: "b",
            theme: t,
            full: false,
            laneWidth: 6,
            laneOpacity: 0.42,
            nodeR: 18,
            surfaceOpacity: 0.13,
            surfaceWidth: 3,
            labels: diagramLabels,
          })}
        </svg>
        <div class="row" style="top:${u(BACK.topRowY)}">
          <div class="kicker" style="text-align:left">Evidence-Based<span>Youth Development</span></div>
          <div class="kicker">${escapeHtml(o.sport)}<span>${escapeHtml(o.skill)} guide</span></div>
        </div>
        <div class="back-copy">
          <h2>${escapeHtml(o.title)}</h2>
          <div class="rule"></div>
          <p>${escapeHtml(BLURB)}</p>
        </div>
        <div class="back-foot">
          <div class="by">${escapeHtml(o.author)}</div>
          <div class="mark">
            <img class="logo-sm" src="${o.logo}" alt="Aspire Sports" />
            <span class="domain">aspiresportsohio.com</span>
          </div>
        </div>
        ${guides}
        ${barcodeGuide}
      </div>
    </div>

    <!-- ============================ SPINE =========================== -->
    <div class="panel panel-spine">
      ${o.showSpineText ? `<div class="spine-text">${escapeHtml(o.title)}</div>` : ""}
    </div>

    <!-- ============================ FRONT =========================== -->
    <div class="panel panel-front">
      <div class="grain"></div>
      <div class="trim">
        <svg viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" xmlns="http://www.w3.org/2000/svg">
          ${defsSvg("f", t.accent)}
          ${rulerSvg(t.accent)}
          ${diagramSvg(o.sport, FRONT.surface, {
            ids: "f",
            theme: t,
            full: true,
            laneWidth: 8,
            laneOpacity: 1,
            nodeR: 27,
            surfaceOpacity: 0.2,
            surfaceWidth: 3.5,
            labels: diagramLabels,
          })}
        </svg>

        <div class="row" style="top:${u(FRONT.topRowY)}">
          <img class="logo" src="${o.logo}" alt="Aspire Sports" />
          <div class="kicker">${escapeHtml(o.sport)}<span>${escapeHtml(o.skill)} guide</span></div>
        </div>

        <h1 class="title">
          <span class="eb">Evidence-Based Youth Development</span>
          ${lines.map((l) => `<span class="ln"><span>${escapeHtml(l)}</span></span>`).join("\n          ")}
        </h1>
        <div class="subtitle">${escapeHtml(o.subtitle)}</div>
        <div class="author"><i></i>${escapeHtml(o.author)}</div>

        <div class="foot">
          <div class="legend">
            <span><i class="a"></i>${escapeHtml(laneLabel)}</span>
            <span><i class="b"></i>Support option</span>
          </div>
          <div>aspiresportsohio.com</div>
        </div>
        ${guides}
      </div>
    </div>
  </div>

<script>
  // Fit each title line to the measure — the comp's signature move: every line
  // set flush to the same width, so line length alone sets the size. Then one
  // shared cap, solved against the block's vertical budget, keeps the stack in
  // its band: long lines still hit the measure exactly and only lines that
  // *want* to be huge (a short word like "BALL") get held back.
  window.__fitTitle = function () {
    var target = ${cssPx(CANVAS_W - 2 * SAFE)};
    var maxFs = ${cssPx(620)};
    var budget = ${cssPx(FRONT.titleBottomMax - FRONT.titleTop)};
    var ebMargin = ${cssPx(36)};
    var LH = 0.84; /* must match .title .ln > span line-height */
    var els = Array.prototype.slice.call(document.querySelectorAll('.title .ln > span'));
    var fits = els.map(function (el) {
      var fs = 100;
      el.style.fontSize = fs + 'px';
      for (var i = 0; i < 24; i++) {
        var w = el.getBoundingClientRect().width;
        if (!w) break;
        var next = Math.min(fs * target / w, maxFs);
        var done = Math.abs(next - fs) < 0.05;
        fs = next;
        el.style.fontSize = fs + 'px';
        if (done) break;
      }
      return fs;
    });
    var eb = document.querySelector('.title .eb');
    var avail = budget - (eb ? eb.getBoundingClientRect().height + ebMargin : 0);
    var room = avail / LH; /* total font-size the stack can spend */
    var spend = function (c) {
      return fits.reduce(function (a, f) { return a + Math.min(f, c); }, 0);
    };
    var cap = maxFs;
    if (spend(cap) > room) {
      var lo = 4, hi = maxFs;
      for (var k = 0; k < 60; k++) {
        var mid = (lo + hi) / 2;
        if (spend(mid) > room) { hi = mid; } else { lo = mid; }
      }
      cap = lo;
    }
    els.forEach(function (el, i) { el.style.fontSize = Math.min(fits[i], cap) + 'px'; });
    var block = document.querySelector('.title');
    return {
      sizes: els.map(function (el) { return Math.round(parseFloat(el.style.fontSize) / 0.32); }),
      // trim-relative design px (the block sits inside .trim, which is one bleed down)
      blockBottom: Math.round(block.getBoundingClientRect().bottom / 0.32 - ${BLEED_IN * DPI})
    };
  };
</script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ *
 * Preview rasterization (proofing aid — reads the real PDF back)
 * ------------------------------------------------------------------ */
async function writePreviews(
  pdfPath: string,
  slug: string,
  dims: Dims,
  spineIn: number,
): Promise<string[]> {
  const dpi = 100;
  const written: string[] = [];
  await mkdir(PREVIEW_DIR, { recursive: true });
  const fullBase = resolve(PREVIEW_DIR, `${slug}-cover-full`);
  const frontBase = resolve(PREVIEW_DIR, `${slug}-cover-front`);
  try {
    await execFileAsync("pdftoppm", ["-r", String(dpi), "-png", "-singlefile", pdfPath, fullBase]);
    written.push(`${fullBase}.png`);
    // Front panel only: crop from the spine seam to the outer bleed edge.
    const x = Math.round((PANEL_W_IN + spineIn) * dpi);
    const w = Math.round(PANEL_W_IN * dpi);
    const h = Math.round(dims.heightIn * dpi);
    await execFileAsync("pdftoppm", [
      "-r", String(dpi), "-png", "-singlefile",
      "-x", String(x), "-y", "0", "-W", String(w), "-H", String(h),
      pdfPath, frontBase,
    ]);
    written.push(`${frontBase}.png`);
  } catch (err) {
    console.warn(`warning: preview rasterization skipped (${(err as Error).message})`);
  }
  return written;
}

async function main() {
  const { slug, pages } = parseArgs(process.argv.slice(2));

  if (pages < LULU_MIN_PAGES) {
    console.warn(
      `warning: ${pages} pages is below Lulu's ${LULU_MIN_PAGES}-page minimum for the ` +
        `0600X0900BWSTDPB060UW444MXX package — fine for local proofing, but this interior ` +
        `can't be ordered from Lulu as-is.`,
    );
  }

  const meta = await loadBookMeta(slug);
  const formula = formulaDims(pages);
  const api = await luluApiDims(pages);

  console.log(`slug: ${slug}  pages: ${pages}  sport: ${meta.sport}`);
  console.log(
    `formula dims: ${formula.widthIn.toFixed(4)}in x ${formula.heightIn.toFixed(4)}in ` +
      `(spine ${spineWidthInches(pages).toFixed(4)}in)`,
  );
  let final: Dims;
  if (api) {
    const widthMatch = Math.abs(api.widthIn - formula.widthIn) <= 0.01;
    const heightMatch = Math.abs(api.heightIn - formula.heightIn) <= 0.01;
    console.log(
      `Lulu API dims: ${api.widthIn.toFixed(4)}in x ${api.heightIn.toFixed(4)}in ` +
        `— width match: ${widthMatch ? "yes" : "no"}, height match: ${heightMatch ? "yes" : "no"}`,
    );
    console.log("using Lulu API dims for the rendered cover (per design spec: prefer their numbers).");
    final = api;
  } else {
    console.log("Lulu API not queried (no LULU_CLIENT_KEY/SECRET, or the request failed) — using formula dims.");
    final = formula;
  }

  // Back-solve the spine band from whichever width we're using, so the two
  // 6.125in panels stay exactly on trim and Lulu's extra hinge allowance
  // (~0.069in, see design spec) lands in the spine band where it belongs.
  const spineIn = final.widthIn - 2 * PANEL_W_IN;

  const logo = await svgDataUri("logo.svg"); // light wordmark — both panels are dark grounds

  const skill = titleCase(meta.skill ?? meta.title.replace(/^.*\bbetter\s+/i, ""));
  const html = buildHtml({
    widthIn: final.widthIn,
    heightIn: final.heightIn,
    spineIn,
    title: meta.title,
    subtitle: meta.subtitle,
    sport: meta.sport,
    skill,
    author: "Mahad Ibrahim",
    showSpineText: pages >= SPINE_TEXT_MIN_PAGES,
    logo,
    guides: process.env.COVER_GUIDES === "1",
  });

  await mkdir(OUT_DIR, { recursive: true });
  const out = resolve(OUT_DIR, `${slug}-cover.pdf`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const fit = await page.evaluate(() => (window as unknown as { __fitTitle: () => unknown }).__fitTitle());
  await page.pdf({
    path: out,
    width: `${final.widthIn}in`,
    height: `${final.heightIn}in`,
    printBackground: true,
    pageRanges: "1",
  });
  await browser.close();

  console.log(
    `layout: spine ${spineIn.toFixed(4)}in  title lines ${JSON.stringify(fit)} ` +
      `(budget bottom ${FRONT.titleBottomMax} design px)`,
  );
  console.log(`done → ${out}`);

  const previews = await writePreviews(out, slug, final, spineIn);
  previews.forEach((p) => console.log(`preview → ${p}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
