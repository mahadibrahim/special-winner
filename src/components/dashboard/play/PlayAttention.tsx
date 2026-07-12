"use client";

import { useEffect, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { Button } from "@/components/ui/button";
import { TriangleAlert, MapPin, CreditCard } from "lucide-react";
import { DashboardCard } from "@/components/dashboard/shell/DashboardCard";
import {
  PANEL_CLASS,
  PANEL_HEADER_CLASS,
  PANEL_ICON_CLASS,
  PANEL_LABEL_CLASS,
  PANEL_BODY_CLASS,
} from "@/lib/dashboard/dashboard-ui";

interface FieldRental {
  id: string;
  startsAt: string;
  endsAt: string;
  status: "confirmed" | "pending_payment" | "cancelled" | "no_show" | "completed";
  paymentExpiresAt: string | null;
  venueName: string;
  fieldNumber: string | null;
}

interface Booking {
  id: string;
  sessionId: string;
  status:
    | "confirmed"
    | "waitlisted"
    | "pending_payment"
    | "pending_claim"
    | "cancelled"
    | "no_show";
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
  // Hydration beacon lives here per convention: this is the page's
  // top-level client:load island. The client:visible islands below the
  // fold (MyDropInBookings, MyFieldRentals) also call it, but they may
  // never hydrate on a tall page — e2e waitForHydration needs this one.
  useHydrationBeacon();
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

              // Walk-in kiosk hold awaiting payment. No self-serve token is
              // available in this response, so the link goes to the general
              // bookings dashboard rather than a payment URL — see
              // MyDropInBookings/BookButton for the same "no minted token
              // here" boundary.
              if (b.status === "pending_payment") {
                collected.push({
                  kind: "expiring_hold",
                  label: `Complete payment — ${b.session.sportOrClassLabel}`,
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
                  href: "/account/invoices",
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

  return (
    <div className={PANEL_CLASS.attention}>
      {/* Panel header */}
      <div className={PANEL_HEADER_CLASS.attention}>
        <span className={PANEL_ICON_CLASS.attention}>
          <TriangleAlert size={13} aria-hidden={true} />
        </span>
        <h2 className={PANEL_LABEL_CLASS.attention}>Needs your attention</h2>
        <span className="text-[10px] font-medium text-ink-faint ml-auto">
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Panel body */}
      <div className={PANEL_BODY_CLASS}>
        {items.map((item) => {
          const action = item.href ? (
            <Button asChild size="sm" variant="outline">
              <a href={item.href} aria-label={`Go to: ${item.label}`}>Go</a>
            </Button>
          ) : undefined;

          if (item.kind === "check_in") {
            return (
              <DashboardCard
                key={item.label}
                icon={MapPin}
                eyebrow="Check in"
                title={item.label}
                meta={item.sublabel}
                status={{ label: "Check in", tone: "confirmed" }}
                action={action}
              />
            );
          }

          if (item.kind === "expiring_hold") {
            return (
              <DashboardCard
                key={item.label}
                type="field_rental"
                title={item.label}
                meta={item.sublabel}
                status={{ label: "Action needed", tone: "action" }}
                action={action}
              />
            );
          }

          // outstanding_balance
          return (
            <DashboardCard
              key={item.label}
              icon={CreditCard}
              eyebrow="Balance due"
              title={item.label}
              meta={item.sublabel}
              status={{ label: "Balance due", tone: "action" }}
              action={action}
            />
          );
        })}
      </div>
    </div>
  );
}
