import type { Page } from "@playwright/test";

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
