"use client";

import { useRef, useState } from "react";

interface Props {
  kind: "drop_in_booking" | "field_rental" | "roster_entry";
  targetId: string;
  photoUrl: string | null;
  name: string;
  onUploaded?: (url: string) => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AvatarUploader({ kind, targetId, photoUrl, name, onUploaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("kind", kind);
      form.append("targetId", targetId);
      form.append("file", file);
      const res = await fetch("/api/admin/check-in/upload-photo", {
        method: "POST",
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `Upload failed (${res.status})`);
        return;
      }
      onUploaded?.(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={`${name} photo`}
        className="w-9 h-9 rounded-full object-cover flex-shrink-0"
      />
    );
  }

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="w-9 h-9 rounded-full bg-stone-200 text-stone-700 text-xs font-semibold flex items-center justify-center disabled:opacity-50"
        title="Add photo"
      >
        {busy ? "..." : initials(name)}
        {!busy && (
          <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-stone-900 text-white text-[10px] flex items-center justify-center border-2 border-white">
            +
          </span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={onPick}
      />
      {error && (
        <div className="text-xs text-rose-700 absolute top-full left-0 whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </div>
  );
}
