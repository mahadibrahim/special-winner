import {
  Home,
  Users,
  GraduationCap,
  ClipboardList,
  BookOpen,
  Calendar,
  BarChart3,
  Inbox,
} from "lucide-react";
import type { NavGroup } from "./nav-super-admin";

// Coach sidebar. Hybrid IA: team-scoped work (roster/attendance/assess) funnels
// through "My Teams"; global tools stay flat. The team-scoped + player-scoped
// pages are dynamic drill-ins reached from My Teams, so they are not nav items.
export const COACH_NAV: NavGroup[] = [
  {
    name: null,
    items: [{ name: "Home", href: "/coach", icon: Home }],
  },
  {
    name: "Teams",
    items: [{ name: "My Teams", href: "/coach/teams", icon: Users }],
  },
  {
    name: "Coaching",
    items: [
      { name: "Practices", href: "/coach/practices", icon: GraduationCap },
      { name: "Assessments", href: "/coach/assessments", icon: ClipboardList, badgeKey: "assessmentsDue" },
      { name: "Resources", href: "/coach/resources", icon: BookOpen },
    ],
  },
  {
    name: "Season",
    items: [
      { name: "Schedule", href: "/coach/schedule", icon: Calendar },
      { name: "Standings", href: "/coach/standings", icon: BarChart3 },
    ],
  },
  {
    name: "Comms",
    items: [{ name: "Messages", href: "/coach/messages", icon: Inbox, badgeKey: "inbox" }],
  },
];
