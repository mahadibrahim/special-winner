"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ui/error-banner";
import type { ClassBlock } from "@/lib/db/schema/classes";

interface BlockFormProps {
  block?: ClassBlock;
}

export default function BlockForm({ block }: BlockFormProps) {
  const isEdit = block !== undefined;

  const [name, setName] = useState(block?.name ?? "");
  const [startDate, setStartDate] = useState(block?.startDate ?? "");
  const [endDate, setEndDate] = useState(block?.endDate ?? "");
  const [active, setActive] = useState(block?.active ?? true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (endDate < startDate) {
      setError("End date must be on or after start date");
      return;
    }

    setBusy(true);
    try {
      const url = block ? `/api/admin/classes/blocks/${block.id}` : "/api/admin/classes/blocks";
      const method = block ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, startDate, endDate, active }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        const rawError = (b as { error?: string }).error;
        setError(
          rawError === "overlapping_block"
            ? "This window overlaps another active block — adjust the dates or deactivate the other block first."
            : (rawError ?? "Save failed"),
        );
        return;
      }
      window.location.href = "/admin/classes/blocks";
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6 max-w-2xl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <a
            href="/admin/classes/blocks"
            className="text-xs uppercase tracking-wider text-ink-muted hover:text-ink"
          >
            ← All blocks
          </a>
          <h1 className="text-2xl font-bold text-ink mt-2">
            {isEdit ? block.name : "New class block"}
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
          <Label htmlFor="block-name">Name</Label>
          <Input
            id="block-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Fall Block"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="start-date">Start date</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="end-date">End date</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : isEdit ? "Save changes" : "Create block"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <a href="/admin/classes/blocks">Back</a>
        </Button>
      </div>
    </form>
  );
}
