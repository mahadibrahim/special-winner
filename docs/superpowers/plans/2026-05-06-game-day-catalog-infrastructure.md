# Game-Day Catalog Infrastructure + Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the CLI tooling and author the comprehensive seed catalog so the game-day operating model exists as machine-validated, view-renderable, version-controlled content. No live platform integration in this plan — pure tooling + docs.

**Architecture:** A TypeScript CLI in `scripts/ops-catalog/` loads YAML records from `docs/operations/catalog/`, validates schema + cross-references + smell flags, and renders artifacts (runbook, role manuals, automation backlog) into `docs/operations/artifacts/`. CI runs the validator on every PR; the renderer is invoked by `npm run catalog:render`. The catalog is git-tracked alongside its generated artifacts so PRs surface downstream effects.

**Tech Stack:**
- TypeScript (existing project stack)
- Zod for schema validation
- `yaml` package for YAML parsing
- Vitest for unit tests (already in repo)
- GitHub Actions for CI gating

**Reference:** The design spec is at `docs/superpowers/specs/2026-05-06-game-day-operating-model-design.md`. This plan implements §4 (schema), §5–10 (taxonomies + tooling), §11 (seed catalog), and §12–13 (artifact + feature stubs).

**Worktree note:** This plan has 25 tasks. Per project convention, executors should create a worktree at execution time using the `superpowers:using-git-worktrees` skill, branched from `docs/game-day-operating-model`.

**Project conventions (verify before starting):**
- **Test paths:** This plan uses `scripts/ops-catalog/__tests__/` for co-located tests. The CLAUDE.md convention says `tests/unit/` for pure-logic tests. Check the existing repo convention; if `tests/unit/` is enforced (e.g., by Vitest config), move test files to `tests/unit/ops-catalog/` and adjust import paths accordingly.
- **Module system:** Tests use `__dirname` for fixture paths. If the project is ESM-only, replace with `path.dirname(fileURLToPath(import.meta.url))`. Confirm by checking `package.json` `"type"` and tsconfig `module` setting before writing the loader test.
- **Runtime:** Plan assumes `tsx` is available for TypeScript scripts. If not in `devDependencies`, install before Task 1: `npm i -D tsx`.

---

## Phase A: Tooling foundations

### Task 1: CLI scaffolding

**Files:**
- Create: `scripts/ops-catalog/index.ts`
- Create: `scripts/ops-catalog/package.json` (or add scripts to root)
- Modify: `package.json` (add scripts)
- Test: `scripts/ops-catalog/__tests__/index.test.ts`

- [ ] **Step 1: Add npm scripts and create entrypoint**

Add to root `package.json` `scripts` block:
```json
"catalog:validate": "tsx scripts/ops-catalog/index.ts validate",
"catalog:render": "tsx scripts/ops-catalog/index.ts render"
```

Create `scripts/ops-catalog/index.ts`:
```typescript
#!/usr/bin/env tsx
const command = process.argv[2];

const commands: Record<string, () => Promise<number>> = {
  validate: async () => {
    console.log("[ops-catalog] validate (not yet implemented)");
    return 0;
  },
  render: async () => {
    console.log("[ops-catalog] render (not yet implemented)");
    return 0;
  },
};

async function main() {
  if (!command || !commands[command]) {
    console.error(`Usage: ops-catalog <validate|render> [options]`);
    process.exit(1);
  }
  const code = await commands[command]();
  process.exit(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Write smoke test**

```typescript
// scripts/ops-catalog/__tests__/index.test.ts
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";

describe("ops-catalog CLI", () => {
  it("prints usage when called without args", () => {
    const result = (() => {
      try {
        execSync("npx tsx scripts/ops-catalog/index.ts", { stdio: "pipe" });
        return { code: 0, stderr: "" };
      } catch (e: any) {
        return { code: e.status, stderr: e.stderr.toString() };
      }
    })();
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Usage: ops-catalog");
  });

  it("runs validate command without error", () => {
    const out = execSync("npx tsx scripts/ops-catalog/index.ts validate").toString();
    expect(out).toContain("validate");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run scripts/ops-catalog/__tests__/index.test.ts`
Expected: 2 tests pass.

- [ ] **Step 4: Commit**

```bash
git add scripts/ops-catalog/ package.json
git commit -m "feat(ops-catalog): scaffold CLI entrypoint with validate/render stubs"
```

---

### Task 2: Activity schema (Zod)

**Files:**
- Create: `scripts/ops-catalog/types/activity.ts`
- Test: `scripts/ops-catalog/__tests__/types/activity.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// scripts/ops-catalog/__tests__/types/activity.test.ts
import { describe, it, expect } from "vitest";
import { ActivitySchema } from "../../types/activity";

const validActivity = {
  id: "act.rainout_decision",
  name: "Rainout decision",
  description: "Make go/no-go call when weather threatens a match",
  trigger: "Weather/field condition within 2h of kickoff suggests cancellation",
  phase: "pre_game",
  sport_tags: [],
  venue_tags: ["outdoor"],
  format_tags: [],
  audience_tags: [],
  raci: {
    accountable: "role.venue_manager",
    responsible: ["role.venue_manager"],
    consulted: ["role.director"],
    informed: ["role.coach", "role.ref", "role.parent"],
  },
  automation_status: "hybrid",
  platform_features: ["feat.weather_alert_dashboard", "feat.cancellation_broadcast"],
  escalation_path: "If Venue Manager unreachable, Director makes call",
  sop_body: "1. Open admin panel.\n2. Check weather.\n3. Decide.",
  tracking_method: "form",
  tracking_artifact: { template_id: "frm.rainout_decision" },
  expected_completion: "T-90min",
};

describe("ActivitySchema", () => {
  it("accepts a fully-valid activity", () => {
    expect(() => ActivitySchema.parse(validActivity)).not.toThrow();
  });

  it("rejects accountable as an array", () => {
    const bad = {
      ...validActivity,
      raci: { ...validActivity.raci, accountable: ["role.venue_manager"] },
    };
    expect(() => ActivitySchema.parse(bad)).toThrow();
  });

  it("rejects empty accountable", () => {
    const bad = { ...validActivity, raci: { ...validActivity.raci, accountable: "" } };
    expect(() => ActivitySchema.parse(bad)).toThrow();
  });

  it("rejects tracking_method = none", () => {
    const bad = { ...validActivity, tracking_method: "none" };
    expect(() => ActivitySchema.parse(bad)).toThrow();
  });

  it("rejects unknown phase", () => {
    const bad = { ...validActivity, phase: "halftime" };
    expect(() => ActivitySchema.parse(bad)).toThrow();
  });

  it("rejects unknown automation_status", () => {
    const bad = { ...validActivity, automation_status: "auto" };
    expect(() => ActivitySchema.parse(bad)).toThrow();
  });

  it("requires tracking_artifact to match tracking_method shape", () => {
    const bad = {
      ...validActivity,
      tracking_method: "checklist",
      tracking_artifact: { event_type: "evt.foo" }, // wrong shape for checklist
    };
    expect(() => ActivitySchema.parse(bad)).toThrow();
  });

  it("accepts checklist artifact with template_id", () => {
    const ok = {
      ...validActivity,
      tracking_method: "checklist",
      tracking_artifact: { template_id: "chk.facility_close" },
    };
    expect(() => ActivitySchema.parse(ok)).not.toThrow();
  });

  it("accepts photo_upload artifact with media_kind + min_count", () => {
    const ok = {
      ...validActivity,
      tracking_method: "photo_upload",
      tracking_artifact: { media_kind: "field_condition_pregame", min_count: 1 },
    };
    expect(() => ActivitySchema.parse(ok)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run scripts/ops-catalog/__tests__/types/activity.test.ts`
Expected: FAIL — `ActivitySchema` does not exist.

- [ ] **Step 3: Implement the schema**

```typescript
// scripts/ops-catalog/types/activity.ts
import { z } from "zod";

export const PhaseEnum = z.enum([
  "pre_day",
  "day_setup",
  "pre_game",
  "in_game",
  "post_game",
  "end_of_day",
  "post_day",
]);

export const AutomationStatusEnum = z.enum(["platform", "hybrid", "manual"]);

export const TrackingMethodEnum = z.enum([
  "checklist",
  "form",
  "signature",
  "photo_upload",
  "system_event",
  "counter_increment",
  "external_acknowledgment",
]);

const RoleId = z.string().min(1).regex(/^role\.[a-z_]+$/, "must match role.<id>");
const FeatId = z.string().regex(/^feat\.[a-z_]+$/);

const ChecklistArtifact = z.object({ template_id: z.string().regex(/^chk\./) });
const FormArtifact = z.object({ template_id: z.string().regex(/^frm\./) });
const SignatureArtifact = z.object({
  template_id: z.string().regex(/^sig\./),
  required_role: RoleId,
});
const PhotoArtifact = z.object({
  media_kind: z.string().min(1),
  min_count: z.number().int().min(1),
});
const CounterArtifact = z.object({
  counter: z.string().regex(/^counter\.[a-z_]+$/, "must reference an existing counter.<id>"),
  min_count: z.number().int().min(0),
});
const SystemEventArtifact = z.object({ event_type: z.string().regex(/^evt\./) });
const ExternalAckArtifact = z.object({
  external_system: z.enum(["stripe", "telegram", "resend", "quo", "payroll"]),
  record_kind: z.string().min(1),
});

const TrackingArtifactByMethod = z.discriminatedUnion("__method__", [
  z.object({ __method__: z.literal("checklist") }).merge(ChecklistArtifact),
  z.object({ __method__: z.literal("form") }).merge(FormArtifact),
  z.object({ __method__: z.literal("signature") }).merge(SignatureArtifact),
  z.object({ __method__: z.literal("photo_upload") }).merge(PhotoArtifact),
  z.object({ __method__: z.literal("counter_increment") }).merge(CounterArtifact),
  z.object({ __method__: z.literal("system_event") }).merge(SystemEventArtifact),
  z.object({ __method__: z.literal("external_acknowledgment") }).merge(ExternalAckArtifact),
]);

export const RaciSchema = z.object({
  accountable: RoleId,
  responsible: z.array(RoleId).min(1),
  consulted: z.array(RoleId).default([]),
  informed: z.array(RoleId).default([]),
});

export const ActivitySchema = z
  .object({
    id: z.string().regex(/^act\.[a-z_]+$/, "must match act.<id>"),
    name: z.string().min(1),
    description: z.string().min(1),
    trigger: z.string().min(1),
    phase: PhaseEnum,
    sport_tags: z.array(z.string()).default([]),
    venue_tags: z.array(z.string()).default([]),
    format_tags: z.array(z.string()).default([]),
    audience_tags: z.array(z.enum(["youth", "adult", "mixed"])).default([]),
    raci: RaciSchema,
    automation_status: AutomationStatusEnum,
    platform_features: z.array(FeatId).default([]),
    escalation_path: z.string().min(1),
    sop_body: z.string().min(1),
    tracking_method: TrackingMethodEnum,
    tracking_artifact: z.unknown(),
    expected_completion: z.string().min(1),
    reminder_policy: z
      .object({
        pre_reminder_minutes: z.number().int().min(0).optional(),
        overdue_alert_minutes: z.number().int().min(0).optional(),
        escalation_minutes: z.number().int().min(0).optional(),
      })
      .optional(),
  })
  .superRefine((val, ctx) => {
    // Validate tracking_artifact shape against tracking_method
    const tagged = { __method__: val.tracking_method, ...(val.tracking_artifact as any) };
    const parsed = TrackingArtifactByMethod.safeParse(tagged);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tracking_artifact"],
        message: `tracking_artifact does not match shape required by tracking_method='${val.tracking_method}': ${parsed.error.message}`,
      });
    }
  });

export type Activity = z.infer<typeof ActivitySchema>;
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `npx vitest run scripts/ops-catalog/__tests__/types/activity.test.ts`
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/ops-catalog/types/activity.ts scripts/ops-catalog/__tests__/types/activity.test.ts
git commit -m "feat(ops-catalog): activity schema with discriminated tracking_artifact"
```

---

### Task 3: Role, feature, and artifact-template schemas

**Files:**
- Create: `scripts/ops-catalog/types/role.ts`
- Create: `scripts/ops-catalog/types/feature.ts`
- Create: `scripts/ops-catalog/types/artifact-template.ts`
- Test: `scripts/ops-catalog/__tests__/types/role.test.ts`
- Test: `scripts/ops-catalog/__tests__/types/feature.test.ts`
- Test: `scripts/ops-catalog/__tests__/types/artifact-template.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// scripts/ops-catalog/__tests__/types/role.test.ts
import { describe, it, expect } from "vitest";
import { RoleSchema } from "../../types/role";

describe("RoleSchema", () => {
  it("accepts a worker role", () => {
    expect(() =>
      RoleSchema.parse({
        id: "role.venue_manager",
        name: "Venue Manager",
        tier: "leadership",
        kind: "worker",
        description: "On-site decision-maker for the day",
        manual_target: "employee_manual",
      }),
    ).not.toThrow();
  });

  it("accepts a customer role", () => {
    expect(() =>
      RoleSchema.parse({
        id: "role.parent",
        name: "Parent",
        tier: "customer",
        kind: "customer",
        description: "Youth program guardian",
        manual_target: "hand_authored",
      }),
    ).not.toThrow();
  });

  it("rejects invalid id format", () => {
    expect(() =>
      RoleSchema.parse({
        id: "venue-manager",
        name: "Venue Manager",
        tier: "leadership",
        kind: "worker",
        description: "x",
        manual_target: "employee_manual",
      }),
    ).toThrow();
  });
});
```

```typescript
// scripts/ops-catalog/__tests__/types/feature.test.ts
import { describe, it, expect } from "vitest";
import { FeatureSchema } from "../../types/feature";

describe("FeatureSchema", () => {
  it("accepts a feature stub", () => {
    expect(() =>
      FeatureSchema.parse({
        id: "feat.activity_tracking_engine",
        name: "Activity Tracking Engine",
        description: "Per-event tracking + reminders + handoff",
        priority: "P0",
        status: "stub",
      }),
    ).not.toThrow();
  });

  it("rejects unknown priority", () => {
    expect(() =>
      FeatureSchema.parse({
        id: "feat.foo",
        name: "Foo",
        description: "x",
        priority: "P5",
        status: "stub",
      }),
    ).toThrow();
  });
});
```

```typescript
// scripts/ops-catalog/__tests__/types/artifact-template.test.ts
import { describe, it, expect } from "vitest";
import { ArtifactTemplateSchema } from "../../types/artifact-template";

describe("ArtifactTemplateSchema", () => {
  it("accepts a checklist template", () => {
    expect(() =>
      ArtifactTemplateSchema.parse({
        id: "chk.facility_close",
        kind: "checklist",
        status: "stub",
        items: [
          { id: "exits_locked", label: "All exits locked" },
          { id: "lights_out", label: "Lights out" },
        ],
      }),
    ).not.toThrow();
  });

  it("accepts a form template", () => {
    expect(() =>
      ArtifactTemplateSchema.parse({
        id: "frm.incident_report",
        kind: "form",
        status: "stub",
        fields: [
          { id: "incident_type", label: "Type", type: "enum", options: ["a", "b"], required: true },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects checklist without items", () => {
    expect(() =>
      ArtifactTemplateSchema.parse({
        id: "chk.foo",
        kind: "checklist",
        status: "stub",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run scripts/ops-catalog/__tests__/types/`
Expected: FAIL — schemas don't exist.

- [ ] **Step 3: Implement schemas**

```typescript
// scripts/ops-catalog/types/role.ts
import { z } from "zod";

export const RoleSchema = z.object({
  id: z.string().regex(/^role\.[a-z_]+$/),
  name: z.string().min(1),
  tier: z.enum(["leadership", "operational", "field_side", "customer", "system"]),
  kind: z.enum(["worker", "customer", "system"]),
  description: z.string().min(1),
  manual_target: z.enum(["employee_manual", "contractor_handbook", "hand_authored", "none"]),
});

export type Role = z.infer<typeof RoleSchema>;
```

```typescript
// scripts/ops-catalog/types/feature.ts
import { z } from "zod";

export const FeatureSchema = z.object({
  id: z.string().regex(/^feat\.[a-z_]+$/),
  name: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(["P0", "P1", "P2", "P3"]),
  status: z.enum(["stub", "in_progress", "shipped"]),
});

export type Feature = z.infer<typeof FeatureSchema>;
```

```typescript
// scripts/ops-catalog/types/artifact-template.ts
import { z } from "zod";

const StatusEnum = z.enum(["stub", "implemented", "deprecated"]);

const ChecklistItem = z.object({ id: z.string(), label: z.string() });
const FormField = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["text", "long_text", "enum", "boolean", "number", "date"]),
  options: z.array(z.string()).optional(),
  required: z.boolean().default(false),
});

const ChecklistTemplate = z.object({
  id: z.string().regex(/^chk\./),
  kind: z.literal("checklist"),
  status: StatusEnum,
  items: z.array(ChecklistItem).min(1),
});
const FormTemplate = z.object({
  id: z.string().regex(/^frm\./),
  kind: z.literal("form"),
  status: StatusEnum,
  fields: z.array(FormField).min(1),
});
const SignatureTemplate = z.object({
  id: z.string().regex(/^sig\./),
  kind: z.literal("signature"),
  status: StatusEnum,
  required_role: z.string().regex(/^role\./),
  prompt: z.string().min(1),
});
const EventTemplate = z.object({
  id: z.string().regex(/^evt\./),
  kind: z.literal("system_event"),
  status: StatusEnum,
  description: z.string().min(1),
});
const CounterTemplate = z.object({
  id: z.string().regex(/^counter\./),
  kind: z.literal("counter"),
  status: StatusEnum,
  description: z.string().min(1),
});

export const ArtifactTemplateSchema = z.discriminatedUnion("kind", [
  ChecklistTemplate,
  FormTemplate,
  SignatureTemplate,
  EventTemplate,
  CounterTemplate,
]);

export type ArtifactTemplate = z.infer<typeof ArtifactTemplateSchema>;
```

- [ ] **Step 4: Run tests, verify all pass**

Run: `npx vitest run scripts/ops-catalog/__tests__/types/`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/ops-catalog/types/ scripts/ops-catalog/__tests__/types/
git commit -m "feat(ops-catalog): role, feature, and artifact-template schemas"
```

---

### Task 4: YAML loader

**Files:**
- Create: `scripts/ops-catalog/loader.ts`
- Test: `scripts/ops-catalog/__tests__/loader.test.ts`
- Create: `scripts/ops-catalog/__tests__/fixtures/sample/` with a few minimal YAML files

- [ ] **Step 1: Create test fixtures**

```yaml
# scripts/ops-catalog/__tests__/fixtures/sample/roles/role.test_role.yaml
id: role.test_role
name: Test Role
tier: operational
kind: worker
description: A role for testing
manual_target: employee_manual
```

```yaml
# scripts/ops-catalog/__tests__/fixtures/sample/features/feat.test.yaml
id: feat.test
name: Test Feature
description: A feature stub for testing
priority: P1
status: stub
```

```yaml
# scripts/ops-catalog/__tests__/fixtures/sample/artifacts/chk.test.yaml
id: chk.test
kind: checklist
status: stub
items:
  - id: item_one
    label: First item
```

- [ ] **Step 2: Write failing test**

```typescript
// scripts/ops-catalog/__tests__/loader.test.ts
import { describe, it, expect } from "vitest";
import { loadCatalog } from "../loader";
import path from "node:path";

const FIXTURE = path.join(__dirname, "fixtures/sample");

describe("loadCatalog", () => {
  it("loads roles, features, and artifacts from fixture dir", async () => {
    const catalog = await loadCatalog(FIXTURE);
    expect(catalog.roles).toHaveLength(1);
    expect(catalog.roles[0].id).toBe("role.test_role");
    expect(catalog.features).toHaveLength(1);
    expect(catalog.features[0].id).toBe("feat.test");
    expect(catalog.artifacts).toHaveLength(1);
    expect(catalog.artifacts[0].id).toBe("chk.test");
  });

  it("returns empty arrays for missing subdirectories", async () => {
    const catalog = await loadCatalog(path.join(__dirname, "fixtures/empty"));
    expect(catalog.roles).toEqual([]);
    expect(catalog.activities).toEqual([]);
  });
});
```

Also create `scripts/ops-catalog/__tests__/fixtures/empty/` (just an empty dir with `.gitkeep`).

- [ ] **Step 3: Run test, verify it fails**

Run: `npx vitest run scripts/ops-catalog/__tests__/loader.test.ts`
Expected: FAIL — `loadCatalog` not defined.

- [ ] **Step 4: Implement loader**

```typescript
// scripts/ops-catalog/loader.ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { ActivitySchema, type Activity } from "./types/activity";
import { RoleSchema, type Role } from "./types/role";
import { FeatureSchema, type Feature } from "./types/feature";
import { ArtifactTemplateSchema, type ArtifactTemplate } from "./types/artifact-template";

export interface Catalog {
  roles: Role[];
  features: Feature[];
  artifacts: ArtifactTemplate[];
  activities: Activity[];
}

async function listYamlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml")).map((f) => path.join(dir, f));
  } catch (e: any) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
}

async function loadFile<T>(file: string, schema: { parse: (raw: unknown) => T }): Promise<T> {
  const text = await fs.readFile(file, "utf8");
  const raw = parseYaml(text);
  try {
    return schema.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ${file}: ${(err as Error).message}`);
  }
}

export async function loadCatalog(rootDir: string): Promise<Catalog> {
  const rolesDir = path.join(rootDir, "roles");
  const featuresDir = path.join(rootDir, "features");
  const artifactsDir = path.join(rootDir, "artifacts");
  const activitiesDir = path.join(rootDir, "activities");

  const [roleFiles, featureFiles, artifactFiles, activityFiles] = await Promise.all([
    listYamlFiles(rolesDir),
    listYamlFiles(featuresDir),
    listYamlFiles(artifactsDir),
    listYamlFiles(activitiesDir),
  ]);

  const [roles, features, artifacts, activities] = await Promise.all([
    Promise.all(roleFiles.map((f) => loadFile(f, RoleSchema))),
    Promise.all(featureFiles.map((f) => loadFile(f, FeatureSchema))),
    Promise.all(artifactFiles.map((f) => loadFile(f, ArtifactTemplateSchema))),
    Promise.all(activityFiles.map((f) => loadFile(f, ActivitySchema))),
  ]);

  return { roles, features, artifacts, activities };
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npx vitest run scripts/ops-catalog/__tests__/loader.test.ts`
Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add scripts/ops-catalog/loader.ts scripts/ops-catalog/__tests__/loader.test.ts scripts/ops-catalog/__tests__/fixtures/
git commit -m "feat(ops-catalog): YAML loader for roles/features/artifacts/activities"
```

---

### Task 5: Validator (cross-references + smell flags)

**Files:**
- Create: `scripts/ops-catalog/validator.ts`
- Test: `scripts/ops-catalog/__tests__/validator.test.ts`
- Modify: `scripts/ops-catalog/index.ts` (wire up `validate` command)

- [ ] **Step 1: Write failing tests**

```typescript
// scripts/ops-catalog/__tests__/validator.test.ts
import { describe, it, expect } from "vitest";
import { validateCatalog, type ValidationResult } from "../validator";
import type { Catalog } from "../loader";

const validCatalog: Catalog = {
  roles: [
    { id: "role.venue_manager", name: "VM", tier: "leadership", kind: "worker", description: "x", manual_target: "employee_manual" },
    { id: "role.director", name: "D", tier: "leadership", kind: "worker", description: "x", manual_target: "employee_manual" },
  ],
  features: [{ id: "feat.x", name: "X", description: "x", priority: "P1", status: "stub" }],
  artifacts: [
    { id: "frm.test", kind: "form", status: "stub", fields: [{ id: "f", label: "F", type: "text", required: false }] },
  ],
  activities: [
    {
      id: "act.test",
      name: "Test",
      description: "x",
      trigger: "x",
      phase: "pre_game",
      sport_tags: [],
      venue_tags: [],
      format_tags: [],
      audience_tags: [],
      raci: { accountable: "role.venue_manager", responsible: ["role.venue_manager"], consulted: [], informed: [] },
      automation_status: "manual",
      platform_features: ["feat.x"],
      escalation_path: "x",
      sop_body: "x",
      tracking_method: "form",
      tracking_artifact: { template_id: "frm.test" },
      expected_completion: "T-30min",
    },
  ],
};

describe("validateCatalog", () => {
  it("returns no errors for a valid catalog", () => {
    const result = validateCatalog(validCatalog);
    expect(result.errors).toEqual([]);
  });

  it("errors when activity references unknown role", () => {
    const bad: Catalog = {
      ...validCatalog,
      activities: [{ ...validCatalog.activities[0], raci: { ...validCatalog.activities[0].raci, accountable: "role.does_not_exist" } }],
    };
    const result = validateCatalog(bad);
    expect(result.errors.some((e) => e.message.includes("role.does_not_exist"))).toBe(true);
  });

  it("errors when activity references unknown feature", () => {
    const bad: Catalog = {
      ...validCatalog,
      activities: [{ ...validCatalog.activities[0], platform_features: ["feat.unknown"] }],
    };
    const result = validateCatalog(bad);
    expect(result.errors.some((e) => e.message.includes("feat.unknown"))).toBe(true);
  });

  it("errors when activity references unknown artifact template", () => {
    const bad: Catalog = {
      ...validCatalog,
      activities: [
        {
          ...validCatalog.activities[0],
          tracking_artifact: { template_id: "frm.does_not_exist" },
        },
      ],
    };
    const result = validateCatalog(bad);
    expect(result.errors.some((e) => e.message.includes("frm.does_not_exist"))).toBe(true);
  });

  it("warns when accountable is role.director outside post_day", () => {
    const flagged: Catalog = {
      ...validCatalog,
      activities: [
        {
          ...validCatalog.activities[0],
          raci: { ...validCatalog.activities[0].raci, accountable: "role.director" },
          phase: "pre_game",
        },
      ],
    };
    const result = validateCatalog(flagged);
    expect(result.warnings.some((w) => w.message.includes("role.director"))).toBe(true);
  });

  it("does not warn when accountable=role.director is in post_day", () => {
    const ok: Catalog = {
      ...validCatalog,
      activities: [
        {
          ...validCatalog.activities[0],
          raci: { ...validCatalog.activities[0].raci, accountable: "role.director" },
          phase: "post_day",
        },
      ],
    };
    const result = validateCatalog(ok);
    expect(result.warnings.filter((w) => w.message.includes("role.director"))).toEqual([]);
  });

  it("errors when same id appears twice", () => {
    const bad: Catalog = {
      ...validCatalog,
      activities: [validCatalog.activities[0], validCatalog.activities[0]],
    };
    const result = validateCatalog(bad);
    expect(result.errors.some((e) => e.message.includes("duplicate id"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `npx vitest run scripts/ops-catalog/__tests__/validator.test.ts`
Expected: FAIL — `validateCatalog` undefined.

- [ ] **Step 3: Implement validator**

```typescript
// scripts/ops-catalog/validator.ts
import type { Catalog } from "./loader";

export interface ValidationIssue {
  level: "error" | "warning";
  source: string; // e.g., "act.rainout_decision"
  message: string;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function validateCatalog(catalog: Catalog): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const roleIds = new Set(catalog.roles.map((r) => r.id));
  const featureIds = new Set(catalog.features.map((f) => f.id));
  const artifactIds = new Set(catalog.artifacts.map((a) => a.id));

  // Duplicate-id check across each kind
  for (const collection of [
    { name: "role", items: catalog.roles },
    { name: "feature", items: catalog.features },
    { name: "artifact", items: catalog.artifacts },
    { name: "activity", items: catalog.activities },
  ]) {
    const seen = new Map<string, number>();
    for (const item of collection.items as { id: string }[]) {
      seen.set(item.id, (seen.get(item.id) ?? 0) + 1);
    }
    for (const [id, count] of seen) {
      if (count > 1) {
        errors.push({ level: "error", source: id, message: `duplicate id: ${collection.name} '${id}' appears ${count} times` });
      }
    }
  }

  // Cross-reference checks on activities
  for (const a of catalog.activities) {
    const refs: { kind: string; id: string }[] = [
      { kind: "role.accountable", id: a.raci.accountable },
      ...a.raci.responsible.map((r) => ({ kind: "role.responsible", id: r })),
      ...a.raci.consulted.map((r) => ({ kind: "role.consulted", id: r })),
      ...a.raci.informed.map((r) => ({ kind: "role.informed", id: r })),
    ];
    for (const ref of refs) {
      if (!roleIds.has(ref.id)) {
        errors.push({ level: "error", source: a.id, message: `unresolved role reference: ${ref.id} (${ref.kind})` });
      }
    }
    for (const fid of a.platform_features) {
      if (!featureIds.has(fid)) {
        errors.push({ level: "error", source: a.id, message: `unresolved feature reference: ${fid}` });
      }
    }
    // Artifact template reference (only methods that use template_id)
    if (
      a.tracking_method === "checklist" ||
      a.tracking_method === "form" ||
      a.tracking_method === "signature"
    ) {
      const tid = (a.tracking_artifact as any).template_id;
      if (!artifactIds.has(tid)) {
        errors.push({ level: "error", source: a.id, message: `unresolved artifact template reference: ${tid}` });
      }
    }
    if (a.tracking_method === "system_event") {
      const eid = (a.tracking_artifact as any).event_type;
      if (!artifactIds.has(eid)) {
        errors.push({ level: "error", source: a.id, message: `unresolved system_event reference: ${eid}` });
      }
    }
    if (a.tracking_method === "counter_increment") {
      const cid = (a.tracking_artifact as any).counter;
      if (!artifactIds.has(cid)) {
        errors.push({ level: "error", source: a.id, message: `unresolved counter reference: ${cid}` });
      }
    }

    // Smell flags
    if (a.raci.accountable === "role.director" && a.phase !== "post_day") {
      warnings.push({
        level: "warning",
        source: a.id,
        message: `accountable=role.director outside post_day (phase=${a.phase}); director should be escalation, not day-of accountable`,
      });
    }
  }

  return { errors, warnings };
}
```

- [ ] **Step 4: Wire up the `validate` command in `index.ts`**

Replace the `validate` stub:
```typescript
import path from "node:path";
import { loadCatalog } from "./loader";
import { validateCatalog } from "./validator";

const CATALOG_DIR = path.join(process.cwd(), "docs/operations/catalog");

const commands: Record<string, () => Promise<number>> = {
  validate: async () => {
    const catalog = await loadCatalog(CATALOG_DIR);
    const result = validateCatalog(catalog);
    for (const w of result.warnings) console.warn(`[warn] ${w.source}: ${w.message}`);
    for (const e of result.errors) console.error(`[error] ${e.source}: ${e.message}`);
    if (result.errors.length > 0) {
      console.error(`\nValidation failed: ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
      return 1;
    }
    console.log(`Validation passed: ${result.warnings.length} warning(s)`);
    return 0;
  },
  // render stub stays the same for now
};
```

- [ ] **Step 5: Run validator tests + smoke test**

Run: `npx vitest run scripts/ops-catalog/__tests__/validator.test.ts`
Expected: 7 tests pass.

Run: `npm run catalog:validate`
Expected: passes (catalog dir doesn't exist yet, loader returns empty arrays, validator finds nothing to validate, returns 0).

- [ ] **Step 6: Commit**

```bash
git add scripts/ops-catalog/validator.ts scripts/ops-catalog/__tests__/validator.test.ts scripts/ops-catalog/index.ts
git commit -m "feat(ops-catalog): validator with cross-reference checks and smell flags"
```

---

## Phase B: Catalog content

For each authoring task in this phase, the structural fields (id, accountable, phase, tracking, tags) come from spec §11. The engineer authoring these should:

1. Create one YAML file per record at the path indicated.
2. Fill in `name`, `description`, `trigger`, `escalation_path`, `expected_completion`, `responsible/consulted/informed` arrays, `automation_status`, `platform_features`, and `tracking_artifact` from the spec table + best judgment matching adjacent activities.
3. For `sop_body`, write a one-paragraph functional placeholder that says: "Procedure to be authored by the operating team. This activity is defined in the catalog; full step-by-step SOP content will be added in a follow-up PR." This is **not** a TBD/TODO marker — it is the deliberate initial state of every activity until the operator writes the SOP. The validator does not flag these; a separate audit view (deferred to a later plan) will surface them.
4. Run `npm run catalog:validate` after each file batch; fix any validator errors before moving to the next task.
5. Commit per phase.

### Task 6: Author 12 role YAML files

**Files:**
- Create: `docs/operations/catalog/roles/role.<id>.yaml` for each of the 12 roles in spec §6.

- [ ] **Step 1: Author role files**

For each role from spec §6 (`role.director`, `role.venue_manager`, `role.event_lead`, `role.front_of_house`, `role.facilities`, `role.coach`, `role.team_captain`, `role.ref`, `role.photographer`, `role.parent`, `role.player`, `role.platform`), create a YAML file.

Example for `role.venue_manager`:
```yaml
# docs/operations/catalog/roles/role.venue_manager.yaml
id: role.venue_manager
name: Venue Manager
tier: leadership
kind: worker
description: |
  On-site decision-maker for a single venue on a single day.
  Accountable for facility readiness, in-game incident response, end-of-day close,
  and post-day incident follow-up. Reports to the Director.
manual_target: employee_manual
```

Mappings for `tier` → use the spec §6 table column. `kind`:
- `worker` for: director, venue_manager, event_lead, front_of_house, facilities, coach, team_captain, ref, photographer
- `customer` for: parent, player
- `system` for: platform

`manual_target`:
- `employee_manual` for: director, venue_manager, event_lead, front_of_house, facilities
- `contractor_handbook` for: ref, photographer
- `hand_authored` for: coach, team_captain (coaches are external; coach handbook is hand-authored), parent, player
- `none` for: platform (no human manual)

- [ ] **Step 2: Validate**

Run: `npm run catalog:validate`
Expected: passes (no activities yet to reference these roles, but role schema validates).

- [ ] **Step 3: Commit**

```bash
git add docs/operations/catalog/roles/
git commit -m "feat(ops-catalog): seed 12 role definitions"
```

---

### Task 7: Author 19 feature stub YAML files

**Files:**
- Create: `docs/operations/catalog/features/feat.<id>.yaml` for each of the 19 features in spec §13.

- [ ] **Step 1: Author feature stubs**

For each feature from spec §13 (`feat.activity_tracking_engine` through `feat.external_ack_listener`), create a stub.

Example:
```yaml
# docs/operations/catalog/features/feat.activity_tracking_engine.yaml
id: feat.activity_tracking_engine
name: Activity Tracking Engine
description: |
  Core platform service that:
  - Computes expected_completion timestamps per scheduled event
  - Tracks per-event activity records (event_id × match_id × activity_id)
  - Fires pre-reminders, overdue alerts, and escalations per reminder_policy
  - Implements the handoff-not-skip ladder: each escalation tier reassigns Responsible
  - Surfaces overdue dashboard for Venue Manager and Director
priority: P0
status: stub
```

Use spec §13 for `name`, `description`, `priority`. Status is `stub` for all.

- [ ] **Step 2: Validate**

Run: `npm run catalog:validate`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add docs/operations/catalog/features/
git commit -m "feat(ops-catalog): seed 19 platform feature stubs"
```

---

### Task 8: Author 16 checklist artifact stubs

**Files:**
- Create: `docs/operations/catalog/artifacts/chk.<id>.yaml` for each checklist from spec §12.

- [ ] **Step 1: Author checklist stubs**

For each checklist (`chk.ref_assignment_confirm`, `chk.weather_pre_check`, `chk.equipment_inventory`, `chk.staff_schedule_confirm`, `chk.facility_unlock`, `chk.equipment_staging`, `chk.concession_setup`, `chk.first_aid`, `chk.parking_setup`, `chk.weather_pregame`, `chk.equipment_turnover`, `chk.field_reset`, `chk.facility_close_walkthrough`, `chk.facility_lock_alarm`, `chk.equipment_storage`, `chk.trash_disposal`), create a stub. Each must have at least one `items` entry.

Example:
```yaml
# docs/operations/catalog/artifacts/chk.facility_close_walkthrough.yaml
id: chk.facility_close_walkthrough
kind: checklist
status: stub
items:
  - id: pending_authorship
    label: (placeholder — full checklist items pending operator authorship)
```

(The single placeholder item satisfies the schema's `items.min(1)` rule. The operator fills in real items in a follow-up PR.)

- [ ] **Step 2: Validate**

Run: `npm run catalog:validate`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add docs/operations/catalog/artifacts/chk.*.yaml
git commit -m "feat(ops-catalog): seed 16 checklist artifact stubs"
```

---

### Task 9: Author 18 form artifact stubs

**Files:**
- Create: `docs/operations/catalog/artifacts/frm.<id>.yaml` for each form from spec §12.

- [ ] **Step 1: Author form stubs**

For each form (`frm.opening_walkthrough_findings`, `frm.concession_inventory`, `frm.team_check_in`, `frm.rainout_decision`, `frm.incident_response`, `frm.code_of_conduct_event`, `frm.spectator_complaint`, `frm.ref_stipend_log`, `frm.incident_report_full`, `frm.field_damage_report`, `frm.ejection_log`, `frm.cash_reconcile`, `frm.lost_and_found_inventory`, `frm.staff_debrief`, `frm.rainout_refund`, `frm.rainout_reschedule`, `frm.incident_followup`, `frm.weekly_safety_review`), create a stub. Each must have at least one `fields` entry.

Example:
```yaml
# docs/operations/catalog/artifacts/frm.incident_response.yaml
id: frm.incident_response
kind: form
status: stub
fields:
  - id: pending_authorship
    label: (placeholder — full field schema pending operator authorship)
    type: text
    required: false
```

- [ ] **Step 2: Validate + commit**

```bash
npm run catalog:validate
git add docs/operations/catalog/artifacts/frm.*.yaml
git commit -m "feat(ops-catalog): seed 18 form artifact stubs"
```

---

### Task 10: Author signature, system event, and counter artifact stubs (20 files)

**Files:**
- Create: `docs/operations/catalog/artifacts/sig.<id>.yaml` × 6 from spec §12
- Create: `docs/operations/catalog/artifacts/evt.<id>.yaml` × 10 from spec §12
- Create: `docs/operations/catalog/artifacts/counter.<id>.yaml` × 4 from spec §12

- [ ] **Step 1: Author signature stubs**

Example:
```yaml
# docs/operations/catalog/artifacts/sig.ref_check_in.yaml
id: sig.ref_check_in
kind: signature
status: stub
required_role: role.ref
prompt: I am [name], officiating today's match. I have reviewed today's roster and confirm I am fit to officiate.
```

For each: `sig.staff_briefing_signin` (role.front_of_house? actually staff in general — use the role most likely to sign — facilities, but multiple roles may use it; pick the broadest plausible role like role.front_of_house, then revise as the SOP matures), `sig.ref_check_in` (role.ref), `sig.photographer_check_in` (role.photographer), `sig.coach_pregame` (role.coach), `sig.ref_score_attestation` (role.ref), `sig.staff_clock_out` (role.front_of_house — multi-role, pick representative).

- [ ] **Step 2: Author system event stubs**

Example:
```yaml
# docs/operations/catalog/artifacts/evt.score_posted.yaml
id: evt.score_posted
kind: system_event
status: stub
description: Emitted by the platform when a final score is posted to standings.
```

For each: `evt.attendance_broadcast_sent`, `evt.t24h_reminder_sent`, `evt.coach_pregame_dispatch`, `evt.field_assignment_published`, `evt.cancellation_broadcast_sent`, `evt.timekeeping_clock`, `evt.score_posted`, `evt.standings_updated`, `evt.daily_digest_sent`, `evt.weekly_metrics_run`.

- [ ] **Step 3: Author counter stubs**

Example:
```yaml
# docs/operations/catalog/artifacts/counter.walk_on_registrations.yaml
id: counter.walk_on_registrations
kind: counter
status: stub
description: Increments once per walk-on registration completed at a venue on a given day.
```

For each: `counter.live_scores`, `counter.walk_on_registrations`, `counter.photos_uploaded`, `counter.photos_published`.

- [ ] **Step 4: Validate + commit**

```bash
npm run catalog:validate
git add docs/operations/catalog/artifacts/sig.*.yaml docs/operations/catalog/artifacts/evt.*.yaml docs/operations/catalog/artifacts/counter.*.yaml
git commit -m "feat(ops-catalog): seed signature, event, and counter artifact stubs"
```

---

### Task 11: Author `pre_day` activity records (8 activities)

**Files:**
- Create: `docs/operations/catalog/activities/act.<id>.yaml` × 8 for the `pre_day` rows in spec §11.

- [ ] **Step 1: Author each activity**

Use the spec §11 table for: `id`, `accountable`, `tracking_method`, `automation_status`, `tags`. Fill in remaining fields.

Example fully-worked record (use this as the pattern for all subsequent activities):

```yaml
# docs/operations/catalog/activities/act.attendance_roster_confirm.yaml
id: act.attendance_roster_confirm
name: Attendance / roster confirm broadcast
description: |
  Platform sends a roster-confirmation prompt to every parent (youth) or
  registered player (adult) for an upcoming event. Parents/players respond
  attending / not attending / unsure. Counts feed the venue manager's
  pre-day capacity check.
trigger: 72h before event kickoff (scheduled job)
phase: pre_day
sport_tags: []
venue_tags: []
format_tags: []
audience_tags: []
raci:
  accountable: role.platform
  responsible: [role.platform]
  consulted: []
  informed: [role.venue_manager, role.coach, role.team_captain]
automation_status: platform
platform_features:
  - feat.cancellation_broadcast
  - feat.activity_tracking_engine
escalation_path: |
  If broadcast send fails (delivery error rate > 20% within 30min),
  alert role.director and role.venue_manager via SMS for manual outreach.
sop_body: |
  Procedure to be authored by the operating team. This activity is defined
  in the catalog; full step-by-step SOP content will be added in a
  follow-up PR.
tracking_method: system_event
tracking_artifact:
  event_type: evt.attendance_broadcast_sent
expected_completion: T-72h
```

Repeat for the other 7 `pre_day` activities. For each:
- Pick `responsible` to include the accountable role at minimum; add others doing actual work.
- Pick `consulted` for activities where Director input is normal before action; usually empty.
- Pick `informed` for downstream stakeholders (parents, coaches, etc.).
- `escalation_path` describes who handles failure or contested calls.
- `expected_completion` from typical timing in pre_day (T-72h, T-48h, T-24h, T-12h are common anchors).

- [ ] **Step 2: Validate**

Run: `npm run catalog:validate`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add docs/operations/catalog/activities/act.*.yaml
git commit -m "feat(ops-catalog): seed pre_day activities (8)"
```

---

### Task 12: Author `day_setup` activity records (9 activities)

**Files:**
- Create: 9 activity YAML files matching spec §11 `day_setup` table.

- [ ] **Step 1: Author each activity** following the Task 11 pattern.

`act.facility_unlock`, `act.opening_walkthrough`, `act.equipment_staging`, `act.signage_setup`, `act.concession_setup`, `act.concession_inventory_count`, `act.preshift_staff_briefing`, `act.first_aid_kit_check`, `act.parking_setup`.

Typical `expected_completion` values: T-12h to T-2h.

- [ ] **Step 2: Validate + commit**

```bash
npm run catalog:validate
git add docs/operations/catalog/activities/act.facility_unlock.yaml docs/operations/catalog/activities/act.opening_walkthrough.yaml docs/operations/catalog/activities/act.equipment_staging.yaml docs/operations/catalog/activities/act.signage_setup.yaml docs/operations/catalog/activities/act.concession_setup.yaml docs/operations/catalog/activities/act.concession_inventory_count.yaml docs/operations/catalog/activities/act.preshift_staff_briefing.yaml docs/operations/catalog/activities/act.first_aid_kit_check.yaml docs/operations/catalog/activities/act.parking_setup.yaml
git commit -m "feat(ops-catalog): seed day_setup activities (9)"
```

---

### Task 13: Author `pre_game` activity records (11 activities)

**Files:**
- Create: 11 activity YAML files matching spec §11 `pre_game` table.

- [ ] **Step 1: Author each activity** following the Task 11 pattern.

`act.field_court_setup`, `act.flag_field_line_check`, `act.ref_check_in`, `act.photographer_check_in`, `act.team_check_in`, `act.coach_pregame_briefing`, `act.walk_on_registration`, `act.weather_check_pregame`, `act.rainout_decision`, `act.cancellation_broadcast`, `act.field_condition_photo`.

Notes:
- `act.flag_field_line_check`: `sport_tags: [outdoor:flag_football]`
- `act.coach_pregame_briefing`: `format_tags: [league]`, `audience_tags: [youth]`
- `act.walk_on_registration`: `format_tags: [drop_in, clinic]`
- `act.weather_check_pregame`, `act.rainout_decision`: `venue_tags: [outdoor]`

Typical `expected_completion`: T-2h to T-0min.

- [ ] **Step 2: Validate + commit**

```bash
npm run catalog:validate
git add docs/operations/catalog/activities/
git commit -m "feat(ops-catalog): seed pre_game activities (11)"
```

---

### Task 14: Author `in_game` activity records (6 activities)

**Files:**
- Create: 6 activity YAML files matching spec §11 `in_game` table.

- [ ] **Step 1: Author each activity** following Task 11 pattern.

`act.timekeeping`, `act.live_score_update`, `act.score_reporting_final`, `act.incident_response`, `act.code_of_conduct_enforcement`, `act.spectator_management`.

Typical `expected_completion`: `trigger+5min` for incident response (must respond fast); `phase_end` for timekeeping/scoring (by end of in_game).

- [ ] **Step 2: Validate + commit**

```bash
npm run catalog:validate
git add docs/operations/catalog/activities/
git commit -m "feat(ops-catalog): seed in_game activities (6)"
```

---

### Task 15: Author `post_game` activity records (8 activities)

**Files:**
- Create: 8 activity YAML files matching spec §11 `post_game` table.

- [ ] **Step 1: Author each activity** following Task 11 pattern.

`act.score_post_to_standings`, `act.equipment_turnover`, `act.field_reset_between_matches`, `act.ref_stipend_log`, `act.photo_handoff`, `act.incident_report_finalization`, `act.field_damage_report`, `act.ejection_logging`.

Notes:
- `act.field_damage_report`: `venue_tags: [owned]`
- Typical `expected_completion`: `T+0` to `T+30min` (within 30min of match end).

- [ ] **Step 2: Validate + commit**

```bash
npm run catalog:validate
git add docs/operations/catalog/activities/
git commit -m "feat(ops-catalog): seed post_game activities (8)"
```

---

### Task 16: Author `end_of_day` activity records (9 activities)

**Files:**
- Create: 9 activity YAML files matching spec §11 `end_of_day` table.

- [ ] **Step 1: Author each activity** following Task 11 pattern.

`act.facility_close_walkthrough`, `act.facility_lock_alarm`, `act.cash_concession_reconcile`, `act.lost_and_found_inventory`, `act.daily_digest_send`, `act.staff_debrief`, `act.staff_clock_out`, `act.equipment_storage`, `act.trash_disposal`.

Notes:
- `act.facility_lock_alarm`: `venue_tags: [owned]`
- `act.cash_concession_reconcile`: `venue_tags: [concessions]`
- `act.trash_disposal`: `venue_tags: [owned]`
- Typical `expected_completion`: absolute time (e.g., `21:00`) or `phase_end`.

- [ ] **Step 2: Validate + commit**

```bash
npm run catalog:validate
git add docs/operations/catalog/activities/
git commit -m "feat(ops-catalog): seed end_of_day activities (9)"
```

---

### Task 17: Author `post_day` activity records (9 activities)

**Files:**
- Create: 9 activity YAML files matching spec §11 `post_day` table.

- [ ] **Step 1: Author each activity** following Task 11 pattern.

`act.photo_publish`, `act.rainout_refund_decision`, `act.rainout_reschedule`, `act.incident_followup`, `act.weekly_metrics_rollup`, `act.standings_update`, `act.staff_payroll_event`, `act.ref_payroll_event`, `act.weekly_safety_review`.

Notes:
- `act.rainout_refund_decision`, `act.rainout_reschedule`, `act.weekly_safety_review`: `accountable: role.director` (allowed in `post_day` without smell flag).
- Typical `expected_completion`: `T+24h` to `T+72h`.

- [ ] **Step 2: Final validation pass**

```bash
npm run catalog:validate
```
Expected: 0 errors. Warnings only allowed where intentional (none expected since director-accountable activities are all in post_day).

- [ ] **Step 3: Commit**

```bash
git add docs/operations/catalog/activities/
git commit -m "feat(ops-catalog): seed post_day activities (9) — catalog seed complete"
```

---

## Phase C: View generation

### Task 18: Runbook view generator

**Files:**
- Create: `scripts/ops-catalog/views/runbook.ts`
- Test: `scripts/ops-catalog/__tests__/views/runbook.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// scripts/ops-catalog/__tests__/views/runbook.test.ts
import { describe, it, expect } from "vitest";
import { renderRunbook, type RunbookContext } from "../../views/runbook";
import type { Catalog } from "../../loader";
// reuse the validCatalog fixture from validator tests, or define here
import { validCatalog } from "../fixtures/inline-catalog";

describe("renderRunbook", () => {
  it("returns markdown with all 7 phases as headings", () => {
    const ctx: RunbookContext = {
      venue_id: "worthington",
      event_date: "2026-06-03",
      sport_tags: ["outdoor:soccer"],
      venue_tags: ["outdoor", "owned"],
      format_tags: ["league"],
      audience_tags: ["youth"],
    };
    const md = renderRunbook(validCatalog, ctx);
    expect(md).toContain("# Runbook — worthington — 2026-06-03");
    expect(md).toContain("## pre_day");
    expect(md).toContain("## end_of_day");
  });

  it("includes activities matching the venue tags", () => {
    const md = renderRunbook(validCatalog, {
      venue_id: "worthington",
      event_date: "2026-06-03",
      sport_tags: ["outdoor:soccer"],
      venue_tags: ["outdoor"],
      format_tags: ["league"],
      audience_tags: ["youth"],
    });
    expect(md).toContain("act.test"); // from validCatalog
  });

  it("excludes activities whose venue_tags don't match (AND across)", () => {
    const ctx = {
      venue_id: "indoor1",
      event_date: "2026-06-03",
      sport_tags: ["indoor:soccer"],
      venue_tags: ["indoor"],
      format_tags: ["league"],
      audience_tags: ["adult"],
    };
    const md = renderRunbook(
      {
        ...validCatalog,
        activities: [{ ...validCatalog.activities[0], venue_tags: ["outdoor"] }],
      },
      ctx,
    );
    expect(md).not.toContain("act.test");
  });
});
```

(Create the inline fixture `scripts/ops-catalog/__tests__/fixtures/inline-catalog.ts` exporting `validCatalog` for reuse.)

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run scripts/ops-catalog/__tests__/views/runbook.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement runbook view**

```typescript
// scripts/ops-catalog/views/runbook.ts
import type { Catalog } from "../loader";
import type { Activity } from "../types/activity";

export interface RunbookContext {
  venue_id: string;
  event_date: string;
  sport_tags: string[];
  venue_tags: string[];
  format_tags: string[];
  audience_tags: ("youth" | "adult" | "mixed")[];
}

const PHASE_ORDER = [
  "pre_day",
  "day_setup",
  "pre_game",
  "in_game",
  "post_game",
  "end_of_day",
  "post_day",
] as const;

function tagsMatch(activityTags: string[], contextTags: string[]): boolean {
  if (activityTags.length === 0) return true; // no constraint
  return activityTags.some((t) => contextTags.includes(t));
}

function activityApplies(a: Activity, ctx: RunbookContext): boolean {
  return (
    tagsMatch(a.sport_tags, ctx.sport_tags) &&
    tagsMatch(a.venue_tags, ctx.venue_tags) &&
    tagsMatch(a.format_tags, ctx.format_tags) &&
    tagsMatch(a.audience_tags, ctx.audience_tags)
  );
}

export function renderRunbook(catalog: Catalog, ctx: RunbookContext): string {
  const lines: string[] = [];
  lines.push(`# Runbook — ${ctx.venue_id} — ${ctx.event_date}`);
  lines.push("");
  lines.push(`Tags: sport=${ctx.sport_tags.join(",")}, venue=${ctx.venue_tags.join(",")}, format=${ctx.format_tags.join(",")}, audience=${ctx.audience_tags.join(",")}`);
  lines.push("");

  for (const phase of PHASE_ORDER) {
    const activities = catalog.activities.filter((a) => a.phase === phase && activityApplies(a, ctx));
    if (activities.length === 0) continue;
    lines.push(`## ${phase}`);
    lines.push("");
    for (const a of activities) {
      lines.push(`### ${a.name} (\`${a.id}\`)`);
      lines.push(`- **Accountable:** ${a.raci.accountable}`);
      lines.push(`- **Expected completion:** ${a.expected_completion}`);
      lines.push(`- **Tracking:** ${a.tracking_method}`);
      lines.push("");
      lines.push(a.sop_body);
      lines.push("");
    }
  }

  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run scripts/ops-catalog/__tests__/views/runbook.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/ops-catalog/views/runbook.ts scripts/ops-catalog/__tests__/views/runbook.test.ts scripts/ops-catalog/__tests__/fixtures/inline-catalog.ts
git commit -m "feat(ops-catalog): runbook view generator"
```

---

### Task 19: Role manual view generator

**Files:**
- Create: `scripts/ops-catalog/views/role-manual.ts`
- Test: `scripts/ops-catalog/__tests__/views/role-manual.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { renderRoleManual, generateAllRoleManuals } from "../../views/role-manual";
import { validCatalog } from "../fixtures/inline-catalog";

describe("renderRoleManual", () => {
  it("includes activities where the role is accountable", () => {
    const md = renderRoleManual(validCatalog, "role.venue_manager");
    expect(md).toContain("# Venue Manager");
    expect(md).toContain("act.test"); // validCatalog has act.test accountable=venue_manager
  });

  it("excludes activities where the role is not involved", () => {
    const md = renderRoleManual(validCatalog, "role.director");
    expect(md).not.toContain("act.test"); // director is not in raci of act.test
  });
});

describe("generateAllRoleManuals", () => {
  it("returns one manual per worker role, excludes customer/system roles", () => {
    const manuals = generateAllRoleManuals(validCatalog);
    expect(Object.keys(manuals)).toContain("role.venue_manager");
    expect(Object.keys(manuals)).not.toContain("role.parent");
    expect(Object.keys(manuals)).not.toContain("role.platform");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run scripts/ops-catalog/__tests__/views/role-manual.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement role manual view**

```typescript
// scripts/ops-catalog/views/role-manual.ts
import type { Catalog } from "../loader";
import type { Activity } from "../types/activity";

const PHASE_ORDER = ["pre_day", "day_setup", "pre_game", "in_game", "post_game", "end_of_day", "post_day"] as const;

function activityInvolvesRole(a: Activity, roleId: string): boolean {
  return (
    a.raci.accountable === roleId ||
    a.raci.responsible.includes(roleId)
  );
}

export function renderRoleManual(catalog: Catalog, roleId: string): string {
  const role = catalog.roles.find((r) => r.id === roleId);
  if (!role) throw new Error(`Unknown role: ${roleId}`);

  const lines: string[] = [];
  lines.push(`# ${role.name}`);
  lines.push("");
  lines.push(role.description);
  lines.push("");

  const activities = catalog.activities.filter((a) => activityInvolvesRole(a, roleId));

  for (const phase of PHASE_ORDER) {
    const phaseActs = activities.filter((a) => a.phase === phase);
    if (phaseActs.length === 0) continue;
    lines.push(`## ${phase}`);
    lines.push("");
    for (const a of phaseActs) {
      const roleType = a.raci.accountable === roleId ? "**Accountable**" : "Responsible";
      lines.push(`### ${a.name} (\`${a.id}\`) — ${roleType}`);
      lines.push(`- Trigger: ${a.trigger}`);
      lines.push(`- Expected completion: ${a.expected_completion}`);
      lines.push(`- Tracking: ${a.tracking_method}`);
      lines.push(`- Escalation: ${a.escalation_path}`);
      lines.push("");
      lines.push(a.sop_body);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function generateAllRoleManuals(catalog: Catalog): Record<string, string> {
  const result: Record<string, string> = {};
  for (const role of catalog.roles) {
    if (role.kind !== "worker") continue; // exclude customer + system
    result[role.id] = renderRoleManual(catalog, role.id);
  }
  return result;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run scripts/ops-catalog/__tests__/views/role-manual.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/ops-catalog/views/role-manual.ts scripts/ops-catalog/__tests__/views/role-manual.test.ts
git commit -m "feat(ops-catalog): role manual view generator (worker roles only)"
```

---

### Task 20: Automation backlog view generator

**Files:**
- Create: `scripts/ops-catalog/views/automation-backlog.ts`
- Test: `scripts/ops-catalog/__tests__/views/automation-backlog.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { generateAutomationBacklog } from "../../views/automation-backlog";
import { validCatalog } from "../fixtures/inline-catalog";

describe("generateAutomationBacklog", () => {
  it("returns deduplicated features with referencing activities", () => {
    const backlog = generateAutomationBacklog(validCatalog);
    const featX = backlog.find((f) => f.id === "feat.x");
    expect(featX).toBeDefined();
    expect(featX!.referenced_by).toContain("act.test");
  });

  it("excludes manual-only activities from referencing", () => {
    const catalog = {
      ...validCatalog,
      activities: [{ ...validCatalog.activities[0], automation_status: "manual" as const, platform_features: [] }],
    };
    const backlog = generateAutomationBacklog(catalog);
    expect(backlog.every((f) => !f.referenced_by.includes("act.test"))).toBe(true);
  });

  it("sorts features by referencing-activity count descending", () => {
    const catalog: Catalog = {
      roles: validCatalog.roles,
      features: [
        { id: "feat.popular", name: "Popular", description: "x", priority: "P1", status: "stub" },
        { id: "feat.lonely", name: "Lonely", description: "x", priority: "P2", status: "stub" },
      ],
      artifacts: validCatalog.artifacts,
      activities: [
        { ...validCatalog.activities[0], id: "act.one", platform_features: ["feat.popular"] },
        { ...validCatalog.activities[0], id: "act.two", platform_features: ["feat.popular"] },
        { ...validCatalog.activities[0], id: "act.three", platform_features: ["feat.lonely"] },
      ],
    };
    const backlog = generateAutomationBacklog(catalog);
    expect(backlog[0].id).toBe("feat.popular");
    expect(backlog[1].id).toBe("feat.lonely");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run scripts/ops-catalog/__tests__/views/automation-backlog.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement automation backlog view**

```typescript
// scripts/ops-catalog/views/automation-backlog.ts
import type { Catalog } from "../loader";
import type { Feature } from "../types/feature";

export interface AutomationBacklogEntry extends Feature {
  referenced_by: string[]; // activity ids
}

export function generateAutomationBacklog(catalog: Catalog): AutomationBacklogEntry[] {
  const refMap = new Map<string, Set<string>>();
  for (const a of catalog.activities) {
    if (a.automation_status === "manual") continue;
    for (const fid of a.platform_features) {
      if (!refMap.has(fid)) refMap.set(fid, new Set());
      refMap.get(fid)!.add(a.id);
    }
  }
  const entries: AutomationBacklogEntry[] = catalog.features.map((f) => ({
    ...f,
    referenced_by: Array.from(refMap.get(f.id) ?? []).sort(),
  }));
  entries.sort((a, b) => b.referenced_by.length - a.referenced_by.length);
  return entries;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run scripts/ops-catalog/__tests__/views/automation-backlog.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/ops-catalog/views/automation-backlog.ts scripts/ops-catalog/__tests__/views/automation-backlog.test.ts
git commit -m "feat(ops-catalog): automation backlog view generator"
```

---

### Task 21: RACI matrix CSV (ad-hoc)

**Files:**
- Create: `scripts/ops-catalog/views/raci-matrix.ts`
- Test: `scripts/ops-catalog/__tests__/views/raci-matrix.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { renderRaciMatrix } from "../../views/raci-matrix";
import { validCatalog } from "../fixtures/inline-catalog";

describe("renderRaciMatrix", () => {
  it("renders CSV with header row of role ids", () => {
    const csv = renderRaciMatrix(validCatalog);
    const firstLine = csv.split("\n")[0];
    expect(firstLine).toContain("activity_id");
    expect(firstLine).toContain("role.venue_manager");
  });

  it("marks A in the accountable column for each activity", () => {
    const csv = renderRaciMatrix(validCatalog);
    const lines = csv.split("\n");
    const actRow = lines.find((l) => l.startsWith("act.test"));
    expect(actRow).toBeDefined();
    // accountable=role.venue_manager, so col for that role should be "A"
    expect(actRow).toMatch(/A/);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `npx vitest run scripts/ops-catalog/__tests__/views/raci-matrix.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement RACI matrix view**

```typescript
// scripts/ops-catalog/views/raci-matrix.ts
import type { Catalog } from "../loader";

export function renderRaciMatrix(catalog: Catalog): string {
  const roleIds = catalog.roles.map((r) => r.id).sort();
  const header = ["activity_id", "phase", ...roleIds].join(",");
  const rows: string[] = [header];

  for (const a of catalog.activities) {
    const cells = roleIds.map((rid) => {
      if (a.raci.accountable === rid) return "A";
      if (a.raci.responsible.includes(rid)) return "R";
      if (a.raci.consulted.includes(rid)) return "C";
      if (a.raci.informed.includes(rid)) return "I";
      return "";
    });
    rows.push([a.id, a.phase, ...cells].join(","));
  }

  return rows.join("\n");
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx vitest run scripts/ops-catalog/__tests__/views/raci-matrix.test.ts`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/ops-catalog/views/raci-matrix.ts scripts/ops-catalog/__tests__/views/raci-matrix.test.ts
git commit -m "feat(ops-catalog): RACI matrix CSV generator (ad-hoc view)"
```

---

### Task 22: Sport addendum view (ad-hoc)

**Files:**
- Create: `scripts/ops-catalog/views/sport-addendum.ts`
- Test: `scripts/ops-catalog/__tests__/views/sport-addendum.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { renderSportAddendum } from "../../views/sport-addendum";
import { validCatalog } from "../fixtures/inline-catalog";

describe("renderSportAddendum", () => {
  it("includes only activities tagged with the requested sport", () => {
    const sportSpecific = {
      ...validCatalog.activities[0],
      id: "act.flag_field_line_check",
      sport_tags: ["outdoor:flag_football"],
    };
    const catalog = { ...validCatalog, activities: [validCatalog.activities[0], sportSpecific] };
    const md = renderSportAddendum(catalog, "outdoor:flag_football");
    expect(md).toContain("act.flag_field_line_check");
    expect(md).not.toContain(validCatalog.activities[0].id); // doesn't have the sport tag
  });

  it("returns a 'no activities' note when nothing matches", () => {
    const md = renderSportAddendum(validCatalog, "indoor:pickleball");
    expect(md).toContain("No sport-specific activities");
  });
});
```

- [ ] **Step 2: Run, verify fail. Implement.**

```typescript
// scripts/ops-catalog/views/sport-addendum.ts
import type { Catalog } from "../loader";

export function renderSportAddendum(catalog: Catalog, sportTag: string): string {
  const activities = catalog.activities.filter((a) => a.sport_tags.includes(sportTag));
  const lines = [`# Sport addendum — ${sportTag}`, ""];
  if (activities.length === 0) {
    lines.push(`No sport-specific activities for ${sportTag}.`);
    return lines.join("\n");
  }
  for (const a of activities) {
    lines.push(`## ${a.name} (\`${a.id}\`)`);
    lines.push(`Phase: ${a.phase}`);
    lines.push(`Accountable: ${a.raci.accountable}`);
    lines.push("");
    lines.push(a.sop_body);
    lines.push("");
  }
  return lines.join("\n");
}
```

- [ ] **Step 3: Run tests, verify pass. Commit.**

```bash
npx vitest run scripts/ops-catalog/__tests__/views/sport-addendum.test.ts
git add scripts/ops-catalog/views/sport-addendum.ts scripts/ops-catalog/__tests__/views/sport-addendum.test.ts
git commit -m "feat(ops-catalog): sport addendum generator (ad-hoc view)"
```

---

## Phase D: Render pipeline + CI

### Task 23: Wire `render` command + emit primary artifacts

**Files:**
- Modify: `scripts/ops-catalog/index.ts`
- New (generated, committed): `docs/operations/artifacts/manuals/role.<id>.md` for each worker role
- New (generated, committed): `docs/operations/artifacts/automation-backlog.json`

- [ ] **Step 1: Update `index.ts` to wire render**

Replace the `render` stub:
```typescript
import { generateAllRoleManuals } from "./views/role-manual";
import { generateAutomationBacklog } from "./views/automation-backlog";
import { renderRunbook } from "./views/runbook";
import { renderRaciMatrix } from "./views/raci-matrix";
import { renderSportAddendum } from "./views/sport-addendum";
import { promises as fs } from "node:fs";

const ARTIFACTS_DIR = path.join(process.cwd(), "docs/operations/artifacts");

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

commands.render = async () => {
  const catalog = await loadCatalog(CATALOG_DIR);
  const v = validateCatalog(catalog);
  if (v.errors.length > 0) {
    for (const e of v.errors) console.error(`[error] ${e.source}: ${e.message}`);
    return 1;
  }

  const args = process.argv.slice(3);
  const view = args.find((a, i) => args[i - 1] === "--view");

  if (!view) {
    // primary pipeline
    const manuals = generateAllRoleManuals(catalog);
    await ensureDir(path.join(ARTIFACTS_DIR, "manuals"));
    for (const [roleId, md] of Object.entries(manuals)) {
      await fs.writeFile(path.join(ARTIFACTS_DIR, "manuals", `${roleId}.md`), md);
    }
    const backlog = generateAutomationBacklog(catalog);
    await fs.writeFile(path.join(ARTIFACTS_DIR, "automation-backlog.json"), JSON.stringify(backlog, null, 2));
    console.log(`Rendered ${Object.keys(manuals).length} role manuals + automation-backlog.json`);
    return 0;
  }

  // ad-hoc views
  if (view === "raci-matrix") {
    const csv = renderRaciMatrix(catalog);
    await ensureDir(ARTIFACTS_DIR);
    await fs.writeFile(path.join(ARTIFACTS_DIR, "raci-matrix.csv"), csv);
    console.log("Wrote raci-matrix.csv");
    return 0;
  }
  if (view === "sport-addendum") {
    const sport = args.find((a, i) => args[i - 1] === "--sport");
    if (!sport) {
      console.error("--sport required for sport-addendum");
      return 1;
    }
    const md = renderSportAddendum(catalog, sport);
    await ensureDir(path.join(ARTIFACTS_DIR, "addendums"));
    await fs.writeFile(path.join(ARTIFACTS_DIR, "addendums", `${sport.replace(":", "_")}.md`), md);
    console.log(`Wrote addendum for ${sport}`);
    return 0;
  }
  if (view === "runbook") {
    const venue = args.find((a, i) => args[i - 1] === "--venue") ?? "default";
    const date = args.find((a, i) => args[i - 1] === "--date") ?? new Date().toISOString().slice(0, 10);
    // For ad-hoc CLI use, default to permissive tag context — operator overrides via flags later.
    const md = renderRunbook(catalog, {
      venue_id: venue,
      event_date: date,
      sport_tags: [],
      venue_tags: [],
      format_tags: [],
      audience_tags: [],
    });
    await ensureDir(path.join(ARTIFACTS_DIR, "runbooks", venue));
    await fs.writeFile(path.join(ARTIFACTS_DIR, "runbooks", venue, `${date}.md`), md);
    console.log(`Wrote runbook for ${venue} on ${date}`);
    return 0;
  }

  console.error(`Unknown view: ${view}`);
  return 1;
};
```

- [ ] **Step 2: Run primary render**

Run: `npm run catalog:render`
Expected: writes 9 worker role manuals (director, venue_manager, event_lead, front_of_house, facilities, coach, team_captain, ref, photographer) + automation-backlog.json. Console shows count.

- [ ] **Step 3: Inspect output**

Inspect at least one role manual (`docs/operations/artifacts/manuals/role.venue_manager.md`) — confirm it contains activities organized by phase. Inspect `automation-backlog.json` — confirm it lists all 19 features with their referencing activities.

- [ ] **Step 4: Commit generated artifacts**

```bash
git add docs/operations/artifacts/ scripts/ops-catalog/index.ts
git commit -m "feat(ops-catalog): wire render pipeline; commit generated worker manuals + automation backlog"
```

---

### Task 24: CI validator gate

**Files:**
- Modify: `.github/workflows/ci.yml` (or whatever CI config lives at repo root)

- [ ] **Step 1: Find existing CI workflow**

Run: `ls .github/workflows/`
Pick the most-likely workflow (e.g., `ci.yml`, `tests.yml`, or `pr.yml`).

- [ ] **Step 2: Add validator step**

Insert into the appropriate job (after dependency install, parallel with or before existing test jobs):

```yaml
      - name: Validate ops catalog
        run: npm run catalog:validate
```

If there's no existing CI workflow, create `.github/workflows/ops-catalog.yml`:

```yaml
name: ops-catalog

on:
  pull_request:
    paths:
      - "docs/operations/catalog/**"
      - "scripts/ops-catalog/**"
  push:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run catalog:validate
      - run: npx vitest run scripts/ops-catalog/__tests__/
      - name: Verify generated artifacts up-to-date
        run: |
          npm run catalog:render
          if [[ -n "$(git status --porcelain docs/operations/artifacts/)" ]]; then
            echo "Generated artifacts are out of date. Run 'npm run catalog:render' and commit."
            git diff docs/operations/artifacts/
            exit 1
          fi
```

The "Verify generated artifacts up-to-date" step is the killer — it ensures every catalog change gets its rendered manuals committed so PRs surface downstream effects.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/
git commit -m "ci(ops-catalog): validate catalog + assert generated artifacts up-to-date on every PR"
```

---

### Task 25: Operations directory README

**Files:**
- Create: `docs/operations/README.md`

- [ ] **Step 1: Write the README**

```markdown
# Operations Catalog

This directory holds the source-of-truth operating model for Aspire Sports.

## Layout

- `catalog/` — source YAML files (the canonical operating model)
  - `roles/` — one file per role
  - `features/` — one file per platform feature stub
  - `artifacts/` — checklist / form / signature / event / counter templates
  - `activities/` — one file per game-day activity
- `artifacts/` — generated outputs (committed; PRs show downstream effects)
  - `manuals/role.<id>.md` — per-role manual chapters
  - `automation-backlog.json` — engineering input
  - `runbooks/<venue>/<date>.md` — generated on demand
  - `addendums/<sport>.md` — generated on demand
  - `raci-matrix.csv` — generated on demand

## Editing

1. Branch from `main`.
2. Edit YAML files in `catalog/`. One activity per file. See `docs/superpowers/specs/2026-05-06-game-day-operating-model-design.md` for the schema.
3. Run `npm run catalog:validate` to check schema, references, and smell flags.
4. Run `npm run catalog:render` to regenerate artifacts.
5. Commit catalog edits + regenerated artifacts in the same PR. CI will reject PRs where `artifacts/` is out of sync with `catalog/`.

## Catalog change migration

Every catalog-modifying PR description must include either:

- `migration: none — additive only` (when the change purely adds new activities/roles/features/artifacts), or
- A migration plan covering: which in-flight events are affected, whether they snapshot at the old catalog or upgrade, and any one-off operator notifications needed.

In-flight events default to snapshotting at the catalog version present at scheduling time.

## Ad-hoc views

```bash
npm run catalog:render -- --view raci-matrix
npm run catalog:render -- --view sport-addendum --sport outdoor:flag_football
npm run catalog:render -- --view runbook --venue worthington --date 2026-06-03
```

## Quarterly review

The Director walks the catalog quarterly:

- Activities not modified in 90+ days: still accurate?
- Activities with `accountable: role.director` outside `post_day`: should this be delegated yet?
- Features in `automation-backlog.json` that are still `stub` after a year: still relevant or drop?

## See also

- Design spec: `docs/superpowers/specs/2026-05-06-game-day-operating-model-design.md`
- CLI: `scripts/ops-catalog/`
```

- [ ] **Step 2: Commit**

```bash
git add docs/operations/README.md
git commit -m "docs(ops-catalog): operations directory README"
```

---

## Self-review checklist (post-execution)

After all 25 tasks are done, the executor should verify:

- [ ] `npm run catalog:validate` exits 0 with no errors
- [ ] `npm run catalog:render` produces 9 worker role manuals + automation-backlog.json
- [ ] CI passes on a fresh PR
- [ ] `git ls-files docs/operations/catalog/activities/ | wc -l` reports 60
- [ ] `git ls-files docs/operations/catalog/artifacts/ | wc -l` reports 54 (16 chk + 18 frm + 6 sig + 10 evt + 4 counter)
- [ ] `git ls-files docs/operations/catalog/roles/ | wc -l` reports 12
- [ ] `git ls-files docs/operations/catalog/features/ | wc -l` reports 19
- [ ] `automation-backlog.json` lists all 19 features sorted by reference count

## What's NOT in this plan (deferred to future plans)

- Activity tracking engine (per-event records, expected_completion compute, reminder dispatch, handoff): **Plan 2**
- Generic checklist / form / signature / counter UI components: **Plan 3**
- Per-feature implementations (cancellation broadcast, weather dashboard, score entry, standings engine, payroll integration, etc.): **Plans 4+**
- Full SOP body content (operator authoring): ongoing follow-up PRs
- Real artifact template content (operator authoring real checklist items, form fields): ongoing follow-up PRs
- Customer-facing handbooks (family handbook, player handbook): hand-authored, separate effort
- Full employee manual (catalog chapters + HR boilerplate + assembly script): later effort
