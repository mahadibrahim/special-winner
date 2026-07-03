import type { APIRoute } from "astro";
import { requireOrgAdminAccess } from "@/lib/auth";
import { isZernioConfigured } from "@/lib/zernio/messaging";
import { provisionOpsGroup, syncOpsGroupMembers } from "@/lib/ops/whatsapp";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  if (!isZernioConfigured()) {
    return new Response(
      JSON.stringify({ error: "Zernio is not configured (ZERNIO_API_KEY / ZERNIO_ACCOUNT_ID)" }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const group = await provisionOpsGroup(auth.organizationId);
    await syncOpsGroupMembers(auth.organizationId);
    return new Response(
      JSON.stringify({ groupId: group.groupId, inviteLink: group.inviteLink }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[ops] provision failed:", err);
    return new Response(JSON.stringify({ error: "Provisioning failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
