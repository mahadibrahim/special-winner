import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const BASE_URL = process.env.MINIBOOK_BASE_URL ?? "http://localhost:4321";
const OUT_DIR = resolve(process.cwd(), "pdfs/minibooks");

const SLUGS = [
  "soccer-passing",
  "soccer-dribbling",
  "soccer-shooting",
  "soccer-defending",
  "soccer-game-intelligence",
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  for (const slug of SLUGS) {
    const url = `${BASE_URL}/minibooks/${slug}`;
    const out = resolve(OUT_DIR, `${slug}.pdf`);
    process.stdout.write(`→ ${slug} ... `);

    await page.goto(url, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: out,
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
    });

    process.stdout.write(`done → ${out}\n`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
