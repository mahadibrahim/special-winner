"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, RefreshCw, ExternalLink, AlertTriangle, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";

interface MerchListItem {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  fromCents: number | null;
}

interface SyncResult {
  products: number;
  variants: number;
  deactivated: number;
}

const money = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export function MerchSyncPanel() {
  useHydrationBeacon();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [products, setProducts] = useState<MerchListItem[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/merch/sync");
      if (!res.ok) throw new Error("Failed to load the catalog");
      const json = await res.json();
      setConfigured(Boolean(json.configured));
      setProducts(json.products ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load the catalog");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function sync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/admin/merch/sync", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // 503 = Printful key missing; 502 = Printful API error; else generic
        toast.error(json.error ?? "Sync failed");
        return;
      }
      const r = json as SyncResult;
      toast.success(
        `Synced ${r.products} product${r.products === 1 ? "" : "s"} (${r.variants} variant${
          r.variants === 1 ? "" : "s"
        })${r.deactivated ? `, ${r.deactivated} removed` : ""}.`,
      );
      await load();
    } catch {
      toast.error("Sync failed — please try again");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink flex items-center gap-2">
            <ShoppingBag className="h-6 w-6" /> Shop
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Products are designed in Printful. Pull them into the store here.
          </p>
        </div>
        <Button onClick={sync} disabled={syncing || configured === false}>
          {syncing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Syncing…
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" /> Sync from Printful
            </>
          )}
        </Button>
      </div>

      {configured === false && (
        <Card className="mb-6 border-amber-300 bg-amber-50">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-medium">Printful isn’t connected.</p>
              <p>
                Add <code>PRINTFUL_API_KEY</code> to this environment’s variables, then
                reload and sync.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">In the store</CardTitle>
            <CardDescription>
              {loading
                ? "Loading…"
                : `${products.length} product${products.length === 1 ? "" : "s"} live at `}
              {!loading && (
                <a href="/shop" className="underline inline-flex items-center gap-1">
                  /shop <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto" />
            </div>
          ) : products.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              No products yet. Publish a product in Printful, then click{" "}
              <span className="font-medium">Sync from Printful</span>.
            </p>
          ) : (
            <ul className="divide-y divide-border list-none p-0 m-0">
              {products.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <div className="h-12 w-12 rounded bg-muted overflow-hidden shrink-0">
                    {p.imageUrl && (
                      <img
                        src={p.imageUrl}
                        alt={p.name}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{p.name}</p>
                    <a
                      href={`/shop/${p.slug}`}
                      className="text-xs text-muted-foreground underline"
                    >
                      /shop/{p.slug}
                    </a>
                  </div>
                  {p.fromCents !== null && (
                    <Badge variant="secondary">from {money(p.fromCents)}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
