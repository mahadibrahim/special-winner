"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";

type SignatureTemplate = {
  id: string;
  kind: "signature";
  required_role: string;
  prompt: string;
};

/**
 * Renders a signature artifact: shows the prompt + a typed-name input.
 * Submit POSTs `{ typed_name: "..." }`. The server records the role at
 * the time of signing (snapshot from the activity's required_role).
 */
export function SignatureRenderer({
  completion,
  activity,
  template,
}: {
  completion: { id: string };
  activity: { name: string; description: string };
  template: SignatureTemplate;
}) {
  const [typedName, setTypedName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = typedName.trim().length >= 3;

  async function submit() {
    if (!valid) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/activity-completions/${completion.id}/submit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ typed_name: typedName.trim() }),
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

      <div className="border rounded p-4 bg-muted whitespace-pre-line">
        {template.prompt}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Type your full name to sign as {template.required_role}
        </label>
        <input
          type="text"
          className="w-full border rounded p-2"
          value={typedName}
          onChange={(e) => setTypedName(e.target.value)}
          autoComplete="off"
        />
      </div>

      <Button onClick={submit} disabled={!valid || submitting}>
        {submitting ? "Signing..." : "Sign"}
      </Button>
    </div>
  );
}
