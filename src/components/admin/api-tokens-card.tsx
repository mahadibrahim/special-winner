"use client";

import { useEffect, useState } from "react";
import { Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
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
import { ErrorBanner } from "@/components/ui/error-banner";

interface TokenRow {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const SCOPE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "catalog:read", label: "Catalog read", hint: "list programs, seasons, locations, sports" },
  { value: "catalog:write", label: "Catalog write", hint: "create offerings, edit programs & seasons" },
  { value: "ops:read", label: "Ops read", hint: "reserved for future read tools" },
];

const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
  { value: "", label: "Never" },
];

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;

function tokenStatus(t: TokenRow): { label: string; tone: "ok" | "off" } {
  if (t.revokedAt) return { label: "Revoked", tone: "off" };
  if (t.expiresAt && new Date(t.expiresAt).getTime() <= Date.now()) return { label: "Expired", tone: "off" };
  return { label: "Active", tone: "ok" };
}

/**
 * "API tokens" settings card — mint/list/revoke scoped machine tokens for
 * the admin MCP (tools/admin-mcp). The raw token is shown exactly once after
 * creation; only its hash is stored server-side.
 */
export function ApiTokensCard() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["catalog:read"]);
  const [expiry, setExpiry] = useState("180");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /** Set right after a successful create; cleared when dismissed. */
  const [freshToken, setFreshToken] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const refresh = async () => {
    const res = await fetch("/api/admin/api-tokens");
    if (!res.ok) throw new Error("Could not load tokens");
    setTokens((await res.json()).tokens ?? []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
        if (!cancelled) setLoaded(true);
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleScope = (value: string) =>
    setScopes((prev) => (prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]));

  const create = async () => {
    setFormError(null);
    if (!name.trim()) {
      setFormError("Give the token a name — e.g. \"MacBook admin MCP\".");
      return;
    }
    if (scopes.length === 0) {
      setFormError("Pick at least one scope.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/admin/api-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          scopes,
          expiresDays: expiry ? Number(expiry) : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Create failed");
      const json = await res.json();
      setFreshToken({ name: name.trim(), token: json.token });
      setCopied(false);
      setName("");
      await refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const copyFresh = async () => {
    if (!freshToken) return;
    try {
      await navigator.clipboard.writeText(freshToken.token);
      setCopied(true);
      toast.success("Token copied");
    } catch {
      toast.error("Copy failed — select the text and copy manually");
    }
  };

  const revoke = async (id: string) => {
    setRevokingId(id);
    try {
      const res = await fetch("/api/admin/api-tokens", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Revoke failed");
      toast.success("Token revoked");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setRevokingId(null);
      setConfirmRevokeId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>API tokens</CardTitle>
        <CardDescription>
          Scoped machine tokens for the admin MCP. Tokens can read the catalog and — with the
          write scope — create or edit programs and seasons. They can never touch registrations,
          payments, refunds, or deletes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!loaded && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading tokens…
          </div>
        )}
        {loadFailed && <ErrorBanner message="Could not load tokens. Reload the page to retry." />}

        {freshToken && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2" data-testid="fresh-token">
            <p className="text-sm font-semibold">
              Token "{freshToken.name}" created — copy it now. It won't be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded bg-white border px-2 py-1.5 text-xs">
                {freshToken.token}
              </code>
              <Button type="button" size="sm" variant="outline" onClick={copyFresh}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={() => setFreshToken(null)}>
              Done — I've stored it
            </Button>
          </div>
        )}

        {loaded && !loadFailed && (
          <>
            <div className="space-y-3">
              {tokens.length === 0 && (
                <p className="text-sm text-muted-foreground">No tokens yet.</p>
              )}
              {tokens.map((t) => {
                const status = tokenStatus(t);
                return (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{t.name}</span>
                        <span
                          className={`text-[11px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${
                            status.tone === "ok"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-gray-200 text-gray-500"
                          }`}
                        >
                          {status.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.scopes.join(" · ")} · created {fmt(t.createdAt)}
                        {t.expiresAt ? ` · expires ${fmt(t.expiresAt)}` : " · never expires"}
                        {t.lastUsedAt ? ` · last used ${fmt(t.lastUsedAt)}` : " · never used"}
                      </p>
                    </div>
                    {!t.revokedAt &&
                      (confirmRevokeId === t.id ? (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={revokingId === t.id}
                            onClick={() => revoke(t.id)}
                          >
                            {revokingId === t.id ? "Revoking…" : "Confirm revoke"}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRevokeId(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button type="button" size="sm" variant="outline" onClick={() => setConfirmRevokeId(t.id)}>
                          Revoke
                        </Button>
                      ))}
                  </div>
                );
              })}
            </div>

            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-semibold">Create a token</p>
              {formError && <ErrorBanner message={formError} />}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="token-name">Name</Label>
                  <Input
                    id="token-name"
                    placeholder='e.g. "MacBook admin MCP"'
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="token-expiry">Expires</Label>
                  <select
                    id="token-expiry"
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                  >
                    {EXPIRY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Scopes</Label>
                {SCOPE_OPTIONS.map((s) => (
                  <label key={s.value} className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={scopes.includes(s.value)}
                      onCheckedChange={() => toggleScope(s.value)}
                    />
                    <span>
                      <span className="font-medium">{s.label}</span>
                      <span className="text-muted-foreground"> — {s.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <Button type="button" onClick={create} disabled={creating}>
                {creating ? "Creating…" : "Create token"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
