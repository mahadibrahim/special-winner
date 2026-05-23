"use client";

import { cn } from "@/lib/utils";

interface Props {
  active: "family" | "play";
  hasFamily: boolean;
  hasPlay: boolean;
}

export function DestinationTabs({ active, hasFamily, hasPlay }: Props) {
  if (!hasFamily || !hasPlay) return null;

  return (
    <nav
      aria-label="Dashboard destination"
      className="flex gap-1 p-1 bg-cream-2 rounded-lg w-fit mb-8"
    >
      <a
        href="/dashboard/family"
        aria-current={active === "family" ? "page" : undefined}
        className={cn(
          "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
          active === "family"
            ? "bg-paper text-ink shadow-sm"
            : "text-ink-muted hover:text-ink hover:bg-cream-3",
        )}
      >
        Family
      </a>
      <a
        href="/dashboard/play"
        aria-current={active === "play" ? "page" : undefined}
        className={cn(
          "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
          active === "play"
            ? "bg-paper text-ink shadow-sm"
            : "text-ink-muted hover:text-ink hover:bg-cream-3",
        )}
      >
        My Play
      </a>
    </nav>
  );
}
