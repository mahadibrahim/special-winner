/**
 * Digital-edition PDF builder ("one book listing, two formats", part 1).
 *
 * Builds pdfs/digital/<slug>-digital.pdf: a front-cover-only page (6x9in
 * trim, no bleed — see generate-minibook-covers.ts's writeFrontCoverOnly)
 * followed by the full interior, concatenated with pdf-lib. No print
 * artifacts (bleed, spine, back cover) belong in a digital download.
 *
 * Usage:
 *   tsx scripts/build-digital-edition.ts --slug <minibook-slug>
 *
 * Locates the two source PDFs on disk if they already exist:
 *   - interior: pdfs/minibooks/<slug>.pdf
 *   - front cover: pdfs/covers/<slug>-cover-front.pdf
 * and renders whichever is missing via the existing pipelines
 * (generate-minibook-pdfs.ts, generate-minibook-covers.ts) — which requires
 * the Astro dev server the interior renderer fetches from
 * (MINIBOOK_BASE_URL, default http://localhost:4321) to be reachable.
 */
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { PDFDocument } from "pdf-lib";
import { countPdfPages } from "./pdf-profiles";

const execFileAsync = promisify(execFile);

const MINIBOOK_DIR = resolve(process.cwd(), "pdfs/minibooks");
const COVERS_DIR = resolve(process.cwd(), "pdfs/covers");
const DIGITAL_DIR = resolve(process.cwd(), "pdfs/digital");

interface Args {
  slug: string;
}

function parseArgs(argv: string[]): Args {
  let slug: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slug" && argv[i + 1]) {
      slug = argv[i + 1];
      i++;
    }
  }
  if (!slug) {
    console.error("usage: tsx scripts/build-digital-edition.ts --slug <minibook-slug>");
    process.exit(64);
  }
  return { slug };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Locate pdfs/minibooks/<slug>.pdf, rendering it via generate-minibook-pdfs.ts if missing. */
async function ensureInterior(slug: string): Promise<string> {
  const path = resolve(MINIBOOK_DIR, `${slug}.pdf`);
  if (await exists(path)) {
    console.log(`interior: found ${path}`);
    return path;
  }
  console.log(`interior: not found — rendering via generate-minibook-pdfs.ts ...`);
  await execFileAsync(
    "npx",
    ["tsx", "scripts/generate-minibook-pdfs.ts", "--slugs", slug, "--profile", "kdp-6x9"],
    { cwd: process.cwd() },
  );
  if (!(await exists(path))) {
    throw new Error(`generate-minibook-pdfs.ts did not produce ${path}`);
  }
  return path;
}

/** Locate pdfs/covers/<slug>-cover-front.pdf, rendering the wraparound (which
 *  also emits the front-only crop) via generate-minibook-covers.ts if missing. */
async function ensureFrontCover(slug: string, interiorPath: string): Promise<string> {
  const path = resolve(COVERS_DIR, `${slug}-cover-front.pdf`);
  if (await exists(path)) {
    console.log(`front cover: found ${path}`);
    return path;
  }
  const pages = await countPdfPages(interiorPath);
  console.log(`front cover: not found — rendering via generate-minibook-covers.ts (--pages ${pages}) ...`);
  await execFileAsync(
    "npx",
    ["tsx", "scripts/generate-minibook-covers.ts", "--slug", slug, "--pages", String(pages)],
    { cwd: process.cwd() },
  );
  if (!(await exists(path))) {
    throw new Error(`generate-minibook-covers.ts did not produce ${path}`);
  }
  return path;
}

/** Concatenate front-cover-only (page 1) + every interior page into one PDF. */
async function concatenate(
  frontCoverPath: string,
  interiorPath: string,
  outPath: string,
): Promise<number> {
  const outDoc = await PDFDocument.create();

  const coverBytes = await readFile(frontCoverPath);
  const coverDoc = await PDFDocument.load(coverBytes);
  const [coverPage] = await outDoc.copyPages(coverDoc, [0]);
  outDoc.addPage(coverPage);

  const interiorBytes = await readFile(interiorPath);
  const interiorDoc = await PDFDocument.load(interiorBytes);
  const interiorPages = await outDoc.copyPages(interiorDoc, interiorDoc.getPageIndices());
  for (const p of interiorPages) outDoc.addPage(p);

  await mkdir(DIGITAL_DIR, { recursive: true });
  const bytes = await outDoc.save();
  await writeFile(outPath, bytes);
  return outDoc.getPageCount();
}

async function main() {
  const { slug } = parseArgs(process.argv.slice(2));

  const interiorPath = await ensureInterior(slug);
  const frontCoverPath = await ensureFrontCover(slug, interiorPath);

  const outPath = resolve(DIGITAL_DIR, `${slug}-digital.pdf`);
  const pageCount = await concatenate(frontCoverPath, interiorPath, outPath);

  console.log(`done → ${outPath}  pages: ${pageCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
