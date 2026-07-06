#!/usr/bin/env tsx
// CLI entrypoint for `npm run training:narration`. Thin wrapper around
// training/lib/narration.ts's generateAllNarrationScripts — mirrors the
// scripts/ops-catalog/index.ts "thin shim, real logic lives in a lib" split.
import path from "node:path";
import { generateAllNarrationScripts } from "../lib/narration";

async function main() {
  const rootDir = path.join(process.cwd(), "training");
  const { written, missing } = await generateAllNarrationScripts(rootDir);

  for (const workflow of written) {
    console.log(`Wrote training/narration/${workflow}.md`);
  }
  if (missing.length > 0) {
    console.log(
      `No captions.json found for: ${missing.join(", ")} — run "npm run training:videos" first.`,
    );
  }
  if (written.length === 0) {
    console.log(
      "No narration scripts generated — no training/output/<workflow>/captions.json found.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
