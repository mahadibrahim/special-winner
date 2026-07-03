"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
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

interface Principal {
  name: string;
  phone: string;
}

interface OpsWhatsAppState {
  groupId?: string;
  conversationId?: string;
  inviteLink?: string;
}

interface OpsPingsState {
  enabled: boolean;
  principals: Principal[];
  whatsapp: OpsWhatsAppState;
}

const MAX_PRINCIPALS = 20;

// The org settings PATCH endpoint replaces the whole `opsPings` block on
// save (top-level key replace, not a deep merge — see
// src/pages/api/admin/organizations/settings.ts). So every save must
// round-trip the `whatsapp` block exactly as loaded, or a save right after
// provisioning would wipe out the group id/invite link this card doesn't
// otherwise own.
const EMPTY_STATE: OpsPingsState = {
  enabled: false,
  principals: [],
  whatsapp: {},
};

type TestChannel = "whatsapp" | "email" | "suppressed" | "disabled" | "deduped";

const TEST_CHANNEL_LABEL: Record<TestChannel, string> = {
  whatsapp: "Delivered via whatsapp",
  email: "Delivered via email",
  suppressed: "Recorded but suppressed — no delivery channel available",
  disabled: "Pings are disabled — turn them on and save first",
  deduped: "Deduplicated — a test ping for this run already exists",
};

/**
 * "Operational pings" settings card: master toggle, principal contacts
 * (name + phone), WhatsApp group provisioning status, and a test-send
 * button. Persists via the org settings PATCH endpoint (settings.opsPings).
 */
export function OpsPingsCard() {
  const [state, setState] = useState<OpsPingsState>(EMPTY_STATE);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  async function loadSettings() {
    try {
      const res = await fetch("/api/admin/organizations/settings");
      if (!res.ok) throw new Error("Failed to load settings");
      const json = await res.json();
      const opsPings = json.settings?.opsPings ?? {};
      setState({
        enabled: opsPings.enabled ?? false,
        principals: opsPings.principals ?? [],
        whatsapp: opsPings.whatsapp ?? {},
      });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
      setLoadFailed(true);
      return false;
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await loadSettings();
      if (cancelled) return;
      if (!ok) {
        // loadSettings already set error/loadFailed; nothing more to do.
      }
      setInitialLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updatePrincipal(index: number, patch: Partial<Principal>) {
    setState((s) => ({
      ...s,
      principals: s.principals.map((p, i) =>
        i === index ? { ...p, ...patch } : p,
      ),
    }));
  }

  function removePrincipal(index: number) {
    setState((s) => ({
      ...s,
      principals: s.principals.filter((_, i) => i !== index),
    }));
  }

  function addPrincipal() {
    setState((s) => ({
      ...s,
      principals: [...s.principals, { name: "", phone: "" }],
    }));
  }

  async function save() {
    setIsSaving(true);
    setError(null);
    try {
      const principals = state.principals
        .map((p) => ({ name: p.name.trim(), phone: p.phone.trim() }))
        .filter((p) => p.name !== "" && p.phone !== "");

      const res = await fetch("/api/admin/organizations/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: {
            opsPings: {
              enabled: state.enabled,
              principals,
              // Round-tripped unchanged — see comment on EMPTY_STATE above.
              // Provisioning is the only flow that writes this block.
              whatsapp: state.whatsapp,
            },
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      const json = await res.json();
      const opsPings = json.settings?.opsPings ?? {};
      setState({
        enabled: opsPings.enabled ?? false,
        principals: opsPings.principals ?? [],
        whatsapp: opsPings.whatsapp ?? {},
      });
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  async function provision() {
    setIsProvisioning(true);
    setProvisionError(null);
    try {
      const res = await fetch("/api/admin/ops-pings/provision", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Provisioning failed");
      }
      // The endpoint persists the group itself; re-load so this card picks
      // up the groupId/inviteLink it just wrote.
      await loadSettings();
    } catch (err) {
      setProvisionError(
        err instanceof Error ? err.message : "Provisioning failed",
      );
    } finally {
      setIsProvisioning(false);
    }
  }

  async function sendTestPing() {
    setIsTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/ops-pings/test", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Test ping failed");
      }
      const data = await res.json();
      const channel = data.channel as TestChannel;
      setTestResult(TEST_CHANNEL_LABEL[channel] ?? `Result: ${channel}`);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Test ping failed");
    } finally {
      setIsTesting(false);
    }
  }

  const isProvisioned = Boolean(state.whatsapp.groupId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Operational pings</CardTitle>
        <CardDescription>
          Send real-time alerts to on-site principals via WhatsApp, with an
          email fallback.
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
                {loadFailed &&
                  " — saving is disabled until settings load successfully. Reload the page and try again."}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id="ops-enable"
                checked={state.enabled}
                onCheckedChange={(v) =>
                  setState({ ...state, enabled: v === true })
                }
                disabled={isSaving}
              />
              <Label htmlFor="ops-enable" className="text-sm">
                Send operational pings
              </Label>
            </div>

            <div className="space-y-3">
              <Label className="text-sm">Principals</Label>
              {state.principals.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No principals added yet.
                </p>
              )}
              {state.principals.map((principal, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label
                      htmlFor={`ops-principal-name-${index}`}
                      className="font-normal text-muted-foreground"
                    >
                      Name
                    </Label>
                    <Input
                      id={`ops-principal-name-${index}`}
                      placeholder="Jordan Lee"
                      value={principal.name}
                      onChange={(e) =>
                        updatePrincipal(index, { name: e.target.value })
                      }
                      disabled={isSaving}
                    />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <Label
                      htmlFor={`ops-principal-phone-${index}`}
                      className="font-normal text-muted-foreground"
                    >
                      Phone
                    </Label>
                    <Input
                      id={`ops-principal-phone-${index}`}
                      type="tel"
                      placeholder="+1 614 555 0100"
                      value={principal.phone}
                      onChange={(e) =>
                        updatePrincipal(index, { phone: e.target.value })
                      }
                      disabled={isSaving}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removePrincipal(index)}
                    disabled={isSaving}
                    aria-label={`Remove principal ${index + 1}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={addPrincipal}
                disabled={isSaving || state.principals.length >= MAX_PRINCIPALS}
              >
                Add principal
              </Button>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <Label className="text-sm">WhatsApp group</Label>
              {isProvisioned ? (
                <div className="text-sm text-muted-foreground">
                  Group provisioned
                  {state.whatsapp.inviteLink && (
                    <>
                      {" — "}
                      <a
                        href={state.whatsapp.inviteLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        invite link
                      </a>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={provision}
                    disabled={isProvisioning}
                  >
                    {isProvisioning && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Provision WhatsApp group
                  </Button>
                  {provisionError && (
                    <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
                      {provisionError}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={sendTestPing}
                disabled={isTesting}
              >
                {isTesting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Send test ping
              </Button>
              {testResult && (
                <span className="text-sm text-muted-foreground">
                  {testResult}
                </span>
              )}
              {testError && (
                <span className="text-sm text-destructive">{testError}</span>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              {savedAt && !isSaving && (
                <span className="text-sm text-muted-foreground">Saved</span>
              )}
              <Button onClick={save} disabled={isSaving || loadFailed}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save operational ping settings
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
