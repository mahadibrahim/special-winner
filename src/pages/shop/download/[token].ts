import type { APIRoute } from "astro";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchDownloadGrants } from "@/lib/db/schema";
import { isGrantExpired } from "@/lib/merch/digital-delivery";
import { getSignedGetUrl } from "@/lib/storage/r2";

// Dynamic: reads a route param and hits the DB on every request. Public —
// guests download via the tokenized link in their delivery email, no auth.
export const prerender = false;

function page(status: number, title: string, body: string): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1><p>${body}</p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const GET: APIRoute = async ({ params }) => {
  const token = params.token;
  if (!token) return page(404, "Not found", "This download link is invalid.");

  const db = getDb();
  const [grant] = await db
    .select()
    .from(merchDownloadGrants)
    .where(eq(merchDownloadGrants.token, token))
    .limit(1);

  if (!grant) {
    return page(404, "Not found", "This download link is invalid.");
  }

  if (isGrantExpired(grant, new Date())) {
    return page(
      410,
      "Link expired",
      "This download link has expired. Contact support if you still need this file.",
    );
  }

  await db
    .update(merchDownloadGrants)
    .set({ downloadCount: sql`${merchDownloadGrants.downloadCount} + 1` })
    .where(eq(merchDownloadGrants.id, grant.id));

  const disposition = `attachment; filename="${grant.assetName.replace(/"/g, "")}"`;

  // Mirrors the R2_MOCK short-circuit used by
  // src/pages/api/admin/coaches/credentials/[id]/document.ts — getSignedGetUrl
  // has no built-in R2_MOCK awareness, so routes that need a mock-friendly
  // redirect (local dev / CI without real R2 credentials) check it here.
  if (process.env.R2_MOCK === "1") {
    return new Response(null, {
      status: 302,
      headers: { Location: `https://mock-r2.local/${grant.assetKey}` },
    });
  }

  try {
    const url = await getSignedGetUrl(grant.assetKey, {
      expiresInSeconds: 300,
      responseContentDisposition: disposition,
    });
    return new Response(null, { status: 302, headers: { Location: url } });
  } catch (err) {
    console.error("merch digital download: R2 signing failed", err);
    return page(
      503,
      "Download temporarily unavailable",
      "We couldn't prepare your file right now. Please try again shortly.",
    );
  }
};
