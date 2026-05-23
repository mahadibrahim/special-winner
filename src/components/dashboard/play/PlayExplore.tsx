"use client";

import { Trophy, MapPin, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ExploreCard } from "@/components/dashboard/shell/ExploreCard";

interface CardDef {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  cta: string;
  variant?: "default" | "cross-sell";
}

const cards: CardDef[] = [
  {
    icon: Trophy,
    title: "Adult leagues",
    description: "7v7 co-ed soccer and upcoming flag football. Register your team or join as a free agent.",
    href: "/programs?audience=adult",
    cta: "Browse adult leagues",
  },
  {
    icon: MapPin,
    title: "Book a field",
    description: "Reserve a field for a private pickup game, practice, or corporate event.",
    href: "/rentals",
    cta: "Book a field",
  },
  {
    icon: Star,
    title: "Kids' camp at Worthington",
    description: "Youth soccer camps and classes for ages 4–14 at our Worthington location.",
    href: "/programs?audience=youth",
    cta: "See youth programs",
    variant: "cross-sell",
  },
];

export default function PlayExplore() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <ExploreCard
          key={card.href}
          icon={card.icon}
          title={card.title}
          description={card.description}
          href={card.href}
          cta={card.cta}
          variant={card.variant}
        />
      ))}
    </div>
  );
}
