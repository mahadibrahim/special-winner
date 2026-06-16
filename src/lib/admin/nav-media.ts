import { Image, ListChecks, History } from "lucide-react";
import type { NavGroup, NavItem } from "./nav-super-admin";

const MY_JOBS: NavItem = { name: "My jobs", href: "/media/jobs", icon: Image };
const TAGGING_QUEUE: NavItem = { name: "Tagging queue", href: "/media/queue", icon: ListChecks, badgeKey: "mediaQueue" };
const HISTORY: NavItem = { name: "History", href: "/media/history", icon: History };

// Full media nav — used by the registry so the orphan-guard covers every page.
export const MEDIA_NAV: NavGroup[] = [{ name: null, items: [MY_JOBS, TAGGING_QUEUE, HISTORY] }];

// Role-filtered view rendered by MediaLayout. The two sub-roles do different
// work: media_staff shoot (jobs), media_editor tag (queue); History is shared.
export function getMediaNav(roleNames: string[]): NavGroup[] {
  const isStaff = roleNames.includes("media_staff");
  const isEditor = roleNames.includes("media_editor");
  const items: NavItem[] = [];
  if (isStaff) items.push(MY_JOBS);
  if (isEditor) items.push(TAGGING_QUEUE);
  items.push(HISTORY);
  return [{ name: null, items }];
}
