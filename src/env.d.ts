/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { Organization, Location, OrganizationSettings, OrganizationFeatures } from "./lib/db/schema/organizations";
import type { UserRole } from "./lib/auth/roles";
import type { UserAttributes } from "./lib/auth/types";
import type { BrandProfile } from "./lib/branding/resolver";

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
    }
  }
}

export {};
