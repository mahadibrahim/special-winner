"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { formatDollars } from "@/components/admin/rentals/blocks/format";

interface PublicBlock {
  id: string;
  label: string;
  brand: string;
  status: "draft" | "awaiting_deposit" | "active" | "completed" | "cancelled";
  renterName: string;
  partySize: number;
  purpose: string | null;
  locationName: string | null;
  subtotalCents: number;
  discountKind: string | null;
  discountValue: number | null;
  totalCents: number;
  depositDueCents: number;
  depositPaidAt: string | null;
  depositExpiresAt: string | null;
  balanceDueCents: number;
  balanceDueAt: string | null;
  balancePaidAt: string | null;
  cancelledAt: string | null;
}

interface PublicSession {
  id: string;
  venueName: string;
  fieldNumber: number;
  startsAt: string;
  endsAt: string;
  status: string;
  amountDueCents: number;
}

interface Owed {
  kind: "deposit" | "balance" | "none";
  cents: number;
  dueAt: string | null;
}

interface Payload {
  block: PublicBlock;
  sessions: PublicSession[];
  owed: Owed;
  timeZone: string;
}

interface BlockQuotePageProps {
  token: string;
  /** Drives the palette. Branding comes from the block, never the request host. */
  brand: "soccerone" | "aspire";
  contactPhone: string;
}

/**
 * Palettes rather than one theme: this page is served on both the SoccerOne
 * (dark) and Aspire (cream) hosts, and the block's own `brand` column decides
 * which - the request host does not.
 */
function palette(brand: "soccerone" | "aspire") {
  return brand === "soccerone"
    ? {
        card: "rounded-xl border border-white/10 bg-white/5 p-5",
        heading: "text-white",
        muted: "text-white/60",
        body: "text-white/85",
        rowBorder: "border-white/10",
        cta: "bg-[var(--so-lime,#c3f53c)] text-black hover:opacity-90",
        good: "text-emerald-300",
      }
    : {
        card: "rounded-xl border border-border bg-cream-2 p-5",
        heading: "text-ink",
        muted: "text-ink-muted",
        body: "text-ink",
        rowBorder: "border-border",
        cta: "bg-primary text-primary-foreground hover:opacity-90",
        good: "text-emerald-700",
      };
}

function fmtDate(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function fmtTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDay(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function BlockQuotePage({ token, brand, contactPhone }: BlockQuotePageProps) {
  useHydrationBeacon();

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const p = palette(brand);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/rentals/blocks/${token}`);
        if (res.status === 410) {
          throw new Error(
            `This link has expired. Call or text us at ${contactPhone} and we'll send a fresh one.`,
          );
        }
        if (res.status === 404) {
          throw new Error(
            `We couldn't find this booking. Call or text us at ${contactPhone}.`,
          );
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Payload;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, contactPhone]);

  const pay = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/rentals/blocks/${token}/pay`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.checkoutUrl) {
        toast.error(json.error ?? "Could not start checkout");
        return;
      }
      window.location.href = json.checkoutUrl;
    } catch {
      toast.error("Could not start checkout");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  const { block, sessions, owed, timeZone } = data;

  if (block.status === "cancelled") {
    return (
      <EmptyState
        title="This booking was cancelled"
        description={`Call or text us at ${contactPhone} if that's a surprise and we'll sort it out.`}
      />
    );
  }

  const discountLabel =
    block.discountKind && block.discountValue !== null
      ? block.discountKind === "percent"
        ? `${block.discountValue}%`
        : formatDollars(block.discountValue)
      : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className={`text-2xl sm:text-3xl font-bold ${p.heading}`}>{block.label}</h1>
        <p className={`mt-1 text-sm ${p.muted}`}>
          {block.renterName}
          {block.locationName && <> · {block.locationName}</>}
          {sessions.length > 0 && (
            <> · {sessions.length} session{sessions.length === 1 ? "" : "s"}</>
          )}
        </p>
      </header>

      {/* What's owed now - the reason the renter opened this link. */}
      <section className={p.card}>
        {owed.kind === "none" ? (
          <div>
            <h2 className={`font-semibold ${p.heading}`}>You're all set</h2>
            <p className={`mt-1 text-sm ${p.good}`}>
              {block.balancePaidAt
                ? `Paid in full — ${formatDollars(block.totalCents)}.`
                : "Nothing is due right now."}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className={`text-xs uppercase tracking-wider ${p.muted}`}>
                {owed.kind === "deposit" ? "Deposit due now" : "Balance due"}
              </div>
              <div className={`text-3xl font-bold ${p.heading}`}>
                {formatDollars(owed.cents)}
              </div>
              {owed.dueAt && (
                <div className={`mt-1 text-xs ${p.muted}`}>
                  {owed.kind === "deposit"
                    ? `Holds your dates until ${fmtDay(owed.dueAt, timeZone)}`
                    : `Due ${fmtDay(owed.dueAt, timeZone)}`}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={pay}
              disabled={busy}
              className={`rounded-md px-5 py-2.5 text-sm font-semibold disabled:opacity-60 ${p.cta}`}
            >
              {busy
                ? "Starting checkout…"
                : owed.kind === "deposit"
                  ? "Pay deposit"
                  : "Pay balance"}
            </button>
          </div>
        )}
      </section>

      {/* Money */}
      <section className={p.card}>
        <h2 className={`font-semibold mb-3 ${p.heading}`}>Your quote</h2>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className={p.muted}>Subtotal</dt>
            <dd className={p.body}>{formatDollars(block.subtotalCents)}</dd>
          </div>
          {discountLabel && (
            <div className="flex justify-between">
              <dt className={p.muted}>Discount</dt>
              <dd className={p.body}>{discountLabel}</dd>
            </div>
          )}
          <div className={`flex justify-between border-t pt-1.5 ${p.rowBorder}`}>
            <dt className={`font-medium ${p.body}`}>Total</dt>
            <dd className={`font-semibold ${p.heading}`}>
              {formatDollars(block.totalCents)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className={p.muted}>Deposit</dt>
            <dd className={p.body}>
              {formatDollars(block.depositDueCents)}
              {block.depositPaidAt && (
                <span className={`ml-1 text-xs ${p.good}`}>
                  paid {fmtDay(block.depositPaidAt, timeZone)}
                </span>
              )}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className={p.muted}>Balance</dt>
            <dd className={p.body}>
              {formatDollars(block.balanceDueCents)}
              {block.balancePaidAt ? (
                <span className={`ml-1 text-xs ${p.good}`}>
                  paid {fmtDay(block.balancePaidAt, timeZone)}
                </span>
              ) : block.balanceDueAt ? (
                <span className={`ml-1 text-xs ${p.muted}`}>
                  due {fmtDay(block.balanceDueAt, timeZone)}
                </span>
              ) : null}
            </dd>
          </div>
        </dl>
      </section>

      {/* Schedule */}
      <section className={p.card}>
        <h2 className={`font-semibold mb-3 ${p.heading}`}>Your schedule</h2>
        {sessions.length === 0 ? (
          <p className={`text-sm ${p.muted}`}>
            Your dates are penciled in. They're confirmed the moment the deposit lands.
          </p>
        ) : (
          <ul className="text-sm">
            {sessions.map((s) => (
              <li
                key={s.id}
                className={`flex flex-wrap justify-between gap-2 border-t py-2 first:border-t-0 first:pt-0 ${p.rowBorder}`}
              >
                <span className={p.body}>
                  {fmtDate(s.startsAt, timeZone)} · {fmtTime(s.startsAt, timeZone)} –{" "}
                  {fmtTime(s.endsAt, timeZone)}
                </span>
                <span className={p.muted}>
                  {s.venueName}
                  {s.status === "cancelled" && " · cancelled"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className={`text-xs ${p.muted}`}>
        Questions about these dates? Call or text us at {contactPhone}.
      </p>
    </div>
  );
}

export default BlockQuotePage;
