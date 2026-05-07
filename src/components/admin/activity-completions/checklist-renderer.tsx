"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";

type ChecklistItem = { id: string; label: string };
type ChecklistTemplate = { id: string; kind: "checklist"; items: ChecklistItem[] };

type ItemState = { checked: boolean; note?: string };

/**
 * Renders a checklist artifact: each item is a checkbox + optional note.
 * Submit button is enabled only when every item is checked.
 *
 * Wire format on submit:
 *   { items: [{ item_id, checked, note? }, ...] }
 */
export function ChecklistRenderer({
  completion,
  activity,
  template,
}: {
  completion: { id: string };
  activity: { name: string; description: string };
  template: ChecklistTemplate;
}) {
  const [items, setItems] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(
      template.items.map((i) => [i.id, { checked: false, note: "" }]),
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const allChecked = template.items.every((i) => items[i.id]?.checked);

  function setItem(id: string, patch: Partial<ItemState>) {
    setItems((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const payload = {
        items: template.items.map((i) => ({
          item_id: i.id,
          checked: items[i.id]?.checked ?? false,
          note: items[i.id]?.note?.trim() || undefined,
        })),
      };
      const res = await fetch(
        `/api/admin/activity-completions/${completion.id}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Submit failed (${res.status})`);
      }
      window.location.reload();
    } catch (e: any) {
      setErr(e.message ?? "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{activity.name}</h1>
        <p className="text-muted-foreground whitespace-pre-line">
          {activity.description}
        </p>
      </header>

      {err && <ErrorBanner message={err} />}

      <ul className="space-y-3">
        {template.items.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-3 p-3 border rounded"
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={items[item.id]?.checked ?? false}
              onChange={(e) => setItem(item.id, { checked: e.target.checked })}
              aria-label={item.label}
            />
            <div className="flex-1">
              <div className="font-medium">{item.label}</div>
              <input
                type="text"
                placeholder="Note (optional)"
                className="mt-1 w-full text-sm border-b focus:outline-none bg-transparent"
                value={items[item.id]?.note ?? ""}
                onChange={(e) => setItem(item.id, { note: e.target.value })}
              />
            </div>
          </li>
        ))}
      </ul>

      <Button onClick={submit} disabled={!allChecked || submitting}>
        {submitting ? "Submitting..." : "Submit"}
      </Button>
    </div>
  );
}
