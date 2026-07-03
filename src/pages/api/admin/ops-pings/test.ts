import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { requireOrgAdminAccess } from "@/lib/auth";
import { sendOpsPing } from "@/lib/ops/ping";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const channel = await sendOpsPing(auth.organizationId, {
    kind: "test",
    brand: "aspire",
    eventId: crypto.randomUUID(),
    label: "Test ping from admin settings",
  });

  return new Response(JSON.stringify({ ok: true, channel }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
