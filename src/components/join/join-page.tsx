"use client";

import { useEffect } from "react";
import type { BrandId } from "@/lib/branding/themes";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { track } from "@/lib/analytics/track";
import {
  joinContentFor,
  JOIN_WHATSAPP_URL,
  isConfiguredLink,
} from "@/lib/branding/join-config";
import { JoinEmailCard } from "@/components/join/join-email-card";

interface JoinPageProps {
  brand: BrandId;
  /** Flyer campaign tag from ?src= (read server-side and passed in). */
  src?: string;
}

const SOCIAL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
};

export function JoinPage({ brand, src }: JoinPageProps) {
  useHydrationBeacon();
  const content = joinContentFor(brand);

  useEffect(() => {
    track("join_page_viewed", { brand, src });
  }, [brand, src]);

  const socialEntries = Object.entries(content.socials).filter(([, url]) =>
    isConfiguredLink(url),
  ) as [string, string][];

  const whatsappReady = isConfiguredLink(JOIN_WHATSAPP_URL);

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-5 py-10"
    >
      <header className="text-center">
        <h1 className="font-display text-2xl text-ink">{content.headline}</h1>
        <p className="mt-2 text-sm text-ink-muted">{content.subcopy}</p>
      </header>

      <JoinEmailCard brand={brand} src={src} />

      {whatsappReady && (
        <a
          href={JOIN_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("join_whatsapp_click", { brand, src })}
          className="rounded-2xl border border-ink/10 bg-paper p-5 shadow-sm transition-colors hover:bg-cream"
        >
          <h2 className="font-display text-lg text-ink">💬 WhatsApp</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Quick updates &amp; reminders — tap to join the group.
          </p>
        </a>
      )}

      <div className="rounded-2xl border border-ink/10 bg-paper p-5 shadow-sm">
        <h2 className="font-display text-lg text-ink">📸 Follow us</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {socialEntries.map(([network, url]) => (
            <a
              key={network}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("join_social_click", { brand, network, src })}
              className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-cream"
            >
              {SOCIAL_LABELS[network] ?? network}
            </a>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-ink/10 bg-paper p-5 shadow-sm">
        <p className="text-sm text-ink-muted">
          Want to work the whistle instead?{" "}
          <a
            href="/careers"
            className="font-medium text-ink transition-colors hover:text-cream"
          >
            Join the crew →
          </a>
        </p>
      </div>
    </main>
  );
}

export default JoinPage;
