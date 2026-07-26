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
 * Usage:
 *   tsx scripts/generate-minibook-covers.ts --slug <minibook-slug> --pages <interior-page-count>
 *
 * Both flags are required. --pages is the interior page count reported by
 * `generate-minibook-pdfs.ts` for that slug (used for the spine-width formula
 * and the Lulu cover-dimensions API query).
 */
import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spineWidthInches } from "./pdf-profiles";

const OUT_DIR = resolve(process.cwd(), "pdfs/covers");
const DATA_DIR = resolve(process.cwd(), "src/data/minibooks");

// Lulu POD minimum page count for this package. Warn-only: a cover can still
// be generated for local proofing below this, only an actual Lulu order
// attempt should hard-fail on it.
const LULU_MIN_PAGES = 32;

// Sport color pairs, hardcoded here (this script runs outside the Astro/CSS
// pipeline) but sourced 1:1 from src/styles/print-guide.css's
// --{sport}-primary / --{sport}-dark custom properties.
const SPORT_COLORS: Record<string, { primary: string; dark: string }> = {
  soccer: { primary: "#16a34a", dark: "#14532d" },
  basketball: { primary: "#ea580c", dark: "#7c2d12" },
  hockey: { primary: "#2015B4", dark: "#1e1b4b" },
  baseball: { primary: "#F12524", dark: "#7f1d1d" },
};

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

async function logoDataUri(filename: string): Promise<string> {
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
  return { widthIn: 0.125 + 6 + spine + 6 + 0.125, heightIn: 9 + 2 * 0.125 };
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

function buildHtml(opts: {
  widthIn: number;
  heightIn: number;
  spineIn: number;
  title: string;
  subtitle: string;
  sport: string;
  showSpineText: boolean;
  frontLogo: string;
  backLogo: string;
}): string {
  const colors = SPORT_COLORS[opts.sport] ?? SPORT_COLORS.soccer;
  const backPanelW = 6.125; // 0.125in bleed + 6in trim
  const spineLeft = backPanelW;
  const frontLeft = backPanelW + opts.spineIn;

  const blurb =
    "Aspire Sports coaching guides turn evidence-based training science into simple, at-home " +
    "routines parents and coaches can run without a whistle or a playbook. Each mini-book distills " +
    "the research on skill acquisition into age-appropriate drills, so every rep at the park builds " +
    "toward real game intelligence. Built by coaches, backed by research, made for the driveway, the " +
    "backyard, and the ten minutes before practice.";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: ${opts.widthIn}in;
    height: ${opts.heightIn}in;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .cover-page { position: relative; width: ${opts.widthIn}in; height: ${opts.heightIn}in; overflow: hidden; }

  .panel { position: absolute; top: 0; height: ${opts.heightIn}in; }
  .panel-content { width: 100%; height: 100%; box-sizing: border-box; }

  .panel-back {
    left: 0; width: ${backPanelW}in;
    background: #ffffff;
  }
  .panel-back .panel-content {
    padding: 0.625in 0.5in 0.625in 0.625in; /* top right bottom left: right edge = spine seam */
    display: flex; flex-direction: column; justify-content: flex-end;
  }
  .panel-back .blurb {
    font-family: Georgia, "Source Serif 4", serif;
    font-size: 12pt; line-height: 1.55; color: #1a1a1a; max-width: 4.6in;
  }
  .panel-back .logo-row {
    display: flex; align-items: center; gap: 0.2in; margin-top: 0.4in;
  }
  .panel-back .logo-row img { height: 0.45in; width: auto; }
  .panel-back .domain {
    font-size: 10pt; letter-spacing: 0.02em; color: #444; font-weight: 600;
  }

  .panel-spine {
    left: ${spineLeft}in; width: ${opts.spineIn}in;
    background: linear-gradient(180deg, ${colors.primary}, ${colors.dark});
  }
  .panel-spine .spine-text {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(90deg);
    transform-origin: center;
    color: #ffffff; font-weight: 700; font-size: 13pt; white-space: nowrap;
    letter-spacing: 0.03em;
  }

  .panel-front {
    left: ${frontLeft}in; width: ${backPanelW}in;
    background: linear-gradient(135deg, ${colors.primary}, ${colors.dark});
  }
  .panel-front .panel-content {
    padding: 0.625in 0.625in 0.625in 0.5in; /* left edge = spine seam */
    display: flex; flex-direction: column; justify-content: space-between; color: #ffffff;
  }
  .panel-front .logo-chip {
    align-self: flex-start;
    background: #ffffff; border-radius: 0.08in;
    padding: 0.12in 0.22in;
    display: inline-flex; align-items: center;
  }
  .panel-front .logo-chip img { height: 0.5in; width: auto; display: block; }
  .panel-front .series {
    font-size: 10pt; letter-spacing: 0.08em; text-transform: uppercase;
    opacity: 0.85; margin-top: 0.35in;
  }
  .panel-front .title {
    font-size: 34pt; font-weight: 800; line-height: 1.08; margin-top: 0.12in;
  }
  .panel-front .subtitle {
    font-size: 14pt; font-weight: 500; margin-top: 0.22in; line-height: 1.35;
    opacity: 0.95; max-width: 4.6in;
  }
</style>
</head>
<body>
  <div class="cover-page">
    <div class="panel panel-back">
      <div class="panel-content">
        <div>
          <p class="blurb">${blurb}</p>
          <div class="logo-row">
            <img src="${opts.backLogo}" alt="Aspire Sports" />
            <span class="domain">aspiresportsohio.com</span>
          </div>
        </div>
      </div>
    </div>

    <div class="panel panel-spine">
      ${opts.showSpineText ? `<div class="spine-text">${escapeHtml(opts.title)}</div>` : ""}
    </div>

    <div class="panel panel-front">
      <div class="panel-content">
        <div class="logo-chip"><img src="${opts.frontLogo}" alt="Aspire Sports" /></div>
        <div>
          <div class="series">Evidence-Based Youth Development</div>
          <h1 class="title">${escapeHtml(opts.title)}</h1>
          <p class="subtitle">${escapeHtml(opts.subtitle)}</p>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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

  const spineIn = final.widthIn - 12.25; // back-solve spine from whichever width we're using

  const [frontLogo, backLogo] = await Promise.all([
    logoDataUri("logo-dark.svg"), // dark-ink variant, sits inside a white chip on the front cover
    logoDataUri("logo-dark.svg"), // same variant works directly on the back cover's white background
  ]);

  const html = buildHtml({
    widthIn: final.widthIn,
    heightIn: final.heightIn,
    spineIn,
    title: meta.title,
    subtitle: meta.subtitle,
    sport: meta.sport,
    showSpineText: pages >= 80,
    frontLogo,
    backLogo,
  });

  await mkdir(OUT_DIR, { recursive: true });
  const out = resolve(OUT_DIR, `${slug}-cover.pdf`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.pdf({
    path: out,
    width: `${final.widthIn}in`,
    height: `${final.heightIn}in`,
    printBackground: true,
    pageRanges: "1",
  });
  await browser.close();

  console.log(`done → ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
