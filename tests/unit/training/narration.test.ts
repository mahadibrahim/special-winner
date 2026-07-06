import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  renderNarrationScript,
  generateAllNarrationScripts,
  WORKFLOWS,
} from "../../../training/lib/narration";
import coachCoreCaptions from "./fixtures/coach-core.captions.json";
import refereeGamedayCaptions from "./fixtures/referee-gameday.captions.json";

describe("renderNarrationScript", () => {
  it("renders a numbered, timestamped script with spoken-register lines, not raw captions", () => {
    const script = renderNarrationScript("coach-core", coachCoreCaptions);

    expect(script).toContain("# Coach Core");
    expect(script).toContain("training/output/coach-core/video.webm");
    expect(script).toMatch(/^1\. \[00:00\] /m);
    expect(script).toMatch(/^2\. \[00:03\] /m);
    expect(script).toMatch(/^3\. \[00:07\] /m);
    // Spoken register, not a verbatim echo of the UI caption string.
    expect(script).not.toContain("Coach dashboard — today at a glance\n");
    expect(script).toContain("today's schedule and tasks");
  });

  it("keeps output ordered by caption index even if input is out of order", () => {
    const shuffled = [...coachCoreCaptions].reverse();
    const script = renderNarrationScript("coach-core", shuffled);
    const lines = script.split("\n").filter((l) => /^\d+\. \[/.test(l));
    expect(lines[0]).toMatch(/^1\. \[00:00\]/);
    expect(lines[2]).toMatch(/^3\. \[00:07\]/);
  });

  it("never leaks internal UI markers like '(not submitted)' into the fallback transform", () => {
    const script = renderNarrationScript("coach-core", [
      {
        index: 0,
        caption: "Some brand-new step not in the lookup table (not submitted)",
        timestampMs: 1000,
        screenshot: "00-x.png",
      },
    ]);
    expect(script).not.toContain("(not submitted)");
    expect(script).toContain("1. [00:01]");
  });

  it("renders every deckSlug-tagged caption from the referee-gameday fixture too (deckSlug is ignored, not required)", () => {
    const script = renderNarrationScript("referee-gameday", refereeGamedayCaptions);
    expect(script).toContain("1. [00:00]");
    expect(script).toContain("2. [00:04]");
    expect(script).toContain("3. [00:10]");
  });
});

describe("generateAllNarrationScripts", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "narration-test-"));
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it("writes a .md file only for workflows with a captions.json present, and lists the rest as missing", async () => {
    const coachCoreDir = path.join(rootDir, "output", "coach-core");
    await fs.mkdir(coachCoreDir, { recursive: true });
    await fs.writeFile(
      path.join(coachCoreDir, "captions.json"),
      JSON.stringify(coachCoreCaptions),
    );

    const result = await generateAllNarrationScripts(rootDir);

    expect(result.written).toEqual(["coach-core"]);
    expect(result.missing).toEqual(WORKFLOWS.filter((w) => w !== "coach-core"));

    const written = await fs.readFile(
      path.join(rootDir, "narration", "coach-core.md"),
      "utf8",
    );
    expect(written).toContain("# Coach Core");
  });

  it("returns every workflow as missing and writes nothing when no output dirs exist", async () => {
    const result = await generateAllNarrationScripts(rootDir);
    expect(result.written).toEqual([]);
    expect(result.missing).toEqual([...WORKFLOWS]);
    await expect(fs.stat(path.join(rootDir, "narration"))).rejects.toThrow();
  });
});
