import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  decimal,
  jsonb,
  integer,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// ============================================
// ENUMS
// ============================================

export const organizationStatusEnum = pgEnum("organization_status", [
  "active",
  "pending",
  "suspended",
  "inactive",
]);

export const organizationTypeEnum = pgEnum("organization_type", [
  "headquarters",
  "franchise",
  "subsidiary",
  "partner",
]);

export const relationshipTypeEnum = pgEnum("relationship_type", [
  "franchise",
  "subsidiary",
  "partner",
  "white_label",
]);

export const domainStatusEnum = pgEnum("domain_status", [
  "pending",
  "active",
  "ssl_pending",
  "ssl_active",
  "failed",
]);

export const resourceTypeEnum = pgEnum("resource_type", [
  "sport",
  "age_group",
  "waiver_template",
  "email_template",
  "pricing_rule",
]);

export const orgAccessRoleEnum = pgEnum("org_access_role", [
  "owner",
  "admin",
  "manager",
  "staff",
  "coach",
  "parent",
]);

// ============================================
// ORGANIZATIONS TABLE
// ============================================

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Basic info
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).unique().notNull(),
  legalName: varchar("legal_name", { length: 255 }),
  description: text("description"),

  // Type and status
  organizationType: organizationTypeEnum("organization_type").default("franchise").notNull(),
  status: organizationStatusEnum("status").default("pending").notNull(),

  // Branding
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),

  // Contact
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  website: varchar("website", { length: 255 }),

  // Address (for legal/billing purposes)
  addressLine1: varchar("address_line1", { length: 255 }),
  addressLine2: varchar("address_line2", { length: 255 }),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  postalCode: varchar("postal_code", { length: 20 }),
  country: varchar("country", { length: 50 }).default("US"),

  // Timezone for this organization
  timezone: varchar("timezone", { length: 50 }).default("America/New_York"),

  // Stripe Connect integration
  stripeAccountId: varchar("stripe_account_id", { length: 255 }),
  stripeAccountStatus: varchar("stripe_account_status", { length: 50 }),
  stripeOnboardingComplete: boolean("stripe_onboarding_complete").default(false),

  // Settings (jsonb for flexibility)
  settings: jsonb("settings").$type<OrganizationSettings>(),

  // Feature flags
  features: jsonb("features").$type<OrganizationFeatures>(),

  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  onboardedAt: timestamp("onboarded_at"),
});

// ============================================
// ORGANIZATION RELATIONSHIPS (Franchise Hierarchy)
// ============================================

export const organizationRelationships = pgTable("organization_relationships", {
  id: uuid("id").primaryKey().defaultRandom(),

  parentOrgId: uuid("parent_org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  childOrgId: uuid("child_org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  relationshipType: relationshipTypeEnum("relationship_type").notNull(),

  // Revenue sharing (franchise fees)
  revenueSharePercent: decimal("revenue_share_percent", { precision: 5, scale: 2 }),
  flatFeeMonthly: integer("flat_fee_monthly"), // cents

  // Agreement details
  agreementStartDate: timestamp("agreement_start_date"),
  agreementEndDate: timestamp("agreement_end_date"),

  // Status
  active: boolean("active").default(true).notNull(),

  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueRelationship: unique().on(table.parentOrgId, table.childOrgId),
}));

// ============================================
// LOCATIONS TABLE
// ============================================

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),

  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  // Basic info
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull(),
  description: text("description"),

  // Address
  addressLine1: varchar("address_line1", { length: 255 }),
  addressLine2: varchar("address_line2", { length: 255 }),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 50 }),
  postalCode: varchar("postal_code", { length: 20 }),
  country: varchar("country", { length: 50 }).default("US"),

  // Geolocation
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),

  // Contact
  timezone: varchar("timezone", { length: 50 }).default("America/New_York"),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 255 }),

  // Settings (can override org settings)
  settings: jsonb("settings").$type<LocationSettings>(),

  // Status
  active: boolean("active").default(true).notNull(),

  // Display order
  sortOrder: integer("sort_order").default(0),

  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueOrgSlug: unique().on(table.organizationId, table.slug),
}));

// ============================================
// DOMAIN MAPPINGS
// ============================================

export const domainMappings = pgTable("domain_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Domain
  domain: varchar("domain", { length: 255 }).unique().notNull(),

  // Can be org-level or location-level
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  locationId: uuid("location_id")
    .references(() => locations.id, { onDelete: "cascade" }),

  // Status
  isPrimary: boolean("is_primary").default(false).notNull(),
  status: domainStatusEnum("status").default("pending").notNull(),

  // SSL
  sslCertificateId: varchar("ssl_certificate_id", { length: 255 }),
  sslExpiresAt: timestamp("ssl_expires_at"),

  // Verification
  verificationToken: varchar("verification_token", { length: 255 }),
  verifiedAt: timestamp("verified_at"),

  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================
// RESOURCE TEMPLATES (Shareable across franchises)
// ============================================

export const resourceTemplates = pgTable("resource_templates", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Owner (usually HQ)
  ownerOrgId: uuid("owner_org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  // Type and name
  resourceType: resourceTypeEnum("resource_type").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),

  // The actual template content
  config: jsonb("config").notNull(),

  // Sharing settings
  isPublic: boolean("is_public").default(false).notNull(), // Available to all child orgs
  isRequired: boolean("is_required").default(false).notNull(), // Must be used by child orgs

  // Version control
  version: integer("version").default(1).notNull(),

  // Status
  active: boolean("active").default(true).notNull(),

  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================
// USER ORGANIZATION ACCESS
// ============================================

export const userOrganizationAccess = pgTable("user_organization_access", {
  id: uuid("id").primaryKey().defaultRandom(),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),

  // Optional: specific location access within org
  locationId: uuid("location_id")
    .references(() => locations.id, { onDelete: "cascade" }),

  // Role within this organization
  role: orgAccessRoleEnum("role").notNull(),

  // Permissions override (jsonb for flexibility)
  permissions: jsonb("permissions").$type<string[]>(),

  // Status
  active: boolean("active").default(true).notNull(),

  // Invitation tracking
  invitedAt: timestamp("invited_at"),
  acceptedAt: timestamp("accepted_at"),
  invitedBy: uuid("invited_by").references(() => users.id),

  // Metadata
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  uniqueUserOrgLocation: unique().on(table.userId, table.organizationId, table.locationId),
}));

// ============================================
// RELATIONS
// ============================================

export const organizationsRelations = relations(organizations, ({ many }) => ({
  locations: many(locations),
  domainMappings: many(domainMappings),
  resourceTemplates: many(resourceTemplates),
  userAccess: many(userOrganizationAccess),
  childRelationships: many(organizationRelationships, { relationName: "parentOrg" }),
  parentRelationships: many(organizationRelationships, { relationName: "childOrg" }),
}));

export const organizationRelationshipsRelations = relations(organizationRelationships, ({ one }) => ({
  parentOrg: one(organizations, {
    fields: [organizationRelationships.parentOrgId],
    references: [organizations.id],
    relationName: "parentOrg",
  }),
  childOrg: one(organizations, {
    fields: [organizationRelationships.childOrgId],
    references: [organizations.id],
    relationName: "childOrg",
  }),
}));

export const locationsRelations = relations(locations, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [locations.organizationId],
    references: [organizations.id],
  }),
  domainMappings: many(domainMappings),
  userAccess: many(userOrganizationAccess),
}));

export const domainMappingsRelations = relations(domainMappings, ({ one }) => ({
  organization: one(organizations, {
    fields: [domainMappings.organizationId],
    references: [organizations.id],
  }),
  location: one(locations, {
    fields: [domainMappings.locationId],
    references: [locations.id],
  }),
}));

export const resourceTemplatesRelations = relations(resourceTemplates, ({ one }) => ({
  ownerOrg: one(organizations, {
    fields: [resourceTemplates.ownerOrgId],
    references: [organizations.id],
  }),
}));

export const userOrganizationAccessRelations = relations(userOrganizationAccess, ({ one }) => ({
  user: one(users, {
    fields: [userOrganizationAccess.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [userOrganizationAccess.organizationId],
    references: [organizations.id],
  }),
  location: one(locations, {
    fields: [userOrganizationAccess.locationId],
    references: [locations.id],
  }),
  inviter: one(users, {
    fields: [userOrganizationAccess.invitedBy],
    references: [users.id],
  }),
}));

// ============================================
// TYPE DEFINITIONS
// ============================================

// External store (spirit wear / merchandise) link-out config
export interface OrganizationExternalStore {
  url: string;
  label: string;
  partnerName: "Squadlocker" | "BSN" | "Custom Ink" | "Other";
}

// Organization settings (stored in jsonb)
export interface OrganizationSettings {
  branding: {
    primaryColor: string;
    secondaryColor?: string;
    accentColor?: string;
    backgroundColor?: string;
    textColor?: string;
    fontFamily?: string;
    headerFontFamily?: string;
    borderRadius?: string;
    logoUrl?: string;
    faviconUrl?: string;
    socialImageUrl?: string;
  };
  contact: {
    supportEmail?: string;
    supportPhone?: string;
    billingEmail?: string;
  };
  social?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    youtube?: string;
    tiktok?: string;
  };
  payments: {
    currency: string;
    platformFeePercent?: number;
    minimumDeposit?: number; // cents
    paymentMethods?: string[];
    refundPolicy?: string;
  };
  registration: {
    requireWaiver?: boolean;
    requireMedicalInfo?: boolean;
    requireEmergencyContact?: boolean;
    customFields?: Array<{
      name: string;
      label: string;
      type: "text" | "textarea" | "select" | "checkbox" | "date";
      required: boolean;
      options?: string[];
    }>;
  };
  notifications: {
    sendWelcomeEmail?: boolean;
    sendRegistrationConfirmation?: boolean;
    sendPaymentReceipts?: boolean;
    sendScheduleReminders?: boolean;
  };
  seo?: {
    title?: string;
    description?: string;
    keywords?: string[];
  };
  externalStore?: OrganizationExternalStore;
}

// Organization features (feature flags)
export interface OrganizationFeatures {
  enableDeposits?: boolean;
  enableWaivers?: boolean;
  enableTeamManagement?: boolean;
  enableCoachPortal?: boolean;
  enablePlayerPortal?: boolean;
  enableOnlinePayments?: boolean;
  enableScheduling?: boolean;
  enableStandings?: boolean;
  enableEmailMarketing?: boolean;
  enableSMS?: boolean;
  enableCustomDomain?: boolean;
  maxLocations?: number;
  maxUsersPerLocation?: number;
}

// Location settings (can override org settings)
export interface LocationSettings {
  branding?: Partial<OrganizationSettings["branding"]>;
  contact?: {
    email?: string;
    phone?: string;
  };
  hours?: {
    monday?: { open: string; close: string } | null;
    tuesday?: { open: string; close: string } | null;
    wednesday?: { open: string; close: string } | null;
    thursday?: { open: string; close: string } | null;
    friday?: { open: string; close: string } | null;
    saturday?: { open: string; close: string } | null;
    sunday?: { open: string; close: string } | null;
  };
  amenities?: string[];
  notes?: string;
  externalStore?: OrganizationExternalStore;
}

// ============================================
// TYPE EXPORTS
// ============================================

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type OrganizationRelationship = typeof organizationRelationships.$inferSelect;
export type NewOrganizationRelationship = typeof organizationRelationships.$inferInsert;
export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
export type DomainMapping = typeof domainMappings.$inferSelect;
export type NewDomainMapping = typeof domainMappings.$inferInsert;
export type ResourceTemplate = typeof resourceTemplates.$inferSelect;
export type NewResourceTemplate = typeof resourceTemplates.$inferInsert;
export type UserOrganizationAccess = typeof userOrganizationAccess.$inferSelect;
export type NewUserOrganizationAccess = typeof userOrganizationAccess.$inferInsert;
