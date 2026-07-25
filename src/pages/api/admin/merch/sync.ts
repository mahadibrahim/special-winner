import type { APIRoute } from "astro";
import { requireOrgAdminAccess } from "@/lib/auth";
import { isPrintfulConfigured, PrintfulApiError } from "@/lib/printful/client";
import { syncMerchCatalog } from "@/lib/merch/sync";
import { listActiveMerchProducts } from "@/lib/merch/catalog";

/** GET — current synced catalog + whether Printful is configured (for the admin panel). */
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const products = await listActiveMerchProducts(auth.organizationId);
  return new Response(
    JSON.stringify({ configured: isPrintfulConfigured(), products }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

/** POST — pull the Printful store catalog into this org's merch tables. */
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  if (!isPrintfulConfigured()) {
    return new Response(
      JSON.stringify({ error: "Printful is not configured (PRINTFUL_API_KEY missing)" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const orgName = context.locals.organization?.name ?? "Aspire Sports";
    const result = await syncMerchCatalog(auth.organizationId, orgName);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof PrintfulApiError) {
      console.error("Merch sync — Printful API error:", error.status, error.message);
      return new Response(
        JSON.stringify({ error: "Printful request failed", detail: error.message }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
    console.error("Merch sync failed:", error);
    return new Response(JSON.stringify({ error: "Merch sync failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
