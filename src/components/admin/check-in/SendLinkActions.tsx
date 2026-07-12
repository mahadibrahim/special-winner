"use client";

import { useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

interface Props {
  kind: "drop_in_booking" | "field_rental" | "roster_entry";
  targetId: string;
  onSent?: () => void;
}

export function SendLinkActions({ kind, targetId, onSent }: Props) {
  const [busy, setBusy] = useState<"email" | "sms" | "qr" | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const send = async (channel: "email" | "sms" | "qr") => {
    setBusy(channel);
    try {
      const res = await fetch("/api/admin/check-in/send-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, targetId, channel }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? `Send failed (${res.status})`);
        return;
      }
      if (channel === "qr") {
        setQrUrl(body.url);
      } else {
        toast.success("Link sent");
        onSent?.();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => send("email")}
          disabled={busy !== null}
          className="text-xs px-2 py-1 rounded bg-stone-900 text-white disabled:opacity-50"
        >
          {busy === "email" ? "..." : "Email"}
        </button>
        <button
          type="button"
          onClick={() => send("sms")}
          disabled={busy !== null}
          className="text-xs px-2 py-1 rounded border disabled:opacity-50"
        >
          {busy === "sms" ? "..." : "SMS"}
        </button>
        <button
          type="button"
          onClick={() => send("qr")}
          disabled={busy !== null}
          className="text-xs px-2 py-1 rounded border disabled:opacity-50"
        >
          {busy === "qr" ? "..." : "Show QR"}
        </button>
      </div>

      {qrUrl && (
        <div
          className="fixed inset-0 z-50 bg-stone-900/80 flex items-center justify-center p-4"
          onClick={() => setQrUrl(null)}
        >
          <div
            className="bg-white rounded-lg p-6 flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold">Scan to finish</h3>
            <QRCodeSVG value={qrUrl} size={240} />
            <p className="text-xs text-stone-500 break-all max-w-xs text-center">{qrUrl}</p>
            <button
              type="button"
              onClick={() => setQrUrl(null)}
              className="text-sm px-3 py-1 rounded bg-stone-900 text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
