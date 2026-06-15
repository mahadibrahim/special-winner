import {
  Calendar,
  ClipboardCheck,
  UserPlus,
  Search,
  Inbox,
  Megaphone,
  ListOrdered,
  RefreshCcw,
  ClipboardList,
} from "lucide-react";
import type { NavGroup } from "./nav-super-admin";

// Venue-manager sidebar. Every item's data is scoped to the manager's locations
// via getEffectiveLocationIds. Grouped for scanability; Casual play / Rosters /
// Reports items are added by sub-project-2 Tasks 2–4 as their pages land.
export const VENUE_MANAGER_NAV: NavGroup[] = [
  {
    name: "Front desk",
    items: [
      { name: "Venue calendar", href: "/admin/venue", icon: Calendar },
      { name: "Check-in", href: "/admin/venue/check-in", icon: ClipboardCheck },
      { name: "Walk-up reg", href: "/admin/venue/walk-up", icon: UserPlus },
    ],
  },
  {
    name: "People",
    items: [
      { name: "Look up", href: "/admin/lookup", icon: Search },
      { name: "Rosters", href: "/admin/venue/rosters", icon: ClipboardList },
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
];
