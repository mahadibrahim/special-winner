# Team Groups & Channel Routing — Part 1: Infrastructure & Compose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation for team-scoped Telegram group chats and a working coach/admin broadcast feature. At the end of this plan, a coach can compose a message from the admin UI that reaches every parent on their roster via the right channel (Telegram group for linked parents, email for non-linked, SMS for urgent/time-critical), and a nightly reconciliation cron keeps membership consistent.

**Architecture:** Extends existing messaging gateway (`src/lib/messaging/`) with a new group-aware layer. Event-driven group membership sync on roster changes, with a nightly reconciliation cron as self-healing safety net. Synchronous compose API — no outbox/job queue. All new tables use Drizzle ORM matching existing patterns. All tests are API integration tests matching the pattern in `tests/api/`.

**Tech Stack:** Astro 5, Drizzle ORM, PostgreSQL (Railway), Twilio, Resend, Telegram Bot API, Vitest, React 19 (for admin UI). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-18-team-groups-and-channel-routing-design.md`

**Out of scope for this plan (deferred to Part 2):**
- Registration wizard Telegram step
- Dashboard nudge banners for unlinked parents
- Email footer nudge links
- Leave/rejoin dashboard UI
- Adoption metrics dashboard

---

## File structure

### New schema files (Drizzle)
- `src/lib/db/schema/team-groups.ts` — `team_groups`, `team_group_memberships`
- `src/lib/db/schema/broadcasts.ts` — `broadcast_log`, `scheduled_broadcasts`
- `src/lib/db/schema/reconciliation-log.ts` — `reconciliation_log`

### Modified schema files
- `src/lib/db/schema/programs.ts` — add `audience_type` column
- `src/lib/db/schema/users.ts` — add `also_email_copy` column
- `src/lib/db/schema/conversations.ts` — add `team_group_id`, `broadcast_id`, `target_type` columns to `conversation_messages`
- `src/lib/db/schema/index.ts` — export the three new schema files

### New library modules
- `src/lib/telegram/group.ts` — Telegram group management primitives (create, archive, DM invite, remove member)
- `src/lib/messaging/routing-policy.ts` — declarative message-type → channel rules
- `src/lib/messaging/broadcast.ts` — compose orchestrator (resolves targets, applies policy, calls channel senders, writes log)
- `src/lib/messaging/group-lifecycle.ts` — group creation + archival logic
- `src/lib/messaging/team-group-sync.ts` — roster-change membership sync + reconciliation logic

### New API endpoints
- `src/pages/api/admin/broadcasts.ts` — POST (compose), GET (list sent broadcasts)
- `src/pages/api/cron/reconcile-team-groups.ts` — nightly reconciliation
- `src/pages/api/cron/archive-team-groups.ts` — season-end archival
- `src/pages/api/cron/create-scheduled-team-groups.ts` — creates groups 7 days before first event
- `src/pages/api/cron/process-scheduled-broadcasts.ts` — dispatches scheduled broadcasts (day-before reminders)

### Modified existing modules
- `src/lib/messaging/notifications.ts` — route automated event-change notifications through the new broadcast pipeline

### New UI
- `src/pages/admin/broadcasts.astro` — admin page (sent list + new-broadcast entry)
- `src/components/admin/broadcast-composer.tsx` — compose form with preview pane
- `src/components/admin/sent-announcements-list.tsx` — list of sent broadcasts

### New test files (API integration)
- `tests/api/admin/broadcasts.test.ts` — compose + list
- `tests/api/cron/reconcile-team-groups.test.ts`
- `tests/api/cron/archive-team-groups.test.ts`
- `tests/api/cron/create-scheduled-team-groups.test.ts`
- `tests/api/cron/process-scheduled-broadcasts.test.ts`
- `tests/api/admin/team-group-membership.test.ts` — event-handler-driven membership sync (exercised via roster-change API)

---

## Conventions used in this plan

- **Tests hit the running dev server at `localhost:4321`.** Start it before running tests: `npm run dev`.
- **Test helpers** are imported from `tests/api/setup/test-helpers.ts` — use `apiFetch`, `expectJson`, `getAdminCookie`, `getCoachCookie`, `resetCookies`, `testSlug`.
- **Telegram API calls** during tests must be mocked or dry-run. Introduce a `TELEGRAM_DRY_RUN=true` env var that short-circuits Telegram HTTP calls and returns synthetic `chat_id` values. Tests set this in their env.
- **All schema migrations** are generated via `npm run db:generate`, applied via `npm run db:push` in dev.
- **Run tests after every implementation step** with `npm run test:api -- <path-to-test-file>`.
- **Commit messages** follow the existing style (see `git log --oneline -10`): `feat:`, `fix:`, `chore:`, lowercase, concise.

---

## Task 1: Schema — team-groups.ts

**Files:**
- Create: `src/lib/db/schema/team-groups.ts`

- [ ] **Step 1: Create the schema file**

Write `src/lib/db/schema/team-groups.ts`:

```typescript
import { pgTable, uuid, varchar, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { organizations } from "./organizations"
import { programs } from "./programs"
import { teams } from "./teams"
import { users } from "./users"

export const teamGroups = pgTable(
  "team_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    telegramChatId: varchar("telegram_chat_id", { length: 100 }),
    audienceType: varchar("audience_type", { length: 20 }).notNull().default("parents"),
    name: varchar("name", { length: 128 }).notNull(),
    inviteLink: text("invite_link"),
    status: varchar("status", { length: 30 }).notNull().default("scheduled"),
    creationScheduledFor: timestamp("creation_scheduled_for", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => ({
    teamIdx: index("team_groups_team_id_idx").on(t.teamId),
    orgIdx: index("team_groups_org_id_idx").on(t.organizationId),
    statusIdx: index("team_groups_status_idx").on(t.status),
    telegramChatIdUnique: uniqueIndex("team_groups_telegram_chat_id_unique").on(t.telegramChatId),
  }),
)

export const teamGroupMemberships = pgTable(
  "team_group_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamGroupId: uuid("team_group_id")
      .notNull()
      .references(() => teamGroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull().default("parent"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    groupUserUnique: uniqueIndex("team_group_memberships_group_user_unique").on(t.teamGroupId, t.userId),
    groupIdx: index("team_group_memberships_group_idx").on(t.teamGroupId),
    userIdx: index("team_group_memberships_user_idx").on(t.userId),
  }),
)

export const teamGroupsRelations = relations(teamGroups, ({ one, many }) => ({
  team: one(teams, { fields: [teamGroups.teamId], references: [teams.id] }),
  program: one(programs, { fields: [teamGroups.programId], references: [programs.id] }),
  organization: one(organizations, {
    fields: [teamGroups.organizationId],
    references: [organizations.id],
  }),
  memberships: many(teamGroupMemberships),
}))

export const teamGroupMembershipsRelations = relations(teamGroupMemberships, ({ one }) => ({
  teamGroup: one(teamGroups, {
    fields: [teamGroupMemberships.teamGroupId],
    references: [teamGroups.id],
  }),
  user: one(users, { fields: [teamGroupMemberships.userId], references: [users.id] }),
}))

export type TeamGroup = typeof teamGroups.$inferSelect
export type NewTeamGroup = typeof teamGroups.$inferInsert
export type TeamGroupMembership = typeof teamGroupMemberships.$inferSelect
export type NewTeamGroupMembership = typeof teamGroupMemberships.$inferInsert
```

- [ ] **Step 2: Add export to schema index**

Open `src/lib/db/schema/index.ts` and add:

```typescript
export * from "./team-groups"
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema/team-groups.ts src/lib/db/schema/index.ts
git commit -m "feat: add team_groups and team_group_memberships schema"
```

---

## Task 2: Schema — broadcasts.ts

**Files:**
- Create: `src/lib/db/schema/broadcasts.ts`

- [ ] **Step 1: Create the schema file**

Write `src/lib/db/schema/broadcasts.ts`:

```typescript
import { pgTable, uuid, varchar, text, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { organizations } from "./organizations"
import { teams } from "./teams"
import { users } from "./users"

export const broadcastLog = pgTable(
  "broadcast_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    initiatorId: uuid("initiator_id").references(() => users.id, { onDelete: "set null" }),
    initiatorType: varchar("initiator_type", { length: 20 }).notNull(),
    targetType: varchar("target_type", { length: 30 }).notNull(),
    teamIds: jsonb("team_ids").$type<string[]>().notNull().default([]),
    messageType: varchar("message_type", { length: 50 }).notNull(),
    body: text("body").notNull(),
    isUrgent: boolean("is_urgent").notNull().default(false),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    channelsUsed: jsonb("channels_used").$type<Record<string, unknown>>().notNull().default({}),
    deliverySummary: jsonb("delivery_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    nonce: varchar("nonce", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("broadcast_log_org_idx").on(t.organizationId),
    initiatorIdx: index("broadcast_log_initiator_idx").on(t.initiatorId),
    nonceIdx: index("broadcast_log_nonce_idx").on(t.nonce),
    sentAtIdx: index("broadcast_log_sent_at_idx").on(t.sentAt),
  }),
)

export const scheduledBroadcasts = pgTable(
  "scheduled_broadcasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    initiatorId: uuid("initiator_id").references(() => users.id, { onDelete: "set null" }),
    messageType: varchar("message_type", { length: 50 }).notNull(),
    body: text("body").notNull(),
    isUrgent: boolean("is_urgent").notNull().default(false),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    cancelIf: jsonb("cancel_if").$type<Record<string, unknown>>().notNull().default({}),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    firedAt: timestamp("fired_at", { withTimezone: true }),
    resultingBroadcastId: uuid("resulting_broadcast_id").references(() => broadcastLog.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("scheduled_broadcasts_org_idx").on(t.organizationId),
    teamIdx: index("scheduled_broadcasts_team_idx").on(t.teamId),
    statusIdx: index("scheduled_broadcasts_status_idx").on(t.status),
    scheduledForIdx: index("scheduled_broadcasts_scheduled_for_idx").on(t.scheduledFor),
  }),
)

export const broadcastLogRelations = relations(broadcastLog, ({ one }) => ({
  organization: one(organizations, {
    fields: [broadcastLog.organizationId],
    references: [organizations.id],
  }),
  initiator: one(users, { fields: [broadcastLog.initiatorId], references: [users.id] }),
}))

export const scheduledBroadcastsRelations = relations(scheduledBroadcasts, ({ one }) => ({
  organization: one(organizations, {
    fields: [scheduledBroadcasts.organizationId],
    references: [organizations.id],
  }),
  team: one(teams, { fields: [scheduledBroadcasts.teamId], references: [teams.id] }),
  initiator: one(users, { fields: [scheduledBroadcasts.initiatorId], references: [users.id] }),
  resultingBroadcast: one(broadcastLog, {
    fields: [scheduledBroadcasts.resultingBroadcastId],
    references: [broadcastLog.id],
  }),
}))

export type BroadcastLog = typeof broadcastLog.$inferSelect
export type NewBroadcastLog = typeof broadcastLog.$inferInsert
export type ScheduledBroadcast = typeof scheduledBroadcasts.$inferSelect
export type NewScheduledBroadcast = typeof scheduledBroadcasts.$inferInsert
```

- [ ] **Step 2: Add export to schema index**

Open `src/lib/db/schema/index.ts`, add:

```typescript
export * from "./broadcasts"
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema/broadcasts.ts src/lib/db/schema/index.ts
git commit -m "feat: add broadcast_log and scheduled_broadcasts schema"
```

---

## Task 3: Schema — reconciliation-log.ts

**Files:**
- Create: `src/lib/db/schema/reconciliation-log.ts`

- [ ] **Step 1: Create the schema file**

Write `src/lib/db/schema/reconciliation-log.ts`:

```typescript
import { pgTable, uuid, timestamp, jsonb, index } from "drizzle-orm/pg-core"
import { relations } from "drizzle-orm"
import { teamGroups } from "./team-groups"

export const reconciliationLog = pgTable(
  "reconciliation_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull().defaultNow(),
    teamGroupId: uuid("team_group_id")
      .notNull()
      .references(() => teamGroups.id, { onDelete: "cascade" }),
    driftDetected: jsonb("drift_detected")
      .$type<{ added: string[]; removed: string[] }>()
      .notNull()
      .default({ added: [], removed: [] }),
    fixesApplied: jsonb("fixes_applied")
      .$type<{ invited: string[]; removed: string[] }>()
      .notNull()
      .default({ invited: [], removed: [] }),
    errors: jsonb("errors").$type<Record<string, unknown>[]>().notNull().default([]),
  },
  (t) => ({
    teamGroupIdx: index("reconciliation_log_team_group_idx").on(t.teamGroupId),
    ranAtIdx: index("reconciliation_log_ran_at_idx").on(t.ranAt),
  }),
)

export const reconciliationLogRelations = relations(reconciliationLog, ({ one }) => ({
  teamGroup: one(teamGroups, {
    fields: [reconciliationLog.teamGroupId],
    references: [teamGroups.id],
  }),
}))

export type ReconciliationLog = typeof reconciliationLog.$inferSelect
export type NewReconciliationLog = typeof reconciliationLog.$inferInsert
```

- [ ] **Step 2: Add export to schema index**

Open `src/lib/db/schema/index.ts`, add:

```typescript
export * from "./reconciliation-log"
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema/reconciliation-log.ts src/lib/db/schema/index.ts
git commit -m "feat: add reconciliation_log schema"
```

---

## Task 4: Schema extensions — programs, users, conversation_messages

**Files:**
- Modify: `src/lib/db/schema/programs.ts`
- Modify: `src/lib/db/schema/users.ts`
- Modify: `src/lib/db/schema/conversations.ts`

- [ ] **Step 1: Extend `programs` with `audience_type`**

Open `src/lib/db/schema/programs.ts` and add to the `programs` pgTable definition, alongside existing columns:

```typescript
audienceType: varchar("audience_type", { length: 20 }).notNull().default("parents"),
```

- [ ] **Step 2: Extend `users` with `also_email_copy`**

Open `src/lib/db/schema/users.ts` and add to the `users` pgTable definition:

```typescript
alsoEmailCopy: boolean("also_email_copy").notNull().default(false),
```

Make sure `boolean` is imported at top: if not already imported, add to the `drizzle-orm/pg-core` import line.

- [ ] **Step 3: Extend `conversation_messages`**

Open `src/lib/db/schema/conversations.ts`. Locate the `conversationMessages` pgTable definition. Add:

```typescript
teamGroupId: uuid("team_group_id"),
broadcastId: uuid("broadcast_id"),
targetType: varchar("target_type", { length: 20 }).notNull().default("user"),
```

**Important:** Do NOT add a `.references(...)` on `teamGroupId` or `broadcastId` here, because it would create a circular import. The foreign keys are instead enforced at the database level via a raw migration addition in Task 5. Add a comment:

```typescript
// teamGroupId / broadcastId FKs are added in the migration directly
// to avoid circular imports from team-groups.ts / broadcasts.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema/programs.ts src/lib/db/schema/users.ts src/lib/db/schema/conversations.ts
git commit -m "feat: schema extensions for audience_type, also_email_copy, broadcast linkage"
```

---

## Task 5: Generate and apply migration

**Files:**
- Create (auto): `drizzle/*_team_groups_infrastructure.sql` (Drizzle generates the name)

- [ ] **Step 1: Generate the migration**

Run:

```bash
npm run db:generate
```

Expected: a new `.sql` file appears in `drizzle/` with CREATE TABLE statements for `team_groups`, `team_group_memberships`, `broadcast_log`, `scheduled_broadcasts`, `reconciliation_log`, and ALTER TABLE statements for the three extended tables.

- [ ] **Step 2: Add manual FK constraints to the migration**

Open the generated `.sql` file. Append at the end:

```sql
-- Manually added FKs (schema defined without .references() to avoid circular imports)
ALTER TABLE "conversation_messages"
  ADD CONSTRAINT "conversation_messages_team_group_id_fk"
  FOREIGN KEY ("team_group_id") REFERENCES "team_groups"("id") ON DELETE SET NULL;

ALTER TABLE "conversation_messages"
  ADD CONSTRAINT "conversation_messages_broadcast_id_fk"
  FOREIGN KEY ("broadcast_id") REFERENCES "broadcast_log"("id") ON DELETE SET NULL;
```

- [ ] **Step 3: Apply the migration**

Run:

```bash
npm run db:push
```

Expected: `Changes applied.` No errors. Confirm by running `npm run db:studio` and visually confirming the new tables exist. (Close Studio after checking.)

- [ ] **Step 4: Commit**

```bash
git add drizzle/
git commit -m "feat: migration for team groups, broadcasts, reconciliation tables"
```

---

## Task 6: Telegram group management module

**Files:**
- Create: `src/lib/telegram/group.ts`

- [ ] **Step 1: Read existing telegram client pattern**

Read `src/lib/telegram/client.ts` to understand the existing bot client pattern — how it exports a configured instance, how `TELEGRAM_BOT_TOKEN` is read, and how HTTP calls are made. Your new module will reuse this client.

- [ ] **Step 2: Create the group module**

Write `src/lib/telegram/group.ts`:

```typescript
import { telegramClient } from "./client"

const DRY_RUN = process.env.TELEGRAM_DRY_RUN === "true"

export type CreateGroupInput = {
  name: string
  description?: string
}

export type CreateGroupResult = {
  chatId: string
  inviteLink: string
}

/**
 * Create a new Telegram Supergroup. Bot must be configured with createChatInviteLink scope.
 * In DRY_RUN mode, returns synthetic IDs for testing.
 */
export async function createSupergroup(input: CreateGroupInput): Promise<CreateGroupResult> {
  if (DRY_RUN) {
    const synthetic = `-100${Date.now()}`
    return { chatId: synthetic, inviteLink: `https://t.me/+dryrun-${synthetic}` }
  }

  // Telegram bot API does not support creating groups directly. The flow is:
  //   1. Admin creates the group in Telegram client and adds the bot
  //   2. Bot receives a getUpdates event with new_chat_members including itself
  //   3. Bot sets the title via setChatTitle and generates invite link via createChatInviteLink
  //
  // For MVP, we use the "create via import bot" pattern: the bot is pre-added
  // to an org-level "template" supergroup that is cloned per team. This is a
  // documented Telegram limitation.
  //
  // For now: this function requires the caller to pre-create the group and pass
  // the chatId. We adapt the signature to reflect reality.

  throw new Error(
    "Telegram bots cannot create groups directly. A pre-created group chatId must be supplied. See docs for workaround.",
  )
}

/**
 * Set the group title. Used during lifecycle setup.
 */
export async function setGroupTitle(chatId: string, title: string): Promise<void> {
  if (DRY_RUN) return
  await telegramClient.post("setChatTitle", { chat_id: chatId, title })
}

/**
 * Set the group description.
 */
export async function setGroupDescription(chatId: string, description: string): Promise<void> {
  if (DRY_RUN) return
  await telegramClient.post("setChatDescription", { chat_id: chatId, description })
}

/**
 * Create a permanent invite link for the group.
 */
export async function createPermanentInviteLink(chatId: string): Promise<string> {
  if (DRY_RUN) return `https://t.me/+dryrun-${chatId}`
  const response = await telegramClient.post("createChatInviteLink", {
    chat_id: chatId,
    creates_join_request: false,
    name: "Aspire permanent",
  })
  return response.result.invite_link
}

/**
 * Send an invite DM to a parent with a join link.
 */
export async function sendInviteDM(
  parentChatId: string,
  groupName: string,
  inviteLink: string,
): Promise<void> {
  if (DRY_RUN) return
  await telegramClient.post("sendMessage", {
    chat_id: parentChatId,
    text: `Your ${groupName} team group is live. Tap to join: ${inviteLink}`,
    disable_web_page_preview: false,
  })
}

/**
 * Remove a member from the group. Used when their kid is removed from the roster
 * or they opt out.
 */
export async function removeMember(groupChatId: string, userChatId: string): Promise<void> {
  if (DRY_RUN) return
  await telegramClient.post("banChatMember", {
    chat_id: groupChatId,
    user_id: userChatId,
    until_date: Math.floor(Date.now() / 1000) + 30, // unban after 30s (kicks without permanent ban)
  })
}

/**
 * Post a message in the group.
 */
export async function postToGroup(groupChatId: string, text: string): Promise<{ messageId: number }> {
  if (DRY_RUN) return { messageId: 0 }
  const response = await telegramClient.post("sendMessage", {
    chat_id: groupChatId,
    text,
    parse_mode: "HTML",
  })
  return { messageId: response.result.message_id }
}

/**
 * Bot leaves the group (for archival).
 */
export async function botLeaveGroup(groupChatId: string): Promise<void> {
  if (DRY_RUN) return
  await telegramClient.post("leaveChat", { chat_id: groupChatId })
}

/**
 * List current group members. Telegram only returns admins via getChatAdministrators;
 * for full member list we rely on getChatMembersCount + our own memberships table.
 * This function returns the count for sanity checks.
 */
export async function getGroupMemberCount(groupChatId: string): Promise<number> {
  if (DRY_RUN) return 0
  const response = await telegramClient.post("getChatMembersCount", { chat_id: groupChatId })
  return response.result
}

/**
 * Check whether a specific user is a member of the group.
 */
export async function isUserInGroup(groupChatId: string, userChatId: string): Promise<boolean> {
  if (DRY_RUN) return false
  try {
    const response = await telegramClient.post("getChatMember", {
      chat_id: groupChatId,
      user_id: userChatId,
    })
    const status = response.result.status
    return status === "member" || status === "administrator" || status === "creator"
  } catch {
    return false
  }
}
```

**Note on Telegram limitation:** The Bot API does not support programmatic group creation. The actual MVP workflow is documented in Task 8 — admin sets up a single "template" supergroup with Ace pre-added, and Ace clones/renames per team. `createSupergroup` as written throws; Task 8 handles the real lifecycle.

- [ ] **Step 3: Commit**

```bash
git add src/lib/telegram/group.ts
git commit -m "feat: telegram group management primitives"
```

---

## Task 7: Routing policy module

**Files:**
- Create: `src/lib/messaging/routing-policy.ts`

- [ ] **Step 1: Create the module**

Write `src/lib/messaging/routing-policy.ts`:

```typescript
export type MessageType =
  | "team_broadcast_general"
  | "event_change"
  | "coach_urgent_override"
  | "payment_receipt"
  | "payment_failed"
  | "refund_issued"
  | "registration_confirmation"
  | "password_reset"
  | "phone_verification"
  | "security_alert"
  | "marketing"
  | "day_before_reminder"
  | "event_cancellation"

export type ChannelRoute = {
  telegramGroup: boolean
  telegramDM: boolean
  sms: "all_recipients" | "unlinked_only" | "none"
  email: "all_recipients" | "unlinked_only" | "none"
}

export type RoutingContext = {
  messageType: MessageType
  hoursUntilEvent?: number // for event_change — triggers SMS when ≤24
  isUrgent?: boolean // manual override
}

/**
 * Resolve a routing decision for a given message type + context.
 * Returns the channels that should be used.
 */
export function resolveRouting(ctx: RoutingContext): ChannelRoute {
  const { messageType, hoursUntilEvent, isUrgent } = ctx

  // Urgent override always fans SMS to all, regardless of message type
  if (isUrgent) {
    return {
      telegramGroup: true,
      telegramDM: false,
      sms: "all_recipients",
      email: "unlinked_only",
    }
  }

  switch (messageType) {
    case "team_broadcast_general":
      return {
        telegramGroup: true,
        telegramDM: false,
        sms: "none",
        email: "unlinked_only",
      }

    case "event_change":
    case "event_cancellation":
      if (hoursUntilEvent !== undefined && hoursUntilEvent <= 24) {
        return {
          telegramGroup: true,
          telegramDM: false,
          sms: "all_recipients",
          email: "unlinked_only",
        }
      }
      return {
        telegramGroup: true,
        telegramDM: false,
        sms: "none",
        email: "unlinked_only",
      }

    case "coach_urgent_override":
      return {
        telegramGroup: true,
        telegramDM: false,
        sms: "all_recipients",
        email: "unlinked_only",
      }

    case "day_before_reminder":
      return {
        telegramGroup: true,
        telegramDM: false,
        sms: "none",
        email: "unlinked_only",
      }

    case "payment_receipt":
    case "refund_issued":
    case "registration_confirmation":
      return {
        telegramGroup: false,
        telegramDM: true,
        sms: "none",
        email: "all_recipients",
      }

    case "payment_failed":
      return {
        telegramGroup: false,
        telegramDM: true,
        sms: "all_recipients",
        email: "all_recipients",
      }

    case "password_reset":
      return {
        telegramGroup: false,
        telegramDM: false,
        sms: "all_recipients",
        email: "all_recipients",
      }

    case "phone_verification":
      return {
        telegramGroup: false,
        telegramDM: false,
        sms: "all_recipients",
        email: "none",
      }

    case "security_alert":
      return {
        telegramGroup: false,
        telegramDM: false,
        sms: "all_recipients",
        email: "all_recipients",
      }

    case "marketing":
      return {
        telegramGroup: false,
        telegramDM: true,
        sms: "none",
        email: "none", // opt-in only, handled separately
      }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/messaging/routing-policy.ts
git commit -m "feat: declarative routing policy per message type"
```

---

## Task 8: Group lifecycle module

**Files:**
- Create: `src/lib/messaging/group-lifecycle.ts`

- [ ] **Step 1: Create the lifecycle module**

Write `src/lib/messaging/group-lifecycle.ts`:

```typescript
import { db } from "../db/client"
import { teamGroups, teamGroupMemberships } from "../db/schema"
import { teams, programs, organizations, familyMemberParents, familyMembers, registrations, users } from "../db/schema"
import { and, eq, lte, isNull, sql, inArray } from "drizzle-orm"
import { botLeaveGroup, postToGroup, sendInviteDM, createPermanentInviteLink, setGroupTitle, setGroupDescription } from "../telegram/group"

type ScheduleCreationInput = {
  teamId: string
  firstEventAt: Date | null
}

/**
 * Called when a roster changes: ensure a team_groups row exists in 'scheduled' state,
 * with creation_scheduled_for set to 7 days before the team's first event (or now
 * if the first event is <7d away). If no first event is known yet, leave
 * creation_scheduled_for null — will be set when an event is added to the schedule.
 */
export async function scheduleGroupCreation(input: ScheduleCreationInput): Promise<void> {
  const { teamId, firstEventAt } = input

  // Fetch the team + program for naming
  const team = await db.query.teams.findFirst({
    where: eq(teams.id, teamId),
    with: { program: { with: { sport: true } }, organization: true, season: true },
  })
  if (!team) throw new Error(`Team ${teamId} not found`)

  // Compose the group name
  const sportName = team.program.sport?.displayName ?? team.program.name
  const audience = team.program.audienceType === "players" ? "Players" : "Parents"
  const seasonName = team.season?.name ?? "Current Season"
  const name = `${team.organization.shortName} ${sportName} ${team.name} — ${seasonName} ${audience}`.slice(0, 128)

  // Compute creation_scheduled_for: 7 days before firstEventAt, or now if <7d, or null
  let creationScheduledFor: Date | null = null
  if (firstEventAt) {
    const sevenDaysBefore = new Date(firstEventAt.getTime() - 7 * 24 * 60 * 60 * 1000)
    creationScheduledFor = sevenDaysBefore <= new Date() ? new Date() : sevenDaysBefore
  }

  // Upsert: create if missing, update creation_scheduled_for if present and still 'scheduled'
  const existing = await db.query.teamGroups.findFirst({
    where: and(eq(teamGroups.teamId, teamId), eq(teamGroups.status, "scheduled")),
  })

  if (!existing) {
    await db.insert(teamGroups).values({
      teamId,
      programId: team.programId,
      organizationId: team.organizationId,
      audienceType: team.program.audienceType,
      name,
      status: "scheduled",
      creationScheduledFor,
    })
  } else if (creationScheduledFor && (!existing.creationScheduledFor || existing.creationScheduledFor > creationScheduledFor)) {
    // Only move the scheduled date earlier, never later
    await db
      .update(teamGroups)
      .set({ creationScheduledFor })
      .where(eq(teamGroups.id, existing.id))
  }
}

/**
 * Dispatch group creation for all 'scheduled' team_groups whose creation_scheduled_for
 * has arrived. Called by the create-scheduled-team-groups cron.
 *
 * MVP WORKFLOW NOTE: The Telegram Bot API does not allow a bot to create groups
 * programmatically. For MVP, a human org admin creates a template supergroup with
 * Ace pre-added, and we clone/rename it per team. For now, this function assumes
 * the admin has supplied a template_chat_id via organization setting, and marks
 * the team_group as 'pending_manual_creation' with a notification to the admin.
 *
 * When the admin manually creates the real team group and pastes the chatId into
 * the admin UI (future Part 2 task), the team_group is promoted to 'active' and
 * invites are sent.
 */
export async function processScheduledGroupCreations(): Promise<number> {
  const due = await db
    .select()
    .from(teamGroups)
    .where(
      and(
        eq(teamGroups.status, "scheduled"),
        lte(teamGroups.creationScheduledFor, new Date()),
      ),
    )

  let promoted = 0
  for (const group of due) {
    // For MVP: mark as pending_manual_creation. Real Telegram API limits preclude
    // automated creation; admin UI will let an org admin paste the chatId to promote.
    await db
      .update(teamGroups)
      .set({ status: "pending_manual_creation" })
      .where(eq(teamGroups.id, group.id))
    promoted++
  }

  return promoted
}

/**
 * Promote a team_group from 'pending_manual_creation' to 'active' once an admin
 * supplies the real Telegram chatId. Sets the title, description, invite link,
 * and invites all expected members.
 */
export async function promoteGroupToActive(
  teamGroupId: string,
  telegramChatId: string,
): Promise<void> {
  const group = await db.query.teamGroups.findFirst({ where: eq(teamGroups.id, teamGroupId) })
  if (!group) throw new Error(`Team group ${teamGroupId} not found`)

  // Set title + description on Telegram
  await setGroupTitle(telegramChatId, group.name)
  await setGroupDescription(
    telegramChatId,
    `${group.name}\nManaged by Ace. Parents chat here; coach posts via Aspire.`,
  )
  const inviteLink = await createPermanentInviteLink(telegramChatId)

  // Update DB
  await db
    .update(teamGroups)
    .set({
      telegramChatId,
      inviteLink,
      status: "active",
      createdAt: new Date(),
    })
    .where(eq(teamGroups.id, teamGroupId))

  // Invite all expected members (implemented in team-group-sync.ts, Task 9)
  const { syncTeamGroupMembership } = await import("./team-group-sync")
  await syncTeamGroupMembership(teamGroupId)
}

/**
 * Archive a team group: post farewell, bot leaves, mark archived.
 */
export async function archiveTeamGroup(teamGroupId: string): Promise<void> {
  const group = await db.query.teamGroups.findFirst({ where: eq(teamGroups.id, teamGroupId) })
  if (!group || !group.telegramChatId) return
  if (group.status === "archived") return

  try {
    await postToGroup(
      group.telegramChatId,
      `Season wrapped — thanks for a great season. This group is now archived. Message history remains; Ace will no longer post here.`,
    )
    await botLeaveGroup(group.telegramChatId)
  } catch (err) {
    // Log but still mark archived — better to release the record than be stuck
    console.warn(`Archive ${teamGroupId}: telegram calls failed, marking archived anyway`, err)
  }

  await db
    .update(teamGroups)
    .set({ status: "archived", archivedAt: new Date() })
    .where(eq(teamGroups.id, teamGroupId))
}

/**
 * Find groups whose season has ended and archive them.
 * Called by archive-team-groups cron.
 */
export async function processSeasonEndArchivals(): Promise<number> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  // A group is eligible for archival if its season ended >= 7 days ago
  // We join to seasons via the team's programId / seasonId
  const eligible = await db
    .select({ id: teamGroups.id })
    .from(teamGroups)
    .innerJoin(teams, eq(teamGroups.teamId, teams.id))
    .innerJoin(sql`seasons`, sql`teams.season_id = seasons.id`)
    .where(
      and(
        eq(teamGroups.status, "active"),
        lte(sql`seasons.end_date`, sevenDaysAgo),
      ),
    )

  for (const group of eligible) {
    await archiveTeamGroup(group.id)
  }

  return eligible.length
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/messaging/group-lifecycle.ts
git commit -m "feat: team group lifecycle (schedule, promote, archive)"
```

---

## Task 9: Team group membership sync module

**Files:**
- Create: `src/lib/messaging/team-group-sync.ts`

- [ ] **Step 1: Create the sync module**

Write `src/lib/messaging/team-group-sync.ts`:

```typescript
import { db } from "../db/client"
import {
  teamGroups,
  teamGroupMemberships,
  familyMembers,
  familyMemberParents,
  registrations,
  users,
  reconciliationLog,
} from "../db/schema"
import { and, eq, inArray, isNull, isNotNull, sql } from "drizzle-orm"
import { sendInviteDM, removeMember, isUserInGroup } from "../telegram/group"

/**
 * Compute the set of userIds who should be in a team group based on:
 * - kids registered on the team
 * - family_member_parents links where canReceiveMessages = true
 * - not opted out
 * - has linked Telegram
 */
export async function computeExpectedMembership(teamGroupId: string): Promise<string[]> {
  const group = await db.query.teamGroups.findFirst({
    where: eq(teamGroups.id, teamGroupId),
  })
  if (!group) return []

  // Query parents of kids on this team's roster
  // registrations → familyMember (kid) → familyMemberParents → users (parent)
  const rows = await db
    .select({ userId: users.id })
    .from(registrations)
    .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
    .innerJoin(familyMemberParents, eq(familyMemberParents.familyMemberId, familyMembers.id))
    .innerJoin(users, eq(familyMemberParents.parentUserId, users.id))
    .where(
      and(
        eq(registrations.teamId, group.teamId),
        eq(familyMemberParents.canReceiveMessages, true),
        isNotNull(users.telegramChatId),
      ),
    )

  return [...new Set(rows.map((r) => r.userId))]
}

/**
 * Sync a team group's membership: ensure expected members are invited/present,
 * opted-out or removed members are removed.
 */
export async function syncTeamGroupMembership(teamGroupId: string): Promise<{
  invited: string[]
  removed: string[]
  errors: Array<{ userId: string; error: string }>
}> {
  const group = await db.query.teamGroups.findFirst({
    where: eq(teamGroups.id, teamGroupId),
  })
  if (!group || group.status !== "active" || !group.telegramChatId) {
    return { invited: [], removed: [], errors: [] }
  }

  const expectedUserIds = await computeExpectedMembership(teamGroupId)

  // Existing memberships in DB
  const existing = await db
    .select()
    .from(teamGroupMemberships)
    .where(eq(teamGroupMemberships.teamGroupId, teamGroupId))

  const existingByUserId = new Map(existing.map((m) => [m.userId, m]))
  const errors: Array<{ userId: string; error: string }> = []
  const invited: string[] = []
  const removed: string[] = []

  // Invite missing members
  for (const userId of expectedUserIds) {
    const membership = existingByUserId.get(userId)
    if (membership?.optedOutAt) continue // honor opt-out
    if (membership?.joinedAt) continue // already joined

    try {
      const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
      if (!user?.telegramChatId) continue
      await sendInviteDM(user.telegramChatId, group.name, group.inviteLink ?? "")
      if (!membership) {
        await db.insert(teamGroupMemberships).values({
          teamGroupId,
          userId,
          role: group.audienceType === "players" ? "player" : "parent",
          lastSyncedAt: new Date(),
        })
      } else {
        await db
          .update(teamGroupMemberships)
          .set({ lastSyncedAt: new Date(), removedAt: null })
          .where(eq(teamGroupMemberships.id, membership.id))
      }
      invited.push(userId)
    } catch (err) {
      errors.push({ userId, error: String(err) })
    }
  }

  // Remove unexpected members (user removed from roster, account deactivated)
  const expectedSet = new Set(expectedUserIds)
  for (const membership of existing) {
    if (expectedSet.has(membership.userId)) continue
    if (membership.removedAt) continue

    try {
      const user = await db.query.users.findFirst({ where: eq(users.id, membership.userId) })
      if (user?.telegramChatId && group.telegramChatId) {
        await removeMember(group.telegramChatId, user.telegramChatId)
      }
      await db
        .update(teamGroupMemberships)
        .set({ removedAt: new Date(), lastSyncedAt: new Date() })
        .where(eq(teamGroupMemberships.id, membership.id))
      removed.push(membership.userId)
    } catch (err) {
      errors.push({ userId: membership.userId, error: String(err) })
    }
  }

  return { invited, removed, errors }
}

/**
 * Reconciliation: run sync for every active team group, write results to reconciliation_log.
 */
export async function reconcileAllActiveGroups(): Promise<{
  groupsProcessed: number
  totalInvited: number
  totalRemoved: number
  totalErrors: number
}> {
  const active = await db
    .select({ id: teamGroups.id })
    .from(teamGroups)
    .where(eq(teamGroups.status, "active"))

  let totalInvited = 0
  let totalRemoved = 0
  let totalErrors = 0

  for (const group of active) {
    const result = await syncTeamGroupMembership(group.id)
    await db.insert(reconciliationLog).values({
      teamGroupId: group.id,
      driftDetected: { added: result.invited, removed: result.removed },
      fixesApplied: { invited: result.invited, removed: result.removed },
      errors: result.errors as unknown as Record<string, unknown>[],
    })
    totalInvited += result.invited.length
    totalRemoved += result.removed.length
    totalErrors += result.errors.length
  }

  return {
    groupsProcessed: active.length,
    totalInvited,
    totalRemoved,
    totalErrors,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/messaging/team-group-sync.ts
git commit -m "feat: team group membership sync + reconciliation logic"
```

---

## Task 10: Broadcast send orchestrator

**Files:**
- Create: `src/lib/messaging/broadcast.ts`

- [ ] **Step 1: Create the broadcast module**

Write `src/lib/messaging/broadcast.ts`:

```typescript
import { db } from "../db/client"
import {
  teamGroups,
  broadcastLog,
  conversationMessages,
  teams,
  registrations,
  familyMembers,
  familyMemberParents,
  users,
} from "../db/schema"
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm"
import { resolveRouting, type MessageType } from "./routing-policy"
import { postToGroup } from "../telegram/group"
import { sendEmail } from "../email/send"
import { sendSMS } from "../sms/send"

export type ComposeBroadcastInput = {
  organizationId: string
  initiatorId: string | null
  initiatorType: "coach" | "admin" | "system"
  targetType: "team_group" | "multi_team" | "org_dm"
  teamIds: string[] // one element for single-team, many for multi, ignored for org_dm
  messageType: MessageType
  body: string
  isUrgent?: boolean
  hoursUntilEvent?: number
  nonce?: string // idempotency
}

export type BroadcastResult = {
  broadcastId: string
  deduplicated: boolean
  telegramGroupPosts: number
  smsSent: number
  emailSent: number
  errors: string[]
}

/**
 * Main broadcast entry point. Resolves routing, performs sends, writes log.
 * Synchronous — returns after all send attempts complete.
 */
export async function composeBroadcast(input: ComposeBroadcastInput): Promise<BroadcastResult> {
  // Idempotency: check nonce
  if (input.nonce) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const existing = await db.query.broadcastLog.findFirst({
      where: and(
        eq(broadcastLog.nonce, input.nonce),
        eq(broadcastLog.organizationId, input.organizationId),
      ),
    })
    if (existing && existing.createdAt > fiveMinutesAgo) {
      return {
        broadcastId: existing.id,
        deduplicated: true,
        telegramGroupPosts: 0,
        smsSent: 0,
        emailSent: 0,
        errors: [],
      }
    }
  }

  // Resolve routing
  const route = resolveRouting({
    messageType: input.messageType,
    hoursUntilEvent: input.hoursUntilEvent,
    isUrgent: input.isUrgent,
  })

  // Create log row up front (in case of crash, we have the intent)
  const [logRow] = await db
    .insert(broadcastLog)
    .values({
      organizationId: input.organizationId,
      initiatorId: input.initiatorId,
      initiatorType: input.initiatorType,
      targetType: input.targetType,
      teamIds: input.teamIds,
      messageType: input.messageType,
      body: input.body,
      isUrgent: input.isUrgent ?? false,
      nonce: input.nonce,
      channelsUsed: route,
      deliverySummary: {},
    })
    .returning()

  const errors: string[] = []
  let telegramGroupPosts = 0
  let smsSent = 0
  let emailSent = 0

  // Resolve all recipients (users)
  const recipients = await resolveRecipients(input)

  // Build message body with attribution prefix
  const displayBody = buildDisplayBody(input, recipients.initiatorFirstName)

  // Telegram group posts
  if (route.telegramGroup && input.targetType !== "org_dm") {
    for (const teamId of input.teamIds) {
      const group = await db.query.teamGroups.findFirst({
        where: and(eq(teamGroups.teamId, teamId), eq(teamGroups.status, "active")),
      })
      if (!group?.telegramChatId) {
        errors.push(`No active group for team ${teamId}`)
        continue
      }
      try {
        const result = await postToGroup(group.telegramChatId, displayBody)
        await db.insert(conversationMessages).values({
          organizationId: input.organizationId,
          teamGroupId: group.id,
          broadcastId: logRow.id,
          targetType: "team_group",
          channel: "telegram",
          direction: "outbound",
          body: displayBody,
          externalMessageId: String(result.messageId),
          deliveryStatus: "sent",
          sentAt: new Date(),
        })
        telegramGroupPosts++
      } catch (err) {
        errors.push(`Telegram post to team ${teamId}: ${err}`)
      }
    }
  }

  // Per-user fan-out (SMS and email)
  for (const recipient of recipients.users) {
    const sendSms =
      route.sms === "all_recipients" ||
      (route.sms === "unlinked_only" && !recipient.hasTelegram)
    const sendEmailThis =
      route.email === "all_recipients" ||
      (route.email === "unlinked_only" && !recipient.hasTelegram) ||
      (route.email === "unlinked_only" && recipient.alsoEmailCopy)

    if (sendSms && recipient.phone) {
      try {
        await sendSMS({ to: recipient.phone, body: input.body, organizationId: input.organizationId })
        await db.insert(conversationMessages).values({
          organizationId: input.organizationId,
          userId: recipient.userId,
          broadcastId: logRow.id,
          targetType: "user",
          channel: "sms",
          direction: "outbound",
          body: input.body,
          deliveryStatus: "sent",
          sentAt: new Date(),
        })
        smsSent++
      } catch (err) {
        errors.push(`SMS to ${recipient.userId}: ${err}`)
      }
    }

    if (sendEmailThis && recipient.email) {
      try {
        await sendEmail({
          to: recipient.email,
          subject: buildEmailSubject(input),
          body: input.body,
          organizationId: input.organizationId,
        })
        await db.insert(conversationMessages).values({
          organizationId: input.organizationId,
          userId: recipient.userId,
          broadcastId: logRow.id,
          targetType: "user",
          channel: "email",
          direction: "outbound",
          body: input.body,
          deliveryStatus: "sent",
          sentAt: new Date(),
        })
        emailSent++
      } catch (err) {
        errors.push(`Email to ${recipient.userId}: ${err}`)
      }
    }
  }

  // Update log with delivery summary
  await db
    .update(broadcastLog)
    .set({
      sentAt: new Date(),
      deliverySummary: {
        telegramGroupPosts,
        smsSent,
        emailSent,
        errors: errors.length,
      },
    })
    .where(eq(broadcastLog.id, logRow.id))

  return {
    broadcastId: logRow.id,
    deduplicated: false,
    telegramGroupPosts,
    smsSent,
    emailSent,
    errors,
  }
}

type Recipient = {
  userId: string
  phone: string | null
  email: string | null
  hasTelegram: boolean
  alsoEmailCopy: boolean
}

type ResolvedRecipients = {
  users: Recipient[]
  initiatorFirstName: string | null
}

async function resolveRecipients(input: ComposeBroadcastInput): Promise<ResolvedRecipients> {
  let userIds: string[] = []

  if (input.targetType === "org_dm") {
    // All parents in the organization (simplification: everyone with a registration)
    const rows = await db
      .selectDistinct({ userId: familyMemberParents.parentUserId })
      .from(familyMemberParents)
      .innerJoin(familyMembers, eq(familyMemberParents.familyMemberId, familyMembers.id))
      .innerJoin(registrations, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(teams, eq(registrations.teamId, teams.id))
      .where(
        and(
          eq(teams.organizationId, input.organizationId),
          eq(familyMemberParents.canReceiveMessages, true),
        ),
      )
    userIds = rows.map((r) => r.userId)
  } else {
    // Parents of kids on the targeted teams
    const rows = await db
      .selectDistinct({ userId: familyMemberParents.parentUserId })
      .from(registrations)
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(familyMemberParents, eq(familyMemberParents.familyMemberId, familyMembers.id))
      .where(
        and(
          inArray(registrations.teamId, input.teamIds),
          eq(familyMemberParents.canReceiveMessages, true),
        ),
      )
    userIds = rows.map((r) => r.userId)
  }

  if (userIds.length === 0) {
    const initiator = input.initiatorId
      ? await db.query.users.findFirst({ where: eq(users.id, input.initiatorId) })
      : null
    return { users: [], initiatorFirstName: initiator?.firstName ?? null }
  }

  const recipientsRaw = await db
    .select({
      userId: users.id,
      phone: users.phone,
      email: users.email,
      telegramChatId: users.telegramChatId,
      alsoEmailCopy: users.alsoEmailCopy,
    })
    .from(users)
    .where(inArray(users.id, userIds))

  const initiator = input.initiatorId
    ? await db.query.users.findFirst({ where: eq(users.id, input.initiatorId) })
    : null

  return {
    users: recipientsRaw.map((u) => ({
      userId: u.userId,
      phone: u.phone,
      email: u.email,
      hasTelegram: !!u.telegramChatId,
      alsoEmailCopy: u.alsoEmailCopy,
    })),
    initiatorFirstName: initiator?.firstName ?? null,
  }
}

function buildDisplayBody(input: ComposeBroadcastInput, initiatorFirstName: string | null): string {
  if (input.initiatorType === "coach" && initiatorFirstName) {
    return `From Coach ${initiatorFirstName}:\n${input.body}`
  }
  if (input.initiatorType === "admin") {
    // Org admin attribution — use org short name
    return `From Organization Admin:\n${input.body}`
  }
  return input.body
}

function buildEmailSubject(input: ComposeBroadcastInput): string {
  switch (input.messageType) {
    case "team_broadcast_general":
      return "Team announcement"
    case "event_change":
      return "Schedule update"
    case "event_cancellation":
      return "Event cancelled"
    case "coach_urgent_override":
      return "URGENT: Team announcement"
    case "day_before_reminder":
      return "Reminder for tomorrow"
    default:
      return "Announcement"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/messaging/broadcast.ts
git commit -m "feat: broadcast compose orchestrator with routing, fan-out, logging"
```

---

## Task 11: Admin broadcasts API endpoint

**Files:**
- Create: `src/pages/api/admin/broadcasts.ts`
- Create: `tests/api/admin/broadcasts.test.ts`

- [ ] **Step 1: Write the failing test**

Write `tests/api/admin/broadcasts.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getAdminCookie, getCoachCookie, apiFetch, expectJson, resetCookies, testSlug } from "../setup/test-helpers"

const ENDPOINT = "/api/admin/broadcasts"

describe("Admin Broadcasts API", () => {
  let adminCookie: string
  let coachCookie: string

  beforeAll(async () => {
    adminCookie = await getAdminCookie()
    coachCookie = await getCoachCookie()
  })

  afterAll(() => resetCookies())

  it("requires admin authentication (401 without cookie)", async () => {
    const res = await apiFetch(ENDPOINT, { method: "POST", body: JSON.stringify({}) })
    expect(res.status).toBe(401)
  })

  it("rejects coach for multi-team target (403)", async () => {
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: coachCookie,
      body: JSON.stringify({
        targetType: "multi_team",
        teamIds: ["00000000-0000-0000-0000-000000000001"],
        messageType: "team_broadcast_general",
        body: "test",
      }),
    })
    expect(res.status).toBe(403)
  })

  it("creates a broadcast for a single team (201)", async () => {
    // Assumes an existing team the admin can target — test-helpers.ts should expose a known teamId
    // Adjust to your existing fixture conventions
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        targetType: "team_group",
        teamIds: ["SEED_TEAM_ID"], // replace with test fixture
        messageType: "team_broadcast_general",
        body: `Test broadcast ${testSlug("bcast")}`,
        nonce: testSlug("nonce"),
      }),
    })
    const json = await expectJson(res, 201)
    expect(json.broadcastId).toBeDefined()
    expect(json.errors).toEqual([])
  })

  it("deduplicates on repeated nonce", async () => {
    const nonce = testSlug("dedupe")
    const body = JSON.stringify({
      targetType: "team_group",
      teamIds: ["SEED_TEAM_ID"],
      messageType: "team_broadcast_general",
      body: "Dedupe test",
      nonce,
    })
    const first = await apiFetch(ENDPOINT, { method: "POST", cookie: adminCookie, body })
    const firstJson = await expectJson(first, 201)
    const second = await apiFetch(ENDPOINT, { method: "POST", cookie: adminCookie, body })
    const secondJson = await expectJson(second, 201)
    expect(secondJson.broadcastId).toBe(firstJson.broadcastId)
    expect(secondJson.deduplicated).toBe(true)
  })

  it("lists sent broadcasts via GET", async () => {
    const res = await apiFetch(ENDPOINT, { method: "GET", cookie: adminCookie })
    const json = await expectJson(res, 200)
    expect(Array.isArray(json.broadcasts)).toBe(true)
  })
})
```

**Note:** `SEED_TEAM_ID` is a placeholder — replace with your project's actual seed/fixture team UUID. Check `tests/api/setup/test-helpers.ts` for existing fixture exports; use the same one.

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:api -- tests/api/admin/broadcasts.test.ts
```

Expected: FAIL — `/api/admin/broadcasts` returns 404.

- [ ] **Step 3: Write the endpoint**

Write `src/pages/api/admin/broadcasts.ts`:

```typescript
import type { APIRoute } from "astro"
import { z } from "zod"
import { db } from "../../../lib/db/client"
import { broadcastLog, teamCoaches, teams } from "../../../lib/db/schema"
import { and, eq, desc, inArray } from "drizzle-orm"
import { composeBroadcast } from "../../../lib/messaging/broadcast"

const ComposeSchema = z.object({
  targetType: z.enum(["team_group", "multi_team", "org_dm"]),
  teamIds: z.array(z.string().uuid()).default([]),
  messageType: z.enum([
    "team_broadcast_general",
    "event_change",
    "coach_urgent_override",
    "day_before_reminder",
    "event_cancellation",
  ]),
  body: z.string().min(1).max(4000),
  isUrgent: z.boolean().optional(),
  hoursUntilEvent: z.number().optional(),
  nonce: z.string().optional(),
})

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }
  const role = locals.user.role
  if (role !== "admin" && role !== "coach") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
  }

  const raw = await request.json()
  const parsed = ComposeSchema.safeParse(raw)
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Invalid payload", details: parsed.error.format() }), {
      status: 400,
    })
  }
  const input = parsed.data

  // Coach restrictions: single-team, only their own team
  if (role === "coach") {
    if (input.targetType !== "team_group" || input.teamIds.length !== 1) {
      return new Response(JSON.stringify({ error: "Coaches can only broadcast to their own team" }), {
        status: 403,
      })
    }
    const teamId = input.teamIds[0]
    const assigned = await db.query.teamCoaches.findFirst({
      where: and(eq(teamCoaches.teamId, teamId), eq(teamCoaches.userId, locals.user.id)),
    })
    if (!assigned) {
      return new Response(JSON.stringify({ error: "Not assigned to this team" }), { status: 403 })
    }
  }

  // Determine organizationId
  let organizationId: string
  if (input.targetType === "org_dm") {
    if (!locals.organization) {
      return new Response(JSON.stringify({ error: "Organization context required" }), { status: 400 })
    }
    organizationId = locals.organization.id
  } else {
    const team = await db.query.teams.findFirst({ where: eq(teams.id, input.teamIds[0]) })
    if (!team) {
      return new Response(JSON.stringify({ error: "Team not found" }), { status: 404 })
    }
    organizationId = team.organizationId
  }

  const result = await composeBroadcast({
    organizationId,
    initiatorId: locals.user.id,
    initiatorType: role === "coach" ? "coach" : "admin",
    targetType: input.targetType,
    teamIds: input.teamIds,
    messageType: input.messageType,
    body: input.body,
    isUrgent: input.isUrgent,
    hoursUntilEvent: input.hoursUntilEvent,
    nonce: input.nonce,
  })

  return new Response(JSON.stringify(result), { status: 201, headers: { "Content-Type": "application/json" } })
}

export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.user || (locals.user.role !== "admin" && locals.user.role !== "coach")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
  }
  if (!locals.organization) {
    return new Response(JSON.stringify({ error: "Organization context required" }), { status: 400 })
  }

  const limit = Number(url.searchParams.get("limit") ?? 50)
  const rows = await db
    .select()
    .from(broadcastLog)
    .where(eq(broadcastLog.organizationId, locals.organization.id))
    .orderBy(desc(broadcastLog.createdAt))
    .limit(limit)

  return new Response(JSON.stringify({ broadcasts: rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:api -- tests/api/admin/broadcasts.test.ts
```

Expected: All tests PASS. If `SEED_TEAM_ID` is wrong, replace with a real team from your fixtures.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/admin/broadcasts.ts tests/api/admin/broadcasts.test.ts
git commit -m "feat: admin broadcasts API (compose + list)"
```

---

## Task 12: Cron — create-scheduled-team-groups

**Files:**
- Create: `src/pages/api/cron/create-scheduled-team-groups.ts`
- Create: `tests/api/cron/create-scheduled-team-groups.test.ts`

- [ ] **Step 1: Write the failing test**

Write `tests/api/cron/create-scheduled-team-groups.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { apiFetch, expectJson } from "../setup/test-helpers"

const ENDPOINT = "/api/cron/create-scheduled-team-groups"

describe("Cron: create scheduled team groups", () => {
  it("requires cron secret", async () => {
    const res = await apiFetch(ENDPOINT, { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("processes due scheduled groups (200)", async () => {
    const secret = process.env.CRON_SECRET ?? ""
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    })
    const json = await expectJson(res, 200)
    expect(typeof json.promoted).toBe("number")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:api -- tests/api/cron/create-scheduled-team-groups.test.ts
```

Expected: FAIL — endpoint returns 404.

- [ ] **Step 3: Write the endpoint**

Write `src/pages/api/cron/create-scheduled-team-groups.ts`:

```typescript
import type { APIRoute } from "astro"
import { processScheduledGroupCreations } from "../../../lib/messaging/group-lifecycle"

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET
  const provided = request.headers.get("x-cron-secret")
  if (secret && provided !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }
  const promoted = await processScheduledGroupCreations()
  return new Response(JSON.stringify({ promoted }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

export const GET: APIRoute = async () =>
  new Response("Use POST with x-cron-secret header", { status: 200 })
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:api -- tests/api/cron/create-scheduled-team-groups.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/cron/create-scheduled-team-groups.ts tests/api/cron/create-scheduled-team-groups.test.ts
git commit -m "feat: cron endpoint for scheduled team group creation"
```

---

## Task 13: Cron — reconcile-team-groups

**Files:**
- Create: `src/pages/api/cron/reconcile-team-groups.ts`
- Create: `tests/api/cron/reconcile-team-groups.test.ts`

- [ ] **Step 1: Write the failing test**

Write `tests/api/cron/reconcile-team-groups.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { apiFetch, expectJson } from "../setup/test-helpers"

const ENDPOINT = "/api/cron/reconcile-team-groups"

describe("Cron: reconcile team groups", () => {
  it("requires cron secret", async () => {
    const res = await apiFetch(ENDPOINT, { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("runs reconciliation and returns counts", async () => {
    const secret = process.env.CRON_SECRET ?? ""
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    })
    const json = await expectJson(res, 200)
    expect(typeof json.groupsProcessed).toBe("number")
    expect(typeof json.totalInvited).toBe("number")
    expect(typeof json.totalRemoved).toBe("number")
    expect(typeof json.totalErrors).toBe("number")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:api -- tests/api/cron/reconcile-team-groups.test.ts
```

Expected: FAIL (404).

- [ ] **Step 3: Write the endpoint**

Write `src/pages/api/cron/reconcile-team-groups.ts`:

```typescript
import type { APIRoute } from "astro"
import { reconcileAllActiveGroups } from "../../../lib/messaging/team-group-sync"

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET
  const provided = request.headers.get("x-cron-secret")
  if (secret && provided !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }
  const result = await reconcileAllActiveGroups()
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

export const GET: APIRoute = async () =>
  new Response("Use POST with x-cron-secret header", { status: 200 })
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:api -- tests/api/cron/reconcile-team-groups.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/cron/reconcile-team-groups.ts tests/api/cron/reconcile-team-groups.test.ts
git commit -m "feat: cron endpoint for team group membership reconciliation"
```

---

## Task 14: Cron — archive-team-groups

**Files:**
- Create: `src/pages/api/cron/archive-team-groups.ts`
- Create: `tests/api/cron/archive-team-groups.test.ts`

- [ ] **Step 1: Write the failing test**

Write `tests/api/cron/archive-team-groups.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { apiFetch, expectJson } from "../setup/test-helpers"

const ENDPOINT = "/api/cron/archive-team-groups"

describe("Cron: archive team groups", () => {
  it("requires cron secret", async () => {
    const res = await apiFetch(ENDPOINT, { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("runs archival and returns count", async () => {
    const secret = process.env.CRON_SECRET ?? ""
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    })
    const json = await expectJson(res, 200)
    expect(typeof json.archived).toBe("number")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:api -- tests/api/cron/archive-team-groups.test.ts
```

- [ ] **Step 3: Write the endpoint**

Write `src/pages/api/cron/archive-team-groups.ts`:

```typescript
import type { APIRoute } from "astro"
import { processSeasonEndArchivals } from "../../../lib/messaging/group-lifecycle"

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET
  const provided = request.headers.get("x-cron-secret")
  if (secret && provided !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }
  const archived = await processSeasonEndArchivals()
  return new Response(JSON.stringify({ archived }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

export const GET: APIRoute = async () =>
  new Response("Use POST with x-cron-secret header", { status: 200 })
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:api -- tests/api/cron/archive-team-groups.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/cron/archive-team-groups.ts tests/api/cron/archive-team-groups.test.ts
git commit -m "feat: cron endpoint for season-end team group archival"
```

---

## Task 15: Cron — process-scheduled-broadcasts

**Files:**
- Create: `src/pages/api/cron/process-scheduled-broadcasts.ts`
- Create: `tests/api/cron/process-scheduled-broadcasts.test.ts`

- [ ] **Step 1: Write the failing test**

Write `tests/api/cron/process-scheduled-broadcasts.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { apiFetch, expectJson } from "../setup/test-helpers"

const ENDPOINT = "/api/cron/process-scheduled-broadcasts"

describe("Cron: process scheduled broadcasts", () => {
  it("requires cron secret", async () => {
    const res = await apiFetch(ENDPOINT, { method: "POST" })
    expect(res.status).toBe(401)
  })

  it("processes due scheduled broadcasts", async () => {
    const secret = process.env.CRON_SECRET ?? ""
    const res = await apiFetch(ENDPOINT, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    })
    const json = await expectJson(res, 200)
    expect(typeof json.fired).toBe("number")
    expect(typeof json.cancelled).toBe("number")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:api -- tests/api/cron/process-scheduled-broadcasts.test.ts
```

- [ ] **Step 3: Write the endpoint**

Write `src/pages/api/cron/process-scheduled-broadcasts.ts`:

```typescript
import type { APIRoute } from "astro"
import { db } from "../../../lib/db/client"
import { scheduledBroadcasts } from "../../../lib/db/schema"
import { and, eq, lte } from "drizzle-orm"
import { composeBroadcast } from "../../../lib/messaging/broadcast"

export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.CRON_SECRET
  const provided = request.headers.get("x-cron-secret")
  if (secret && provided !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  const due = await db
    .select()
    .from(scheduledBroadcasts)
    .where(
      and(eq(scheduledBroadcasts.status, "pending"), lte(scheduledBroadcasts.scheduledFor, new Date())),
    )

  let fired = 0
  let cancelled = 0

  for (const sb of due) {
    // Check cancel conditions
    const cancelConditions = sb.cancelIf as Record<string, unknown>
    if (cancelConditions.event_cancelled === true) {
      await db
        .update(scheduledBroadcasts)
        .set({ status: "cancelled" })
        .where(eq(scheduledBroadcasts.id, sb.id))
      cancelled++
      continue
    }

    try {
      const result = await composeBroadcast({
        organizationId: sb.organizationId,
        initiatorId: sb.initiatorId,
        initiatorType: sb.initiatorId ? "admin" : "system",
        targetType: sb.teamId ? "team_group" : "org_dm",
        teamIds: sb.teamId ? [sb.teamId] : [],
        messageType: sb.messageType as Parameters<typeof composeBroadcast>[0]["messageType"],
        body: sb.body,
        isUrgent: sb.isUrgent,
      })
      await db
        .update(scheduledBroadcasts)
        .set({
          status: "sent",
          firedAt: new Date(),
          resultingBroadcastId: result.broadcastId,
        })
        .where(eq(scheduledBroadcasts.id, sb.id))
      fired++
    } catch (err) {
      console.error(`Failed to fire scheduled broadcast ${sb.id}:`, err)
    }
  }

  return new Response(JSON.stringify({ fired, cancelled }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

export const GET: APIRoute = async () =>
  new Response("Use POST with x-cron-secret header", { status: 200 })
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:api -- tests/api/cron/process-scheduled-broadcasts.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/cron/process-scheduled-broadcasts.ts tests/api/cron/process-scheduled-broadcasts.test.ts
git commit -m "feat: cron endpoint for scheduled broadcast dispatch"
```

---

## Task 16: Wire automated event-change notifications

**Files:**
- Modify: `src/lib/messaging/notifications.ts`

- [ ] **Step 1: Read the existing notifications module**

Read `src/lib/messaging/notifications.ts` to understand its structure. Look for `notifyScheduleChange()` and `notifyEventCancellation()` — these are the functions called when events are rescheduled/cancelled.

- [ ] **Step 2: Refactor to use composeBroadcast**

Modify the two functions to call `composeBroadcast` from `./broadcast` instead of directly calling channel senders.

Replace `notifyScheduleChange` with:

```typescript
import { composeBroadcast } from "./broadcast"
// ... existing imports

export async function notifyScheduleChange(params: {
  eventId: string
  teamId: string
  organizationId: string
  oldTime: Date
  newTime: Date
  eventName: string
}): Promise<void> {
  const hoursUntilEvent = (params.newTime.getTime() - Date.now()) / (1000 * 60 * 60)
  const formattedOld = params.oldTime.toLocaleString()
  const formattedNew = params.newTime.toLocaleString()
  const body = `Heads up — ${params.eventName} has moved from ${formattedOld} to ${formattedNew}.`

  await composeBroadcast({
    organizationId: params.organizationId,
    initiatorId: null,
    initiatorType: "system",
    targetType: "team_group",
    teamIds: [params.teamId],
    messageType: "event_change",
    body,
    hoursUntilEvent,
  })
}
```

Similarly replace `notifyEventCancellation`:

```typescript
export async function notifyEventCancellation(params: {
  eventId: string
  teamId: string
  organizationId: string
  eventStartAt: Date
  eventName: string
  reason?: string
}): Promise<void> {
  const hoursUntilEvent = (params.eventStartAt.getTime() - Date.now()) / (1000 * 60 * 60)
  const reasonText = params.reason ? ` (${params.reason})` : ""
  const body = `${params.eventName} has been cancelled${reasonText}. Rescheduling details to follow.`

  await composeBroadcast({
    organizationId: params.organizationId,
    initiatorId: null,
    initiatorType: "system",
    targetType: "team_group",
    teamIds: [params.teamId],
    messageType: "event_cancellation",
    body,
    hoursUntilEvent,
  })
}
```

**Preserve existing function signatures and exports** — callers in the codebase should not need changes. If the existing functions had different signatures, adapt the wrapper to match.

- [ ] **Step 3: Run the existing test suite to check for regressions**

```bash
npm run test:api -- tests/api/
```

Expected: all tests PASS. Any existing test that exercised notifyScheduleChange now goes through the new broadcast path; if a test broke, read the failure and either update the test to assert on the new log row or restore backwards-compat in the wrapper.

- [ ] **Step 4: Commit**

```bash
git add src/lib/messaging/notifications.ts
git commit -m "feat: route event-change notifications through broadcast pipeline"
```

---

## Task 17: Roster-change event hook for group sync

**Files:**
- Modify: the roster-change API endpoint (identify via grep)

- [ ] **Step 1: Locate the roster change endpoint**

Search for where registrations get created or where `registrations.teamId` is mutated:

```bash
grep -rn "registrations" src/pages/api/admin/ | head -20
```

The likely endpoints are `src/pages/api/admin/registrations.ts` or `src/pages/api/admin/teams/[teamId]/roster.ts`. Identify the handler that adds/removes a kid from a team.

- [ ] **Step 2: Add sync call after roster mutation**

In each handler that sets or changes `registrations.teamId`, add after the DB write:

```typescript
import { scheduleGroupCreation } from "../../../lib/messaging/group-lifecycle"
import { syncTeamGroupMembership } from "../../../lib/messaging/team-group-sync"
import { teamGroups } from "../../../lib/db/schema"
import { eq } from "drizzle-orm"

// After writing the roster change:
const team = await db.query.teams.findFirst({
  where: eq(teams.id, newTeamId),
  with: {
    events: { orderBy: (events, { asc }) => [asc(events.scheduledAt)], limit: 1 },
  },
})
const firstEvent = team?.events[0]?.scheduledAt ?? null
await scheduleGroupCreation({ teamId: newTeamId, firstEventAt: firstEvent })

// If an active group already exists, sync immediately
const activeGroup = await db.query.teamGroups.findFirst({
  where: and(eq(teamGroups.teamId, newTeamId), eq(teamGroups.status, "active")),
})
if (activeGroup) {
  await syncTeamGroupMembership(activeGroup.id)
}
```

**Adapt to the specific handler's DB transaction pattern** (if the existing handler uses a transaction, add these calls inside or after the transaction commit as appropriate — do not block the transaction on Telegram API calls).

- [ ] **Step 3: Add a query endpoint for tests to inspect team_groups**

Before writing the test, we need a way to assert a team_group was created. Add a GET endpoint on the team route:

Write `src/pages/api/admin/teams/[teamId]/group.ts`:

```typescript
import type { APIRoute } from "astro"
import { db } from "../../../../lib/db/client"
import { teamGroups } from "../../../../lib/db/schema"
import { eq, and, ne } from "drizzle-orm"

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user || (locals.user.role !== "admin" && locals.user.role !== "coach")) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 })
  }
  const teamId = params.teamId
  if (!teamId) return new Response(JSON.stringify({ error: "teamId required" }), { status: 400 })

  const group = await db.query.teamGroups.findFirst({
    where: and(eq(teamGroups.teamId, teamId), ne(teamGroups.status, "archived")),
  })
  return new Response(JSON.stringify({ teamGroup: group ?? null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
```

- [ ] **Step 4: Write test for the sync trigger**

Create `tests/api/admin/team-group-membership.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getAdminCookie, apiFetch, expectJson, resetCookies, testSlug } from "../setup/test-helpers"

describe("Team group membership sync on roster change", () => {
  let adminCookie: string

  beforeAll(async () => {
    adminCookie = await getAdminCookie()
  })
  afterAll(() => resetCookies())

  // Replace SEED_TEAM_ID and SEED_KID_ID with real fixture UUIDs from your
  // test-helpers setup. Look at existing admin CRUD tests (e.g.,
  // tests/api/admin/discount-codes.test.ts) for the fixture pattern.
  const SEED_TEAM_ID = process.env.TEST_TEAM_ID ?? ""
  const SEED_KID_ID = process.env.TEST_FAMILY_MEMBER_ID ?? ""

  it("creates a scheduled team_group row after roster add", async () => {
    if (!SEED_TEAM_ID || !SEED_KID_ID) {
      console.warn("TEST_TEAM_ID / TEST_FAMILY_MEMBER_ID not set; skipping")
      return
    }

    const registerRes = await apiFetch("/api/admin/registrations", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        teamId: SEED_TEAM_ID,
        familyMemberId: SEED_KID_ID,
        idempotencyKey: testSlug("roster"),
      }),
    })
    // Accept either 201 (created) or 200 (already exists) — we only care that sync fires
    expect([200, 201]).toContain(registerRes.status)

    const groupRes = await apiFetch(`/api/admin/teams/${SEED_TEAM_ID}/group`, {
      method: "GET",
      cookie: adminCookie,
    })
    const groupJson = await expectJson(groupRes, 200)
    expect(groupJson.teamGroup).not.toBeNull()
    expect(["scheduled", "pending_manual_creation", "active"]).toContain(
      groupJson.teamGroup.status,
    )
    expect(groupJson.teamGroup.teamId).toBe(SEED_TEAM_ID)
  })
})
```

**Environment variables:** Add `TEST_TEAM_ID` and `TEST_FAMILY_MEMBER_ID` to your test env (either `.env.test` or CI secret). Populate them from the seed script used for the dev database.

- [ ] **Step 5: Run tests**

```bash
npm run test:api -- tests/api/admin/team-group-membership.test.ts
npm run test:api -- tests/api/admin/ # check for regressions
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/admin/ tests/api/admin/team-group-membership.test.ts
git commit -m "feat: hook roster changes into team group sync pipeline"
```

---

## Task 18: Broadcast composer UI component

**Files:**
- Create: `src/components/admin/broadcast-composer.tsx`

- [ ] **Step 1: Read an existing composer component for style reference**

Read `src/components/admin/announcements-list.tsx` (per CLAUDE.md this is an existing admin compose-style component). Note the shadcn/ui imports, form state pattern, submit handler, and `apiFetch`/fetch style.

- [ ] **Step 2: Write the component**

Write `src/components/admin/broadcast-composer.tsx`:

```typescript
"use client"

import { useState } from "react"
import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { Checkbox } from "../ui/checkbox"
import { Label } from "../ui/label"
import { toast } from "sonner"

type Props = {
  teamId: string
  teamName: string
  coachFirstName?: string
  onSent?: () => void
}

export function BroadcastComposer({ teamId, teamName, coachFirstName, onSent }: Props) {
  const [body, setBody] = useState("")
  const [isUrgent, setIsUrgent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const preview = coachFirstName ? `From Coach ${coachFirstName}:\n${body}` : body
  const charCount = body.length

  async function submit() {
    if (!body.trim()) return
    setSubmitting(true)
    const nonce = `compose-${teamId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      const res = await fetch("/api/admin/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType: "team_group",
          teamIds: [teamId],
          messageType: isUrgent ? "coach_urgent_override" : "team_broadcast_general",
          body,
          isUrgent,
          nonce,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Send failed")
      }
      const result = await res.json()
      toast.success(
        `Sent: ${result.telegramGroupPosts} group post, ${result.smsSent} SMS, ${result.emailSent} email${
          result.errors.length > 0 ? ` (${result.errors.length} errors)` : ""
        }`,
      )
      setBody("")
      setIsUrgent(false)
      onSent?.()
    } catch (err) {
      toast.error(String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div>
        <Label htmlFor="broadcast-body">Message to {teamName} parents</Label>
        <Textarea
          id="broadcast-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          rows={5}
          placeholder="Write your announcement…"
          disabled={submitting}
        />
        <div className="mt-1 text-xs text-gray-500">{charCount} / 4000</div>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="urgent"
          checked={isUrgent}
          onCheckedChange={(v) => setIsUrgent(v === true)}
          disabled={submitting}
        />
        <Label htmlFor="urgent" className="text-sm">
          Mark as urgent (forces SMS to all parents)
        </Label>
      </div>

      {body && (
        <div className="rounded bg-gray-50 p-3 text-sm">
          <div className="mb-1 text-xs font-medium text-gray-500">Preview</div>
          <pre className="whitespace-pre-wrap font-sans">{preview}</pre>
        </div>
      )}

      <Button onClick={submit} disabled={submitting || !body.trim()}>
        {submitting ? "Sending…" : "Send announcement"}
      </Button>
    </div>
  )
}
```

**Note:** adjust `Checkbox`, `Textarea`, `Button`, `Label` imports to match your actual shadcn/ui component paths in the codebase (`../ui/...`). If `sonner` isn't already imported elsewhere, it should be — per CLAUDE.md "Toast notifications via sonner."

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/broadcast-composer.tsx
git commit -m "feat: broadcast composer UI component"
```

---

## Task 19: Sent announcements list component + admin page

**Files:**
- Create: `src/components/admin/sent-announcements-list.tsx`
- Create: `src/pages/admin/broadcasts.astro`

- [ ] **Step 1: Write the list component**

Write `src/components/admin/sent-announcements-list.tsx`:

```typescript
"use client"

import { useEffect, useState } from "react"
import { Badge } from "../ui/badge"

type BroadcastRow = {
  id: string
  initiatorType: string
  targetType: string
  messageType: string
  body: string
  isUrgent: boolean
  sentAt: string | null
  createdAt: string
  deliverySummary: {
    telegramGroupPosts?: number
    smsSent?: number
    emailSent?: number
    errors?: number
  }
}

export function SentAnnouncementsList() {
  const [rows, setRows] = useState<BroadcastRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/admin/broadcasts?limit=50")
      .then((r) => r.json())
      .then((json) => {
        setRows(json.broadcasts ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-sm text-gray-500">Loading…</div>
  if (rows.length === 0) return <div className="text-sm text-gray-500">No broadcasts sent yet.</div>

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="rounded-lg border p-3">
          <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
            <span>{new Date(row.sentAt ?? row.createdAt).toLocaleString()}</span>
            <Badge variant="outline">{row.initiatorType}</Badge>
            <Badge variant="outline">{row.messageType}</Badge>
            {row.isUrgent && <Badge variant="destructive">urgent</Badge>}
          </div>
          <div className="mb-2 whitespace-pre-wrap text-sm">{row.body}</div>
          <div className="text-xs text-gray-500">
            {row.deliverySummary.telegramGroupPosts ?? 0} group ·{" "}
            {row.deliverySummary.smsSent ?? 0} SMS ·{" "}
            {row.deliverySummary.emailSent ?? 0} email
            {row.deliverySummary.errors ? ` · ${row.deliverySummary.errors} errors` : ""}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Write the admin page**

Write `src/pages/admin/broadcasts.astro`:

```astro
---
import AdminLayout from "../../layouts/AdminLayout.astro"
import { SentAnnouncementsList } from "../../components/admin/sent-announcements-list"

const { user } = Astro.locals
if (!user || (user.role !== "admin" && user.role !== "coach")) {
  return Astro.redirect("/signin?returnUrl=/admin/broadcasts")
}
---

<AdminLayout title="Sent announcements" user={user}>
  <div class="mx-auto max-w-3xl p-6">
    <h1 class="mb-6 text-2xl font-semibold">Sent announcements</h1>
    <SentAnnouncementsList client:load />
  </div>
</AdminLayout>
```

**Adjust the AdminLayout import path** if your layout lives elsewhere (e.g., `src/layouts/admin-layout.astro`). Check existing admin `.astro` files for the correct path.

- [ ] **Step 3: Manual sanity check**

Start the dev server: `npm run dev`. Sign in as an admin and navigate to `/admin/broadcasts`. Verify the page renders (may be empty if no broadcasts have been sent). Send a test broadcast via the API and refresh; confirm it appears.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/sent-announcements-list.tsx src/pages/admin/broadcasts.astro
git commit -m "feat: sent announcements admin page"
```

---

## Task 20: Wire composer entry from team admin page

**Files:**
- Modify: the existing admin team detail page (likely `src/pages/admin/teams/[teamId].astro` or similar)

- [ ] **Step 1: Locate the team detail page**

```bash
find src/pages/admin -name "*.astro" | xargs grep -l "teams"
```

Find the page that renders a single team's admin view. Read the surrounding code for the import/layout pattern.

- [ ] **Step 2: Add the composer**

Edit the team detail page:

```astro
---
// existing imports
import { BroadcastComposer } from "../../../components/admin/broadcast-composer"

// existing logic to fetch team data (teamId, team, coachUser, etc.)
---

<AdminLayout title={team.name} user={user}>
  <!-- existing content -->

  <section class="mt-8">
    <h2 class="mb-4 text-xl font-semibold">Send team announcement</h2>
    <BroadcastComposer
      client:load
      teamId={team.id}
      teamName={team.name}
      coachFirstName={coachUser?.firstName}
    />
  </section>

  <!-- existing content below -->
</AdminLayout>
```

- [ ] **Step 3: Manual sanity check**

With `npm run dev` running, sign in as a coach or admin, navigate to a team's admin page, and confirm the composer renders. Type a test message, send it, and verify:
1. Success toast appears with send counts
2. `/admin/broadcasts` lists the new broadcast
3. If a `team_group` exists with `status = 'active'` and a `telegram_chat_id`, the Telegram group receives the post (in non-dry-run env)

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/teams/
git commit -m "feat: wire broadcast composer into team admin page"
```

---

## Task 21: End-to-end smoke test

**Files:**
- Create: `tests/api/messaging/e2e-broadcast.test.ts`

- [ ] **Step 1: Write the smoke test**

Write `tests/api/messaging/e2e-broadcast.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getAdminCookie, apiFetch, expectJson, resetCookies, testSlug } from "../setup/test-helpers"

describe("E2E: broadcast flow", () => {
  let adminCookie: string

  beforeAll(async () => {
    adminCookie = await getAdminCookie()
  })
  afterAll(() => resetCookies())

  it("admin sends a broadcast; it appears in the log", async () => {
    const body = `E2E broadcast ${testSlug("e2e")}`
    const nonce = testSlug("e2e-nonce")

    const sendRes = await apiFetch("/api/admin/broadcasts", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        targetType: "team_group",
        teamIds: ["SEED_TEAM_ID"], // replace
        messageType: "team_broadcast_general",
        body,
        nonce,
      }),
    })
    const sendJson = await expectJson(sendRes, 201)
    expect(sendJson.broadcastId).toBeDefined()

    const listRes = await apiFetch("/api/admin/broadcasts?limit=5", {
      method: "GET",
      cookie: adminCookie,
    })
    const listJson = await expectJson(listRes, 200)
    const found = listJson.broadcasts.find((b: { id: string }) => b.id === sendJson.broadcastId)
    expect(found).toBeDefined()
    expect(found.body).toBe(body)
  })

  it("reconcile cron runs without error", async () => {
    const secret = process.env.CRON_SECRET ?? ""
    const res = await apiFetch("/api/cron/reconcile-team-groups", {
      method: "POST",
      headers: { "x-cron-secret": secret },
    })
    await expectJson(res, 200)
  })
})
```

- [ ] **Step 2: Run the full test suite**

```bash
npm run test:api
```

Expected: all new tests PASS, existing tests remain green.

- [ ] **Step 3: Commit**

```bash
git add tests/api/messaging/e2e-broadcast.test.ts
git commit -m "test: e2e smoke for broadcast compose + reconcile"
```

---

## Task 22: Documentation — runbook for pending_manual_creation flow

**Files:**
- Create: `docs/messaging/team-groups-runbook.md`

- [ ] **Step 1: Write the runbook**

Write `docs/messaging/team-groups-runbook.md`:

```markdown
# Team Groups: Operator Runbook

## Pending manual creation

Telegram Bot API does not allow bots to create groups programmatically. When a
team's group is due for creation (7 days before first event), the system marks
it `status = 'pending_manual_creation'` rather than failing.

### What to do

1. Dashboard shows a "Groups awaiting creation" list on the admin home.
2. For each pending group:
   a. In the Telegram app, create a new Supergroup.
   b. Add the Ace bot (@AspireAceBot) as an admin with "Invite Users" and "Change Info" permissions.
   c. Copy the group's chatId (use `@AspireAceBot /chatid` command in the group once the bot is added).
   d. Paste the chatId into the admin UI, "Promote to active" button.
3. System will set the title, description, generate an invite link, and DM-invite all eligible parents.

### Automation path

This manual step is a Telegram API limitation. If we later adopt a paid
"template bot" provider (e.g., TMWS), we can automate creation. Until then,
org admins must perform the above flow per team per season.

## Archival

- Groups auto-archive 7 days after season `end_date`.
- Ace posts a farewell, leaves the group.
- Group persists in Telegram with full history for parents who want to reference it.

## Reconciliation

- Runs nightly via `POST /api/cron/reconcile-team-groups`.
- Schedule via cron-job.org, GitHub Actions, or equivalent.
- Inspect drift in `reconciliation_log` table; unusual drift volume suggests
  an event handler bug.

## Urgent override

- Coaches and admins see "Mark as urgent" checkbox in compose.
- Urgent forces SMS fan-out to all parents regardless of time-to-event.
- All urgent sends logged with `broadcast_log.is_urgent = true` — review periodically
  for abuse.

## Cron schedule (suggested)

| Endpoint | Frequency |
|---|---|
| `/api/cron/create-scheduled-team-groups` | every 1 hour |
| `/api/cron/reconcile-team-groups` | every 24 hours, low-traffic window |
| `/api/cron/archive-team-groups` | every 24 hours |
| `/api/cron/process-scheduled-broadcasts` | every 15 minutes |

All cron endpoints require header `x-cron-secret: $CRON_SECRET`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/messaging/team-groups-runbook.md
git commit -m "docs: team groups operator runbook"
```

---

## Verification checklist

After completing all tasks:

- [ ] `npm run test:api` — all tests PASS
- [ ] Schema: `team_groups`, `team_group_memberships`, `broadcast_log`, `scheduled_broadcasts`, `reconciliation_log` tables exist; `programs.audience_type`, `users.also_email_copy`, `conversation_messages.team_group_id` columns exist
- [ ] Coach can sign in, navigate to their team's admin page, compose a broadcast, and see delivery confirmation
- [ ] Admin can navigate to `/admin/broadcasts` and see the log
- [ ] Cron endpoints return 401 without secret, 200 with secret, and record appropriate log rows
- [ ] Runbook in `docs/messaging/team-groups-runbook.md` describes the manual Telegram group creation flow

## What ships after this plan

- Working coach compose → broadcast to team group + email fan-out for non-linked parents
- Working admin compose with multi-team and org-DM targeting
- Automated event-change notifications route through the new pipeline (SMS triggered ≤24h before event)
- Nightly reconciliation cron keeps group membership consistent
- Season-end archival cron closes out groups
- Scheduled broadcast dispatch for day-before reminders and the like
- Sent Announcements admin view
- Operator runbook for the manual Telegram group creation step

## What's NOT in this plan (Part 2)

- Registration wizard Telegram link step
- Dashboard nudge banners for unlinked parents
- Email footer nudge links in transactional emails
- Parent-facing "Leave this group" / "Rejoin group" UI
- Adoption metrics dashboard (link rate, join rate, nudge conversion)
- The "template bot" automation for Telegram group creation (manual runbook flow covers MVP)
