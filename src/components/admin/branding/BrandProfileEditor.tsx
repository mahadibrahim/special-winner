"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { toast } from "sonner";

interface ColorTokens {
  primary?: string;
  background?: string;
  text?: string;
}
interface HeroCopy {
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
}
interface BrandProfile {
  id: string;
  domain: string;
  displayName: string;
  logoMediaId: string | null;
  heroCopy: HeroCopy | null;
  colorTokens: ColorTokens | null;
  footerCopy: string | null;
  featuredVenueIds: string[];
  active: boolean;
  updatedAt: string;
}

interface VenueOption {
  id: string;
  name: string;
}

interface BrandProfileEditorProps {
  profileId: string;
}

/**
 * Inline preview pane. Renders a small homepage-hero card using the
 * current settings (title, subtitle, primary CTA, color tokens).
 */
function HeroPreview({
  displayName,
  hero,
  colors,
}: {
  displayName: string;
  hero: HeroCopy;
  colors: ColorTokens;
}) {
  const bg = colors.background ?? "#fdfaf3";
  const text = colors.text ?? "#1a1a1a";
  const primary = colors.primary ?? "#ea580c";
  return (
    <div
      className="rounded-xl border border-border overflow-hidden"
      style={{ background: bg, color: text }}
    >
      <div className="px-6 py-8">
        <div className="text-xs uppercase tracking-wider opacity-70 mb-2">
          {displayName || "Your brand"}
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
          {hero.title || "Pick-up. Drop-in. Show up."}
        </h2>
        <p className="mt-2 text-sm opacity-80 max-w-md">
          {hero.subtitle ||
            "Adult and youth pickup soccer plus drop-in classes — book a spot, show up, play."}
        </p>
        <button
          type="button"
          className="mt-4 inline-flex items-center px-4 py-2 rounded font-medium text-sm"
          style={{ background: primary, color: "white" }}
          onClick={(e) => e.preventDefault()}
        >
          {hero.ctaLabel || "Browse drop-in"}
        </button>
      </div>
    </div>
  );
}

export function BrandProfileEditor({ profileId }: BrandProfileEditorProps) {
  useHydrationBeacon();

  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [profileRes, venuesRes] = await Promise.all([
          fetch(`/api/admin/branding/${profileId}`),
          fetch("/api/admin/venues"),
        ]);
        if (!profileRes.ok) throw new Error(`profile HTTP ${profileRes.status}`);
        const profileJson = await profileRes.json();
        setProfile(profileJson.brandProfile);
        if (venuesRes.ok) {
          const v = await venuesRes.json();
          setVenues(v.venues ?? v ?? []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [profileId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/branding/${profileId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: profile.domain,
          displayName: profile.displayName,
          logoMediaId: profile.logoMediaId,
          heroCopy: profile.heroCopy,
          colorTokens: profile.colorTokens,
          footerCopy: profile.footerCopy,
          featuredVenueIds: profile.featuredVenueIds,
          active: profile.active,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Save failed");
        return;
      }
      toast.success("Saved");
      setProfile(json.brandProfile);
    } finally {
      setBusy(false);
    }
  };

  const hero = useMemo<HeroCopy>(() => profile?.heroCopy ?? {}, [profile]);
  const colors = useMemo<ColorTokens>(() => profile?.colorTokens ?? {}, [profile]);

  if (loading) return <LoadingSkeleton />;
  if (error && !profile) return <ErrorBanner message={error} />;
  if (!profile) return null;

  const updateHero = (patch: Partial<HeroCopy>) =>
    setProfile({ ...profile, heroCopy: { ...hero, ...patch } });
  const updateColors = (patch: Partial<ColorTokens>) =>
    setProfile({ ...profile, colorTokens: { ...colors, ...patch } });

  const toggleVenue = (id: string) => {
    const has = profile.featuredVenueIds.includes(id);
    setProfile({
      ...profile,
      featuredVenueIds: has
        ? profile.featuredVenueIds.filter((v) => v !== id)
        : [...profile.featuredVenueIds, id],
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6 max-w-5xl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <a
            href="/admin/branding"
            className="text-xs uppercase tracking-wider text-ink-muted hover:text-ink"
          >
            ← All profiles
          </a>
          <h1 className="text-2xl font-bold text-ink mt-2">
            {profile.displayName}
          </h1>
          <p className="text-sm text-ink-muted">{profile.domain}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={profile.active}
            onChange={(e) =>
              setProfile({ ...profile, active: e.target.checked })
            }
          />
          Active
        </label>
      </header>

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-5">
          <h2 className="font-semibold text-ink text-lg">Settings</h2>
          <div>
            <Label htmlFor="domain">Domain</Label>
            <Input
              id="domain"
              value={profile.domain}
              onChange={(e) =>
                setProfile({ ...profile, domain: e.target.value })
              }
            />
          </div>
          <div>
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={profile.displayName}
              onChange={(e) =>
                setProfile({ ...profile, displayName: e.target.value })
              }
            />
          </div>

          <h3 className="font-medium text-ink mt-4">Hero copy</h3>
          <div>
            <Label htmlFor="hero-title">Title</Label>
            <Input
              id="hero-title"
              value={hero.title ?? ""}
              onChange={(e) => updateHero({ title: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="hero-subtitle">Subtitle</Label>
            <Textarea
              id="hero-subtitle"
              rows={3}
              value={hero.subtitle ?? ""}
              onChange={(e) => updateHero({ subtitle: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="hero-cta">CTA label</Label>
            <Input
              id="hero-cta"
              value={hero.ctaLabel ?? ""}
              onChange={(e) => updateHero({ ctaLabel: e.target.value })}
            />
          </div>

          <h3 className="font-medium text-ink mt-4">Color tokens</h3>
          <div className="grid grid-cols-3 gap-3">
            {(["primary", "background", "text"] as const).map((k) => (
              <div key={k}>
                <Label htmlFor={`color-${k}`} className="capitalize">
                  {k}
                </Label>
                <div className="flex items-center gap-2">
                  <input
                    id={`color-${k}`}
                    type="color"
                    value={colors[k] ?? "#000000"}
                    onChange={(e) => updateColors({ [k]: e.target.value })}
                    className="h-10 w-12 rounded border border-border"
                  />
                  <Input
                    value={colors[k] ?? ""}
                    onChange={(e) => updateColors({ [k]: e.target.value })}
                    placeholder="#fdfaf3"
                  />
                </div>
              </div>
            ))}
          </div>

          <h3 className="font-medium text-ink mt-4">Footer copy</h3>
          <Textarea
            rows={3}
            value={profile.footerCopy ?? ""}
            onChange={(e) =>
              setProfile({ ...profile, footerCopy: e.target.value })
            }
          />

          <h3 className="font-medium text-ink mt-4">Featured venues</h3>
          {venues.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No venues to choose. Add venues under Admin → Venues first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {venues.map((v) => {
                const selected = profile.featuredVenueIds.includes(v.id);
                return (
                  <button
                    type="button"
                    key={v.id}
                    onClick={() => toggleVenue(v.id)}
                    className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                      selected
                        ? "bg-stone-900 text-white border-stone-900"
                        : "bg-white text-stone-700 border-stone-300 hover:border-stone-500"
                    }`}
                  >
                    {v.name}
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-xs text-ink-muted">
            Soft differentiation only — both branded sites still show all
            sessions; featured venues bubble to the top.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="font-semibold text-ink text-lg">Live preview</h2>
          <p className="text-xs text-ink-muted">
            Updates as you edit. The full homepage uses the same tokens —
            this is a representative card, not the real homepage.
          </p>
          <HeroPreview
            displayName={profile.displayName}
            hero={hero}
            colors={colors}
          />
          <div className="text-xs text-ink-muted">
            <Badge variant="outline" className="mr-2">
              {profile.featuredVenueIds.length} featured venues
            </Badge>
            <Badge
              variant="outline"
              className={
                profile.active
                  ? "bg-emerald-100 text-emerald-900 border-emerald-200"
                  : "bg-stone-100 text-stone-700 border-stone-200"
              }
            >
              {profile.active ? "Active" : "Inactive"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <a href="/admin/branding">Back</a>
        </Button>
      </div>
    </form>
  );
}
