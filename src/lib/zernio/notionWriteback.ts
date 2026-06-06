/**
 * Notion writeback for the Zernio publish webhook (sub-project 2b).
 *
 * The web-app holds a Notion integration token (`NOTION_TOKEN`) scoped to the
 * marketing **Content Calendar** data source (`NOTION_CONTENT_CALENDAR_DS`).
 * When Zernio confirms a post went live (or failed), the webhook matches the
 * row by its `Zernio post ID` (written by the ops push routine — the only
 * correlation key between the two halves) and writes the result back.
 *
 * - `markPublished` → set `Live URL` + `Status = Published` (idempotent).
 * - `markSyncError` → set `Sync error`.
 *
 * Notion access is the modern data-source API (Notion-Version 2025-09-03):
 * `POST /v1/data_sources/{id}/query` then `PATCH /v1/pages/{id}`.
 *
 * `fetchImpl` is injectable for unit testing; it defaults to global `fetch`.
 */

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2025-09-03";

const ZERNIO_POST_ID_PROP = "Zernio post ID";
const LIVE_URL_PROP = "Live URL";
const STATUS_PROP = "Status";
const SYNC_ERROR_PROP = "Sync error";
const PUBLISHED_STATUS = "Published";

type FetchImpl = (url: string | URL, init?: RequestInit) => Promise<Response>;

export interface NotionWritebackConfig {
  /** Notion integration token (`NOTION_TOKEN`). */
  token: string;
  /** Content Calendar data source UUID (no `collection://` prefix). */
  dataSourceId: string;
  /** Injectable fetch; defaults to global `fetch`. */
  fetchImpl?: FetchImpl;
}

interface NotionPage {
  id: string;
  properties?: Record<string, unknown>;
}

/**
 * Build a NotionWritebackConfig from the web-app environment. Strips the
 * `collection://` prefix that the ops/MCP world uses on the data-source id.
 * Throws if either secret is missing — the webhook treats that as a server
 * misconfiguration (5xx), not a silent no-op.
 */
export function getNotionConfigFromEnv(): NotionWritebackConfig {
  const token = import.meta.env.NOTION_TOKEN ?? process.env.NOTION_TOKEN;
  const rawDs =
    import.meta.env.NOTION_CONTENT_CALENDAR_DS ??
    process.env.NOTION_CONTENT_CALENDAR_DS;

  if (!token) throw new Error("NOTION_TOKEN is not set");
  if (!rawDs) throw new Error("NOTION_CONTENT_CALENDAR_DS is not set");

  return { token, dataSourceId: stripCollectionPrefix(rawDs) };
}

function stripCollectionPrefix(ds: string): string {
  return ds.replace(/^collection:\/\//, "");
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

/**
 * Find the single Content Calendar page whose `Zernio post ID` contains the
 * given Zernio post id. Uses `contains` (not `equals`) so a per-platform JSON
 * map value (`{platform: id}`) still matches a single returned id — Zernio post
 * ids are fixed-width hex, so a partial-substring false match is not a concern.
 * Returns null when no row matches.
 */
async function findRowByPostId(
  postId: string,
  config: NotionWritebackConfig,
): Promise<NotionPage | null> {
  const doFetch = config.fetchImpl ?? fetch;
  const res = await doFetch(
    `${NOTION_API}/data_sources/${config.dataSourceId}/query`,
    {
      method: "POST",
      headers: headers(config.token),
      body: JSON.stringify({
        filter: {
          property: ZERNIO_POST_ID_PROP,
          rich_text: { contains: postId },
        },
        page_size: 1,
      }),
    },
  );

  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(`Notion query failed (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as { results?: NotionPage[] };
  return data.results?.[0] ?? null;
}

async function patchPage(
  pageId: string,
  properties: Record<string, unknown>,
  config: NotionWritebackConfig,
): Promise<void> {
  const doFetch = config.fetchImpl ?? fetch;
  const res = await doFetch(`${NOTION_API}/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(config.token),
    body: JSON.stringify({ properties }),
  });

  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error(`Notion page update failed (${res.status}): ${detail}`);
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}

function richText(content: string) {
  return { rich_text: [{ text: { content } }] };
}

export interface MarkPublishedResult {
  matched: boolean;
  alreadyPublished?: boolean;
}

/**
 * Mark the row for `postId` as published: set `Live URL` and `Status =
 * Published`. Idempotent — if the row is already Published with a Live URL,
 * no write is made. Returns `{matched:false}` (no throw) when no row matches.
 */
export async function markPublished(
  postId: string,
  liveUrl: string,
  config: NotionWritebackConfig,
): Promise<MarkPublishedResult> {
  const page = await findRowByPostId(postId, config);
  if (!page) return { matched: false };

  if (isAlreadyPublished(page)) {
    return { matched: true, alreadyPublished: true };
  }

  await patchPage(
    page.id,
    {
      [LIVE_URL_PROP]: { url: liveUrl },
      [STATUS_PROP]: { select: { name: PUBLISHED_STATUS } },
    },
    config,
  );

  return { matched: true, alreadyPublished: false };
}

export interface MarkSyncErrorResult {
  matched: boolean;
}

/**
 * Record a publish/sync failure for `postId` in the `Sync error` column. Leaves
 * `Status` untouched (stays `Loaded`). Returns `{matched:false}` (no throw)
 * when no row matches.
 */
export async function markSyncError(
  postId: string,
  error: string,
  config: NotionWritebackConfig,
): Promise<MarkSyncErrorResult> {
  const page = await findRowByPostId(postId, config);
  if (!page) return { matched: false };

  await patchPage(page.id, { [SYNC_ERROR_PROP]: richText(error) }, config);

  return { matched: true };
}

function isAlreadyPublished(page: NotionPage): boolean {
  const props = page.properties ?? {};
  const status = props[STATUS_PROP] as { select?: { name?: string } } | undefined;
  const liveUrl = props[LIVE_URL_PROP] as { url?: string | null } | undefined;
  return status?.select?.name === PUBLISHED_STATUS && Boolean(liveUrl?.url);
}
