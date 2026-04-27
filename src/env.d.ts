/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { Organization, Location, OrganizationSettings, OrganizationFeatures } from "./lib/db/schema/organizations";
import type { UserRole } from "./lib/auth/roles";

interface UserAttributes {
  id: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  avatarUrl: string | null;
  phone?: string | null;
}

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
    }
  }
}

export {};
