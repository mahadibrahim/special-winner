import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  decimal,
  pgEnum,
  index,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./users";
import { organizations, locations } from "./organizations";
import { games, venues, teams } from "./teams";
import { familyMembers } from "./registrations";

// --- Enums ---

export const sessionTypeEnum = pgEnum("media_session_type", [
  "game",
  "team_posed",
  "practice",
  "event",
]);

export const shootStatusEnum = pgEnum("media_shoot_status", [
  "assigned",
  "confirmed",
  "checked_in",
  "uploading",
  "uploaded",
  "tagging",
  "ready",
  "published",
  "cancelled",
]);

export const rateTypeEnum = pgEnum("media_rate_type", [
  "per_game",
  "per_day",
  "flat",
]);

export const payoutStatusEnum = pgEnum("media_payout_status", [
  "unearned",
  "pending_approval",
  "approved",
  "paid",
  "cancelled",
]);

export const assetTypeEnum = pgEnum("media_asset_type", [
  "photo",
  "video",
  "video_clip",
]);

export const assetStatusEnum = pgEnum("media_asset_status", [
  "uploading",
  "uploaded",
  "culled",
  "edited",
  "tagged",
  "published",
  "rejected",
]);

export const editPassEnum = pgEnum("media_edit_pass", [
  "none",
  "ai_only",
  "human_reviewed",
]);

export const auditEntityEnum = pgEnum("media_audit_entity", [
  "asset",
  "tag",
  "session",
  "agreement",
]);

export const auditActionEnum = pgEnum("media_audit_action", [
  "create",
  "update",
  "delete",
  "approve",
  "publish",
  "revoke",
]);

// --- shoot_sessions ---

export const shootSessions = pgTable(
  "shoot_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    gameId: uuid("game_id").references(() => games.id, { onDelete: "set null" }),
    venueId: uuid("venue_id").references(() => venues.id, {
      onDelete: "set null",
    }),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sessionType: sessionTypeEnum("session_type").notNull(),
    status: shootStatusEnum("status").default("assigned").notNull(),
    scheduledStart: timestamp("scheduled_start").notNull(),
    scheduledEnd: timestamp("scheduled_end").notNull(),
    confirmedAt: timestamp("confirmed_at"),
    checkedInAt: timestamp("checked_in_at"),
    checkedInLat: decimal("checked_in_lat", { precision: 10, scale: 6 }),
    checkedInLng: decimal("checked_in_lng", { precision: 10, scale: 6 }),
    checkedOutAt: timestamp("checked_out_at"),
    rateType: rateTypeEnum("rate_type"),
    rateCents: integer("rate_cents"),
    payoutStatus: payoutStatusEnum("payout_status")
      .default("unearned")
      .notNull(),
    stripeTransferId: varchar("stripe_transfer_id", { length: 255 }),
    // The media-auth scope this session's output is intended for. Used at
    // publish time to filter out tagged participants who haven't consented
    // to that scope. Defaults to 'internal' (most-restrictive).
    intendedScope: varchar("intended_scope", { length: 32 })
      .default("internal")
      .notNull()
      .$type<"internal" | "promotional" | "public">(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("shoot_sessions_org_idx").on(t.organizationId),
    assignedIdx: index("shoot_sessions_assigned_idx").on(t.assignedUserId),
    scheduledIdx: index("shoot_sessions_scheduled_idx").on(t.scheduledStart),
    statusIdx: index("shoot_sessions_status_idx").on(t.status),
    gameIdx: index("shoot_sessions_game_idx").on(t.gameId),
  })
);

// --- media_assets ---

export const mediaAssets = pgTable(
  "media_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shootSessionId: uuid("shoot_session_id")
      .notNull()
      .references(() => shootSessions.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    assetType: assetTypeEnum("asset_type").notNull(),
    storageKey: text("storage_key").notNull(),
    thumbnailKey: text("thumbnail_key"),
    originalFilename: varchar("original_filename", { length: 500 }).notNull(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    mimeType: varchar("mime_type", { length: 100 }),
    width: integer("width"),
    height: integer("height"),
    durationSeconds: integer("duration_seconds"),
    capturedAt: timestamp("captured_at"),
    uploadedAt: timestamp("uploaded_at"),
    // multipart bookkeeping (Phase 1; not in spec data-model but required for the upload flow)
    multipartUploadId: varchar("multipart_upload_id", { length: 255 }),
    burstGroupId: uuid("burst_group_id"),
    status: assetStatusEnum("status").default("uploading").notNull(),
    editPass: editPassEnum("edit_pass").default("none").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    sessionIdx: index("media_assets_session_idx").on(t.shootSessionId),
    orgIdx: index("media_assets_org_idx").on(t.organizationId),
    statusIdx: index("media_assets_status_idx").on(t.status),
    capturedAtIdx: index("media_assets_captured_at_idx").on(t.capturedAt),
  })
);

// --- media_staff_profiles ---

export const mediaStaffProfiles = pgTable(
  "media_staff_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stripeConnectAccountId: varchar("stripe_connect_account_id", {
      length: 255,
    }),
    preferredRateType: rateTypeEnum("preferred_rate_type"),
    preferredRateCents: integer("preferred_rate_cents"),
    serviceLocationIds: uuid("service_location_ids").array(),
    active: boolean("active").default(true).notNull(),
    onboardedAt: timestamp("onboarded_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    orgIdx: index("media_staff_profiles_org_idx").on(t.organizationId),
  })
);

// --- media_audit_log ---

export const mediaAuditLog = pgTable(
  "media_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    entityType: auditEntityEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: auditActionEnum("action").notNull(),
    diff: jsonb("diff"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    entityIdx: index("media_audit_log_entity_idx").on(t.entityType, t.entityId),
    actorIdx: index("media_audit_log_actor_idx").on(t.actorUserId),
  })
);

// --- Relations ---

export const shootSessionsRelations = relations(shootSessions, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [shootSessions.organizationId],
    references: [organizations.id],
  }),
  location: one(locations, {
    fields: [shootSessions.locationId],
    references: [locations.id],
  }),
  game: one(games, {
    fields: [shootSessions.gameId],
    references: [games.id],
  }),
  venue: one(venues, {
    fields: [shootSessions.venueId],
    references: [venues.id],
  }),
  assignedUser: one(users, {
    fields: [shootSessions.assignedUserId],
    references: [users.id],
    relationName: "shootAssignedUser",
  }),
  assignedByUser: one(users, {
    fields: [shootSessions.assignedByUserId],
    references: [users.id],
    relationName: "shootAssignedByUser",
  }),
  assets: many(mediaAssets),
}));

export const mediaAssetsRelations = relations(mediaAssets, ({ one, many }) => ({
  session: one(shootSessions, {
    fields: [mediaAssets.shootSessionId],
    references: [shootSessions.id],
  }),
  organization: one(organizations, {
    fields: [mediaAssets.organizationId],
    references: [organizations.id],
  }),
  tags: many(mediaTags),
}));

export const mediaStaffProfilesRelations = relations(mediaStaffProfiles, ({ one }) => ({
  user: one(users, {
    fields: [mediaStaffProfiles.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [mediaStaffProfiles.organizationId],
    references: [organizations.id],
  }),
}));

export const mediaAuditLogRelations = relations(mediaAuditLog, ({ one }) => ({
  actor: one(users, {
    fields: [mediaAuditLog.actorUserId],
    references: [users.id],
  }),
}));

// --- Type exports ---

export type ShootSession = typeof shootSessions.$inferSelect;
export type NewShootSession = typeof shootSessions.$inferInsert;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;
export type MediaStaffProfile = typeof mediaStaffProfiles.$inferSelect;
export type NewMediaStaffProfile = typeof mediaStaffProfiles.$inferInsert;
export type MediaAuditLog = typeof mediaAuditLog.$inferSelect;
export type NewMediaAuditLog = typeof mediaAuditLog.$inferInsert;

// --- Phase 2: media_tags ---

export const tagScopeEnum = pgEnum("media_tag_scope", [
  "player", "team", "both_teams",
]);

export const tagSourceEnum = pgEnum("media_tag_source", [
  "manual_staff", "manual_offshore", "manual_admin",
  "auto_jersey_ocr", "auto_face", "burst_propagated",
]);

export const mediaTags = pgTable(
  "media_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaAssetId: uuid("media_asset_id").notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    familyMemberId: uuid("family_member_id").references(
      () => familyMembers.id, { onDelete: "cascade" }
    ),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    tagScope: tagScopeEnum("tag_scope").notNull(),
    source: tagSourceEnum("source").notNull(),
    confidence: decimal("confidence", { precision: 3, scale: 2 })
      .notNull().default("1.00"),
    taggedByUserId: uuid("tagged_by_user_id").notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    uniqPlayerTag: uniqueIndex("media_tags_unique_player")
      .on(t.mediaAssetId, t.familyMemberId)
      .where(sql`${t.familyMemberId} IS NOT NULL`),
    uniqTeamTag: uniqueIndex("media_tags_unique_team")
      .on(t.mediaAssetId, t.teamId)
      .where(sql`${t.teamId} IS NOT NULL AND ${t.familyMemberId} IS NULL`),
    assetIdx: index("media_tags_asset_idx").on(t.mediaAssetId),
    familyMemberIdx: index("media_tags_family_member_idx").on(t.familyMemberId),
    teamIdx: index("media_tags_team_idx").on(t.teamId),
  })
);

export const mediaTagsRelations = relations(mediaTags, ({ one }) => ({
  asset: one(mediaAssets, {
    fields: [mediaTags.mediaAssetId], references: [mediaAssets.id],
  }),
  familyMember: one(familyMembers, {
    fields: [mediaTags.familyMemberId], references: [familyMembers.id],
  }),
  team: one(teams, {
    fields: [mediaTags.teamId], references: [teams.id],
  }),
  taggedBy: one(users, {
    fields: [mediaTags.taggedByUserId], references: [users.id],
  }),
}));

export type MediaTag = typeof mediaTags.$inferSelect;
export type NewMediaTag = typeof mediaTags.$inferInsert;
