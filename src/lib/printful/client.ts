import type {
  PrintfulListResponse,
  PrintfulSyncProductSummary,
  PrintfulSyncProductDetail,
} from "./types";

const PRINTFUL_API_BASE = "https://api.printful.com";

export class PrintfulNotConfiguredError extends Error {
  constructor() {
    super("PRINTFUL_API_KEY is not set");
    this.name = "PrintfulNotConfiguredError";
  }
}

export class PrintfulApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "PrintfulApiError";
  }
}

// process.env first — Netlify SSR inlines import.meta.env at build time, so a
// rotated runtime secret only reads reliably via process.env.
function getApiKey(): string {
  const key = process.env.PRINTFUL_API_KEY ?? import.meta.env?.PRINTFUL_API_KEY;
  if (!key) throw new PrintfulNotConfiguredError();
  return key;
}

function getStoreId(): string | undefined {
  return (
    process.env.PRINTFUL_STORE_ID ?? import.meta.env?.PRINTFUL_STORE_ID ?? undefined
  );
}

export function isPrintfulConfigured(): boolean {
  return Boolean(process.env.PRINTFUL_API_KEY ?? import.meta.env?.PRINTFUL_API_KEY);
}

async function pfGet<T>(path: string): Promise<PrintfulListResponse<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
  const storeId = getStoreId();
  if (storeId) headers["X-PF-Store-Id"] = storeId;

  const res = await fetch(`${PRINTFUL_API_BASE}${path}`, { headers });
  const json = (await res.json().catch(() => null)) as PrintfulListResponse<T> | null;
  if (!res.ok || !json) {
    const msg = json?.error?.message ?? res.statusText;
    throw new PrintfulApiError(res.status, `Printful GET ${path} failed: ${msg}`);
  }
  return json;
}

/** List every synced product in the store (paginated). */
export async function listStoreProducts(): Promise<PrintfulSyncProductSummary[]> {
  const out: PrintfulSyncProductSummary[] = [];
  const limit = 100;
  let offset = 0;
  for (;;) {
    const page = await pfGet<PrintfulSyncProductSummary[]>(
      `/store/products?offset=${offset}&limit=${limit}`,
    );
    out.push(...page.result);
    const total = page.paging?.total ?? out.length;
    offset += limit;
    if (offset >= total || page.result.length === 0) break;
  }
  return out;
}

/** Fetch one product's full detail (sync_product + sync_variants). */
export async function getSyncProduct(
  syncProductId: number,
): Promise<PrintfulSyncProductDetail> {
  const res = await pfGet<PrintfulSyncProductDetail>(
    `/store/products/${syncProductId}`,
  );
  return res.result;
}
