#!/usr/bin/env tsx
import path from "node:path";
import fs from "node:fs/promises";
import { loadCatalog } from "./loader";
import { validateCatalog } from "./validator";
import { generateAllRoleManuals } from "./views/role-manual";
import { generateAutomationBacklog } from "./views/automation-backlog";
import { renderRunbook } from "./views/runbook";
import { renderRaciMatrix } from "./views/raci-matrix";
import { renderSportAddendum } from "./views/sport-addendum";

const command = process.argv[2];

const CATALOG_DIR = path.join(process.cwd(), "docs/operations/catalog");
const ARTIFACTS_DIR = path.join(process.cwd(), "docs/operations/artifacts");

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
    const catalog = await loadCatalog(CATALOG_DIR);
    const v = validateCatalog(catalog);
    for (const w of v.warnings) console.warn(`[warn] ${w.source}: ${w.message}`);
    for (const e of v.errors) console.error(`[error] ${e.source}: ${e.message}`);
    if (v.errors.length > 0) {
      console.error(`Validation failed before render: ${v.errors.length} error(s)`);
      return 1;
    }

    const args = process.argv.slice(3);
    const viewIdx = args.indexOf("--view");
    const view = viewIdx >= 0 ? (args[viewIdx + 1] ?? null) : null;

    if (!view) {
      // Primary pipeline: write all worker role manuals + automation-backlog.json
      const manuals = generateAllRoleManuals(catalog);
      await fs.mkdir(path.join(ARTIFACTS_DIR, "manuals"), { recursive: true });
      for (const [roleId, md] of Object.entries(manuals)) {
        await fs.writeFile(path.join(ARTIFACTS_DIR, "manuals", `${roleId}.md`), md);
      }
      const backlog = generateAutomationBacklog(catalog);
      await fs.writeFile(
        path.join(ARTIFACTS_DIR, "automation-backlog.json"),
        JSON.stringify(backlog, null, 2) + "\n",
      );
      console.log(
        `Rendered ${Object.keys(manuals).length} role manuals + automation-backlog.json`,
      );
      return 0;
    }

    if (view === "raci-matrix") {
      const csv = renderRaciMatrix(catalog);
      await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
      await fs.writeFile(path.join(ARTIFACTS_DIR, "raci-matrix.csv"), csv);
      console.log("Wrote raci-matrix.csv");
      return 0;
    }

    if (view === "sport-addendum") {
      const sportIdx = args.indexOf("--sport");
      const sport = sportIdx >= 0 ? (args[sportIdx + 1] ?? null) : null;
      if (!sport) {
        console.error("--sport required");
        return 1;
      }
      const md = renderSportAddendum(catalog, sport);
      const out = path.join(ARTIFACTS_DIR, "addendums", `${sport.replace(":", "_")}.md`);
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, md);
      console.log(`Wrote addendum for ${sport}`);
      return 0;
    }

    if (view === "runbook") {
      const venueIdx = args.indexOf("--venue");
      const dateIdx = args.indexOf("--date");
      const venue = venueIdx >= 0 ? (args[venueIdx + 1] ?? "default") : "default";
      const date =
        dateIdx >= 0
          ? (args[dateIdx + 1] ?? new Date().toISOString().slice(0, 10))
          : new Date().toISOString().slice(0, 10);
      const md = renderRunbook(catalog, {
        venue_id: venue,
        event_date: date,
        sport_tags: [],
        venue_tags: [],
        format_tags: [],
        audience_tags: [],
      });
      const out = path.join(ARTIFACTS_DIR, "runbooks", venue, `${date}.md`);
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, md);
      console.log(`Wrote runbook ${venue}/${date}`);
      return 0;
    }

    console.error(`Unknown view: ${view}`);
    return 1;
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
