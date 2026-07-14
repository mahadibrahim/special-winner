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

/**
 * Draw a center-cropped square from a video frame to a downscaled JPEG File.
 * The live preview renders `aspect-square object-cover`, so the captured
 * frame must match that crop — otherwise the saved photo (and the circular
 * avatar it feeds downstream) shows more than what the customer framed.
 */
function frameToFile(video: HTMLVideoElement): Promise<File | null> {
  const { videoWidth: w, videoHeight: h } = video;
  if (!w || !h) return Promise.resolve(null);
  const side = Math.min(w, h);
  const sx = (w - side) / 2;
  const sy = (h - side) / 2;
  const outSide = Math.min(side, MAX_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = outSide;
  canvas.height = outSide;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(video, sx, sy, side, side, 0, 0, outSide, outSide);
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
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  // Bumped by stopCamera (leave-camera-view, capture, unmount). A pending
  // startCamera() call snapshots this at kickoff; if it no longer matches
  // when getUserMedia resolves, the caller has moved on and the arriving
  // stream must be stopped, not assigned — otherwise a double-tap or a
  // leave-mid-start races two streams and the loser is never stopped.
  const cancelTokenRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // A mounted iPad must never sit with its camera light on. Stopping every
  // track is the whole point of this ref.
  const stopCamera = useCallback(() => {
    cancelTokenRef.current += 1;
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
    if (starting) return;
    setCameraError(null);
    setStarting(true);
    const myEpoch = cancelTokenRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      // The caller may have moved on (double-tap already got a stream in,
      // the customer switched to the device-upload path, or the component
      // unmounted) while this was in flight. Overwriting streamRef.current
      // in that case is exactly what leaks a live camera — stop and drop
      // this stream instead.
      const stale =
        !mountedRef.current || cancelTokenRef.current !== myEpoch || streamRef.current;
      if (stale) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setCameraOn(true);
    } catch (err) {
      if (!mountedRef.current) return;
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
      } else if (name === "NotReadableError") {
        setCameraError(
          "The camera is already in use by another app. Choose a photo from the device instead.",
        );
      } else {
        setCameraError(
          "The camera couldn't be started. Choose a photo from the device instead.",
        );
      }
    } finally {
      if (mountedRef.current) setStarting(false);
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.videoWidth || !video.videoHeight) {
      // The stream connected but never produced a frame — e.g. it's held by
      // another app. Capturing will never succeed here; say so and point at
      // the fallback instead of leaving the customer to tap Capture forever.
      setCameraError(
        'The camera feed hasn\'t started. Tap "Use a photo from my device instead" below.',
      );
      return;
    }
    const f = await frameToFile(video);
    if (!f) {
      setCameraError(
        'Couldn\'t capture the photo. Try again, or tap "Use a photo from my device instead" below.',
      );
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
          <button type="button" onClick={stopCamera} className={GHOST_BTN}>
            Use a photo from my device instead
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={startCamera}
            disabled={starting}
            className={`${PRIMARY_BTN} inline-flex items-center justify-center gap-2`}
          >
            <Camera className="w-5 h-5" />
            {starting ? "Starting camera…" : "Take a photo"}
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
