import {
  Calendar,
  ClipboardCheck,
  UserPlus,
  Inbox,
  Search,
  Users2,
  Megaphone,
  ListOrdered,
  BarChart3,
  RefreshCcw,
} from "lucide-react";
import type { NavGroup } from "./nav-super-admin";

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
      { name: "Rosters", href: "/admin/venue/rosters", icon: Users2 },
      { name: "Announcements", href: "/admin/announcements", icon: Megaphone },
      { name: "Waitlist", href: "/admin/waitlist", icon: ListOrdered },
    ],
  },
  {
    name: null,
    items: [
      { name: "Reports", href: "/admin/reports/venue", icon: BarChart3 },
      { name: "Refund requests", href: "/admin/refund-requests", icon: RefreshCcw },
    ],
  },
];
