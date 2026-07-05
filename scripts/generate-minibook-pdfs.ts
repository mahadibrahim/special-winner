import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { profileFor, resolveRunConfig, spineWidthInches } from "./pdf-profiles";

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

      if (profile.waitForPaged) {
        await page.waitForFunction(() => (window as any).__pagedDone === true, {
          timeout: 120_000,
        });
      }

      await page.pdf({
        path: out,
        ...profile.pdfOptions,
      });

      process.stdout.write(`done → ${out}\n`);
    }

    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
