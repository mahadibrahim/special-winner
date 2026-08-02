#!/usr/bin/env node
// Aspire admin MCP — scoped catalog administration over the existing admin
// HTTP API. Capabilities are the tool list below and nothing else: there are
// deliberately NO tools for refunds, deletes, registrations, payments, users,
// or messaging, and the server-side token scopes enforce the same boundary
// independently (catalog:read / catalog:write).
//
// Env:
//   ASPIRE_ADMIN_TOKEN — required; minted by scripts/mint-admin-api-token.ts
//   ASPIRE_BASE_URL    — default https://aspiresportsohio.com
//
// Every mutating tool is confirm-gated: called without confirm:true it only
// returns a preview of exactly what would change.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = (process.env.ASPIRE_BASE_URL ?? "https://aspiresportsohio.com").replace(/\/$/, "");
const TOKEN = process.env.ASPIRE_ADMIN_TOKEN;
if (!TOKEN) {
  console.error("ASPIRE_ADMIN_TOKEN is not set. Mint one with scripts/mint-admin-api-token.ts.");
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "x-admin-token": TOKEN,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${json.error ?? text.slice(0, 300)}`);
  }
  return json;
}

const ok = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (err) => ({
  isError: true,
  content: [{ type: "text", text: String(err?.message ?? err) }],
});

/** Fields a season PUT payload carries — mirror of the server's seasonSchema. */
const SEASON_FIELDS = [
  "programId", "ageGroupId", "venueId", "name", "slug", "startDate", "endDate",
  "registrationOpens", "registrationCloses", "maxParticipants", "priceCents",
  "teamPriceCents", "halfDayPriceCents", "minAge", "maxAge", "signupModes",
  "earlyBirdDeadline", "earlyBirdPriceCents", "earlyBirdTeamPriceCents",
  "depositCents", "allowDeposit", "status", "scheduleNotes", "termSlug",
  "termLabel", "divisionGender", "skillLevel", "dayOfWeek", "startTime", "endTime",
];
const PROGRAM_FIELDS = [
  "locationId", "sportId", "venueId", "name", "slug", "description",
  "programType", "active", "audienceType",
];

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function diff(current, next) {
  const changes = {};
  for (const k of Object.keys(next)) {
    const a = JSON.stringify(current[k] ?? null);
    const b = JSON.stringify(next[k] ?? null);
    if (a !== b) changes[k] = { from: current[k] ?? null, to: next[k] ?? null };
  }
  return changes;
}

async function getSeasonRow(id) {
  const { seasons } = await api("GET", "/api/admin/seasons?include_test=1");
  const row = (seasons ?? []).find((s) => s.id === id);
  if (!row) throw new Error(`Season ${id} not found in this organization`);
  return row;
}

async function getProgramRow(id) {
  const { programs } = await api("GET", "/api/admin/programs");
  const row = (programs ?? []).find((p) => p.id === id);
  if (!row) throw new Error(`Program ${id} not found in this organization`);
  return row;
}

/** Season DB row → full PUT payload (the merge base). */
function seasonRowToPayload(row) {
  return pick(
    { ...row, programId: row.program?.id },
    SEASON_FIELDS,
  );
}

/** Program DB row → full PUT payload (the merge base). */
function programRowToPayload(row) {
  return pick(
    {
      ...row,
      locationId: row.location?.id,
      sportId: row.sport?.id,
      venueId: row.venue?.id ?? row.venueId ?? null,
      description: row.description ?? undefined,
    },
    PROGRAM_FIELDS,
  );
}

const server = new McpServer({ name: "aspire-admin", version: "0.1.0" });

// ---------------------------------------------------------------- reads ----
server.tool(
  "list_locations",
  "List the organization's locations (venues) with ids — use these ids in create_offering.",
  {},
  async () => api("GET", "/api/admin/locations").then(ok).catch(fail),
);

server.tool(
  "list_sports",
  "List the organization's sports with ids — use these ids in create_offering.",
  {},
  async () => api("GET", "/api/admin/sports").then(ok).catch(fail),
);

server.tool(
  "list_programs",
  "List programs (the container a season/division belongs to): name, slug, type, audience, location, sport.",
  {},
  async () => api("GET", "/api/admin/programs").then(ok).catch(fail),
);

server.tool(
  "list_seasons",
  "List seasons/divisions with full catalog detail (dates, prices in cents, early-bird, status, division metadata).",
  { includeTest: z.boolean().optional().describe("Include test/E2E fixture rows (default false)") },
  async ({ includeTest }) =>
    api("GET", `/api/admin/seasons${includeTest ? "?include_test=1" : ""}`).then(ok).catch(fail),
);

// ------------------------------------------------------------- mutations ----
const confirmNote =
  "Without confirm:true this only previews. Re-call with confirm:true to apply.";

server.tool(
  "create_offering",
  `Create a program + its first season atomically (the correct path — it can set audienceType). All prices are in CENTS. ${confirmNote}`,
  {
    programType: z.enum(["camp", "tournament", "league"]),
    locationId: z.string().uuid(),
    sportId: z.string().uuid(),
    name: z.string().min(1).describe("Program name, e.g. 'Adult 4v4 Flag Football League'"),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    audienceType: z.string().max(20).optional().describe("'adults' for adult per-player pricing"),
    season: z.record(z.string(), z.any()).describe("seasonSchema payload: name, slug, startDate, endDate, priceCents, ... (cents!)"),
    confirm: z.boolean().optional(),
  },
  async ({ confirm, ...payload }) => {
    try {
      if (!confirm) {
        return ok({ action: "create_offering (PREVIEW — not applied)", payload, next: confirmNote });
      }
      return ok(await api("POST", "/api/admin/offerings", payload));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "update_season",
  `Update fields on an existing season/division (e.g. set minAge, prices in cents, day, status). Unspecified fields keep their current values. ${confirmNote}`,
  {
    id: z.string().uuid(),
    changes: z.record(z.string(), z.any()).describe(`Any of: ${SEASON_FIELDS.join(", ")}`),
    confirm: z.boolean().optional(),
  },
  async ({ id, changes, confirm }) => {
    try {
      const unknown = Object.keys(changes).filter((k) => !SEASON_FIELDS.includes(k));
      if (unknown.length) throw new Error(`Unknown season field(s): ${unknown.join(", ")}`);
      const row = await getSeasonRow(id);
      const base = seasonRowToPayload(row);
      const next = { ...base, ...changes };
      const changed = diff(base, next);
      if (Object.keys(changed).length === 0) {
        return ok({ action: "update_season", id, note: "No effective changes." });
      }
      if (!confirm) {
        return ok({
          action: "update_season (PREVIEW — not applied)",
          id,
          season: row.name,
          changes: changed,
          next: confirmNote,
        });
      }
      return ok(await api("PUT", "/api/admin/seasons", { id, ...next }));
    } catch (err) {
      return fail(err);
    }
  },
);

server.tool(
  "update_program",
  `Update fields on an existing program (name, active, audienceType, ...). Unspecified fields keep their current values. ${confirmNote}`,
  {
    id: z.string().uuid(),
    changes: z.record(z.string(), z.any()).describe(`Any of: ${PROGRAM_FIELDS.join(", ")}`),
    confirm: z.boolean().optional(),
  },
  async ({ id, changes, confirm }) => {
    try {
      const unknown = Object.keys(changes).filter((k) => !PROGRAM_FIELDS.includes(k));
      if (unknown.length) throw new Error(`Unknown program field(s): ${unknown.join(", ")}`);
      const row = await getProgramRow(id);
      const base = programRowToPayload(row);
      const next = { ...base, ...changes };
      const changed = diff(base, next);
      if (Object.keys(changed).length === 0) {
        return ok({ action: "update_program", id, note: "No effective changes." });
      }
      if (!confirm) {
        return ok({
          action: "update_program (PREVIEW — not applied)",
          id,
          program: row.name,
          changes: changed,
          next: confirmNote,
        });
      }
      return ok(await api("PUT", "/api/admin/programs", { id, ...next }));
    } catch (err) {
      return fail(err);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
