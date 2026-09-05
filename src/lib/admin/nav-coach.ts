import {
  Home,
  Users,
  GraduationCap,
  ClipboardList,
  BookOpen,
  Calendar,
  Inbox,
  Layers,
} from "lucide-react";
import type { NavGroup } from "./nav-super-admin";

// Coach sidebar. Hybrid IA: team-scoped work (roster/attendance/assess) funnels
// through "My Teams"; global tools stay flat. The team-scoped + player-scoped
// pages are dynamic drill-ins reached from My Teams, so they are not nav items.
// "My Classes" (Task 5 of the coach-classes plan) sits alongside "My Teams" —
// both are "pick one of my assigned groups" list pages that drill into a
// roster/session detail, same IA shape.
export const COACH_NAV: NavGroup[] = [
  {
    name: null,
    items: [{ name: "Home", href: "/coach", icon: Home }],
  },
  {
    name: "Teams",
    items: [
      { name: "My Teams", href: "/coach/teams", icon: Users },
      { name: "My Classes", href: "/coach/classes", icon: Layers },
    ],
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
    ],
  },
  {
    name: "Comms",
    items: [{ name: "Messages", href: "/coach/messages", icon: Inbox, badgeKey: "inbox" }],
  },
];
