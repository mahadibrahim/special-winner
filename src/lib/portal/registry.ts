import {
  ShieldCheck,
  Building2,
  Flag,
  Camera,
  Image,
  History,
  type LucideIcon,
} from "lucide-react";
import { SUPER_ADMIN_NAV, type NavGroup } from "@/lib/admin/nav-super-admin";
import { VENUE_MANAGER_NAV } from "@/lib/admin/nav-venue-manager";
import { COACH_NAV } from "@/lib/admin/nav-coach";
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

const MEDIA_NAV: NavGroup[] = [
  {
    name: null,
    items: [
      { name: "My jobs", href: "/media/jobs", icon: Image },
      { name: "History", href: "/media/history", icon: History },
    ],
  },
];

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
    icon: Flag,
    basePath: "/referee",
    homeHref: "/referee",
    roles: ["referee"],
    available: false,
    nav: [],
  },
];
