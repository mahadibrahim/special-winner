"use client";

/**
 * Shared pill-link tab strip for the /admin/classes/* admin section.
 * "blocks" lands with the block-purchase task (Task 10 of the class
 * purchase ladder) — the pill is wired up ahead of that page existing, so
 * it 404s until then. That's an accepted gap for this two-task window.
 */

type ClassesAdminTab = "templates" | "packs" | "blocks";

const TABS: Array<{ key: ClassesAdminTab; label: string; href: string }> = [
  { key: "templates", label: "Templates", href: "/admin/classes" },
  { key: "packs", label: "Packs", href: "/admin/classes/packs" },
  { key: "blocks", label: "Blocks", href: "/admin/classes/blocks" },
];

export function ClassesAdminTabs({ active }: { active: ClassesAdminTab }) {
  return (
    <nav className="flex gap-2" aria-label="Classes admin sections">
      {TABS.map((tab) => (
        <a
          key={tab.key}
          href={tab.href}
          className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
            tab.key === active
              ? "bg-ink text-cream border-ink"
              : "border-border text-ink-muted hover:text-ink hover:border-ink/40"
          }`}
        >
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
