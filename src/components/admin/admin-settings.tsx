"use client";

import { useEffect, useState } from "react";
import { Bell, Building2, CreditCard, Loader2, Mail, Shield } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ExternalStoreSettings,
  type ExternalStoreValue,
} from "./external-store-settings";
import { FeedbackSettingsCard } from "./feedback-settings-card";

type SiteAnnouncementValue = {
  title: string;
  detail?: string;
  linkUrl?: string;
  linkLabel?: string;
  audience: "all" | "adult" | "youth";
  expiresAt?: string;
};

type AdminSettingsProps = {
  organizationName?: string | null;
};

export function AdminSettings({ organizationName }: AdminSettingsProps = {}) {
  const [activeTab, setActiveTab] = useState("general");
  const [externalStore, setExternalStore] =
    useState<ExternalStoreValue | null>(null);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Site announcement state
  const [announcement, setAnnouncement] = useState<SiteAnnouncementValue>({
    title: "",
    detail: "",
    linkUrl: "",
    linkLabel: "",
    audience: "all",
    expiresAt: "",
  });
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);
  const [announcementError, setAnnouncementError] = useState<string | null>(null);
  const [announcementSavedAt, setAnnouncementSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/organizations/settings");
        if (!res.ok) throw new Error("Failed to load settings");
        const json = await res.json();
        if (cancelled) return;
        setExternalStore(json.settings?.externalStore ?? null);
        const ann = json.settings?.siteAnnouncement;
        if (ann) {
          // Convert stored UTC ISO back to LOCAL wall-time for the
          // datetime-local input. Slicing the ISO string directly would show
          // UTC as if it were local, and a subsequent save would re-encode it
          // — drifting the expiry by the UTC offset on every load-save cycle.
          const d = ann.expiresAt ? new Date(ann.expiresAt) : null;
          const expiresLocal =
            d && !Number.isNaN(d.getTime())
              ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
              : "";
          setAnnouncement({
            title: ann.title ?? "",
            detail: ann.detail ?? "",
            linkUrl: ann.linkUrl ?? "",
            linkLabel: ann.linkLabel ?? "",
            audience: ann.audience ?? "all",
            expiresAt: expiresLocal,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Load failed");
        }
      } finally {
        if (!cancelled) setInitialLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveExternalStore() {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/organizations/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { externalStore } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      const json = await res.json();
      setExternalStore(json.settings?.externalStore ?? null);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveAnnouncement() {
    setIsSavingAnnouncement(true);
    setAnnouncementError(null);
    try {
      const payload: SiteAnnouncementValue = {
        title: announcement.title,
        audience: announcement.audience,
      };
      if (announcement.detail?.trim()) payload.detail = announcement.detail.trim();
      if (announcement.linkUrl?.trim()) payload.linkUrl = announcement.linkUrl.trim();
      if (announcement.linkLabel?.trim()) payload.linkLabel = announcement.linkLabel.trim();
      if (announcement.expiresAt) {
        payload.expiresAt = new Date(announcement.expiresAt).toISOString();
      }

      const res = await fetch("/api/admin/organizations/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { siteAnnouncement: payload } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      setAnnouncementSavedAt(Date.now());
    } catch (err) {
      setAnnouncementError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSavingAnnouncement(false);
    }
  }

  async function clearAnnouncement() {
    setIsSavingAnnouncement(true);
    setAnnouncementError(null);
    try {
      const res = await fetch("/api/admin/organizations/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { siteAnnouncement: null } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to clear");
      }
      setAnnouncement({ title: "", detail: "", linkUrl: "", linkLabel: "", audience: "all", expiresAt: "" });
      setAnnouncementSavedAt(null);
    } catch (err) {
      setAnnouncementError(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setIsSavingAnnouncement(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        {organizationName && (
          <div className="text-[10px] uppercase tracking-widest text-ink-muted font-semibold mb-1">
            {organizationName}
          </div>
        )}
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">
          Manage organization settings and preferences
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Payments</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Organization Settings</CardTitle>
                <CardDescription>
                  Manage your organization details and branding
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!initialLoaded ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {error && (
                      <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
                        {error}
                      </div>
                    )}

                    <ExternalStoreSettings
                      value={externalStore}
                      onChange={setExternalStore}
                    />

                    <div className="flex items-center justify-end gap-3 pt-2">
                      {savedAt && !isSaving && (
                        <span className="text-sm text-muted-foreground">
                          Saved
                        </span>
                      )}
                      <Button onClick={saveExternalStore} disabled={isSaving}>
                        {isSaving && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Save Changes
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Site banner — Next up card</CardTitle>
                <CardDescription>
                  Shows in the home and hub heroes. Changes can take up to 5 minutes to appear. Clears itself after the expiry.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!initialLoaded ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {announcementError && (
                      <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
                        {announcementError}
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2 space-y-1.5">
                        <Label htmlFor="ann-title">Title</Label>
                        <Input
                          id="ann-title"
                          placeholder="Summer 7v7 League"
                          maxLength={120}
                          value={announcement.title}
                          onChange={(e) =>
                            setAnnouncement((a) => ({ ...a, title: e.target.value }))
                          }
                        />
                      </div>

                      <div className="sm:col-span-2 space-y-1.5">
                        <Label htmlFor="ann-detail">Detail <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Input
                          id="ann-detail"
                          placeholder="Registration closes June 30 — 4 spots left"
                          maxLength={240}
                          value={announcement.detail ?? ""}
                          onChange={(e) =>
                            setAnnouncement((a) => ({ ...a, detail: e.target.value }))
                          }
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="ann-link-url">Link URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Input
                          id="ann-link-url"
                          placeholder="/adult/leagues"
                          maxLength={500}
                          value={announcement.linkUrl ?? ""}
                          onChange={(e) =>
                            setAnnouncement((a) => ({ ...a, linkUrl: e.target.value }))
                          }
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="ann-link-label">Link label <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Input
                          id="ann-link-label"
                          placeholder="Claim a spot"
                          maxLength={60}
                          value={announcement.linkLabel ?? ""}
                          onChange={(e) =>
                            setAnnouncement((a) => ({ ...a, linkLabel: e.target.value }))
                          }
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="ann-audience">Audience</Label>
                        <select
                          id="ann-audience"
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          value={announcement.audience}
                          onChange={(e) =>
                            setAnnouncement((a) => ({
                              ...a,
                              audience: e.target.value as "all" | "adult" | "youth",
                            }))
                          }
                        >
                          <option value="all">Everywhere</option>
                          <option value="adult">Adult pages</option>
                          <option value="youth">Youth pages</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="ann-expires">Expires <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Input
                          id="ann-expires"
                          type="datetime-local"
                          value={announcement.expiresAt ?? ""}
                          onChange={(e) =>
                            setAnnouncement((a) => ({ ...a, expiresAt: e.target.value }))
                          }
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      {announcementSavedAt && !isSavingAnnouncement && (
                        <span className="text-sm text-muted-foreground">Saved</span>
                      )}
                      <Button
                        variant="outline"
                        onClick={clearAnnouncement}
                        disabled={isSavingAnnouncement}
                      >
                        {isSavingAnnouncement && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Clear banner
                      </Button>
                      <Button
                        onClick={saveAnnouncement}
                        disabled={isSavingAnnouncement}
                      >
                        {isSavingAnnouncement && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Save
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <FeedbackSettingsCard />
          </div>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>
                Configure email notifications and alerts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-8 text-center border-2 border-dashed rounded-lg">
                <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">
                  Email Notifications
                </h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Email notifications are sent automatically for registrations,
                  payments, and announcements. Configure your email templates
                  and preferences.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Payment Settings</CardTitle>
              <CardDescription>
                Configure Stripe and payment options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-8 text-center border-2 border-dashed rounded-lg">
                <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">
                  Stripe Integration
                </h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Payment processing is handled through Stripe. Visit your
                  Stripe dashboard to manage payment settings, view
                  transactions, and configure payouts.
                </p>
                <a
                  href="https://dashboard.stripe.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-4 text-primary hover:underline"
                >
                  Open Stripe Dashboard
                </a>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Manage access controls and security options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-8 text-center border-2 border-dashed rounded-lg">
                <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">
                  Security Configuration
                </h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Security settings are managed system-wide. User roles and
                  permissions can be configured in the Users section.
                </p>
                <a
                  href="/admin/users"
                  className="inline-flex items-center gap-2 mt-4 text-primary hover:underline"
                >
                  Manage Users &amp; Roles
                </a>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
