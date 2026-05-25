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

// Two earlier nav entries — "Rosters" → /admin/venue/rosters and
// "Reports" → /admin/reports/venue — pointed at routes that don't exist.
// They've been dropped from the sidebar; the work to build venue-scoped
// rosters and reports surfaces lives in the launch-readiness backlog
// (see docs/post-launch-backlog-dnd.md → "Venue-manager surface").
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
