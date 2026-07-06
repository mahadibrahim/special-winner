// Tiny helper for Phase 2 walkthrough scripts. Records a timestamped caption
// and a named screenshot for every `step()`, writes a `captions.json`
// sidecar per workflow, and — when a step is tagged with a real ops-catalog
// activity slug — copies that step's screenshot into the Phase 1 deck's
// screenshot slot (`training/screenshots/<role>/<slug>.png`; see
// src/lib/ops-catalog/views/training-deck.ts).
//
// Kept framework-light on purpose: `Tour.step()` only needs
// `page.screenshot`/`page.waitForTimeout`, expressed as the `TourPage`
// subset of Playwright's `Page`, so this logic is unit-testable with a
// plain fake object — no browser required. Real Playwright glue
// (`registerVideoCapture`) lives at the bottom, separate from the
// unit-tested `Tour` class.
import fs from "node:fs/promises";
import path from "node:path";
import type { test as PlaywrightTest } from "@playwright/test";

// Deliberately NOT `Pick<Page, "screenshot" | "waitForTimeout">`: Playwright's
// real `Page.screenshot()` resolves `Promise<Buffer>`, while the fake object
// used in tour.test.ts (and any lightweight test double) resolves
// `Promise<void>` — those are NOT structurally compatible against a `Pick`,
// which inherits Playwright's exact return type. Declaring `screenshot`'s
// return type as `Promise<unknown>` here keeps both a real `Page` (which
// still satisfies this with zero casting — Promise<Buffer> is assignable to
// Promise<unknown>) and a minimal test fake assignable to `TourPage`.
export interface TourPage {
  screenshot(options: { path: string }): Promise<unknown>;
  waitForTimeout(timeout: number): Promise<void>;
}

export interface StepOptions {
  /** Catalog activity slug (act.<slug> minus the "act." prefix) this step
   * illustrates. When set, the step's screenshot is ALSO copied to
   * training/screenshots/<role>/<slug>.png so `catalog:render --embed`
   * picks it up. Most steps have no catalog counterpart (coach-lifecycle /
   * hiring / curriculum-sequencing features aren't modeled in the ops
   * catalog) and should leave this unset. */
  deckSlug?: string;
  /** Pause after the action completes, in ms. Default 400 — long enough to
   * read the resulting screen in the recorded video. */
  pauseMs?: number;
}

export interface CaptionEntry {
  index: number;
  caption: string;
  timestampMs: number;
  screenshot: string;
  deckSlug?: string;
}

export interface TourOptions {
  /** Workflow name — output lands in <rootDir>/output/<workflow>/. Should
   * match the walkthrough file's own name stem (by convention, not code). */
  workflow: string;
  /** Role slug for the deck screenshot directory (e.g. "coach", "ref",
   * "venue_manager", "director"). Only read when a step sets `deckSlug`. */
  role: string;
  /** Root directory for all training output. Defaults to <cwd>/training;
   * override in unit tests to avoid touching the real repo tree. */
  rootDir?: string;
}

function slugifyCaption(caption: string): string {
  return caption
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export class Tour {
  private readonly captions: CaptionEntry[] = [];
  private readonly startedAt = Date.now();
  private nextIndex = 0;

  constructor(private readonly opts: TourOptions) {}

  private root(): string {
    return this.opts.rootDir ?? path.join(process.cwd(), "training");
  }

  private outputDir(): string {
    return path.join(this.root(), "output", this.opts.workflow);
  }

  private deckScreenshotDir(): string {
    return path.join(this.root(), "screenshots", this.opts.role);
  }

  /** Runs `fn`, pauses briefly, saves a named screenshot, and records a
   * timestamped caption. Call once per visually distinct beat of the tour. */
  async step(
    page: TourPage,
    caption: string,
    fn: () => Promise<void>,
    stepOptions: StepOptions = {},
  ): Promise<void> {
    await fn();
    await page.waitForTimeout(stepOptions.pauseMs ?? 400);

    const index = this.nextIndex++;
    const filename = `${String(index).padStart(2, "0")}-${slugifyCaption(caption)}.png`;
    const outputDir = this.outputDir();
    await fs.mkdir(outputDir, { recursive: true });
    const screenshotPath = path.join(outputDir, filename);
    await page.screenshot({ path: screenshotPath });

    if (stepOptions.deckSlug) {
      const deckDir = this.deckScreenshotDir();
      await fs.mkdir(deckDir, { recursive: true });
      await fs.copyFile(screenshotPath, path.join(deckDir, `${stepOptions.deckSlug}.png`));
    }

    const entry: CaptionEntry = {
      index,
      caption,
      timestampMs: Date.now() - this.startedAt,
      screenshot: filename,
    };
    if (stepOptions.deckSlug) entry.deckSlug = stepOptions.deckSlug;
    this.captions.push(entry);
  }

  /** Writes captions.json. Call once at the end of the walkthrough. */
  async finish(): Promise<void> {
    const outputDir = this.outputDir();
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      path.join(outputDir, "captions.json"),
      JSON.stringify(this.captions, null, 2) + "\n",
    );
  }
}

export function createTour(opts: TourOptions): Tour {
  return new Tour(opts);
}

/**
 * Registers a `test.afterEach` that finalizes the Playwright-recorded video
 * for every test in the file and copies it to
 * <rootDir>/output/<workflow>/video.webm.
 *
 * Closes the whole browser CONTEXT (not just the page) before reading
 * `video.path()` — Playwright's own docs guarantee the video is fully
 * flushed to disk "upon closing the browser context", not merely the page.
 * An earlier version of this function called only `page.close()`, which
 * usually left enough time for the OS to flush anyway, but produced a
 * genuine 0-byte video.webm for the fastest walkthrough (referee-gameday,
 * ~7s) during Task 14 end-to-end verification — a real race, not a fluke:
 * `page.close()` alone doesn't wait for the context's video muxer to
 * finish writing trailing frames.
 */
export function registerVideoCapture(
  testObj: typeof PlaywrightTest,
  workflow: string,
  rootDir?: string,
): void {
  testObj.afterEach(async ({ page }) => {
    const video = page.video();
    await page.context().close();
    if (!video) return;
    const src = await video.path();
    const destDir = path.join(rootDir ?? path.join(process.cwd(), "training"), "output", workflow);
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(src, path.join(destDir, "video.webm"));
  });
}
