"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { fmtDay, fmtSessionDate, fmtSessionTime, formatDollars } from "./format";
import type { PreviewResponse } from "./types";

interface Block {
  id: string;
  label: string;
  brand: string;
  status: "draft" | "awaiting_deposit" | "active" | "completed" | "cancelled";
  locationId: string;
  renterName: string;
  renterEmail: string | null;
  renterPhone: string | null;
  partySize: number;
  purpose: string | null;
  notes: string | null;
  pattern: DraftPattern | null;
  subtotalCents: number;
  discountKind: string | null;
  discountValue: number | null;
  totalCents: number;
  depositPctSnapshot: number | null;
  depositDueCents: number;
  depositPaidAt: string | null;
  depositExpiresAt: string | null;
  balanceDueCents: number;
  balanceDueAt: string | null;
  balancePaidAt: string | null;
  offlinePaymentMethod: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

/** The generator input a draft carries so it can be reopened and re-checked. */
interface DraftPattern {
  pattern: {
    timeZone: string;
    firstDate: string;
    lastDate: string;
    days: Array<{
      weekday: number;
      startMinute: number;
      durationMinutes: number;
      venueIds: string[];
    }>;
  };
  excludedKeys: string[];
  sessionOverrides: Record<
    string,
    { startMinute?: number; durationMinutes?: number; venueId?: string }
  >;
  extraSessions: Array<{
    key: string;
    date: string;
    venueId: string;
    startMinute: number;
    durationMinutes: number;
    startsAt: string;
    endsAt: string;
  }>;
}

interface Session {
  id: string;
  venueId: string;
  venueName: string;
  fieldNumber: number;
  startsAt: string;
  endsAt: string;
  status: string;
  paymentStatus: string;
  amountDueCents: number;
  amountPaidCents: number;
  waiverSigned: boolean;
  checkedInAt: string | null;
}

interface BlockDetailProps {
  blockId: string;
  /** Org IANA timezone — session times are displayed in it. */
  timeZone: string;
}

function statusColor(s: Block["status"]): string {
  switch (s) {
    case "draft":
      return "bg-stone-100 text-stone-700 border-stone-200";
    case "awaiting_deposit":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "active":
      return "bg-emerald-100 text-emerald-900 border-emerald-200";
    case "completed":
      return "bg-sky-100 text-sky-900 border-sky-200";
    case "cancelled":
      return "bg-rose-100 text-rose-900 border-rose-200";
  }
}

function discountLabel(block: Block): string {
  if (!block.discountKind || block.discountValue === null) return "—";
  return block.discountKind === "percent"
    ? `${block.discountValue}%`
    : formatDollars(block.discountValue);
}

export function BlockDetail({ blockId, timeZone }: BlockDetailProps) {
  useHydrationBeacon();

  const [block, setBlock] = useState<Block | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const [cancelFrom, setCancelFrom] = useState("");
  // Destructive actions take a typed confirmation rather than window.confirm:
  // browser dialogs block automation and can't be driven by the e2e suite.
  const [cancelConfirm, setCancelConfirm] = useState("");
  const [recheck, setRecheck] = useState<{ total: number; conflicts: string[] } | null>(null);
  // Whole dollars only: the endpoint rejects anything that is not a multiple
  // of 100 cents, so the field never offers cents to type into.
  const [refundDollars, setRefundDollars] = useState("");

  const reload = async () => {
    try {
      const res = await fetch(`/api/admin/rentals/blocks/${blockId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { block: Block; sessions: Session[] };
      setBlock(json.block);
      setSessions(json.sessions ?? []);
      setNotes(json.block.notes ?? "");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [blockId]);

  const saveNotes = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/rentals/blocks/${blockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Save failed");
        return;
      }
      toast.success("Notes saved");
      setBlock(json.block);
    } finally {
      setBusy(false);
    }
  };

  const cancelRemaining = async () => {
    if (!cancelFrom) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/rentals/blocks/${blockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelRemainingFrom: new Date(cancelFrom).toISOString() }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Cancel failed");
        return;
      }
      toast.success(
        `${json.cancelledSessionIds.length} sessions cancelled · suggested refund ${formatDollars(
          json.suggestedRefundCents,
        )}`,
      );
      setCancelFrom("");
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const cancelBlock = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/rentals/blocks/${blockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancel: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Cancel failed");
        return;
      }
      toast.success(
        `Block cancelled · suggested refund ${formatDollars(json.suggestedRefundCents)}`,
      );
      setCancelConfirm("");
      await reload();
    } finally {
      setBusy(false);
    }
  };

  /**
   * Send (or resend) a payment link. The token behind it is minted
   * idempotently and the Stripe Checkout Session is created when the renter
   * clicks, so resending never strands the renter on a stale session.
   */
  const sendLink = async (kind: "deposit" | "balance") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/rentals/blocks/${blockId}/${kind}-link`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? `Could not send the ${kind} link`);
        return;
      }
      toast.success(
        `${kind === "deposit" ? "Deposit" : "Balance"} link sent${
          json.channel ? ` by ${json.channel}` : ""
        }`,
      );
      await reload();
    } finally {
      setBusy(false);
    }
  };

  /**
   * Refund against the block's payment intents. The endpoint caps the amount
   * at what the block has actually been paid and writes the reduced figure
   * back, so a second refund is capped at the remainder.
   */
  const issueRefund = async () => {
    const cents = Math.round(Number(refundDollars) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/rentals/blocks/${blockId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: cents }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Refund failed");
        await reload();
        return;
      }
      toast.success(
        `${formatDollars(json.refundedCents)} refunded${
          json.offline ? " (recorded only - this block was settled offline)" : ""
        }`,
      );
      setRefundDollars("");
      await reload();
    } finally {
      setBusy(false);
    }
  };

  /**
   * A draft holds nothing firm, so what it was priced against can be gone by
   * the time someone reopens it. Re-run the same preview the builder uses and
   * report what the ledger has taken since.
   */
  const recheckAvailability = async () => {
    if (!block?.pattern) return;
    setBusy(true);
    try {
      const draft = block.pattern;
      const res = await fetch("/api/admin/rentals/blocks/generate-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: block.locationId,
          brand: block.brand,
          label: block.label,
          renterName: block.renterName,
          renterEmail: block.renterEmail,
          renterPhone: block.renterPhone,
          partySize: block.partySize,
          pattern: draft.pattern,
          excludedKeys: draft.excludedKeys ?? [],
          sessionOverrides: draft.sessionOverrides ?? {},
          extraSessions: draft.extraSessions ?? [],
          discount:
            block.discountKind && block.discountValue !== null
              ? { kind: block.discountKind, value: block.discountValue }
              : null,
          depositPct: block.depositPctSnapshot ?? 25,
          mode: "draft",
        }),
      });
      const json = (await res.json()) as PreviewResponse & { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "Re-check failed");
        return;
      }
      setRecheck({
        total: json.sessions.length,
        conflicts: json.sessions
          .filter((s) => s.conflict)
          .map((s) => `${fmtSessionDate(s.startsAt, timeZone)} — ${s.conflict!.reason}`),
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorBanner message={error} />;
  if (!block) return null;

  const isDraft = block.status === "draft";
  const isTerminal = block.status === "cancelled" || block.status === "completed";
  const paidCents =
    (block.depositPaidAt ? block.depositDueCents : 0) +
    (block.balancePaidAt ? block.balanceDueCents : 0);
  // Mirrors the guards on the two link endpoints, so a disabled-looking action
  // is never offered and then rejected.
  const canSendDeposit = block.status === "awaiting_deposit";
  const canSendBalance =
    block.status === "active" && !block.balancePaidAt && block.balanceDueCents > 0;
  const refundCents = Math.round(Number(refundDollars) * 100);
  const refundAmountValid =
    refundDollars.trim() !== "" &&
    Number.isFinite(refundCents) &&
    refundCents > 0 &&
    refundCents <= paidCents;

  return (
    <div className="space-y-6 max-w-4xl">
      <a
        href="/admin/rentals/blocks"
        className="text-xs uppercase tracking-wider text-ink-muted hover:text-ink"
      >
        ← All blocks
      </a>

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">{block.label}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {block.renterName}
            {block.renterEmail && <> · {block.renterEmail}</>}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="outline" className={statusColor(block.status)}>
              {block.status.replace(/_/g, " ")}
            </Badge>
            <span className="text-xs text-ink-muted">{block.brand}</span>
          </div>
        </div>
        {isDraft && (
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={recheckAvailability}>
              Re-check availability
            </Button>
            <Button asChild>
              <a href={`/admin/rentals/blocks/new?draft=${block.id}`}>Open in builder</a>
            </Button>
          </div>
        )}
      </header>

      {recheck && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            recheck.conflicts.length === 0
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {recheck.conflicts.length === 0 ? (
            <>All {recheck.total} sessions are still available.</>
          ) : (
            <>
              <div className="font-medium">
                {recheck.conflicts.length} of {recheck.total} sessions are no longer available:
              </div>
              <ul className="mt-1 list-disc pl-5">
                {recheck.conflicts.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Renter */}
      <section className="rounded-xl border border-border bg-cream-2 p-5">
        <h2 className="font-semibold text-ink mb-3">Renter</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Name</div>
            <div className="text-ink">{block.renterName}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Email</div>
            <div className="text-ink">{block.renterEmail ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Phone</div>
            <div className="text-ink">{block.renterPhone ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Party size</div>
            <div className="text-ink">{block.partySize}</div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs uppercase tracking-wider text-ink-muted">Purpose</div>
            <div className="text-ink">{block.purpose ?? "—"}</div>
          </div>
        </div>
      </section>

      {/* Money */}
      <section className="rounded-xl border border-border bg-cream-2 p-5">
        <h2 className="font-semibold text-ink mb-3">Money</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Subtotal</div>
            <div className="text-ink">{formatDollars(block.subtotalCents)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Discount</div>
            <div className="text-ink">{discountLabel(block)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Block total</div>
            <div className="text-ink font-semibold">{formatDollars(block.totalCents)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Deposit</div>
            <div className="text-ink">
              {formatDollars(block.depositDueCents)}
              <span className="text-xs text-ink-muted ml-1">
                {block.depositPaidAt
                  ? `paid ${fmtDay(block.depositPaidAt, timeZone)}`
                  : "unpaid"}
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Balance</div>
            <div className="text-ink">
              {formatDollars(block.balanceDueCents)}
              <span className="text-xs text-ink-muted ml-1">
                {block.balancePaidAt
                  ? `paid ${fmtDay(block.balancePaidAt, timeZone)}`
                  : block.balanceDueAt
                    ? `due ${fmtDay(block.balanceDueAt, timeZone)}`
                    : "unscheduled"}
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">Paid so far</div>
            <div className="text-ink">{formatDollars(paidCents)}</div>
          </div>
        </div>
        {block.offlinePaymentMethod && (
          <p className="mt-3 text-xs text-ink-muted">
            Marked paid offline · {block.offlinePaymentMethod}
          </p>
        )}
      </section>

      {/* Sessions */}
      <section className="rounded-xl border border-border bg-cream-2 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">Sessions</h2>
          <span className="text-xs text-ink-muted">{sessions.length} total</span>
        </div>
        {sessions.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No session rows yet — a draft holds its slots as soft quote markers only.
          </p>
        ) : (
          <div className="rounded-lg border border-border bg-cream overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream-2 border-b border-border">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium text-ink-muted">Date</th>
                  <th className="px-3 py-2 font-medium text-ink-muted">Field</th>
                  <th className="px-3 py-2 font-medium text-ink-muted">Time</th>
                  <th className="px-3 py-2 font-medium text-ink-muted">Status</th>
                  <th className="px-3 py-2 font-medium text-ink-muted">Amount</th>
                  <th className="px-3 py-2 font-medium text-ink-muted">Waiver</th>
                  <th className="px-3 py-2 font-medium text-ink-muted">In</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-3 py-2 text-ink whitespace-nowrap">
                      {fmtSessionDate(s.startsAt, timeZone)}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      {s.venueName} · Field {s.fieldNumber}
                    </td>
                    <td className="px-3 py-2 text-ink-muted whitespace-nowrap">
                      {fmtSessionTime(s.startsAt, timeZone)} – {fmtSessionTime(s.endsAt, timeZone)}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">{s.status.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-ink whitespace-nowrap">
                      {formatDollars(s.amountDueCents)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {s.waiverSigned ? (
                        <span className="text-emerald-700 font-medium">&#10003;</span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {s.checkedInAt ? (
                        <span className="text-emerald-700 font-medium">&#10003;</span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <a href={`/admin/rentals/${s.id}`} className="text-xs text-ink underline">
                        Open
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Notes */}
      <section className="space-y-2">
        <h2 className="font-semibold text-ink">Internal notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="w-full rounded border border-border px-3 py-2 text-sm bg-cream resize-y"
          placeholder="Not shown to the renter…"
        />
        <Button size="sm" onClick={saveNotes} disabled={busy}>
          {busy ? "Saving…" : "Save notes"}
        </Button>
      </section>

      {/* Actions */}
      {!isTerminal && (
        <section className="rounded-xl border border-border bg-cream-2 p-5 space-y-4">
          <h2 className="font-semibold text-ink">Actions</h2>

          {(canSendDeposit || canSendBalance) && (
            <div className="flex flex-wrap items-center gap-3">
              {canSendDeposit && (
                <Button size="sm" disabled={busy} onClick={() => sendLink("deposit")}>
                  {block.depositExpiresAt ? "Resend deposit link" : "Send deposit link"}
                </Button>
              )}
              {canSendBalance && (
                <Button size="sm" disabled={busy} onClick={() => sendLink("balance")}>
                  Send balance link
                </Button>
              )}
              <span className="text-xs text-ink-muted">
                Emails the renter their payment page. Nothing is charged here.
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="cancel-from">Cancel remaining from</Label>
              <input
                id="cancel-from"
                type="date"
                value={cancelFrom}
                onChange={(e) => setCancelFrom(e.target.value)}
                className="rounded border border-border px-2 py-1.5 text-sm bg-cream"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !cancelFrom}
              onClick={cancelRemaining}
              className="text-rose-700 border-rose-200 hover:bg-rose-50"
            >
              Cancel remaining sessions
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="cancel-confirm">
                Type CANCEL to cancel the whole block
              </Label>
              <Input
                id="cancel-confirm"
                value={cancelConfirm}
                onChange={(e) => setCancelConfirm(e.target.value)}
                placeholder="CANCEL"
                className="w-40"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || cancelConfirm !== "CANCEL"}
              onClick={cancelBlock}
              className="text-rose-700 border-rose-200 hover:bg-rose-50"
            >
              Cancel block
            </Button>
          </div>

        </section>
      )}

      {/* Refund: offered after cancellation too, which is when it is usually needed. */}
      {paidCents > 0 && (
        <section className="rounded-xl border border-border bg-cream-2 p-5 space-y-3">
          <h2 className="font-semibold text-ink">Refund</h2>
          <p className="text-xs text-ink-muted">
            Goes back against the deposit first, then the balance. Whole dollars only,
            up to the {formatDollars(paidCents)} paid.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="refund-amount">Amount ($)</Label>
              <Input
                id="refund-amount"
                type="number"
                min={1}
                step={1}
                value={refundDollars}
                onChange={(e) => setRefundDollars(e.target.value)}
                placeholder={String(Math.round(paidCents / 100))}
                className="w-32"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !refundAmountValid}
              onClick={issueRefund}
              className="text-rose-700 border-rose-200 hover:bg-rose-50"
            >
              Issue refund
            </Button>
          </div>
        </section>
      )}

      {block.cancelledAt && (
        <p className="text-xs text-ink-muted">
          Cancelled {fmtDay(block.cancelledAt, timeZone)}
        </p>
      )}
    </div>
  );
}
