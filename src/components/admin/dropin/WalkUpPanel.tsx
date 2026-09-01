"use client";

/**
 * Front-desk walk-up panel for the drop-in admin surface.
 *
 * Search-by-phone-or-email, create-new-account form, member-status
 * display, and a "Register" button that drives the paired Stripe
 * Terminal reader via @stripe/terminal-js for paid bookings.
 *
 * For free-rate callers (member with allotment/unlimited), the server
 * skips the PaymentIntent creation entirely and we get back a confirmed
 * booking row immediately.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadStripeTerminal,
  type Terminal,
  type Reader,
} from "@stripe/terminal-js";
import { toast } from "sonner";
import { walkUpErrorMessage } from "@/lib/admin/walk-up-error";

interface WalkUpPanelProps {
  sessionId: string;
  /** URL the front-desk panel can hit to mint a Terminal connection token. */
  connectionTokenEndpoint?: string;
}

interface WalkUpResponse {
  paymentRequired: boolean;
  bookingId?: string;
  paymentIntentId?: string;
  clientSecret?: string;
  amountCents?: number;
  teamAssignment?: string | null;
}

interface NewAccount {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  gender?: "male" | "female" | "non_binary" | "prefer_not_to_say";
}

export default function WalkUpPanel({
  sessionId,
  connectionTokenEndpoint = "/api/admin/dropin/terminal/connection-token",
}: WalkUpPanelProps) {
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [reader, setReader] = useState<Reader | null>(null);
  const [loadingTerminal, setLoadingTerminal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [userIdInput, setUserIdInput] = useState("");
  const [newAccount, setNewAccount] = useState<NewAccount>({
    firstName: "",
    lastName: "",
    email: "",
  });
  const [lastResult, setLastResult] = useState<WalkUpResponse | null>(null);
  const cancelledRef = useRef(false);

  // Lazy-load the Terminal SDK + connect to a discovered reader. Connection
  // tokens are minted server-side; the endpoint isn't part of this plan
  // (lives behind admin auth) but we attempt to use it on demand and fail
  // soft if it's not yet wired.
  const ensureTerminal = useCallback(async (): Promise<Terminal | null> => {
    if (terminal) return terminal;
    setLoadingTerminal(true);
    try {
      const t = await loadStripeTerminal();
      if (!t) throw new Error("Stripe Terminal SDK failed to load");
      const instance = t.create({
        onFetchConnectionToken: async () => {
          const res = await fetch(connectionTokenEndpoint, { method: "POST" });
          if (!res.ok) throw new Error(`Connection-token fetch failed: ${res.status}`);
          const json = await res.json();
          return json.secret as string;
        },
        onUnexpectedReaderDisconnect: () => {
          toast.error("Reader disconnected");
          setReader(null);
        },
      });
      setTerminal(instance);
      return instance;
    } catch (err) {
      console.error("[walk-up] Terminal init failed", err);
      toast.error(
        err instanceof Error ? err.message : "Stripe Terminal init failed",
      );
      return null;
    } finally {
      setLoadingTerminal(false);
    }
  }, [terminal, connectionTokenEndpoint]);

  const discoverAndConnect = useCallback(async () => {
    const t = await ensureTerminal();
    if (!t) return;
    const discoverResult = await t.discoverReaders({
      simulated: import.meta.env.DEV,
    });
    if ("error" in discoverResult) {
      toast.error(`Reader discovery failed: ${discoverResult.error.message}`);
      return;
    }
    const first = discoverResult.discoveredReaders[0];
    if (!first) {
      toast.error("No readers found — pair a reader first");
      return;
    }
    const connect = await t.connectReader(first);
    if ("error" in connect) {
      toast.error(`Connect failed: ${connect.error.message}`);
      return;
    }
    setReader(connect.reader);
    toast.success(`Connected to ${connect.reader.label}`);
  }, [ensureTerminal]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const submit = async () => {
    setBusy(true);
    setLastResult(null);
    try {
      const body =
        mode === "existing"
          ? { userId: userIdInput.trim() }
          : { newAccount };
      const res = await fetch(
        `/api/admin/dropin/sessions/${sessionId}/walk-up`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json()) as WalkUpResponse | { error: unknown };
      if (!res.ok) {
        // Surface what the server actually said. Two shapes are in play:
        // a plain `{ error: "…" }` string (most of this endpoint's refusals)
        // and the coded `{ error: { code, message } }` the class guard uses.
        // The old blanket "see console" toast hid both from the person at the
        // desk, who is the only one who can act on them.
        console.error(json);
        toast.error(walkUpErrorMessage(json));
        return;
      }
      const result = json as WalkUpResponse;
      setLastResult(result);
      if (!result.paymentRequired) {
        toast.success(
          `Booked${result.teamAssignment ? ` — ${result.teamAssignment}` : ""}`,
        );
        return;
      }
      // Paid path — drive the reader.
      if (!reader) {
        toast.error("No reader connected. Tap 'Connect reader' first.");
        return;
      }
      if (!terminal) return;
      if (!result.clientSecret) {
        toast.error("Missing client_secret in response");
        return;
      }
      const collectResult = await terminal.collectPaymentMethod(result.clientSecret);
      if ("error" in collectResult) {
        toast.error(`Card read failed: ${collectResult.error.message}`);
        return;
      }
      const processResult = await terminal.processPayment(collectResult.paymentIntent);
      if ("error" in processResult) {
        toast.error(`Process payment failed: ${processResult.error.message}`);
        return;
      }
      toast.success("Payment captured — booking will appear momentarily");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-6 space-y-4">
      <h3 className="text-lg font-semibold">Walk-up registration</h3>

      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode("existing")}
          className={`px-3 py-1 rounded ${
            mode === "existing"
              ? "bg-stone-800 text-white"
              : "bg-stone-100 text-stone-700"
          }`}
        >
          Existing user
        </button>
        <button
          type="button"
          onClick={() => setMode("new")}
          className={`px-3 py-1 rounded ${
            mode === "new"
              ? "bg-stone-800 text-white"
              : "bg-stone-100 text-stone-700"
          }`}
        >
          New account
        </button>
      </div>

      {mode === "existing" && (
        <label className="block text-sm">
          User ID (paste from search above)
          <input
            type="text"
            value={userIdInput}
            onChange={(e) => setUserIdInput(e.target.value)}
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
            placeholder="00000000-..."
          />
        </label>
      )}

      {mode === "new" && (
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="First name"
            value={newAccount.firstName}
            onChange={(e) =>
              setNewAccount({ ...newAccount, firstName: e.target.value })
            }
            className="rounded border border-stone-300 px-3 py-2"
          />
          <input
            placeholder="Last name"
            value={newAccount.lastName}
            onChange={(e) =>
              setNewAccount({ ...newAccount, lastName: e.target.value })
            }
            className="rounded border border-stone-300 px-3 py-2"
          />
          <input
            placeholder="Email"
            type="email"
            value={newAccount.email}
            onChange={(e) =>
              setNewAccount({ ...newAccount, email: e.target.value })
            }
            className="rounded border border-stone-300 px-3 py-2 col-span-2"
          />
          <input
            placeholder="Phone (optional)"
            value={newAccount.phone ?? ""}
            onChange={(e) =>
              setNewAccount({ ...newAccount, phone: e.target.value })
            }
            className="rounded border border-stone-300 px-3 py-2 col-span-2"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center text-sm">
        <button
          type="button"
          onClick={discoverAndConnect}
          disabled={loadingTerminal || !!reader}
          className="px-3 py-1 rounded bg-stone-100 text-stone-700 disabled:opacity-50"
        >
          {reader
            ? `Reader: ${reader.label}`
            : loadingTerminal
              ? "Loading…"
              : "Connect reader"}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="px-4 py-2 rounded bg-orange-600 text-white disabled:opacity-50"
        >
          {busy ? "Working…" : "Register"}
        </button>
      </div>

      {lastResult?.paymentRequired === false && lastResult.bookingId && (
        <div className="text-sm text-emerald-700">
          Booked. ID: {lastResult.bookingId}
          {lastResult.teamAssignment ? ` · Team ${lastResult.teamAssignment}` : ""}
        </div>
      )}
      {lastResult?.paymentRequired && lastResult.amountCents && (
        <div className="text-sm text-stone-700">
          Amount due: ${(lastResult.amountCents / 100).toFixed(2)} — tap card on
          reader.
        </div>
      )}
    </div>
  );
}
