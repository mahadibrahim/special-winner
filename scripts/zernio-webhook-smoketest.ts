/**
 * Local smoke test for the Zernio publish webhook (sub-project 2b).
 *
 * Exercises POST /api/webhooks/zernio end-to-end against a running dev server
 * WITHOUT needing Zernio: it creates a throwaway Content Calendar row, signs
 * synthetic payloads with ZERNIO_WEBHOOK_SECRET exactly as Zernio would
 * (lowercase-hex HMAC-SHA256 over the raw body), fires them, then re-reads the
 * row through the same Notion data-source API the app uses to assert the
 * writeback happened. The test row is archived at the end.
 *
 * Regression tool — re-run after the ops-side 2a push routine lands, or after
 * any change to the route / Notion writeback. Run from the repo root:
 *   npm run dev                       # in one shell (loads .env)
 *   npx tsx scripts/zernio-webhook-smoketest.ts
 *
 * To smoke-test prod instead of local, point it at the deployed apex (needs the
 * real Netlify secret mirrored into local .env so signatures match):
 *   BASE_URL=https://aspiresportsohio.com npx tsx scripts/zernio-webhook-smoketest.ts
 *
 * It is non-destructive: the only row it touches is one it creates and archives.
 *
 * Env (from .env): NOTION_TOKEN, NOTION_CONTENT_CALENDAR_DS, ZERNIO_WEBHOOK_SECRET
 * Optional: BASE_URL (default http://localhost:4321)
 */
import "dotenv/config";
import crypto from "node:crypto";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:4321").replace(/\/$/, "");
const WEBHOOK_URL = `${BASE_URL}/api/webhooks/zernio`;

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";

const token = process.env.NOTION_TOKEN;
const rawDs = process.env.NOTION_CONTENT_CALENDAR_DS;
const secret = process.env.ZERNIO_WEBHOOK_SECRET;

if (!token) die("NOTION_TOKEN is not set in .env");
if (!rawDs) die("NOTION_CONTENT_CALENDAR_DS is not set in .env");
if (!secret) die("ZERNIO_WEBHOOK_SECRET is not set in .env");

const dataSourceId = rawDs.replace(/^collection:\/\//, "");
// A unique-ish marker so a partial-substring match can never hit a real row.
const POST_ID = "zernio-smoketest-aa11bb22";
const TITLE = "[SMOKETEST] Zernio webhook — safe to delete";

function die(msg: string): never {
  console.error(`\x1b[31m✗ ${msg}\x1b[0m`);
  process.exit(1);
}

function notionHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

function sign(body: string): string {
  return crypto.createHmac("sha256", secret!).update(body, "utf8").digest("hex");
}

/** Fire one webhook request; return {status, json}. `sig` overrides the signature. */
async function fire(
  payload: unknown,
  opts: { sig?: string } = {},
): Promise<{ status: number; json: any }> {
  const body = JSON.stringify(payload);
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Zernio-Signature": opts.sig ?? sign(body),
    },
    body,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json };
}

// --- Notion helpers (same endpoints the app's writeback uses) -----------------

async function createTestRow(): Promise<string> {
  const res = await fetch(`${NOTION_API}/pages`, {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties: {
        Post: { title: [{ text: { content: TITLE } }] },
        "Zernio post ID": { rich_text: [{ text: { content: POST_ID } }] },
        Status: { select: { name: "Loaded" } },
      },
    }),
  });
  if (!res.ok) die(`create test row failed (${res.status}): ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

async function getRow(): Promise<any | null> {
  const res = await fetch(`${NOTION_API}/data_sources/${dataSourceId}/query`, {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify({
      filter: { property: "Zernio post ID", rich_text: { contains: POST_ID } },
      page_size: 1,
    }),
  });
  if (!res.ok) die(`query row failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { results?: any[] };
  return data.results?.[0] ?? null;
}

async function resetRow(pageId: string): Promise<void> {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: "PATCH",
    headers: notionHeaders(),
    body: JSON.stringify({
      properties: {
        Status: { select: { name: "Loaded" } },
        "Live URL": { url: null },
        "Sync error": { rich_text: [] },
      },
    }),
  });
  if (!res.ok) die(`reset row failed (${res.status}): ${await res.text()}`);
}

async function archiveRow(pageId: string): Promise<void> {
  await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: "PATCH",
    headers: notionHeaders(),
    body: JSON.stringify({ archived: true }),
  });
}

function status(row: any): string | undefined {
  return row?.properties?.Status?.select?.name;
}
function liveUrl(row: any): string | null | undefined {
  return row?.properties?.["Live URL"]?.url;
}
function syncError(row: any): string {
  return (row?.properties?.["Sync error"]?.rich_text ?? [])
    .map((t: any) => t.plain_text ?? t.text?.content ?? "")
    .join("");
}

// --- Assertions ---------------------------------------------------------------

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗ ${name}\x1b[0m ${detail}`);
  }
}

// --- Run ----------------------------------------------------------------------

async function main() {
  console.log(`\nZernio webhook smoke test → ${WEBHOOK_URL}\n`);

  // Preflight: is the dev server up?
  try {
    await fetch(BASE_URL, { method: "HEAD" });
  } catch {
    die(`dev server not reachable at ${BASE_URL} — start it with \`npm run dev\``);
  }

  const LIVE_URL = "https://instagram.com/p/smoketest123";
  const ERR_MSG = "smoketest: simulated publish failure";

  console.log("Seeding test row…");
  const pageId = await createTestRow();
  console.log(`  row ${pageId} (Zernio post ID=${POST_ID}, Status=Loaded)\n`);

  try {
    // 1. Valid signature, bad signature rejected first (no row mutation).
    console.log("Case: invalid signature → 401");
    {
      const r = await fire(
        { event: "post.published", post: { _id: POST_ID, url: LIVE_URL } },
        { sig: "deadbeef" },
      );
      check("returns 401", r.status === 401, `got ${r.status}`);
    }

    // 2. Missing signature → 401.
    console.log("Case: missing signature → 401");
    {
      const body = JSON.stringify({ event: "post.published", post: { _id: POST_ID } });
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      check("returns 401", res.status === 401, `got ${res.status}`);
    }

    // 3. post.published → row flips to Published + Live URL.
    console.log("Case: post.published → Status=Published + Live URL");
    await resetRow(pageId);
    {
      const r = await fire({
        event: "post.published",
        post: { _id: POST_ID, url: LIVE_URL },
      });
      check("returns 200", r.status === 200, `got ${r.status}`);
      check("response matched=true", r.json?.matched === true, JSON.stringify(r.json));
      const row = await getRow();
      check("Status == Published", status(row) === "Published", `got ${status(row)}`);
      check("Live URL persisted", liveUrl(row) === LIVE_URL, `got ${liveUrl(row)}`);
    }

    // 4. Idempotency: re-fire published → no error, stays Published.
    console.log("Case: re-fire post.published → idempotent no-op");
    {
      const r = await fire({
        event: "post.published",
        post: { _id: POST_ID, url: LIVE_URL },
      });
      check("returns 200", r.status === 200, `got ${r.status}`);
      check(
        "alreadyPublished=true",
        r.json?.alreadyPublished === true,
        JSON.stringify(r.json),
      );
    }

    // 5. post.failed → Sync error recorded, Status stays Loaded.
    console.log("Case: post.failed → Sync error recorded");
    await resetRow(pageId);
    {
      const r = await fire({
        event: "post.failed",
        post: { _id: POST_ID, errorMessage: ERR_MSG },
      });
      check("returns 200", r.status === 200, `got ${r.status}`);
      check("response matched=true", r.json?.matched === true, JSON.stringify(r.json));
      const row = await getRow();
      check("Sync error contains message", syncError(row).includes(ERR_MSG), syncError(row));
      check("Status still Loaded", status(row) === "Loaded", `got ${status(row)}`);
    }

    // 6. Unknown post id → 200 no-op (no retry storm), matched=false.
    console.log("Case: unknown post id → 200 no-op");
    {
      const r = await fire({
        event: "post.published",
        post: { _id: "zernio-does-not-exist-zzzz", url: LIVE_URL },
      });
      check("returns 200", r.status === 200, `got ${r.status}`);
      check("matched=false", r.json?.matched === false, JSON.stringify(r.json));
    }

    // 7. Unhandled event → 200 skip.
    console.log("Case: unhandled event → 200 skip");
    {
      const r = await fire({ event: "post.scheduled", post: { _id: POST_ID } });
      check("returns 200", r.status === 200, `got ${r.status}`);
      check("skipped", typeof r.json?.skipped === "string", JSON.stringify(r.json));
    }
  } finally {
    console.log("\nArchiving test row…");
    await archiveRow(pageId);
  }

  console.log(`\n${failed === 0 ? "\x1b[32m" : "\x1b[31m"}${passed} passed, ${failed} failed\x1b[0m\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => die(err?.stack ?? String(err)));
