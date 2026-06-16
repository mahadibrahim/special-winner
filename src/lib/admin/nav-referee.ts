import { ClipboardList, Wallet } from "lucide-react";
import type { NavGroup } from "./nav-super-admin";

export const REFEREE_NAV: NavGroup[] = [
  {
    name: null,
    items: [
      { name: "My matches", href: "/referee", icon: ClipboardList, badgeKey: "reportsOwed" },
      { name: "Pay", href: "/referee/pay", icon: Wallet },
    ],
  },
];
