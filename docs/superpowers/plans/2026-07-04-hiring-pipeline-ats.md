# Hiring Pipeline (Coach/Ref ATS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Candidates apply for referee/coach/staff roles at `/careers`; applications persist in Postgres (source of truth), sync to a Notion "Hiring Pipeline" board, and email hello@ — per `docs/superpowers/specs/2026-07-04-hiring-pipeline-ats-design.md`.

**Architecture:** Public form → `POST /api/public/careers/apply` (zod + Turnstile + rate limit) → `job_applications` insert → best-effort Notion page + Resend email. Hourly cron retries unsynced rows. Read-only admin fallback list.

**Tech Stack:** Astro 5 + React 19, Drizzle/Postgres, zod, `@notionhq/client` (new dep), Cloudflare Turnstile (`src/lib/auth/turnstile.ts`), R2 (`src/lib/storage/r2.ts`), Resend (`src/lib/email`).

## Global Constraints

- Branch: work on `feat/hiring-pipeline-ats` (spec is already committed there).
- Schema changes MUST go through `npm run db:generate` → commit the generated `src/lib/db/migrations/NNNN_*.sql`. NEVER `db:push` (CLAUDE.md).
- All new server env reads use `import.meta.env` (matches email/turnstile libs); R2 lib internally uses `process.env` — don't change it.
- Missing `NOTION_API_KEY` / `NOTION_ATS_DATABASE_ID` must make Notion sync a silent no-op (feature-gated env convention).
- Refinement over spec: the DB column is `resume_key` (R2 object key), NOT a URL — signed URLs expire, so the admin endpoint `/api/admin/applications/[id]/resume` redirects to a fresh signed URL, and Notion's Resume property links to that endpoint.
- UI: ErrorBanner for form-level errors, sonner for transient errors, EmptyState/LoadingSkeleton in admin (CLAUDE.md UI primitives). `useHydrationBeacon()` on the top-level `client:load` component.
- `npx tsc --noEmit` must stay at zero errors after every task.
- Commit after every task (conventional commits + Claude co-author trailer).
- Unit tests: `npx vitest run tests/unit/careers tests/unit/notion`. API tests need the dev server (`R2_MOCK=1 CRON_SECRET=localtest E2E_TEST_ENDPOINTS=yes ./scripts/with-bws.sh npm run dev`) and run via `CRON_SECRET=localtest TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run tests/api/careers`.

---

### Task 1: `job_applications` schema + migration

**Files:**
- Create: `src/lib/db/schema/job-applications.ts`
- Modify: `src/lib/db/schema/index.ts` (add export)
- Create (generated): `src/lib/db/migrations/NNNN_*.sql`

**Interfaces:**
- Produces: `jobApplications` table, `jobApplicationRoleEnum`, types `JobApplication` / `NewJobApplication` — consumed by Tasks 3, 4, 5, 7.

- [ ] **Step 1: Write the schema file** (mirror `corporate-inquiries.ts` style)

```ts
// src/lib/db/schema/job-applications.ts
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * Coach/ref/staff job applications (the site-side half of the Notion ATS).
 * This table is the source of truth; Notion is a synced pipeline view —
 * see docs/superpowers/specs/2026-07-04-hiring-pipeline-ats-design.md.
 *
 * `status` exists only for the admin fallback list (new → archived);
 * hiring stages live in Notion and are never synced back.
 */
export const jobApplicationRoleEnum = pgEnum("job_application_role", [
  "referee",
  "coach",
  "staff",
]);

export const jobApplications = pgTable("job_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id, {
    onDelete: "set null",
  }),
  brand: varchar("brand", { length: 30 }).default("aspire").notNull(),

  role: jobApplicationRoleEnum("role").notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 30 }),
  preferredLocation: varchar("preferred_location", { length: 30 }), // worthington | downtown | either
  certifications: text("certifications"),
  experience: text("experience").notNull(),
  availability: text("availability").array().default([]).notNull(), // weeknights | weekends | mornings
  resumeKey: text("resume_key"), // R2 object key, not a URL (signed URLs expire)
  source: varchar("source", { length: 200 }),

  status: varchar("status", { length: 30 }).default("new").notNull(),
  notionPageId: varchar("notion_page_id", { length: 64 }),
  notionSyncedAt: timestamp("notion_synced_at"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type JobApplication = typeof jobApplications.$inferSelect;
export type NewJobApplication = typeof jobApplications.$inferInsert;
```

- [ ] **Step 2: Export from the schema index**

In `src/lib/db/schema/index.ts`, add (alphabetical near the corporate-inquiries line):

```ts
export * from "./job-applications";
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: a new `src/lib/db/migrations/NNNN_<name>.sql` containing `CREATE TYPE "public"."job_application_role"` and `CREATE TABLE "job_applications"`. Review it — additive only.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema/ src/lib/db/migrations/
git commit -m "feat(careers): job_applications schema + migration

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Shared zod schema for applications

**Files:**
- Create: `src/lib/careers/application-schema.ts`
- Test: `tests/unit/careers/application-schema.test.ts`

**Interfaces:**
- Produces: `jobApplicationSchema` (zod), `type JobApplicationInput = z.infer<typeof jobApplicationSchema>`, constants `APPLICATION_ROLES`, `APPLICATION_LOCATIONS`, `APPLICATION_AVAILABILITY` — consumed by Tasks 4 (server parse) and 6 (client form).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/careers/application-schema.test.ts
import { describe, expect, it } from "vitest";
import { jobApplicationSchema } from "@/lib/careers/application-schema";

const valid = {
  role: "referee",
  firstName: "Jordan",
  lastName: "Reyes",
  email: "jordan@example.com",
  phone: "614-555-0100",
  preferredLocation: "worthington",
  certifications: "USSF Grassroots Referee",
  experience: "Three seasons officiating adult coed leagues.",
  availability: ["weeknights", "weekends"],
  source: "Instagram",
};

describe("jobApplicationSchema", () => {
  it("accepts a complete application", () => {
    expect(jobApplicationSchema.parse(valid)).toMatchObject({ role: "referee" });
  });

  it("requires role, names, email, experience", () => {
    for (const key of ["role", "firstName", "lastName", "email", "experience"]) {
      const { [key]: _omitted, ...rest } = valid as Record<string, unknown>;
      expect(jobApplicationSchema.safeParse(rest).success).toBe(false);
    }
  });

  it("rejects unknown role and location values", () => {
    expect(jobApplicationSchema.safeParse({ ...valid, role: "janitor" }).success).toBe(false);
    expect(jobApplicationSchema.safeParse({ ...valid, preferredLocation: "cleveland" }).success).toBe(false);
  });

  it("defaults availability to [] and tolerates missing optionals", () => {
    const { phone, certifications, source, availability, preferredLocation, ...required } = valid;
    const parsed = jobApplicationSchema.parse(required);
    expect(parsed.availability).toEqual([]);
  });

  it("rejects invalid availability entries", () => {
    expect(jobApplicationSchema.safeParse({ ...valid, availability: ["midnight"] }).success).toBe(false);
  });

  it("trims and bounds text fields", () => {
    expect(jobApplicationSchema.safeParse({ ...valid, experience: "x".repeat(5001) }).success).toBe(false);
    expect(jobApplicationSchema.parse({ ...valid, firstName: "  Jordan  " }).firstName).toBe("Jordan");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/careers/application-schema.test.ts`
Expected: FAIL — cannot resolve `@/lib/careers/application-schema`.

- [ ] **Step 3: Implement the schema**

```ts
// src/lib/careers/application-schema.ts
import { z } from "zod";

/**
 * Shared client/server validation for /careers applications. The API route
 * parses FormData through this; the React form mirrors it via
 * @hookform/resolvers. Keep in sync with the job_applications columns.
 */
export const APPLICATION_ROLES = ["referee", "coach", "staff"] as const;
export const APPLICATION_LOCATIONS = ["worthington", "downtown", "either"] as const;
export const APPLICATION_AVAILABILITY = ["weeknights", "weekends", "mornings"] as const;

export const jobApplicationSchema = z.object({
  role: z.enum(APPLICATION_ROLES),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(320),
  phone: z.string().trim().max(30).optional(),
  preferredLocation: z.enum(APPLICATION_LOCATIONS).optional(),
  certifications: z.string().trim().max(2000).optional(),
  experience: z.string().trim().min(1).max(5000),
  availability: z.array(z.enum(APPLICATION_AVAILABILITY)).default([]),
  source: z.string().trim().max(200).optional(),
});

export type JobApplicationInput = z.infer<typeof jobApplicationSchema>;
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/careers/application-schema.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/careers/ tests/unit/careers/
git commit -m "feat(careers): shared application validation schema

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Notion sync lib

**Files:**
- Create: `src/lib/notion/ats.ts`
- Test: `tests/unit/notion/ats.test.ts`
- Modify: `package.json` (add `@notionhq/client`)

**Interfaces:**
- Consumes: `JobApplication` from Task 1.
- Produces:
  - `isNotionConfigured(): boolean`
  - `buildApplicationPageParams(app: JobApplication, databaseId: string, appBaseUrl: string): CreatePageParameters` (pure — unit-tested)
  - `createNotionApplicationPage(app: JobApplication): Promise<string | null>` — pageId on success, `null` when unconfigured or on failure (logs, never throws). Consumed by Tasks 4 and 5.

- [ ] **Step 1: Install the SDK**

Run: `npm install @notionhq/client`
Expected: added to `dependencies` in package.json.

- [ ] **Step 2: Write the failing test (pure builder only)**

```ts
// tests/unit/notion/ats.test.ts
import { describe, expect, it } from "vitest";
import { buildApplicationPageParams } from "@/lib/notion/ats";
import type { JobApplication } from "@/lib/db/schema/job-applications";

const app: JobApplication = {
  id: "11111111-2222-4333-8444-555555555555",
  organizationId: null,
  brand: "aspire",
  role: "referee",
  firstName: "Jordan",
  lastName: "Reyes",
  email: "jordan@example.com",
  phone: "614-555-0100",
  preferredLocation: "worthington",
  certifications: "USSF Grassroots",
  experience: "Three seasons officiating adult coed.",
  availability: ["weeknights", "weekends"],
  resumeKey: "careers/resumes/abc.pdf",
  source: "Instagram",
  status: "new",
  notionPageId: null,
  notionSyncedAt: null,
  createdAt: new Date("2026-07-04T12:00:00Z"),
};

describe("buildApplicationPageParams", () => {
  it("maps the application onto the Hiring Pipeline properties", () => {
    const params = buildApplicationPageParams(app, "db-123", "https://aspiresportsohio.com");
    expect(params.parent).toEqual({ database_id: "db-123" });
    const p = params.properties as Record<string, any>;
    expect(p["Name"].title[0].text.content).toBe("Jordan Reyes");
    expect(p["Role"].select.name).toBe("Referee");
    expect(p["Status"].select.name).toBe("New");
    expect(p["Email"].email).toBe("jordan@example.com");
    expect(p["Facility"].select.name).toBe("Worthington");
    expect(p["Availability"].multi_select).toEqual([{ name: "weeknights" }, { name: "weekends" }]);
    expect(p["Resume"].url).toBe(
      "https://aspiresportsohio.com/api/admin/applications/11111111-2222-4333-8444-555555555555/resume",
    );
    expect(p["Applied"].date.start).toBe("2026-07-04");
  });

  it("omits empty optionals instead of sending empty Notion values", () => {
    const bare = { ...app, phone: null, preferredLocation: null, certifications: null, resumeKey: null, source: null, availability: [] };
    const p = buildApplicationPageParams(bare, "db-123", "https://x.test").properties as Record<string, any>;
    expect(p["Phone"]).toBeUndefined();
    expect(p["Facility"]).toBeUndefined();
    expect(p["Resume"]).toBeUndefined();
    expect(p["Availability"]).toBeUndefined();
  });

  it("puts the experience blurb in the page body", () => {
    const params = buildApplicationPageParams(app, "db-123", "https://x.test");
    const children = (params as any).children;
    expect(JSON.stringify(children)).toContain("Three seasons officiating");
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/unit/notion/ats.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// src/lib/notion/ats.ts
import { Client } from "@notionhq/client";
import type { CreatePageParameters } from "@notionhq/client/build/src/api-endpoints";
import type { JobApplication } from "@/lib/db/schema/job-applications";

/**
 * Notion half of the hiring pipeline. The app DB is the source of truth;
 * this module only pushes new applications into the "Hiring Pipeline"
 * database. Feature-gated: missing env → silent no-op (rows stay
 * unsynced; the hourly cron retries once env is configured).
 *
 * Property names MUST match the Notion database exactly:
 * Name (title), Role (select), Status (select), Email (email),
 * Phone (phone_number), Facility (select), Certifications (rich_text),
 * Availability (multi_select), Resume (url), Applied (date),
 * Source (rich_text).
 */
const ROLE_LABELS: Record<JobApplication["role"], string> = {
  referee: "Referee",
  coach: "Coach",
  staff: "Staff",
};
const FACILITY_LABELS: Record<string, string> = {
  worthington: "Worthington",
  downtown: "Downtown",
  either: "Either",
};

export function isNotionConfigured(): boolean {
  return Boolean(import.meta.env.NOTION_API_KEY && import.meta.env.NOTION_ATS_DATABASE_ID);
}

export function buildApplicationPageParams(
  app: JobApplication,
  databaseId: string,
  appBaseUrl: string,
): CreatePageParameters {
  const properties: CreatePageParameters["properties"] = {
    Name: { title: [{ text: { content: `${app.firstName} ${app.lastName}` } }] },
    Role: { select: { name: ROLE_LABELS[app.role] } },
    Status: { select: { name: "New" } },
    Email: { email: app.email },
    Applied: { date: { start: app.createdAt.toISOString().slice(0, 10) } },
  };
  if (app.phone) properties["Phone"] = { phone_number: app.phone };
  if (app.preferredLocation && FACILITY_LABELS[app.preferredLocation]) {
    properties["Facility"] = { select: { name: FACILITY_LABELS[app.preferredLocation] } };
  }
  if (app.certifications) {
    properties["Certifications"] = { rich_text: [{ text: { content: app.certifications.slice(0, 2000) } }] };
  }
  if (app.availability.length > 0) {
    properties["Availability"] = { multi_select: app.availability.map((a) => ({ name: a })) };
  }
  if (app.resumeKey) {
    properties["Resume"] = { url: `${appBaseUrl.replace(/\/$/, "")}/api/admin/applications/${app.id}/resume` };
  }
  if (app.source) properties["Source"] = { rich_text: [{ text: { content: app.source.slice(0, 200) } }] };

  return {
    parent: { database_id: databaseId },
    properties,
    children: [
      {
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: app.experience.slice(0, 2000) } }] },
      },
    ],
  };
}

/** Returns the created Notion page id, or null (unconfigured / failed — logged, never throws). */
export async function createNotionApplicationPage(app: JobApplication): Promise<string | null> {
  if (!isNotionConfigured()) return null;
  try {
    const notion = new Client({ auth: import.meta.env.NOTION_API_KEY as string });
    const baseUrl = (import.meta.env.PUBLIC_APP_URL as string | undefined) ?? "https://aspiresportsohio.com";
    const page = await notion.pages.create(
      buildApplicationPageParams(app, import.meta.env.NOTION_ATS_DATABASE_ID as string, baseUrl),
    );
    return page.id;
  } catch (err) {
    console.error("[careers] notion sync failed", { applicationId: app.id, err });
    return null;
  }
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run tests/unit/notion/ats.test.ts && npx tsc --noEmit`
Expected: 3 tests PASS; tsc clean. (If the `CreatePageParameters` import path errors, use `import type { CreatePageParameters } from "@notionhq/client";` — the SDK re-exports it in recent versions.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/notion/ tests/unit/notion/
git commit -m "feat(careers): notion hiring-pipeline sync lib

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `POST /api/public/careers/apply`

**Files:**
- Create: `src/pages/api/public/careers/apply.ts`
- Test: `tests/api/careers/apply.test.ts`

**Interfaces:**
- Consumes: `jobApplicationSchema` (Task 2), `jobApplications` (Task 1), `createNotionApplicationPage` (Task 3), `verifyTurnstile` (`@/lib/auth/turnstile`), `rateLimit`/`rateLimitedResponse` (`@/lib/auth/rate-limit`), `putObject` (`@/lib/storage/r2`), `sendEmail`/`fromForBrand`/`isEmailConfigured` (`@/lib/email`), `brandFromHost` (`@/lib/organization/soccerone-routing`).
- Produces: `POST` accepting `multipart/form-data`; 200 `{ ok: true, id }`; 400 validation/CAPTCHA; 429 rate-limited; 502 DB failure. Consumed by Task 6's form.

- [ ] **Step 1: Write the failing API test**

```ts
// tests/api/careers/apply.test.ts
import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { jobApplications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// Turnstile note: verifyTurnstile fails OPEN when no secret is configured
// (dev/CI), so no token is needed here. The fail-closed prod path is
// covered by tests/unit on the existing helper.
function formFor(overrides: Record<string, string | string[]> = {}): FormData {
  const fd = new FormData();
  const fields: Record<string, string | string[]> = {
    role: "referee",
    firstName: "Api",
    lastName: "Applicant",
    email: `careers-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    experience: "Two seasons officiating.",
    availability: ["weeknights"],
    ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((item) => fd.append(k, item));
    else fd.append(k, v);
  }
  return fd;
}

describe("POST /api/public/careers/apply", () => {
  it("stores a valid application and returns its id", async () => {
    const email = `careers-ok-${Date.now()}@example.com`;
    const res = await fetch(`${BASE}/api/public/careers/apply`, {
      method: "POST",
      body: formFor({ email }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const [row] = await getDb()
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, body.id));
    expect(row.email).toBe(email);
    expect(row.role).toBe("referee");
    expect(row.status).toBe("new");
    // Notion env is absent in CI/dev → row stored unsynced, request still 200.
    expect(row.notionSyncedAt).toBeNull();
  });

  it("rejects an invalid application with field details", async () => {
    const res = await fetch(`${BASE}/api/public/careers/apply`, {
      method: "POST",
      body: formFor({ role: "janitor" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("rejects a non-PDF resume", async () => {
    const fd = formFor();
    fd.append("resume", new File([new Uint8Array([1, 2, 3])], "resume.exe", { type: "application/octet-stream" }));
    const res = await fetch(`${BASE}/api/public/careers/apply`, { method: "POST", body: fd });
    expect(res.status).toBe(400);
  });

  it("rate limits after 5 submissions per minute", async () => {
    let last = 0;
    for (let i = 0; i < 7; i++) {
      const res = await fetch(`${BASE}/api/public/careers/apply`, {
        method: "POST",
        body: formFor(),
      });
      last = res.status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Start the dev server per Global Constraints, then:
Run: `CRON_SECRET=localtest TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run tests/api/careers/apply.test.ts`
Expected: FAIL — 404s (route missing).

- [ ] **Step 3: Implement the endpoint**

```ts
// src/pages/api/public/careers/apply.ts
import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { jobApplications } from "@/lib/db/schema";
import { jobApplicationSchema } from "@/lib/careers/application-schema";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { putObject } from "@/lib/storage/r2";
import { sendEmail, fromForBrand, isEmailConfigured } from "@/lib/email";
import { createNotionApplicationPage } from "@/lib/notion/ats";
import { brandFromHost } from "@/lib/organization/soccerone-routing";

export const prerender = false;

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const HIRING_NOTIFY_EMAIL = "hello@aspiresportsohio.com";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  // Rate limit first — cheapest check (mirrors corporate-inquiry).
  const ip = clientAddress ?? "unknown";
  const ipLimit = rateLimit(`careers-apply:ip:${ip}`, 5, 60_000);
  if (!ipLimit.allowed) return rateLimitedResponse(ipLimit.retryAfter ?? 60);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected multipart form data" }, 400);
  }

  // CAPTCHA — fails closed in prod when secret unset, open in dev/CI
  // (same contract as forgot-password).
  const turnstileOk = await verifyTurnstile(String(form.get("turnstileToken") ?? ""), {
    secret: import.meta.env.TURNSTILE_SECRET_KEY as string | undefined,
    isProd: Boolean(import.meta.env.PROD),
  });
  if (!turnstileOk) {
    return json({ error: "Please complete the CAPTCHA challenge before continuing." }, 400);
  }

  const parsed = jobApplicationSchema.safeParse({
    role: form.get("role") ?? undefined,
    firstName: form.get("firstName") ?? undefined,
    lastName: form.get("lastName") ?? undefined,
    email: form.get("email") ?? undefined,
    phone: form.get("phone") || undefined,
    preferredLocation: form.get("preferredLocation") || undefined,
    certifications: form.get("certifications") || undefined,
    experience: form.get("experience") ?? undefined,
    availability: form.getAll("availability").map(String),
    source: form.get("source") || undefined,
  });
  if (!parsed.success) {
    return json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400,
    );
  }

  // Optional resume: PDF only, ≤5MB, server-side put to R2. Key stored,
  // never a signed URL (they expire) — the admin endpoint redirects.
  let resumeKey: string | null = null;
  const resume = form.get("resume");
  if (resume instanceof File && resume.size > 0) {
    if (resume.type !== "application/pdf" || !resume.name.toLowerCase().endsWith(".pdf")) {
      return json({ error: "Resume must be a PDF" }, 400);
    }
    if (resume.size > MAX_RESUME_BYTES) {
      return json({ error: "Resume must be 5 MB or smaller" }, 400);
    }
    resumeKey = `careers/resumes/${randomUUID()}.pdf`;
    try {
      await putObject(resumeKey, new Uint8Array(await resume.arrayBuffer()), "application/pdf");
    } catch (err) {
      console.error("[careers] resume upload failed (continuing without)", err);
      resumeKey = null;
    }
  }

  const brand = brandFromHost(request.headers.get("host") ?? "");
  let application;
  try {
    [application] = await getDb()
      .insert(jobApplications)
      .values({
        organizationId: locals.organization?.id ?? null,
        brand,
        ...parsed.data,
        resumeKey,
      })
      .returning();
  } catch (err) {
    console.error("[careers] insert failed", err);
    return json(
      { error: `Could not submit your application. Please email ${HIRING_NOTIFY_EMAIL} directly.` },
      502,
    );
  }

  // Source of truth committed — everything below is best-effort and must
  // never turn the response into an error.
  const pageId = await createNotionApplicationPage(application);
  if (pageId) {
    try {
      await getDb()
        .update(jobApplications)
        .set({ notionPageId: pageId, notionSyncedAt: new Date() })
        .where(eq(jobApplications.id, application.id));
    } catch (err) {
      console.error("[careers] notion mark-synced failed", err);
    }
  }

  if (isEmailConfigured()) {
    const result = await sendEmail({
      from: fromForBrand(brand),
      to: HIRING_NOTIFY_EMAIL,
      subject: `New ${parsed.data.role} application — ${parsed.data.firstName} ${parsed.data.lastName}`,
      html: `<p><strong>${parsed.data.firstName} ${parsed.data.lastName}</strong> applied as <strong>${parsed.data.role}</strong>.</p>
<p>Email: ${parsed.data.email}<br/>Phone: ${parsed.data.phone ?? "—"}<br/>Facility: ${parsed.data.preferredLocation ?? "—"}</p>
<p>${(parsed.data.experience ?? "").slice(0, 500)}</p>
<p>Review in Notion or /admin/applications.</p>`,
    });
    if (!result.success) console.error("[careers] notify email failed", result.error);
  }

  return json({ ok: true, id: application.id }, 200);
};
```

Add the missing import at the top with the others: `import { eq } from "drizzle-orm";`
(Signatures verified against the codebase: `rateLimit` returns `{ allowed, retryAfter? }`; `EmailOptions` is `{ to, subject, html, from?, ... }`; `getSignedGetUrl(key, expiresInSeconds = 3600)`.)

- [ ] **Step 4: Run the API tests**

Run: `CRON_SECRET=localtest TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run tests/api/careers/apply.test.ts`
Expected: 4 tests PASS. (The rate-limit test may consume the IP budget for the happy-path test if ordered badly — vitest runs top-down in a file, happy-path first, so budget is fine: 3 requests before the rate-limit test starts, which then sends up to 7.)
Note: 3 + 7 = 10 total requests: the limiter allows 5/min, so the rate-limit test hits 429 on its 2nd or 3rd request — assertion only requires SOME request to 429.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/pages/api/public/careers/ tests/api/careers/
git commit -m "feat(careers): public application endpoint (turnstile, rate limit, R2 resume, notion+email side effects)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Notion retry cron

**Files:**
- Create: `src/lib/careers/sync-pending.ts`
- Create: `src/pages/api/cron/sync-notion-applications.ts`
- Create: `netlify/functions/scheduled-sync-notion-applications.ts`
- Test: `tests/api/careers/sync-cron.test.ts`

**Interfaces:**
- Consumes: `createNotionApplicationPage` (Task 3), `jobApplications` (Task 1).
- Produces: `syncPendingApplications(): Promise<{ attempted: number; synced: number }>`; `POST /api/cron/sync-notion-applications` guarded by `x-cron-secret` (same contract as expire-pending-claims); hourly Netlify schedule.

- [ ] **Step 1: Write the failing API test**

```ts
// tests/api/careers/sync-cron.test.ts
import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const CRON_SECRET = process.env.CRON_SECRET ?? "localtest";

describe("POST /api/cron/sync-notion-applications", () => {
  it("rejects a missing/wrong cron secret", async () => {
    const res = await fetch(`${BASE}/api/cron/sync-notion-applications`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("runs and reports counts (0 synced with Notion env absent)", async () => {
    const res = await fetch(`${BASE}/api/cron/sync-notion-applications`, {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("attempted");
    expect(body).toHaveProperty("synced");
    expect(body.synced).toBe(0); // Notion unconfigured in CI/dev
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `CRON_SECRET=localtest TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run tests/api/careers/sync-cron.test.ts`
Expected: FAIL — 404.

- [ ] **Step 3: Implement lib + cron route + schedule**

```ts
// src/lib/careers/sync-pending.ts
import { and, isNull, gte } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobApplications } from "@/lib/db/schema";
import { createNotionApplicationPage, isNotionConfigured } from "@/lib/notion/ats";

/**
 * Retry Notion sync for applications that stored locally but never made it
 * to the Hiring Pipeline (Notion outage, or env configured after launch).
 * 30-day lookback keeps the sweep bounded on the accumulating table.
 */
export async function syncPendingApplications(): Promise<{ attempted: number; synced: number }> {
  if (!isNotionConfigured()) return { attempted: 0, synced: 0 };
  const db = getDb();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const pending = await db
    .select()
    .from(jobApplications)
    .where(and(isNull(jobApplications.notionSyncedAt), gte(jobApplications.createdAt, cutoff)))
    .limit(25); // Notion rate limit is ~3 rps; 25/hour is plenty at our volume

  let synced = 0;
  for (const app of pending) {
    const pageId = await createNotionApplicationPage(app);
    if (pageId) {
      await db
        .update(jobApplications)
        .set({ notionPageId: pageId, notionSyncedAt: new Date() })
        .where(eq(jobApplications.id, app.id));
      synced++;
    }
  }
  return { attempted: pending.length, synced };
}
```

```ts
// src/pages/api/cron/sync-notion-applications.ts
// Mirrors /api/cron/expire-pending-claims: same x-cron-secret auth, same
// misconfigured-in-prod behavior, same response shape.
import type { APIRoute } from "astro";
import { syncPendingApplications } from "@/lib/careers/sync-pending";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET;
  const providedSecret = request.headers.get("x-cron-secret");

  if (secret) {
    if (providedSecret !== secret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  } else if (import.meta.env.PROD) {
    console.error("[cron] CRON_SECRET not configured in production. Refusing request.");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const result = await syncPendingApplications();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[cron/sync-notion-applications] failed", err);
    return new Response(JSON.stringify({ error: "Sync failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
```

For the scheduled function, COPY `netlify/functions/scheduled-expire-pending-claims.ts` verbatim to `netlify/functions/scheduled-sync-notion-applications.ts`, then change only: the doc comment, `const ROUTE = "/api/cron/sync-notion-applications";`, and the schedule expression to hourly: `schedule("0 * * * *", ...)`.

- [ ] **Step 4: Run the tests**

Restart the dev server (new route), then:
Run: `CRON_SECRET=localtest TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run tests/api/careers/`
Expected: apply + sync-cron suites PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/careers/sync-pending.ts src/pages/api/cron/ netlify/functions/ tests/api/careers/
git commit -m "feat(careers): hourly notion retry cron

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: `/careers` page + application form

**Files:**
- Create: `src/pages/careers.astro`
- Create: `src/components/careers/application-form.tsx`

**Interfaces:**
- Consumes: `jobApplicationSchema` + constants (Task 2), the Task 4 endpoint, `TurnstileWidget` (`@/components/auth/turnstile-widget` — props `{ onToken: (t: string) => void; onError?: () => void }`), `useHydrationBeacon`, `ErrorBanner`.
- Produces: the public page. No downstream code consumers.

- [ ] **Step 1: Build the form component**

```tsx
// src/components/careers/application-form.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ErrorBanner } from "@/components/ui/error-banner";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import {
  jobApplicationSchema,
  APPLICATION_ROLES,
  APPLICATION_LOCATIONS,
  APPLICATION_AVAILABILITY,
} from "@/lib/careers/application-schema";

const ROLE_LABELS: Record<string, string> = { referee: "Referee", coach: "Coach", staff: "Other staff" };
const LOCATION_LABELS: Record<string, string> = { worthington: "Worthington", downtown: "Downtown", either: "Either" };
const AVAILABILITY_LABELS: Record<string, string> = { weeknights: "Weeknights", weekends: "Weekends", mornings: "Mornings" };

type FormValues = z.infer<typeof jobApplicationSchema>;

export default function ApplicationForm() {
  useHydrationBeacon();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [resume, setResume] = useState<File | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(jobApplicationSchema),
    defaultValues: { availability: [] },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) {
      if (v == null || v === "") continue;
      if (Array.isArray(v)) v.forEach((item) => fd.append(k, item));
      else fd.append(k, String(v));
    }
    if (resume) fd.append("resume", resume);
    if (turnstileToken) fd.append("turnstileToken", turnstileToken);

    const res = await fetch("/api/public/careers/apply", { method: "POST", body: fd });
    if (res.ok) {
      setSubmitted(true);
      return;
    }
    const body = await res.json().catch(() => ({}));
    setServerError(body.error ?? "Something went wrong. Please email hello@aspiresportsohio.com.");
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-border bg-cream-2/50 p-8 text-center">
        <h2 className="font-serif text-2xl mb-2">Application received.</h2>
        <p className="text-ink-muted">
          Thanks for applying — we review every application and will reach out by email.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {serverError && <ErrorBanner message={serverError} />}

      <div>
        <label htmlFor="role" className="block text-sm font-medium mb-1">I'm applying as *</label>
        <select id="role" {...register("role")} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm">
          <option value="">Select a role…</option>
          {APPLICATION_ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
        {errors.role && <p className="mt-1 text-xs text-red-600">Please pick a role.</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium mb-1">First name *</label>
          <input id="firstName" {...register("firstName")} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" />
          {errors.firstName && <p className="mt-1 text-xs text-red-600">Required.</p>}
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium mb-1">Last name *</label>
          <input id="lastName" {...register("lastName")} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" />
          {errors.lastName && <p className="mt-1 text-xs text-red-600">Required.</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">Email *</label>
          <input id="email" type="email" {...register("email")} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" />
          {errors.email && <p className="mt-1 text-xs text-red-600">A valid email is required.</p>}
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium mb-1">Phone</label>
          <input id="phone" type="tel" {...register("phone")} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" />
        </div>
      </div>

      <div>
        <label htmlFor="preferredLocation" className="block text-sm font-medium mb-1">Preferred facility</label>
        <select id="preferredLocation" {...register("preferredLocation")} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm">
          <option value="">No preference</option>
          {APPLICATION_LOCATIONS.map((l) => (
            <option key={l} value={l}>{LOCATION_LABELS[l]}</option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="block text-sm font-medium mb-1">Availability</legend>
        <div className="flex flex-wrap gap-4">
          {APPLICATION_AVAILABILITY.map((a) => (
            <label key={a} className="flex items-center gap-2 text-sm">
              <input type="checkbox" value={a} {...register("availability")} />
              {AVAILABILITY_LABELS[a]}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="certifications" className="block text-sm font-medium mb-1">
          Certifications <span className="text-ink-muted">(ref grade, coaching badges…)</span>
        </label>
        <input id="certifications" {...register("certifications")} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" />
      </div>

      <div>
        <label htmlFor="experience" className="block text-sm font-medium mb-1">Tell us about your experience *</label>
        <textarea id="experience" rows={4} {...register("experience")} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" />
        {errors.experience && <p className="mt-1 text-xs text-red-600">Required.</p>}
      </div>

      <div>
        <label htmlFor="resume" className="block text-sm font-medium mb-1">
          Resume <span className="text-ink-muted">(optional, PDF up to 5 MB)</span>
        </label>
        <input
          id="resume"
          type="file"
          accept="application/pdf"
          className="block w-full text-sm"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (f && (f.type !== "application/pdf" || f.size > 5 * 1024 * 1024)) {
              setResumeError("Resume must be a PDF up to 5 MB.");
              setResume(null);
              e.target.value = "";
              return;
            }
            setResumeError(null);
            setResume(f);
          }}
        />
        {resumeError && <p className="mt-1 text-xs text-red-600">{resumeError}</p>}
      </div>

      <div>
        <label htmlFor="source" className="block text-sm font-medium mb-1">How did you hear about us?</label>
        <input id="source" {...register("source")} className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" />
      </div>

      <TurnstileWidget onToken={(t) => setTurnstileToken(t)} />

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full sm:w-auto rounded-md bg-primary-orange px-6 py-3 text-sm font-semibold text-white disabled:opacity-60"
      >
        {isSubmitting ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}
```

NOTE for implementer: before styling, open `src/components/join/join-page.tsx` or `SponsorInquiryForm.tsx` and reuse the exact input/button classes used there (editorial cream tokens) — the classNames above are directionally right but MUST match the design system in the file you find. Also confirm `TurnstileWidget`'s exact props at `src/components/auth/turnstile-widget.tsx:51`.

- [ ] **Step 2: Build the page**

```astro
---
// src/pages/careers.astro
export const prerender = true;
import BaseLayout from '@/layouts/BaseLayout.astro';
import ApplicationForm from '@/components/careers/application-form';
---

<BaseLayout
  title="Careers — Aspire Sports"
  description="Referee our adult leagues, coach with us, or join the facility crew. Apply in about 90 seconds."
>
  <main id="main-content" class="flex-1 pt-24 pb-16 px-4">
    <div class="max-w-2xl mx-auto">
      <p class="text-sm font-medium text-primary-orange mb-2">Work with us</p>
      <h1 class="font-serif text-4xl mb-3">Refs. Coaches. Crew.</h1>
      <p class="text-ink-muted mb-8">
        Our adult leagues kick off September 14 and we're staffing up — referees
        first, coaches for what's coming next. Tell us who you are; it takes
        about 90 seconds. We read every application.
      </p>
      <ApplicationForm client:load />
    </div>
  </main>
</BaseLayout>
```

NOTE: match heading/typography classes to an existing Aspire marketing page (e.g. `src/pages/contact.astro` or `/corporate`) — copy its header block classes rather than inventing new ones.

- [ ] **Step 3: Verify in the browser**

Run the dev server; open `http://localhost:4321/careers`; submit with only required fields. Expected: success card renders; a `job_applications` row exists (check via the Task 7 admin list once built, or psql-free: the Task 4 API test covers insertion — visually confirm the success state + validation errors here).

- [ ] **Step 4: Build check (prerender)**

Run: `./scripts/with-bws.sh npm run build`
Expected: clean; `/careers` prerenders without `Astro.request.headers` warnings beyond the known middleware noise (CLAUDE.md).

- [ ] **Step 5: Commit**

```bash
git add src/pages/careers.astro src/components/careers/
git commit -m "feat(careers): public application page + form

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Admin fallback list + resume redirect

**Files:**
- Create: `src/pages/api/admin/applications/index.ts`
- Create: `src/pages/api/admin/applications/[id]/resume.ts`
- Create: `src/pages/admin/applications.astro`
- Create: `src/components/admin/applications-list.tsx`
- Test: `tests/api/admin/applications.test.ts`

**Interfaces:**
- Consumes: `requireOrgAdminAccess(context)` from `@/lib/auth` (returns `{ authorized: true, organizationId }` or `{ authorized: false, response }`), `getSignedGetUrl(key: string)` from `@/lib/storage/r2` (verify exact signature at `src/lib/storage/r2.ts:117` — it may take an expiry arg), `jobApplications` (Task 1).
- Produces: `GET /api/admin/applications` → `{ applications: JobApplication[] }` (org-scoped, newest first); `GET /api/admin/applications/[id]/resume` → 302 to signed R2 URL (404 when no resume). The Notion "Resume" property (Task 3) links here.

- [ ] **Step 1: Write the failing API test**

```ts
// tests/api/admin/applications.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { getAdminCookie, apiFetch } from "../setup/test-helpers";

describe("GET /api/admin/applications", () => {
  let cookie: string;
  beforeAll(async () => {
    cookie = await getAdminCookie();
  });

  it("401s unauthenticated", async () => {
    const res = await apiFetch("/api/admin/applications", { method: "GET" });
    expect([401, 403]).toContain(res.status);
  });

  it("lists org applications newest-first for an admin", async () => {
    // Ensure at least one row exists (public endpoint, same org host)
    const fd = new FormData();
    for (const [k, v] of Object.entries({
      role: "coach",
      firstName: "Admin",
      lastName: "Listed",
      email: `admin-list-${Date.now()}@example.com`,
      experience: "Coached U10 for two years.",
    })) fd.append(k, v as string);
    const submit = await fetch(`${process.env.TEST_BASE_URL ?? "http://localhost:4321"}/api/public/careers/apply`, { method: "POST", body: fd });
    expect(submit.status).toBe(200);

    const res = await apiFetch("/api/admin/applications", { method: "GET", cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.applications)).toBe(true);
    expect(body.applications.length).toBeGreaterThan(0);
    expect(body.applications[0]).toHaveProperty("role");
    expect(body.applications[0]).toHaveProperty("notionSyncedAt");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `CRON_SECRET=localtest TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run tests/api/admin/applications.test.ts`
Expected: FAIL — 404.

- [ ] **Step 3: Implement the two endpoints**

```ts
// src/pages/api/admin/applications/index.ts
import type { APIRoute } from "astro";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobApplications } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const rows = await getDb()
    .select()
    .from(jobApplications)
    .where(eq(jobApplications.organizationId, auth.organizationId))
    .orderBy(desc(jobApplications.createdAt))
    .limit(200);

  return new Response(JSON.stringify({ applications: rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

```ts
// src/pages/api/admin/applications/[id]/resume.ts
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobApplications } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getSignedGetUrl } from "@/lib/storage/r2";

export const prerender = false;

/**
 * 302s to a fresh signed R2 URL for the application's resume. This is the
 * stable URL the Notion "Resume" property links to — signed URLs expire,
 * this endpoint never does (and enforces admin + tenant scope).
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const id = context.params.id ?? "";
  const [row] = await getDb()
    .select({ resumeKey: jobApplications.resumeKey })
    .from(jobApplications)
    .where(and(eq(jobApplications.id, id), eq(jobApplications.organizationId, auth.organizationId)))
    .limit(1);
  if (!row?.resumeKey) {
    return new Response(JSON.stringify({ error: "No resume on this application" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  const url = await getSignedGetUrl(row.resumeKey);
  return context.redirect(url, 302);
};
```

- [ ] **Step 4: Implement the admin page + list**

```astro
---
// src/pages/admin/applications.astro  (middleware already gates /admin/**)
import AdminLayout from '@/layouts/AdminLayout.astro';
import ApplicationsList from '@/components/admin/applications-list';
---
<AdminLayout title="Applications">
  <ApplicationsList client:load />
</AdminLayout>
```

NOTE: check how sibling pages like `src/pages/admin/dropins.astro` wrap content (layout name/props may differ — mirror exactly, including any nav registration for the admin sidebar if one exists; grep the sidebar component for where pages are listed and add "Applications").

```tsx
// src/components/admin/applications-list.tsx
"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";

interface ApplicationRow {
  id: string;
  role: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  preferredLocation: string | null;
  certifications: string | null;
  experience: string;
  availability: string[];
  resumeKey: string | null;
  source: string | null;
  notionPageId: string | null;
  notionSyncedAt: string | null;
  createdAt: string;
}

export default function ApplicationsList() {
  const [rows, setRows] = useState<ApplicationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/applications")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setRows((await r.json()).applications);
      })
      .catch(() => setError("Could not load applications."));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!rows) return <LoadingSkeleton />;
  if (rows.length === 0)
    return <EmptyState title="No applications yet" description="Applications from /careers will appear here and in the Notion Hiring Pipeline." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-border">
            <th className="py-2 pr-4">Applied</th>
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Role</th>
            <th className="py-2 pr-4">Contact</th>
            <th className="py-2 pr-4">Facility</th>
            <th className="py-2 pr-4">Resume</th>
            <th className="py-2 pr-4">Notion</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-b border-border/50 align-top">
              <td className="py-2 pr-4 whitespace-nowrap">{new Date(a.createdAt).toLocaleDateString()}</td>
              <td className="py-2 pr-4 font-medium">{a.firstName} {a.lastName}</td>
              <td className="py-2 pr-4 capitalize">{a.role}</td>
              <td className="py-2 pr-4">{a.email}{a.phone ? ` · ${a.phone}` : ""}</td>
              <td className="py-2 pr-4 capitalize">{a.preferredLocation ?? "—"}</td>
              <td className="py-2 pr-4">
                {a.resumeKey ? <a className="underline" href={`/api/admin/applications/${a.id}/resume`} target="_blank" rel="noreferrer">PDF</a> : "—"}
              </td>
              <td className="py-2 pr-4">{a.notionSyncedAt ? "Synced" : "Pending"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Run tests + verify page**

Restart dev server. Run: `CRON_SECRET=localtest TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run tests/api/admin/applications.test.ts`
Expected: PASS. Browser: sign in as admin@test.aspiresports.com / TestAdmin123!, open `/admin/applications` — table renders rows created by the tests.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/pages/api/admin/applications/ src/pages/admin/applications.astro src/components/admin/applications-list.tsx tests/api/admin/applications.test.ts
git commit -m "feat(careers): admin fallback list + tenant-scoped resume redirect

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: SoccerOne "Join the crew" links + env documentation

**Files:**
- Modify: `src/components/soccerone/SoccerOneFooter.astro` (HELP column)
- Modify: `src/pages/soccerone/join.astro` (add a careers pointer near the bottom CTA — read the file first and match its section style)
- Modify: `.env.example` (document new env)

**Interfaces:** none produced; links point to the Aspire `/careers` URL.

- [ ] **Step 1: Footer link**

In `SoccerOneFooter.astro`'s HELP column (next to "Sponsor Us"), add:

```astro
<a href="https://aspiresportsohio.com/careers" class="sf-link">Join the Crew</a>
```

Match the exact anchor class used by the neighboring links in that file (read it first — the class may be different from `sf-link`).

- [ ] **Step 2: /join page pointer**

In `src/pages/soccerone/join.astro`, add one line of copy + link in the closing CTA section: "Want to work the whistle instead? **Join the crew →**" linking to `https://aspiresportsohio.com/careers`. Match surrounding markup/styles.

- [ ] **Step 3: Document env**

Append to `.env.example` near the other integration blocks:

```bash
# Notion hiring pipeline (careers ATS). Optional — when unset, applications
# still store in Postgres + email; Notion sync stays pending and the hourly
# cron backfills once configured.
NOTION_API_KEY=
NOTION_ATS_DATABASE_ID=
```

- [ ] **Step 4: Commit**

```bash
git add src/components/soccerone/SoccerOneFooter.astro src/pages/soccerone/join.astro .env.example
git commit -m "feat(careers): soccerone join-the-crew links + env docs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: E2E spec + full verification pass

**Files:**
- Create: `tests/e2e/careers-apply.spec.ts`

**Interfaces:** consumes the `/careers` page (Task 6). Runs post-merge only (test-full) — must be correct on first merge (CLAUDE.md warning).

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/careers-apply.spec.ts
import { test, expect } from "@playwright/test";
import { waitForHydration } from "../utils/test-helpers";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4321";

test("careers application submits and shows the success card", async ({ page }) => {
  await page.goto(`${BASE}/careers`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  await page.selectOption("#role", "referee");
  await page.fill("#firstName", "Playwright");
  await page.fill("#lastName", "Applicant");
  await page.fill("#email", `e2e-careers-${Date.now()}@example.com`);
  await page.fill("#experience", "Officiated intramurals for two years.");
  await page.getByRole("button", { name: /submit application/i }).click();

  await expect(page.getByText("Application received.")).toBeVisible({ timeout: 10_000 });
});

test("careers form surfaces validation errors without submitting", async ({ page }) => {
  await page.goto(`${BASE}/careers`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  await page.getByRole("button", { name: /submit application/i }).click();
  await expect(page.getByText(/please pick a role/i)).toBeVisible();
});
```

- [ ] **Step 2: Run it locally**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- careers-apply`
Expected: 2 tests PASS (dev server running with R2_MOCK=1).

- [ ] **Step 3: Full local verification (pre-push checklist)**

```bash
npx tsc --noEmit                       # clean
npx vitest run tests/unit              # all pass
# with dev server up:
CRON_SECRET=localtest TEST_BASE_URL=http://localhost:4321 ./scripts/with-bws.sh npx vitest run tests/api/careers tests/api/admin/applications.test.ts
./scripts/with-bws.sh npm run build    # clean
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/careers-apply.spec.ts
git commit -m "test(careers): e2e application flow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Notion database provisioning + rollout (controller/user steps — not subagent work)

- [ ] Controller creates the **"Hiring Pipeline"** database in the user's Notion workspace via the Notion connection (board grouped by Status: New → Screening → Interview → Offer → Hired / Rejected; properties exactly as named in Task 3's doc comment).
- [ ] User mints an internal integration token at notion.so/my-integrations, **shares the database with the integration**, and adds `NOTION_API_KEY` + `NOTION_ATS_DATABASE_ID` to Bitwarden (`aspire-web-app` project) and the Netlify env.
- [ ] After env lands in prod: hand-trigger the cron once (`Actions`-free: `curl -X POST -H "x-cron-secret: <secret>" https://aspiresportsohio.com/api/cron/sync-notion-applications`) to backfill any pre-env applications.
- [ ] Open PR, CI green, merge, watch post-merge run (test-full includes the new e2e spec).
