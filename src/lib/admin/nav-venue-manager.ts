import {
  Calendar,
  ClipboardCheck,
  UserPlus,
  Inbox,
  Search,
  Megaphone,
  ListOrdered,
  RefreshCcw,
} from "lucide-react";
import type { NavGroup } from "./nav-super-admin";

// The venue-manager sidebar is deliberately narrow: only surfaces whose
// queries are scoped by `getLocationIdsForUser` belong here. Adding an
// item requires confirming both (a) the page filters its data to the
// manager's locations and (b) the backing API enforces the same scope.
//
// Previously removed:
//   - "Rosters" → /admin/venue/rosters (route didn't exist; backlog #25)
//   - "Reports" → /admin/reports/venue (route didn't exist; backlog #25)
//
// Announcements were removed in #26 (no per-location data model) and
// added back in #28 once `announcements.location_id` was wired up.
export const VENUE_MANAGER_NAV: NavGroup[] = [
  {
    name: null,
    items: [
      { name: "Venue calendar", href: "/admin/venue", icon: Calendar },
      { name: "Check-in", href: "/admin/venue/check-in", icon: ClipboardCheck },
      { name: "Walk-up reg", href: "/admin/venue/walk-up", icon: UserPlus },
    ],
  },
  {
    name: null,
    items: [
      { name: "Inbox", href: "/messages", icon: Inbox, badgeKey: "inbox" },
      { name: "Look up", href: "/admin/lookup", icon: Search },
      { name: "Announcements", href: "/admin/announcements", icon: Megaphone },
      { name: "Waitlist", href: "/admin/waitlist", icon: ListOrdered },
    ],
  },
  {
    name: null,
    items: [
      { name: "Refund requests", href: "/admin/refund-requests", icon: RefreshCcw },
    ],
  },
];
