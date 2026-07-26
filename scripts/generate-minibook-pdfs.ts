import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { countPdfPages, profileFor, resolveRunConfig, spineWidthInches } from "./pdf-profiles";

/**
 * Front matter (cover through table of contents) has its folio suppressed
 * entirely via CSS (`page: front-matter` + `@page front-matter { @bottom-center:
 * none }`). Content is meant to start numbering at 1 from the Part One
 * divider — but that requires resetting the browser's own automatic "page"
 * counter, and Chromium's print-to-PDF pipeline does not honor an author
 * `counter-reset` on it under any circumstances (verified empirically: it's
 * a native engine limitation, not something fixable in CSS). So instead:
 * the divider carries an invisible text marker (`.content-start::after` in
 * minibook.css), we find which physical page it landed on via `pdftotext`,
 * and we paint over Chromium's (wrong, absolute) folio on that page and
 * every page after it with the correct content-relative "1, 2, 3…".
 */
async function renumberContentPages(pdfPath: string): Promise<void> {
  const text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { encoding: "utf-8" });
  const pages = text.split("\f");
  const markerIndex = pages.findIndex((p) => p.includes("CONTENT-START-MARKER"));
  if (markerIndex === -1) {
    process.stdout.write(`  [warn] no content-start marker found — folios left as-is] `);
    return;
  }
  // The marker text (top: 0 / left: 0 inside .content-start) consistently
  // lands one physical page *before* the divider's own visible content —
  // verified by rendering: the marker's page still shows the tail of the
  // table of contents, and the actual "Part One" divider is the page right
  // after it. Chromium appears to attribute the pseudo-element to the page
  // where the forced break is decided rather than the page it lands on
  // after the break. Content numbering starts on the divider's real page,
  // one past the marker.
  const startIndex = markerIndex + 1;

  const bytes = await readFile(pdfPath);
  const pdfDoc = await PDFDocument.load(bytes);
  const font = await pdfDoc.embedFont(StandardFonts.Courier);
  const pdfPages = pdfDoc.getPages();

  // Matches --margin-bottom: 0.875in in minibook.css (the @page bottom
  // margin band Chromium draws the native folio inside of).
  const marginBottomPt = 0.875 * 72;
  const fontSize = 8;
  const inkMuted = rgb(0x8a / 255, 0x8a / 255, 0x8a / 255);

  for (let i = startIndex; i < pdfPages.length; i++) {
    const pdfPage = pdfPages[i];
    const { width } = pdfPage.getSize();
    const label = String(i - startIndex + 1);
    const textWidth = font.widthOfTextAtSize(label, fontSize);

    // Cover Chromium's own (absolute, wrong) folio for this page.
    pdfPage.drawRectangle({ x: 0, y: 0, width, height: marginBottomPt, color: rgb(1, 1, 1) });
    pdfPage.drawText(label, {
      x: (width - textWidth) / 2,
      y: marginBottomPt / 2 - fontSize / 2,
      size: fontSize,
      font,
      color: inkMuted,
    });
  }

  await writeFile(pdfPath, await pdfDoc.save());
}

const BASE_URL = process.env.MINIBOOK_BASE_URL ?? "http://localhost:4321";
const MINIBOOK_OUT_DIR = resolve(process.cwd(), "pdfs/minibooks");
const BOOK_OUT_DIR = resolve(process.cwd(), "pdfs/books");

const MINIBOOK_SLUGS = [
  "soccer-passing",
  "soccer-dribbling",
  "soccer-shooting",
  "soccer-defending",
  "soccer-game-intelligence",
  "basketball-ball-handling",
  "basketball-defending",
  "basketball-game-intelligence",
  "basketball-passing",
  "basketball-shooting",
  "hockey-defending",
  "hockey-passing",
  "hockey-shooting",
  "hockey-skating",
  "hockey-stickhandling",
];

// Parse CLI args and resolve configuration
const config = resolveRunConfig(process.argv.slice(2));
const profileName = config.profileName;
const bookSlug = config.bookSlug ?? null;
const userSlugs = config.userSlugs ?? null;

async function main() {
  // Validate profile
  const profile = profileFor(profileName);

  if (bookSlug) {
    // Book render mode
    await mkdir(BOOK_OUT_DIR, { recursive: true });

    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    const url = `${BASE_URL}/books/${bookSlug}`;
    const out = resolve(BOOK_OUT_DIR, `${bookSlug}-interior.pdf`);
    process.stdout.write(`→ book ${bookSlug} ... `);

    await page.goto(url, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });

    if (profile.waitForPaged) {
      await page.waitForFunction(() => (window as any).__pagedDone === true, {
        timeout: 120_000,
      });

      const pagedError = await page.evaluate(() => (window as any).__pagedError);
      if (pagedError) {
        throw new Error(`paged.js reported an error for book ${bookSlug}: ${pagedError}`);
      }
    }

    await page.pdf({
      path: out,
      ...profile.pdfOptions,
    });

    const pageCount = await page.evaluate(() => (window as any).__pagedPageCount ?? 0);
    process.stdout.write(`done → ${out}, pages: ${pageCount}, spine: ${spineWidthInches(pageCount).toFixed(4)}in\n`);

    await browser.close();
  } else {
    // Minibook render mode (default)
    const slugs = userSlugs ?? MINIBOOK_SLUGS;
    await mkdir(MINIBOOK_OUT_DIR, { recursive: true });

    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    for (const slug of slugs) {
      const url = `${BASE_URL}/minibooks/${slug}`;
      const out = resolve(MINIBOOK_OUT_DIR, `${slug}.pdf`);
      process.stdout.write(`→ ${slug} ... `);

      await page.goto(url, { waitUntil: "networkidle" });
      await page.emulateMedia({ media: "print" });

      // Unlike --book mode, minibook .astro pages have no paged.js step (no
      // `Previewer`, no window.__pagedDone) — they paginate purely via native
      // Chromium @page CSS during print, so `profile.waitForPaged` (which
      // exists for book mode's client-side pagedjs pass) doesn't apply here.

      await page.pdf({
        path: out,
        ...profile.pdfOptions,
      });

      await renumberContentPages(out);

      const pageCount = await countPdfPages(out);
      process.stdout.write(`done → ${out}, pages: ${pageCount}, spine: ${spineWidthInches(pageCount).toFixed(4)}in\n`);
    }

    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
