"use client";

import { useRef, useState } from "react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { CARD_CLASS, DONE_CARD_CLASS, GHOST_BTN, PRIMARY_BTN } from "./card-styles";

interface Props {
  token: string;
  done: boolean;
  onDone: () => void;
}

export function PhotoCard({ token, done, onDone }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className={DONE_CARD_CLASS}>
        <span aria-hidden="true">&#10003;</span>
        <span>Photo added</span>
      </div>
    );
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
  };

  const onUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/self-serve/${token}/photo`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError((b as any).error ?? `Upload failed (${res.status})`);
        return;
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={CARD_CLASS}>
      <h2 className="font-semibold text-ink">Add your photo</h2>
      <p className="text-sm text-ink-muted">
        Helps the front desk recognize you at check-in.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        onChange={onPick}
        className="hidden"
      />
      {preview ? (
        <img
          src={preview}
          alt="Preview"
          className="w-32 h-32 rounded-full object-cover mx-auto"
        />
      ) : null}
      <div className="flex gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className={GHOST_BTN}>
          {preview ? "Pick different photo" : "Take photo"}
        </button>
        {preview && (
          <button type="button" onClick={onUpload} disabled={busy} className={PRIMARY_BTN}>
            {busy ? "Uploading..." : "Save"}
          </button>
        )}
      </div>
      <ErrorBanner message={error} />
    </div>
  );
}
