"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";

type FormFieldType = "text" | "long_text" | "enum" | "boolean" | "number" | "date";
type FormField = {
  id: string;
  label: string;
  type: FormFieldType;
  options?: string[];
  required?: boolean;
};
type FormTemplate = { id: string; kind: "form"; fields: FormField[] };

/**
 * Renders a form artifact: field-by-field input matching the template's
 * declared types. Submit POSTs `{ fields: { <field_id>: <value> } }`.
 */
export function FormRenderer({
  completion,
  activity,
  template,
}: {
  completion: { id: string };
  activity: { name: string; description: string };
  template: FormTemplate;
}) {
  const [fields, setFields] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setField(id: string, value: any) {
    setFields((prev) => ({ ...prev, [id]: value }));
  }

  function isValid(): boolean {
    return template.fields.every((f) => {
      if (!f.required) return true;
      const v = fields[f.id];
      if (v === undefined || v === null) return false;
      if (typeof v === "string" && v.trim() === "") return false;
      return true;
    });
  }

  async function submit() {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/activity-completions/${completion.id}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields }),
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

  function renderField(f: FormField) {
    const v = fields[f.id] ?? "";
    if (f.type === "long_text") {
      return (
        <textarea
          className="w-full border rounded p-2"
          rows={4}
          value={v}
          onChange={(e) => setField(f.id, e.target.value)}
        />
      );
    }
    if (f.type === "enum") {
      return (
        <select
          className="w-full border rounded p-2"
          value={v}
          onChange={(e) => setField(f.id, e.target.value)}
        >
          <option value="">— select —</option>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }
    if (f.type === "boolean") {
      return (
        <input
          type="checkbox"
          checked={!!v}
          onChange={(e) => setField(f.id, e.target.checked)}
        />
      );
    }
    if (f.type === "number") {
      return (
        <input
          type="number"
          className="w-full border rounded p-2"
          value={v === "" ? "" : v}
          onChange={(e) =>
            setField(
              f.id,
              e.target.value === "" ? "" : e.target.valueAsNumber,
            )
          }
        />
      );
    }
    if (f.type === "date") {
      return (
        <input
          type="date"
          className="w-full border rounded p-2"
          value={v}
          onChange={(e) => setField(f.id, e.target.value)}
        />
      );
    }
    // text fallback
    return (
      <input
        type="text"
        className="w-full border rounded p-2"
        value={v}
        onChange={(e) => setField(f.id, e.target.value)}
      />
    );
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

      <div className="space-y-4">
        {template.fields.map((f) => (
          <div key={f.id}>
            <label className="block text-sm font-medium mb-1">
              {f.label}
              {f.required && " *"}
            </label>
            {renderField(f)}
          </div>
        ))}
      </div>

      <Button onClick={submit} disabled={!isValid() || submitting}>
        {submitting ? "Submitting..." : "Submit"}
      </Button>
    </div>
  );
}
