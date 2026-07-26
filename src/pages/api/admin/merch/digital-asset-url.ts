import type { APIRoute } from "astro";
import { z } from "zod";
import { getSignedPutUrl } from "@/lib/storage/r2";
import { requireOrgAdminAccess } from "@/lib/auth";

export const prerender = false;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// Digital merch assets are buyer-facing downloads (guides, playbooks, media
// packs) — not arbitrary uploads. Keep the allowlist narrow; widen only when
// a real product needs a new type.
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/epub+zip",
  "application/zip",
  "image/png",
  "image/jpeg",
]);

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
});

/** Strip any path separators and unsafe characters, keeping a safe basename. */
function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() || "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 150);
  return cleaned || "file";
}

/**
 * POST /api/admin/merch/digital-asset-url
 *
 * Issues a short-lived presigned R2 PUT for a digital merch product's
 * downloadable file. The admin editor uploads directly to R2 (Netlify
 * function bodies cap far below typical file sizes), then submits the
 * returned `key` back to store-products as `digitalAssetKey`.
 */
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const parsed = bodySchema.safeParse(await context.request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);

  const { filename, contentType } = parsed.data;
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return json({ error: `Unsupported file type: ${contentType}` }, 400);
  }

  const key = `merch-digital/${auth.organizationId}/${crypto.randomUUID()}-${sanitizeFilename(filename)}`;

  try {
    const uploadUrl = await getSignedPutUrl(key, contentType, { expiresInSeconds: 900 });
    return json({ uploadUrl, key });
  } catch (err) {
    // R2 env absent (local dev without storage config) — expected, not a 500.
    console.warn("[merch] digital-asset-url unavailable (R2 not configured)", err);
    return json({ error: "Uploads unavailable", code: "storage_unavailable" }, 503);
  }
};
