import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { futsalInterest } from "@/lib/db/schema/futsal-interest";

export const prerender = false;

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, locals }) => {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const email = (body.email ?? "").trim();
  if (!email || !EMAIL_RX.test(email)) {
    return json({ error: "A valid email is required" }, 422);
  }
  await getDb()
    .insert(futsalInterest)
    .values({
      organizationId: locals.organization?.id ?? null,
      email,
      emailCanonical: email.toLowerCase(),
      source: "rent_page",
    })
    .onConflictDoNothing({ target: futsalInterest.emailCanonical });
  return json({ ok: true }, 200);
};
