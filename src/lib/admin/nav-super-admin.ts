// src/lib/admin/nav-super-admin.ts
import {
  Home,
  Inbox,
  Calendar,
  Dumbbell,
  Zap,
  Key,
  Send,
  Search,
  Users,
  RefreshCcw,
  CreditCard,
  Tag,
  ShoppingBag,
  MapPin,
  Palette,
  Gem,
  BookOpen,
  ShieldCheck,
  Settings,
  BarChart3,
  type LucideIcon,
  CalendarDays,
  TrendingDown,
} from "lucide-react";

export type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  badgeKey?: "inbox" | "refundsPending" | "attention";
};

export type NavGroup = {
  name: string | null; // null = ungrouped top section
  items: NavItem[];
};

export const SUPER_ADMIN_NAV: NavGroup[] = [
  {
    name: null,
    items: [
      { name: "Home", href: "/admin", icon: Home },
      { name: "Inbox", href: "/messages", icon: Inbox, badgeKey: "inbox" },
    ],
  },
  {
    name: "Plan",
    items: [
      { name: "Venue calendar", href: "/admin/venue", icon: CalendarDays },
      { name: "Seasons", href: "/admin/seasons", icon: Calendar },
      { name: "Programs", href: "/admin/programs", icon: Dumbbell },
      { name: "Drop-ins", href: "/admin/dropins", icon: Zap },
      { name: "Drop League", href: "/admin/drop-league", icon: TrendingDown },
      { name: "Rentals", href: "/admin/rentals", icon: Key },
      { name: "Memberships", href: "/admin/memberships", icon: Gem },
      { name: "Campaigns", href: "/admin/campaigns", icon: Send },
    ],
  },
  {
    name: "People",
    items: [
      { name: "Look up", href: "/admin/lookup", icon: Search },
      { name: "Users & staff", href: "/admin/users", icon: Users },
    ],
  },
  {
    name: "Money",
    items: [
      { name: "Refunds", href: "/admin/refunds", icon: RefreshCcw, badgeKey: "refundsPending" },
      { name: "Payments", href: "/admin/payments", icon: CreditCard },
      { name: "Discount codes", href: "/admin/discount-codes", icon: Tag },
      { name: "Gear", href: "/admin/gear", icon: ShoppingBag },
    ],
  },
  {
    name: "Setup",
    items: [
      { name: "Locations & venues", href: "/admin/locations", icon: MapPin },
      { name: "Branding", href: "/admin/branding", icon: Palette },
      { name: "Curriculum", href: "/admin/curriculum", icon: BookOpen },
      { name: "Compliance", href: "/admin/compliance", icon: ShieldCheck },
      { name: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
  {
    name: "Reports",
    items: [
      { name: "Revenue", href: "/admin/reports/revenue", icon: BarChart3 },
      { name: "Registrations", href: "/admin/reports/registrations", icon: BarChart3 },
      // Conversion analytics live in PostHog — funnel queries don't have
      // a backing route or component here yet. Add this entry back once
      // the funnel API + chart component land.
    ],
  },
];
