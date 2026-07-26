// src/lib/admin/nav-super-admin.ts
import {
  Home,
  Inbox,
  CalendarDays,
  Calendar,
  Dumbbell,
  Trophy,
  Shield,
  ClipboardList,
  Baby,
  Activity,
  Zap,
  TrendingDown,
  Key,
  Gem,
  Send,
  Radio,
  Megaphone,
  RefreshCcw,
  Search,
  Users,
  FileText,
  CreditCard,
  Tag,
  ShoppingBag,
  Store,
  Camera,
  UserCog,
  Tags,
  MapPin,
  Palette,
  BookOpen,
  ShieldCheck,
  Settings,
  LayoutDashboard,
  BarChart3,
  Smile,
  Star,
  DollarSign,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  badgeKey?: "inbox" | "refundsPending" | "attention" | "mediaQueue" | "reportsOwed" | "assessmentsDue";
};

export type NavGroup = {
  name: string | null; // null = ungrouped top section
  items: NavItem[];
};

export const SUPER_ADMIN_NAV: NavGroup[] = [
  {
    name: null,
    items: [
      { name: "Home", href: "/admin", icon: Home, badgeKey: "attention" },
      { name: "Inbox", href: "/messages", icon: Inbox, badgeKey: "inbox" },
    ],
  },
  {
    name: "Plan & Program",
    items: [
      { name: "Command center", href: "/admin/venue", icon: CalendarDays },
      { name: "Seasons", href: "/admin/seasons", icon: Calendar },
      { name: "Programs", href: "/admin/programs", icon: Dumbbell },
      { name: "Games", href: "/admin/games", icon: Trophy },
      { name: "Teams", href: "/admin/teams", icon: Shield },
      { name: "Registrations", href: "/admin/registrations", icon: ClipboardList },
      { name: "Age groups", href: "/admin/age-groups", icon: Baby },
      { name: "Game day", href: "/admin/game-day/today", icon: Activity },
    ],
  },
  {
    name: "Casual play",
    items: [
      { name: "Manage Pickup and Hosts", href: "/admin/dropins", icon: Zap },
      { name: "Drop League", href: "/admin/drop-league", icon: TrendingDown },
      { name: "Rentals", href: "/admin/rentals", icon: Key },
      { name: "Memberships", href: "/admin/memberships", icon: Gem },
    ],
  },
  {
    name: "Marketing",
    items: [
      { name: "Campaigns", href: "/admin/campaigns", icon: Send },
      { name: "Broadcasts", href: "/admin/broadcasts", icon: Radio },
      { name: "Announcements", href: "/admin/announcements", icon: Megaphone },
      { name: "Re-registration", href: "/admin/re-registration-campaign", icon: RefreshCcw },
    ],
  },
  {
    name: "People",
    items: [
      { name: "Look up", href: "/admin/lookup", icon: Search },
      { name: "Users & staff", href: "/admin/users", icon: Users },
      { name: "Applications", href: "/admin/applications", icon: FileText },
      { name: "Coach compliance", href: "/admin/coaches", icon: ShieldCheck },
    ],
  },
  {
    name: "Money",
    items: [
      { name: "Refunds", href: "/admin/refunds", icon: RefreshCcw, badgeKey: "refundsPending" },
      { name: "Payments", href: "/admin/payments", icon: CreditCard },
      { name: "Discount codes", href: "/admin/discount-codes", icon: Tag },
      { name: "Gear", href: "/admin/gear", icon: ShoppingBag },
      { name: "Shop", href: "/admin/merch", icon: Store },
      { name: "Stores", href: "/admin/merch/stores", icon: Store },
    ],
  },
  {
    name: "Media",
    items: [
      { name: "Shoots", href: "/admin/media/shoots", icon: Camera },
      { name: "Media staff", href: "/admin/media/staff", icon: UserCog },
      { name: "Tag queue", href: "/admin/media/tag-queue", icon: Tags },
    ],
  },
  {
    name: "Setup",
    items: [
      { name: "Locations & spaces", href: "/admin/locations", icon: MapPin },
      { name: "Branding", href: "/admin/branding", icon: Palette },
      { name: "Curriculum", href: "/admin/curriculum", icon: BookOpen },
      { name: "Compliance", href: "/admin/compliance", icon: ShieldCheck },
      { name: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
  {
    name: "Reports",
    items: [
      { name: "Overview", href: "/admin/reports", icon: LayoutDashboard },
      { name: "Revenue", href: "/admin/reports/revenue", icon: BarChart3 },
      { name: "Registration trends", href: "/admin/reports/registrations", icon: BarChart3 },
      { name: "NPS", href: "/admin/reports/nps", icon: Smile },
      { name: "Referee ratings", href: "/admin/reports/referee-ratings", icon: Star },
      { name: "Payroll export", href: "/admin/reports/payroll", icon: DollarSign },
    ],
  },
];
