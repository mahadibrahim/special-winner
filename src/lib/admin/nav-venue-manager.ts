import {
  Calendar,
  Search,
  Inbox,
  Megaphone,
  ListOrdered,
  RefreshCcw,
  ClipboardList,
  BarChart3,
  Zap,
  Key,
  FileText,
  ShieldCheck,
} from "lucide-react";
import type { NavGroup } from "./nav-super-admin";

// Venue-manager sidebar. Every item's data is scoped to the manager's locations
// via getEffectiveLocationIds. Grouped for scanability; Casual play / Rosters /
// Reports items are added by sub-project-2 Tasks 2–4 as their pages land.
//
// Check-in and walk-up registration used to be separate nav entries pointing
// at their own pages. Both flows now live inside the command center
// (/admin/venue) as panels, so Command center is the single front-desk
// entry point. The old pages still exist as 308 redirects to /admin/venue
// for bookmarks in the wild — see src/pages/admin/venue/check-in/index.astro
// and src/pages/admin/venue/walk-up.astro.
export const VENUE_MANAGER_NAV: NavGroup[] = [
  {
    name: "Front desk",
    items: [
      { name: "Command center", href: "/admin/venue", icon: Calendar },
    ],
  },
  {
    name: "Casual play",
    items: [
      { name: "Drop-ins", href: "/admin/dropins", icon: Zap },
      { name: "Rentals", href: "/admin/rentals", icon: Key },
    ],
  },
  {
    name: "People",
    items: [
      { name: "Look up", href: "/admin/lookup", icon: Search },
      { name: "Rosters", href: "/admin/venue/rosters", icon: ClipboardList },
      { name: "Applications", href: "/admin/applications", icon: FileText },
      { name: "Coach compliance", href: "/admin/coaches", icon: ShieldCheck },
    ],
  },
  {
    name: "Comms",
    items: [
      { name: "Inbox", href: "/messages", icon: Inbox, badgeKey: "inbox" },
      { name: "Announcements", href: "/admin/announcements", icon: Megaphone },
      { name: "Waitlist", href: "/admin/waitlist", icon: ListOrdered },
    ],
  },
  {
    name: "Requests",
    items: [
      { name: "Refund requests", href: "/admin/refund-requests", icon: RefreshCcw, badgeKey: "refundsPending" },
    ],
  },
  {
    name: "Reports",
    items: [{ name: "Reports", href: "/admin/venue/reports", icon: BarChart3 }],
  },
];
