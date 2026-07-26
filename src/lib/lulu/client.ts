import type {
  LuluCostLineItem, LuluAddressInput, LuluPrintJobLineItemInput,
  LuluShippingLevel, LuluTracking,
} from "./types";

// process.env first — Netlify SSR inlines import.meta.env at build time, so a
// rotated runtime secret only reads reliably via process.env (same as printful/client.ts).
const env = (k: string): string | undefined =>
  process.env[k] ?? (import.meta as any).env?.[k];

const apiBase = (): string => env("LULU_API_BASE") ?? "https://api.lulu.com";
const isMock = (): boolean => env("LULU_MOCK") === "1";

export class LuluNotConfiguredError extends Error {
  constructor() { super("LULU_CLIENT_KEY / LULU_CLIENT_SECRET are not set"); this.name = "LuluNotConfiguredError"; }
}
export class LuluApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "LuluApiError"; }
}

export function isLuluConfigured(): boolean {
  return isMock() || Boolean(env("LULU_CLIENT_KEY") && env("LULU_CLIENT_SECRET"));
}

// ---- OAuth2 client-credentials token, cached until shortly before expiry ----
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  const key = env("LULU_CLIENT_KEY");
  const secret = env("LULU_CLIENT_SECRET");
  if (!key || !secret) throw new LuluNotConfiguredError();
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  const res = await fetch(`${apiBase()}/auth/realms/glasstree/protocol/openid-connect/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  const json = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!res.ok || !json?.access_token) {
    throw new LuluApiError(res.status, `Lulu token request failed: ${res.statusText}`);
  }
  cachedToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 300) * 1000 };
  return cachedToken.token;
}

async function luluFetch<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let token = await getToken();
  let res = await fetch(`${apiBase()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  // If 401, cached token is stale; invalidate and retry once with a fresh token
  if (res.status === 401) {
    cachedToken = null;
    token = await getToken();
    res = await fetch(`${apiBase()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  const json = (await res.json().catch(() => null)) as T | null;
  if (!res.ok || json === null) {
    throw new LuluApiError(res.status, `Lulu ${method} ${path} failed: ${res.statusText}`);
  }
  return json;
}

/** Lulu returns money as decimal strings (e.g. "12.34"). */
function toCents(s: string | number | null | undefined): number {
  if (s == null) return 0;
  const n = typeof s === "number" ? s : parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function toLuluAddressPayload(a: LuluAddressInput) {
  return {
    name: a.name,
    street1: a.street1,
    ...(a.street2 ? { street2: a.street2 } : {}),
    city: a.city,
    state_code: a.stateCode,
    postcode: a.postcode,
    country_code: a.countryCode,
    ...(a.phoneNumber ? { phone_number: a.phoneNumber } : {}),
  };
}

// Mock shipping table — keep in sync with tests/unit/lulu/client.test.ts.
const MOCK_SHIPPING_CENTS: Record<LuluShippingLevel, number> = {
  MAIL: 399, PRIORITY_MAIL: 899, GROUND: 599, EXPEDITED: 1299, EXPRESS: 2499,
};
const MOCK_PRINT_CENTS_PER_UNIT = 700;

/** Per-level cost: one POST /print-job-cost-calculations/ call. */
export async function calculatePrintJobCost(args: {
  lineItems: LuluCostLineItem[];
  address: LuluAddressInput;
  level: LuluShippingLevel;
}): Promise<{ shippingCents: number; printCents: number }> {
  if (isMock()) {
    const qty = args.lineItems.reduce((s, l) => s + l.quantity, 0);
    return { shippingCents: MOCK_SHIPPING_CENTS[args.level], printCents: MOCK_PRINT_CENTS_PER_UNIT * qty };
  }
  const res = await luluFetch<{
    line_item_costs?: { total_cost_incl_tax?: string }[] | null;
    shipping_cost?: { total_cost_incl_tax?: string } | null;
  }>("POST", "/print-job-cost-calculations/", {
    line_items: args.lineItems.map((l) => ({
      pod_package_id: l.podPackageId, page_count: l.pageCount, quantity: l.quantity,
    })),
    shipping_address: toLuluAddressPayload(args.address),
    shipping_option: args.level,
  });
  const printCents = (res.line_item_costs ?? []).reduce((s, li) => s + toCents(li.total_cost_incl_tax), 0);
  return { shippingCents: toCents(res.shipping_cost?.total_cost_incl_tax), printCents };
}

/** Create (and pay for, via the Lulu account's stored payment method) a print job. */
export async function createPrintJob(args: {
  externalId: string;
  contactEmail: string;
  lineItems: LuluPrintJobLineItemInput[];
  address: LuluAddressInput;
  level: LuluShippingLevel;
}): Promise<{ id: string; status: string }> {
  if (isMock()) return { id: `mock-lulu-${args.externalId}`, status: "CREATED" };
  const res = await luluFetch<{ id: number | string; status?: { name?: string } }>("POST", "/print-jobs/", {
    contact_email: args.contactEmail,
    external_id: args.externalId,
    line_items: args.lineItems.map((l) => ({
      title: l.title,
      pod_package_id: l.podPackageId,
      page_count: l.pageCount,
      quantity: l.quantity,
      printable_normalization: {
        interior: { source_url: l.interiorUrl },
        cover: { source_url: l.coverUrl },
      },
    })),
    shipping_address: toLuluAddressPayload(args.address),
    shipping_level: args.level,
  });
  return { id: String(res.id), status: res.status?.name ?? "CREATED" };
}

export async function getPrintJob(id: string): Promise<{ id: string; status: string; tracking: LuluTracking }> {
  if (isMock()) {
    return {
      id, status: "SHIPPED",
      tracking: { trackingId: "MOCK-TRACK-123", trackingUrl: "https://tracking.example/MOCK-TRACK-123", carrier: "USPS" },
    };
  }
  const res = await luluFetch<{
    id: number | string;
    status?: { name?: string } | null;
    line_items?: { tracking_id?: string | null; tracking_urls?: string[] | null; carrier_name?: string | null }[] | null;
  }>("GET", `/print-jobs/${id}/`);
  const li = (res.line_items ?? []).find((l) => l.tracking_id) ?? null;
  return {
    id: String(res.id),
    status: res.status?.name ?? "UNKNOWN",
    tracking: {
      trackingId: li?.tracking_id ?? null,
      trackingUrl: li?.tracking_urls?.[0] ?? null,
      carrier: li?.carrier_name ?? null,
    },
  };
}
