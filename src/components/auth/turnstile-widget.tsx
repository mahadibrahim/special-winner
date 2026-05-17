"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile widget — loads the Cloudflare JS once, renders the
 * widget into a div, and pushes the resulting token back to the caller
 * via onToken. No third-party React package — Cloudflare's own JS handles
 * everything.
 *
 * Site keys:
 *   - Pass PUBLIC_TURNSTILE_SITE_KEY at build time when a real key is
 *     provisioned in Cloudflare.
 *   - When absent (dev / pre-Cloudflare-account), we fall back to
 *     `1x00000000000000000000AA`, Cloudflare's documented "always-passes
 *     visible" sandbox key. Pairs with the documented secret
 *     `1x0000000000000000000000000000000AA` on the server.
 *
 * The fail-closed-in-prod behavior lives in src/lib/auth/turnstile.ts —
 * when the SECRET is unset in prod the verifier rejects all submissions,
 * so the widget rendering with a sandbox site key doesn't actually let a
 * bot through if someone forgets to provision the prod keys.
 */

const SANDBOX_ALWAYS_PASS_SITE_KEY = "1x00000000000000000000AA";

declare global {
  interface Window {
    turnstile?: {
      render: (
        target: HTMLElement | string,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

type Props = {
  onToken: (token: string) => void;
  onError?: () => void;
};

export function TurnstileWidget({ onToken, onError }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Read at mount; keeping it in a ref keeps the effect deps empty.
  const siteKeyRef = useRef<string>(
    (import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined) ||
      SANDBOX_ALWAYS_PASS_SITE_KEY,
  );

  useEffect(() => {
    let cancelled = false;

    const ensureScript = (): Promise<void> => {
      if (window.turnstile) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(
          'script[data-aspire-turnstile]',
        );
        if (existing) {
          existing.addEventListener("load", () => resolve());
          existing.addEventListener("error", () => reject());
          return;
        }
        const script = document.createElement("script");
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.setAttribute("data-aspire-turnstile", "1");
        script.onload = () => resolve();
        script.onerror = () => reject();
        document.head.appendChild(script);
      });
    };

    ensureScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKeyRef.current,
          callback: (token: string) => onToken(token),
          "error-callback": () => onError?.(),
          "expired-callback": () => onError?.(),
          theme: "auto",
        });
      })
      .catch(() => {
        if (!cancelled) onError?.();
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore unmount race */
        }
        widgetIdRef.current = null;
      }
    };
    // onToken/onError are stable from parent (we use refs above); intentionally empty deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} />;
}
