import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PROFILES, profileFor, spineWidthInches } from "./pdf-profiles";

const MINIBOOK_BASE_URL = process.env.MINIBOOK_BASE_URL ?? "http://localhost:4321";
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

// Parse CLI args
const args = process.argv.slice(2);
let userSlugs: string[] | null = null;
let profileName = "letter";
let bookSlug: string | null = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--slugs" && args[i + 1]) {
    userSlugs = args[i + 1].split(",").map((s) => s.trim());
    i++;
  } else if (args[i] === "--profile" && args[i + 1]) {
    profileName = args[i + 1];
    i++;
  } else if (args[i] === "--book" && args[i + 1]) {
    bookSlug = args[i + 1];
    i++;
  }
}

async function main() {
  // Validate profile
  const profile = profileFor(profileName);

  if (bookSlug) {
    // Book render mode
    await mkdir(BOOK_OUT_DIR, { recursive: true });

    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    const url = `${MINIBOOK_BASE_URL}/books/${bookSlug}`;
    const out = resolve(BOOK_OUT_DIR, `${bookSlug}-interior.pdf`);
    process.stdout.write(`→ book ${bookSlug} ... `);

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
      const url = `${MINIBOOK_BASE_URL}/minibooks/${slug}`;
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
