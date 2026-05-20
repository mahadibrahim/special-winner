"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  index: number;
  title: string;
  accent?: "default" | "attention" | "explore";
  children: ReactNode;
}

export function DashboardSection({ index, title, accent = "default", children }: Props) {
  return (
    <section>
      <h2
        className={cn(
          "text-[11px] font-semibold tracking-[0.15em] uppercase mb-4",
          accent === "attention" && "text-ochre",
          accent === "explore" && "text-sage",
          (accent === "default" || !accent) && "text-ink-muted",
        )}
      >
        {index} · {title}
      </h2>
      {children}
    </section>
  );
}
