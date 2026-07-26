import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

export interface PdfProfile {
  name: string;
  pdfOptions: NonNullable<Parameters<Page["pdf"]>[0]>;
  /** paged.js paginates in-browser; the renderer must wait for it. */
  waitForPaged: boolean;
}

/** KDP white paper: 0.002252 in per page. */
export function spineWidthInches(pageCount: number): number {
  return pageCount * 0.002252;
}

/**
 * Count pages in an already-rendered PDF by reading it back off disk.
 *
 * Book mode gets its page count for free: paged.js's `Previewer` runs
 * client-side and sets `window.__pagedPageCount` before the PDF is printed.
 * Minibook `.astro` pages have no paged.js step at all — they paginate purely
 * via native Chromium `@page` CSS during print — so there's no in-page JS
 * count to read for minibook mode. Instead we read the count back out of the
 * PDF itself: `pdfinfo` (poppler) is tried first since it's authoritative,
 * falling back to a byte-level scan for non-"/Type /Pages" page objects if
 * `pdfinfo` isn't on PATH (Chromium/PDFium PDFs are uncompressed enough at
 * this size for the object markers to be found directly in the bytes).
 */
export async function countPdfPages(pdfPath: string): Promise<number> {
  try {
    const out = execFileSync("pdfinfo", [pdfPath], { encoding: "utf-8" });
    const m = out.match(/^Pages:\s+(\d+)/m);
    if (m) return parseInt(m[1], 10);
  } catch {
    // pdfinfo missing or failed — fall through to the byte-level scan below.
  }
  const buf = await readFile(pdfPath);
  const text = buf.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page(?!s)/g);
  return matches ? matches.length : 0;
}

export const PROFILES: Record<string, PdfProfile> = {
  letter: {
    name: "letter",
    pdfOptions: {
      format: "Letter",
      printBackground: true,
      margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
    },
    waitForPaged: false,
  },
  "kdp-6x9": {
    name: "kdp-6x9",
    pdfOptions: { width: "6in", height: "9in", printBackground: true, preferCSSPageSize: true },
    waitForPaged: true,
  },
  "kdp-8.5x11": {
    name: "kdp-8.5x11",
    pdfOptions: { width: "8.5in", height: "11in", printBackground: true, preferCSSPageSize: true },
    waitForPaged: true,
  },
};

export function profileFor(name: string): PdfProfile {
  const p = PROFILES[name];
  if (!p) throw new Error(`unknown pdf profile "${name}" (have: ${Object.keys(PROFILES).join(", ")})`);
  return p;
}

export interface RunConfig {
  mode: "book" | "minibooks";
  bookSlug?: string;
  userSlugs?: string[];
  profileName: string;
}

/**
 * Parse CLI arguments and resolve the run configuration.
 * Validates profile, enforces mutually exclusive flags, and applies profile defaults.
 */
export function resolveRunConfig(argv: string[]): RunConfig {
  let userSlugs: string[] | null = null;
  let profileName = "letter";
  let bookSlug: string | null = null;
  let profileExplicitlyProvided = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slugs" && argv[i + 1]) {
      userSlugs = argv[i + 1].split(",").map((s) => s.trim());
      i++;
    } else if (argv[i] === "--profile" && argv[i + 1]) {
      profileName = argv[i + 1];
      profileExplicitlyProvided = true;
      i++;
    } else if (argv[i] === "--book" && argv[i + 1]) {
      bookSlug = argv[i + 1];
      i++;
    }
  }

  // Validate mutually exclusive flags
  if (bookSlug && userSlugs) {
    throw new Error("--book and --slugs are mutually exclusive");
  }

  // Default profile for book mode
  if (bookSlug && !profileExplicitlyProvided) {
    profileName = "kdp-6x9";
  }

  // Validate profile
  profileFor(profileName);

  const mode = bookSlug ? "book" : "minibooks";
  return {
    mode,
    bookSlug: bookSlug || undefined,
    userSlugs: userSlugs || undefined,
    profileName,
  };
}
