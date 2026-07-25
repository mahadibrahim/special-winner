import type {
  PrintfulListResponse,
  PrintfulSyncProductSummary,
  PrintfulSyncProductDetail,
  PrintfulRecipient,
  PrintfulShippingRate,
  PrintfulOrderResult,
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

async function pfPost<T>(path: string, body: unknown): Promise<PrintfulListResponse<T>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
  const storeId = getStoreId();
  if (storeId) headers["X-PF-Store-Id"] = storeId;
  const res = await fetch(`${PRINTFUL_API_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as PrintfulListResponse<T> | null;
  if (!res.ok || !json) {
    const msg = json?.error?.message ?? res.statusText;
    throw new PrintfulApiError(res.status, `Printful POST ${path} failed: ${msg}`);
  }
  return json;
}

/** Live shipping rates for a recipient + items (catalog variant ids). */
export async function calculateShipping(
  recipient: PrintfulRecipient,
  items: { variant_id: number; quantity: number }[],
): Promise<PrintfulShippingRate[]> {
  const res = await pfPost<PrintfulShippingRate[]>("/shipping/rates", { recipient, items });
  return res.result;
}

/** Create an order. confirm:true submits it for fulfillment; false = draft. */
export async function createOrder(
  payload: {
    recipient: PrintfulRecipient;
    items: { sync_variant_id: number; quantity: number }[];
    shipping?: string;
    external_id?: string;
  },
  opts: { confirm: boolean },
): Promise<PrintfulOrderResult> {
  const res = await pfPost<PrintfulOrderResult>(
    `/orders${opts.confirm ? "?confirm=1" : ""}`,
    payload,
  );
  return res.result;
}

export async function getOrder(id: number | string): Promise<PrintfulOrderResult> {
  const res = await pfGet<PrintfulOrderResult>(`/orders/${id}`);
  return res.result;
}
