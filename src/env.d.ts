/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { Organization, Location, OrganizationSettings, OrganizationFeatures } from "./lib/db/schema/organizations";
import type { UserRole } from "./lib/auth/roles";
import type { UserAttributes } from "./lib/auth/types";
import type { BrandProfile } from "./lib/branding/resolver";
import type { BrandId } from "./lib/branding/themes";

interface SessionAttributes {
  id: string;
  userId: string;
  expiresAt: Date;
}

declare global {
  namespace App {
    interface Locals {
      user: UserAttributes | null;
      session: SessionAttributes | null;
      organization: Organization | null;
      currentLocation: Location | null;
      userRoles: UserRole[];
      isAdmin: boolean;
      isCoach: boolean;
      brand: BrandProfile | null;
      brandId: BrandId;
      // Active venue pinned by the admin via the venue picker. Always
      // validated against the caller's scope in middleware — a cookie
      // value that doesn't belong to a location the user can access is
      // discarded (treated as if no venue is pinned). null means
      // "no pin", i.e. show every location the user is scoped to.
      activeLocationId: string | null;
    }
  }
}

export {};
