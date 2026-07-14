import type { APIRoute } from "astro";
import { requireHostOfSession } from "@/lib/auth/host";
import { applyAttendanceEntries, type AttendanceEntry } from "@/lib/dropin/attendance";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** POST /api/host/games/:id/attendance — host-scoped mirror of the admin endpoint. */
export const POST: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);
  const auth = await requireHostOfSession(context, id);
  if (!auth.authorized) return auth.response;

  let body: { entries?: AttendanceEntry[] };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.entries || !Array.isArray(body.entries)) {
    return json({ error: "entries[] required" }, 400);
  }
  const { updated } = await applyAttendanceEntries(id, body.entries);
  return json({ ok: true, updated }, 200);
};
