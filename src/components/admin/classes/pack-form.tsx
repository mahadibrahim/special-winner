"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ui/error-banner";
import type { ClassPackProduct } from "@/lib/db/schema/classes";

interface PackFormProps {
  pack?: ClassPackProduct;
}

export default function PackForm({ pack }: PackFormProps) {
  const isEdit = pack !== undefined;

  const [name, setName] = useState(pack?.name ?? "");
  const [sessionCount, setSessionCount] = useState<string>(
    pack?.sessionCount != null ? String(pack.sessionCount) : "",
  );
  // Price stored as a dollar string in the form — converted to cents at the
  // API boundary right before submit, same pattern as tier-form.tsx.
  const [priceDollars, setPriceDollars] = useState<string>(
    pack?.priceCents != null ? String(pack.priceCents / 100) : "",
  );
  const [expiryMonths, setExpiryMonths] = useState<string>(
    pack?.expiryMonths != null ? String(pack.expiryMonths) : "6",
  );
  const [displayOrder, setDisplayOrder] = useState<string>(String(pack?.displayOrder ?? 0));
  const [active, setActive] = useState(pack?.active ?? true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const url = pack ? `/api/admin/classes/packs/${pack.id}` : "/api/admin/classes/packs";
      const method = pack ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          sessionCount: Number(sessionCount) || 0,
          priceCents: Math.round(Number(priceDollars || 0) * 100),
          expiryMonths: Number(expiryMonths) || 0,
          displayOrder: Number(displayOrder) || 0,
          active,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError((b as { error?: string }).error ?? "Save failed");
        return;
      }
      window.location.href = "/admin/classes/packs";
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6 max-w-2xl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <a
            href="/admin/classes/packs"
            className="text-xs uppercase tracking-wider text-ink-muted hover:text-ink"
          >
            ← All packs
          </a>
          <h1 className="text-2xl font-bold text-ink mt-2">
            {isEdit ? pack.name : "New class pack"}
          </h1>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Active
        </label>
      </header>

      {error && <ErrorBanner message={error} />}

      <div className="space-y-5">
        <h2 className="font-semibold text-ink text-lg">Details</h2>

        <div>
          <Label htmlFor="pack-name">Name</Label>
          <Input
            id="pack-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 8-Session Pack"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="session-count">Sessions</Label>
            <Input
              id="session-count"
              type="number"
              min="1"
              step="1"
              value={sessionCount}
              onChange={(e) => setSessionCount(e.target.value)}
              placeholder="e.g. 8"
              required
            />
          </div>
          <div>
            <Label htmlFor="price-dollars">Price ($)</Label>
            <Input
              id="price-dollars"
              type="number"
              min="0"
              step="0.01"
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
              placeholder="e.g. 180"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="expiry-months">Credits expire after (months)</Label>
            <Input
              id="expiry-months"
              type="number"
              min="1"
              step="1"
              value={expiryMonths}
              onChange={(e) => setExpiryMonths(e.target.value)}
              placeholder="e.g. 6"
              required
            />
          </div>
          <div>
            <Label htmlFor="display-order">Display order</Label>
            <Input
              id="display-order"
              type="number"
              min="0"
              step="1"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : isEdit ? "Save changes" : "Create pack"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <a href="/admin/classes/packs">Back</a>
        </Button>
      </div>
    </form>
  );
}
