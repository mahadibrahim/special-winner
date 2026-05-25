import {
  Calendar,
  ClipboardCheck,
  UserPlus,
  Inbox,
  Search,
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
//   - "Announcements" → /admin/announcements (no per-location data
//      model; backlog #26 dropped it pending a schema-level "scope"
//      concept on announcement rows)
export const VENUE_MANAGER_NAV: NavGroup[] = [
  {
    name: null,
    items: [
      { name: "Venue Day", href: "/admin/venue", icon: Calendar },
      { name: "Check-in", href: "/admin/venue/check-in", icon: ClipboardCheck },
      { name: "Walk-up reg", href: "/admin/venue/walk-up", icon: UserPlus },
    ],
  },
  {
    name: null,
    items: [
      { name: "Inbox", href: "/messages", icon: Inbox, badgeKey: "inbox" },
      { name: "Look up", href: "/admin/lookup", icon: Search },
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
