import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { hostGameReports } from "@/lib/db/schema/hosts";
import { requireHostOfSession } from "@/lib/auth/host";
import { sendOpsPing } from "@/lib/ops/ping";
import { brandFromHost } from "@/lib/organization/soccerone-routing";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** POST /api/host/games/:id/report — one wrap-up per game, from kickoff on. */
export const POST: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);
  const auth = await requireHostOfSession(context, id);
  if (!auth.authorized) return auth.response;

  if (new Date() < auth.session.startsAt) {
    return json({ error: "Wrap-up opens at game time", code: "too_early" }, 400);
  }

  let body: { summary?: string; incidentFlagged?: boolean; incidentDetails?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const summary = (body.summary ?? "").trim();
  if (!summary || summary.length > 5000) {
    return json({ error: "summary required (max 5000 chars)" }, 400);
  }

  try {
    await getDb().insert(hostGameReports).values({
      sessionId: id,
      hostProfileId: auth.profile.id,
      summary,
      incidentFlagged: body.incidentFlagged === true,
      incidentDetails: body.incidentFlagged === true ? (body.incidentDetails ?? null) : null,
    });
  } catch (err: any) {
    // Unique(sessionId) violation → already reported. Postgres surfaces the
    // unique_violation as SQLSTATE 23505 (sometimes nested under `.cause`
    // depending on the driver wrapping) — matching err.message against the
    // constraint name is NOT reliable, the driver's message text doesn't
    // consistently include it. See src/pages/api/referee/matches/[gameId]/check-in.ts
    // for the same pattern.
    if (err?.code === "23505" || err?.cause?.code === "23505") {
      return json({ error: "Wrap-up already submitted", code: "already_reported" }, 409);
    }
    throw err;
  }

  // Incident → instant ops ping (awaited: serverless freeze drops
  // fire-and-forget work; sendOpsPing itself never throws).
  if (body.incidentFlagged === true) {
    await sendOpsPing(auth.organizationId, {
      kind: "host_incident",
      brand: brandFromHost(context.request.headers.get("host") ?? ""),
      eventId: id,
      label: `${auth.session.sportOrClassLabel} — ${summary.slice(0, 80)}`,
    });
  }
  return json({ ok: true }, 200);
};
