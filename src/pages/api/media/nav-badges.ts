import type { APIRoute } from "astro";
import { getTaggingQueue } from "@/lib/media/get-tagging-queue";

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

// Editor tagging-queue count for the media sidebar badge. Fail-soft: any error
// (or non-editor) returns { mediaQueue: 0 }, never 500.
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  const roleNames = (locals.userRoles ?? []).map((r) => r.name);
  if (!roleNames.includes("media_editor")) return json({ mediaQueue: 0 });
  try {
    const queue = await getTaggingQueue(locals.user.id);
    return json({ mediaQueue: queue.length });
  } catch {
    return json({ mediaQueue: 0 });
  }
};
