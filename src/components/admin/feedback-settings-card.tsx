"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface FeedbackSettingsState {
  enableNpsSurveys: boolean;
  enableRefereeRatings: boolean;
  googleReviewUrlAspire: string;
  googleReviewUrlSoccerone: string;
  detractorAlertEmail: string;
}

/**
 * "Customer feedback" settings card: NPS + referee-rating feature toggles,
 * per-brand Google review URLs, detractor alert address. Persists via the
 * org settings PATCH endpoint (settings.feedback + features).
 */
const EMPTY_STATE: FeedbackSettingsState = {
  enableNpsSurveys: false,
  enableRefereeRatings: false,
  googleReviewUrlAspire: "",
  googleReviewUrlSoccerone: "",
  detractorAlertEmail: "",
};

export function FeedbackSettingsCard() {
  const [state, setState] = useState<FeedbackSettingsState>(EMPTY_STATE);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/organizations/settings");
        if (!res.ok) throw new Error("Failed to load settings");
        const json = await res.json();
        if (cancelled) return;
        setState({
          enableNpsSurveys: json.features?.enableNpsSurveys ?? false,
          enableRefereeRatings: json.features?.enableRefereeRatings ?? false,
          googleReviewUrlAspire:
            json.settings?.feedback?.googleReviewUrl?.aspire ?? "",
          googleReviewUrlSoccerone:
            json.settings?.feedback?.googleReviewUrl?.soccerone ?? "",
          detractorAlertEmail: json.settings?.feedback?.detractorAlertEmail ?? "",
        });
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

  async function save() {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/organizations/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          features: {
            enableNpsSurveys: state.enableNpsSurveys,
            enableRefereeRatings: state.enableRefereeRatings,
          },
          settings: {
            feedback: {
              googleReviewUrl: {
                ...(state.googleReviewUrlAspire
                  ? { aspire: state.googleReviewUrlAspire }
                  : {}),
                ...(state.googleReviewUrlSoccerone
                  ? { soccerone: state.googleReviewUrlSoccerone }
                  : {}),
              },
              ...(state.detractorAlertEmail
                ? { detractorAlertEmail: state.detractorAlertEmail }
                : {}),
            },
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer feedback</CardTitle>
        <CardDescription>
          Post-event NPS surveys with a Google review funnel, and post-game
          referee ratings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="fb-enable-nps"
                  checked={state.enableNpsSurveys}
                  onCheckedChange={(v) =>
                    setState({ ...state, enableNpsSurveys: v === true })
                  }
                  disabled={isSaving}
                />
                <Label htmlFor="fb-enable-nps" className="text-sm">
                  Send NPS surveys after bookings
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="fb-enable-referee"
                  checked={state.enableRefereeRatings}
                  onCheckedChange={(v) =>
                    setState({ ...state, enableRefereeRatings: v === true })
                  }
                  disabled={isSaving}
                />
                <Label htmlFor="fb-enable-referee" className="text-sm">
                  Send referee-rating asks after completed games
                </Label>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fb-review-aspire">
                  Google review URL — Aspire
                </Label>
                <Input
                  id="fb-review-aspire"
                  type="url"
                  placeholder="https://g.page/r/…/review"
                  value={state.googleReviewUrlAspire}
                  onChange={(e) =>
                    setState({ ...state, googleReviewUrlAspire: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fb-review-soccerone">
                  Google review URL — SoccerOne
                </Label>
                <Input
                  id="fb-review-soccerone"
                  type="url"
                  placeholder="https://g.page/r/…/review"
                  value={state.googleReviewUrlSoccerone}
                  onChange={(e) =>
                    setState({
                      ...state,
                      googleReviewUrlSoccerone: e.target.value,
                    })
                  }
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="fb-alert-email">
                  Detractor alert email{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional, falls back to support email)
                  </span>
                </Label>
                <Input
                  id="fb-alert-email"
                  type="email"
                  placeholder="owner@example.com"
                  value={state.detractorAlertEmail}
                  onChange={(e) =>
                    setState({ ...state, detractorAlertEmail: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              {savedAt && !isSaving && (
                <span className="text-sm text-muted-foreground">Saved</span>
              )}
              <Button onClick={save} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save feedback settings
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
