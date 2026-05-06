#!/usr/bin/env tsx
import path from "node:path";
import { loadCatalog } from "./loader";
import { validateCatalog } from "./validator";

const command = process.argv[2];

const CATALOG_DIR = path.join(process.cwd(), "docs/operations/catalog");

const commands: Record<string, () => Promise<number>> = {
  validate: async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const result = validateCatalog(catalog);
    for (const w of result.warnings) {
      console.warn(`[warn] ${w.source}: ${w.message}`);
    }
    for (const e of result.errors) {
      console.error(`[error] ${e.source}: ${e.message}`);
    }
    if (result.errors.length > 0) {
      console.error(
        `Validation failed: ${result.errors.length} error(s), ${result.warnings.length} warning(s)`,
      );
      return 1;
    }
    console.log(`Validation passed: ${result.warnings.length} warning(s)`);
    return 0;
  },
  render: async () => {
    console.log("[ops-catalog] render (not yet implemented)");
    return 0;
  },
};

async function main() {
  if (!command || !commands[command]) {
    console.error(`Usage: ops-catalog <validate|render> [options]`);
    process.exit(1);
  }
  const code = await commands[command]();
  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
