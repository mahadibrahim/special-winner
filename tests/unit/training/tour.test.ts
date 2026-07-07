import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createTour } from "../../../training/lib/tour";

function fakePage() {
  const calls = { screenshot: [] as string[], waits: [] as number[] };
  return {
    calls,
    async screenshot({ path: p }: { path: string }) {
      calls.screenshot.push(p);
      await fs.writeFile(p, Buffer.from("fake-png-bytes"));
    },
    async waitForTimeout(ms: number) {
      calls.waits.push(ms);
    },
  };
}

describe("Tour", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "tour-test-"));
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it("writes one screenshot + one captions.json entry per step, in order", async () => {
    const page = fakePage();
    const tour = createTour({ workflow: "demo-workflow", role: "coach", rootDir });

    await tour.step(page, "Open the dashboard", async () => {});
    await tour.step(page, "Click the roster tab", async () => {});
    await tour.finish();

    const outputDir = path.join(rootDir, "output", "demo-workflow");
    const captions = JSON.parse(
      await fs.readFile(path.join(outputDir, "captions.json"), "utf8"),
    );

    expect(captions).toHaveLength(2);
    expect(captions[0]).toMatchObject({ index: 0, caption: "Open the dashboard" });
    expect(captions[1]).toMatchObject({ index: 1, caption: "Click the roster tab" });
    expect(captions[0].timestampMs).toBeLessThanOrEqual(captions[1].timestampMs);
    expect(page.calls.screenshot).toHaveLength(2);

    for (const c of captions) {
      const stat = await fs.stat(path.join(outputDir, c.screenshot));
      expect(stat.isFile()).toBe(true);
    }
  });

  it("pauses 400ms after a step by default, for watchability", async () => {
    const page = fakePage();
    const tour = createTour({ workflow: "demo-workflow", role: "coach", rootDir });
    await tour.step(page, "Step one", async () => {});
    expect(page.calls.waits).toEqual([400]);
  });

  it("respects a custom pauseMs override", async () => {
    const page = fakePage();
    const tour = createTour({ workflow: "demo-workflow", role: "coach", rootDir });
    await tour.step(page, "Step one", async () => {}, { pauseMs: 100 });
    expect(page.calls.waits).toEqual([100]);
  });

  it("copies the step screenshot into the deck screenshot slot when deckSlug is set", async () => {
    const page = fakePage();
    const tour = createTour({ workflow: "referee-gameday", role: "ref", rootDir });
    await tour.step(page, "Submit the match report", async () => {}, {
      deckSlug: "score_reporting_final",
    });

    const stat = await fs.stat(
      path.join(rootDir, "screenshots", "ref", "score_reporting_final.png"),
    );
    expect(stat.isFile()).toBe(true);
  });

  it("copies to deckRole's directory instead of the tour's own role when set", async () => {
    const page = fakePage();
    const tour = createTour({ workflow: "venue-manager", role: "event_lead", rootDir });
    await tour.step(page, "Walk-up registration form", async () => {}, {
      deckSlug: "walk_on_registration",
      deckRole: "front_of_house",
    });

    const stat = await fs.stat(
      path.join(rootDir, "screenshots", "front_of_house", "walk_on_registration.png"),
    );
    expect(stat.isFile()).toBe(true);
    await expect(
      fs.stat(path.join(rootDir, "screenshots", "event_lead", "walk_on_registration.png")),
    ).rejects.toThrow();
  });

  it("does not create a deck-slot directory when no step sets deckSlug", async () => {
    const page = fakePage();
    const tour = createTour({ workflow: "coach-core", role: "coach", rootDir });
    await tour.step(page, "View the roster", async () => {});
    await expect(fs.stat(path.join(rootDir, "screenshots", "coach"))).rejects.toThrow();
  });

  it("slugifies captions into zero-padded, filesystem-safe screenshot filenames", async () => {
    const page = fakePage();
    const tour = createTour({ workflow: "demo-workflow", role: "coach", rootDir });
    await tour.step(page, "Open the Coach's Dashboard!!", async () => {});

    const outputDir = path.join(rootDir, "output", "demo-workflow");
    const files = await fs.readdir(outputDir);
    expect(files).toContain("00-open-the-coach-s-dashboard.png");
  });
});
