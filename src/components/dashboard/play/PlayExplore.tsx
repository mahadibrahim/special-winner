"use client";

interface ExploreCard {
  title: string;
  description: string;
  href: string;
  cta: string;
  accent?: "default" | "cross-sell";
}

const cards: ExploreCard[] = [
  {
    title: "Adult leagues",
    description: "7v7 co-ed soccer and upcoming flag football. Register your team or join as a free agent.",
    href: "/programs?audience=adult",
    cta: "Browse adult leagues",
  },
  {
    title: "Book a field",
    description: "Reserve a field for a private pickup game, practice, or corporate event.",
    href: "/rentals",
    cta: "Book a field",
  },
  {
    title: "Kids' camp at Worthington",
    description: "Youth soccer camps and classes for ages 4–14 at our Worthington location.",
    href: "/programs?audience=youth",
    cta: "See youth programs",
    accent: "cross-sell",
  },
];

export default function PlayExplore() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <a
          key={card.href}
          href={card.href}
          className={[
            "group block rounded-xl border p-5 transition-colors",
            card.accent === "cross-sell"
              ? "border-sage/30 bg-paper hover:border-sage/60"
              : "border-stone-200 bg-paper hover:border-stone-300",
          ].join(" ")}
        >
          <h3
            className={[
              "font-semibold text-sm mb-1.5",
              card.accent === "cross-sell" ? "text-sage" : "text-ink",
            ].join(" ")}
          >
            {card.title}
          </h3>
          <p className="text-xs text-ink-muted leading-relaxed mb-3">{card.description}</p>
          <span
            className={[
              "text-xs font-semibold underline",
              card.accent === "cross-sell" ? "text-sage" : "text-primary",
            ].join(" ")}
          >
            {card.cta} →
          </span>
        </a>
      ))}
    </div>
  );
}
