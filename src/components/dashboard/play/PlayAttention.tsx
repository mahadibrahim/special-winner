"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface FieldRental {
  id: string;
  startsAt: string;
  endsAt: string;
  status: "confirmed" | "pending_payment" | "cancelled" | "no_show" | "completed";
  paymentExpiresAt: string | null;
  venueName: string;
  fieldNumber: number;
}

interface Booking {
  id: string;
  sessionId: string;
  status: "confirmed" | "waitlisted" | "pending_claim" | "cancelled" | "no_show";
  checkedInAt: string | null;
  session: {
    sportOrClassLabel: string;
    startsAt: string;
    endsAt: string;
    venueName: string | null;
  };
}

interface Payment {
  id: string;
  amountCents: number;
  status: string;
  season: { name: string };
  program: { name: string };
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Returns true when startsAt is within ±2 hours of now. */
function isNearStart(startsAt: string): boolean {
  const diff = Math.abs(new Date(startsAt).getTime() - Date.now());
  return diff <= 2 * 60 * 60 * 1000;
}

/** Returns true when paymentExpiresAt is in the future. */
function isHoldLive(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() > Date.now();
}

interface AttentionItem {
  kind: "check_in" | "expiring_hold" | "outstanding_balance";
  label: string;
  sublabel?: string;
  href?: string;
}

export default function PlayAttention() {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const [rentalsRes, bookingsRes, paymentsRes] = await Promise.allSettled([
          fetch("/api/rentals/bookings"),
          fetch("/api/dropin/bookings"),
          fetch("/api/payments/history"),
        ]);

        const collected: AttentionItem[] = [];

        // Field rental expiring holds and near-start check-ins
        if (rentalsRes.status === "fulfilled" && rentalsRes.value.ok) {
          try {
            const json = await rentalsRes.value.json();
            const rentals: FieldRental[] = json.rentals ?? [];
            const now = Date.now();

            for (const r of rentals) {
              if (r.status === "cancelled" || r.status === "completed") continue;
              const startMs = new Date(r.startsAt).getTime();
              if (startMs <= now) continue;

              // Expiring hold (pending_payment with a live expiry)
              if (r.status === "pending_payment" && r.paymentExpiresAt && isHoldLive(r.paymentExpiresAt)) {
                collected.push({
                  kind: "expiring_hold",
                  label: `Field ${r.fieldNumber} at ${r.venueName} — payment due`,
                  sublabel: `Hold expires ${fmtDateTime(r.paymentExpiresAt)}`,
                  href: "/dashboard/bookings",
                });
              }

              // Available check-in (confirmed, near start, not yet checked in)
              if (r.status === "confirmed" && isNearStart(r.startsAt)) {
                collected.push({
                  kind: "check_in",
                  label: `Check in for Field ${r.fieldNumber} at ${r.venueName}`,
                  sublabel: fmtDateTime(r.startsAt),
                  href: "/dashboard/bookings",
                });
              }
            }
          } catch {
            // Malformed JSON — skip rentals items; component still reaches terminal state
          }
        }

        // Drop-in booking available check-ins and expiring pending claims
        if (bookingsRes.status === "fulfilled" && bookingsRes.value.ok) {
          try {
            const json = await bookingsRes.value.json();
            const bookings: Booking[] = json.bookings ?? [];
            const now = Date.now();

            for (const b of bookings) {
              if (b.status === "cancelled" || b.status === "no_show") continue;
              const startMs = new Date(b.session.startsAt).getTime();
              if (startMs <= now) continue;

              // Available check-in (confirmed, near start, not yet checked in)
              if (b.status === "confirmed" && !b.checkedInAt && isNearStart(b.session.startsAt)) {
                collected.push({
                  kind: "check_in",
                  label: `Check in for ${b.session.sportOrClassLabel}`,
                  sublabel: b.session.venueName
                    ? `${fmtDateTime(b.session.startsAt)} · ${b.session.venueName}`
                    : fmtDateTime(b.session.startsAt),
                  href: "/dashboard/bookings",
                });
              }

              // Pending claim (someone else claimed their spot and must confirm)
              if (b.status === "pending_claim") {
                collected.push({
                  kind: "expiring_hold",
                  label: `Confirm your spot — ${b.session.sportOrClassLabel}`,
                  sublabel: fmtDateTime(b.session.startsAt),
                  href: "/dashboard/bookings",
                });
              }
            }
          } catch {
            // Malformed JSON — skip bookings items; component still reaches terminal state
          }
        }

        // Outstanding balances — failed or pending payments
        if (paymentsRes.status === "fulfilled" && paymentsRes.value.ok) {
          try {
            const json = await paymentsRes.value.json();
            const payments: Payment[] = json.payments ?? [];

            for (const p of payments) {
              if (p.status === "failed" || p.status === "pending") {
                collected.push({
                  kind: "outstanding_balance",
                  label: `Balance due — ${p.program.name} (${p.season.name})`,
                  sublabel: `$${(p.amountCents / 100).toFixed(2)}`,
                  href: "/dashboard/payments",
                });
              }
            }
          } catch {
            // Malformed JSON — skip payments items; component still reaches terminal state
          }
        }

        setItems(collected);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // While loading, render nothing (steady-state "nothing pending" is null)
  if (loading) return null;

  // Nothing pending — render nothing so the play page can skip this section entirely
  if (items.length === 0) return null;

  const kindIcon: Record<AttentionItem["kind"], string> = {
    check_in: "📍",
    expiring_hold: "⏳",
    outstanding_balance: "💳",
  };

  const kindBadge: Record<AttentionItem["kind"], string> = {
    check_in: "bg-emerald-100 text-emerald-900 border-emerald-200",
    expiring_hold: "bg-amber-100 text-amber-900 border-amber-200",
    outstanding_balance: "bg-rose-100 text-rose-900 border-rose-200",
  };

  const kindLabel: Record<AttentionItem["kind"], string> = {
    check_in: "Check in",
    expiring_hold: "Action needed",
    outstanding_balance: "Balance due",
  };

  return (
    <section>
      {/* Heading mirrors DashboardSection.astro accent="attention" — keep classes in sync */}
      <h2 className="text-[11px] font-semibold tracking-[0.15em] uppercase mb-4 text-ochre">
        1 · Needs your attention
      </h2>
      <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-stone-200 bg-paper px-4 py-3 flex items-start justify-between gap-3"
        >
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 text-base leading-none">{kindIcon[item.kind]}</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{item.label}</p>
              {item.sublabel && (
                <p className="text-xs text-ink-muted mt-0.5">{item.sublabel}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className={`text-xs ${kindBadge[item.kind]}`}>
              {kindLabel[item.kind]}
            </Badge>
            {item.href && (
              <Button asChild size="sm" variant="outline">
                <a href={item.href} aria-label={`Go to: ${item.label}`}>Go</a>
              </Button>
            )}
          </div>
        </div>
      ))}
      </div>
    </section>
  );
}
