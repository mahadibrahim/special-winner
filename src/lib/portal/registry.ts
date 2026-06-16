import {
  ShieldCheck,
  Building2,
  Flag,
  Camera,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import { SUPER_ADMIN_NAV, type NavGroup } from "@/lib/admin/nav-super-admin";
import { VENUE_MANAGER_NAV } from "@/lib/admin/nav-venue-manager";
import { COACH_NAV } from "@/lib/admin/nav-coach";
import { MEDIA_NAV } from "@/lib/admin/nav-media";
import { REFEREE_NAV } from "@/lib/admin/nav-referee";
import type { RoleName } from "@/lib/auth/roles";

export type PortalId = "admin" | "venue" | "coach" | "media" | "referee";

export type Portal = {
  id: PortalId;
  label: string;
  icon: LucideIcon;
  basePath: string;
  homeHref: string;
  roles: RoleName[];
  /** Hidden from resolution until its pages exist. */
  available: boolean;
  nav: NavGroup[];
};

export const PORTALS: Portal[] = [
  {
    id: "admin",
    label: "Admin",
    icon: ShieldCheck,
    basePath: "/admin",
    homeHref: "/admin",
    roles: ["super_admin"],
    available: true,
    nav: SUPER_ADMIN_NAV,
  },
  {
    id: "venue",
    label: "Venue manager",
    icon: Building2,
    basePath: "/admin",
    homeHref: "/admin/venue",
    roles: ["location_admin"],
    available: true,
    nav: VENUE_MANAGER_NAV,
  },
  {
    id: "coach",
    label: "Coach",
    icon: Flag,
    basePath: "/coach",
    homeHref: "/coach",
    roles: ["coach"],
    available: true,
    nav: COACH_NAV,
  },
  {
    id: "media",
    label: "Media",
    icon: Camera,
    basePath: "/media",
    homeHref: "/media/jobs",
    roles: ["media_staff", "media_editor"],
    available: true,
    nav: MEDIA_NAV,
  },
  {
    id: "referee",
    label: "Referee",
    icon: ClipboardCheck,
    basePath: "/referee",
    homeHref: "/referee",
    roles: ["referee"],
    available: true,
    nav: REFEREE_NAV,
  },
];
