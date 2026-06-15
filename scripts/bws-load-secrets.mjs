#!/usr/bin/env node
// scripts/bws-load-secrets.mjs
//
// Bulk-load (or update) secrets into the Aspire Bitwarden Secrets Manager
// project from a local, git-ignored CSV. Idempotent: a key that already
// exists in the project is updated in place; a new key is created.
//
// 1. cp secrets.local.csv.example secrets.local.csv
// 2. Fill in KEY,VALUE rows (delete the ones you don't need yet).
// 3. node scripts/bws-load-secrets.mjs
// 4. rm secrets.local.csv   (values now live in Bitwarden — don't keep the file)
//
// The BWS access token is read from the macOS Keychain (same item the dev
// runner uses), or from BWS_ACCESS_TOKEN if already set in the environment.

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PROJECT_ID = process.env.BWS_PROJECT_ID || "d5054128-d647-480c-bcfd-b46a00d295c7";
const KEYCHAIN_ACCOUNT = "BitWarden";
const KEYCHAIN_SERVICE = "bws-aspire-local";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const csvPath = join(root, "secrets.local.csv");

if (!existsSync(csvPath)) {
  console.error(`error: ${csvPath} not found.`);
  console.error("       cp secrets.local.csv.example secrets.local.csv, fill it in, then re-run.");
  process.exit(1);
}

function resolveToken() {
  if (process.env.BWS_ACCESS_TOKEN) return process.env.BWS_ACCESS_TOKEN;
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-a", KEYCHAIN_ACCOUNT, "-s", KEYCHAIN_SERVICE, "-w"],
      { encoding: "utf8" }
    ).trim();
  } catch {
    console.error(
      `error: could not read BWS token from Keychain (account '${KEYCHAIN_ACCOUNT}', service '${KEYCHAIN_SERVICE}').`
    );
    process.exit(1);
  }
}

const env = { ...process.env, BWS_ACCESS_TOKEN: resolveToken() };
const bws = (args) => execFileSync("bws", args, { encoding: "utf8", env });

// Parse CSV: one KEY,VALUE per line. Split on the FIRST comma only, so values
// may themselves contain commas (connection strings, etc.). Blank lines and
// lines starting with '#' are ignored.
const rows = readFileSync(csvPath, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => {
    const i = l.indexOf(",");
    if (i === -1) {
      console.error(`error: line has no comma (expected KEY,VALUE): ${l}`);
      process.exit(1);
    }
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  });

if (rows.length === 0) {
  console.error("error: no KEY,VALUE rows found in secrets.local.csv");
  process.exit(1);
}

const existing = JSON.parse(bws(["secret", "list", PROJECT_ID, "-o", "json"]));
const idByKey = new Map(existing.map((s) => [s.key, s.id]));

let created = 0;
let updated = 0;
for (const [key, value] of rows) {
  if (idByKey.has(key)) {
    bws(["secret", "edit", idByKey.get(key), "--value", value]);
    updated++;
    console.log(`  updated  ${key}`);
  } else {
    bws(["secret", "create", key, value, PROJECT_ID]);
    created++;
    console.log(`  created  ${key}`);
  }
}

console.log(`\nDone — ${created} created, ${updated} updated, ${rows.length} total.`);
console.log("Now delete the plaintext file:  rm secrets.local.csv");
