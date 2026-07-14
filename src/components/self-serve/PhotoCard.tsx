"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImageIcon, RotateCcw } from "lucide-react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { CARD_CLASS, DONE_CARD_CLASS, PRIMARY_BTN, GHOST_BTN } from "./card-styles";

interface Props {
  token: string;
  done: boolean;
  onDone: () => void;
}

/** Longest edge of the uploaded image. Gym Wi-Fi is slow and the front desk
 *  only needs to recognize a face. */
const MAX_EDGE = 800;
const JPEG_QUALITY = 0.85;

/** Draw a video frame to a downscaled JPEG File. */
function frameToFile(video: HTMLVideoElement): Promise<File | null> {
  const { videoWidth: w, videoHeight: h } = video;
  if (!w || !h) return Promise.resolve(null);
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) =>
    canvas.toBlob(
      (blob) =>
        resolve(blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : null),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
}

export function PhotoCard({ token, done, onDone }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A mounted iPad must never sit with its camera light on. Stopping every
  // track is the whole point of this ref.
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // Attach the stream once the <video> element has actually mounted. This
  // runs after React commits the DOM update that flips cameraOn to true, so
  // videoRef.current is guaranteed to be the live element for this stream —
  // no dependence on requestAnimationFrame's timing relative to the commit.
  useEffect(() => {
    if (!cameraOn) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {
      /* autoplay rejection is harmless; the element is muted+playsInline */
    });
  }, [cameraOn]);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
    } catch (err) {
      // The whole reason for getUserMedia over capture="user": this is
      // reachable. capture="user" fails silently and strands the customer.
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setCameraError(
          "Camera access is blocked on this device. Choose a photo from the device instead, or ask the front desk.",
        );
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setCameraError(
          "No camera found on this device. Choose a photo from the device instead.",
        );
      } else {
        setCameraError(
          "The camera couldn't be started. Choose a photo from the device instead.",
        );
      }
    }
  };

  const capture = async () => {
    if (!videoRef.current) return;
    const f = await frameToFile(videoRef.current);
    if (!f) {
      setCameraError("Couldn't capture the photo. Try again.");
      return;
    }
    stopCamera();
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const pickFromDevice = (f: File | null) => {
    if (!f) return;
    stopCamera();
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const reset = () => {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
  };

  const upload = async () => {
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
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? `Upload failed (${res.status})`);
        return;
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className={DONE_CARD_CLASS}>
        <span aria-hidden="true">&#10003;</span>
        <span>Photo added</span>
      </div>
    );
  }

  return (
    <div className={CARD_CLASS}>
      <h2 className="font-medium text-ink">Add your photo</h2>
      <p className="text-sm text-ink-muted">
        Helps the front desk recognize you at check-in.
      </p>

      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => pickFromDevice(e.target.files?.[0] ?? null)}
      />

      {preview ? (
        <div className="flex flex-col items-center gap-4 py-2">
          <img
            src={preview}
            alt="Profile preview"
            className="w-40 h-40 rounded-full object-cover ring-2 ring-border"
          />
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Retake
          </button>
        </div>
      ) : cameraOn ? (
        <div className="space-y-3">
          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full aspect-square rounded-xl object-cover bg-cream-2"
          />
          <button type="button" onClick={capture} className={PRIMARY_BTN}>
            Capture
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={startCamera}
            className={`${PRIMARY_BTN} inline-flex items-center justify-center gap-2`}
          >
            <Camera className="w-5 h-5" />
            Take a photo
          </button>
          <button
            type="button"
            onClick={() => uploadRef.current?.click()}
            className={`${GHOST_BTN} inline-flex items-center justify-center gap-2`}
          >
            <ImageIcon className="w-5 h-5" />
            Choose from device
          </button>
        </div>
      )}

      <ErrorBanner message={cameraError} onDismiss={() => setCameraError(null)} />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {file && (
        <button type="button" onClick={upload} disabled={busy} className={PRIMARY_BTN}>
          {busy ? "Uploading…" : "Save photo"}
        </button>
      )}
    </div>
  );
}
