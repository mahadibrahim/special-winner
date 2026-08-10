"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Ban, DollarSign, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

interface PaymentRow {
  id: string;
  amountCents: number;
  status: string;
  paymentMethod: string | null;
  stripePaymentIntentId: string | null;
  refundReason: string | null;
  createdAt: string;
}

interface RegistrationDetail {
  registration: {
    id: string;
    status: string;
    paymentStatus: string;
    amountPaidCents: number;
    amountDueCents: number;
    refundStatus: string;
    refundAmountCents: number | null;
    waiverSigned: boolean;
    cancelledAt: string | null;
    cancelledReason: string | null;
    createdAt: string;
    notes: string | null;
  };
  familyMember: { id: string; firstName: string; lastName: string; birthDate: string | null };
  season: { id: string; name: string; startDate: string; endDate: string; priceCents: number };
  program: { id: string; name: string; slug: string };
  sport: { id: string; name: string; slug: string };
  location: { id: string; name: string };
  parent: { id: string; email: string; firstName: string | null; lastName: string | null };
  paymentHistory: PaymentRow[];
  /**
   * Present when this registration belongs to a team registration — the
   * member's own amounts are usually $0/$0 (covered by the captain's
   * deposit), so the team's money state and team-level payment rows are
   * what the admin needs to see (#530).
   */
  team: {
    id: string;
    teamName: string;
    teamFeeCents: number | null;
    depositCents: number;
    collectedCents: number;
    role: string;
    payments: Array<{
      id: string;
      amountCents: number;
      paymentType: string;
      status: string;
      stripePaymentIntentId: string | null;
      createdAt: string;
    }>;
  } | null;
}

function formatCurrency(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusBadge(status: string) {
  const variants: Record<string, string> = {
    confirmed: "bg-green-100 text-green-800",
    pending: "bg-yellow-100 text-yellow-800",
    waitlisted: "bg-blue-100 text-blue-800",
    cancelled: "bg-red-100 text-red-800",
    refunded: "bg-red-100 text-red-800",
  };
  return (
    <Badge className={`${variants[status] ?? ""} hover:${variants[status] ?? ""}`}>
      {status}
    </Badge>
  );
}

function paymentBadge(status: string) {
  const variants: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    unpaid: "bg-red-100 text-red-800",
    deposit_paid: "bg-yellow-100 text-yellow-800",
    partial_refund: "bg-orange-100 text-orange-800",
    refunded: "bg-gray-200 text-gray-700",
  };
  return (
    <Badge className={`${variants[status] ?? ""} hover:${variants[status] ?? ""}`}>
      {status}
    </Badge>
  );
}

export function RegistrationDetail({ id }: { id: string }) {
  const [data, setData] = useState<RegistrationDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function fetchDetail() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/registrations/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${res.status})`);
      }
      setData(await res.json());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load registration");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton className="h-8 w-1/3" />
        <LoadingSkeleton className="h-40 w-full" />
        <LoadingSkeleton className="h-40 w-full" />
      </div>
    );
  }

  if (loadError) {
    return <ErrorBanner message={loadError} />;
  }

  if (!data) return null;

  const { registration, familyMember, season, program, sport, location, parent, paymentHistory, team } = data;
  const isCancelled = registration.status === "cancelled" || registration.status === "refunded";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <a
          href="/admin/registrations"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> All registrations
        </a>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {familyMember.firstName} {familyMember.lastName}
          </h1>
          <p className="text-gray-600 mt-1">
            {program.name} · {season.name} · {sport.name} · {location.name}
          </p>
          <div className="flex items-center gap-2 mt-3">
            {statusBadge(registration.status)}
            {paymentBadge(registration.paymentStatus)}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Registration</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Player DOB</p>
            <p className="font-medium">
              {familyMember.birthDate
                ? new Date(familyMember.birthDate).toLocaleDateString()
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Parent</p>
            <p className="font-medium">
              {parent.firstName} {parent.lastName}
            </p>
            <p className="text-muted-foreground">{parent.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Amount</p>
            {team ? (
              <>
                <p className="font-medium">
                  Team: {formatCurrency(team.collectedCents)} paid
                  {team.teamFeeCents != null &&
                    ` / ${formatCurrency(team.teamFeeCents)} total`}
                </p>
                <p className="text-muted-foreground text-xs">
                  {team.teamName} — remainder splits across roster
                </p>
              </>
            ) : (
              <p className="font-medium">
                {formatCurrency(registration.amountPaidCents)} paid ·{" "}
                {formatCurrency(registration.amountDueCents)} due
              </p>
            )}
          </div>
          <div>
            <p className="text-muted-foreground">Waiver</p>
            <p className="font-medium">{registration.waiverSigned ? "Signed" : "Not signed"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Registered</p>
            <p className="font-medium">{formatDate(registration.createdAt)}</p>
          </div>
          {registration.cancelledAt && (
            <div className="col-span-2 md:col-span-2">
              <p className="text-muted-foreground">Cancelled</p>
              <p className="font-medium">{formatDate(registration.cancelledAt)}</p>
              {registration.cancelledReason && (
                <p className="text-muted-foreground italic">"{registration.cancelledReason}"</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payment history</CardTitle>
          <CardDescription>All payments and refunds against this registration</CardDescription>
        </CardHeader>
        <CardContent>
          {paymentHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Method</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Stripe PI</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentHistory.map((p) => (
                    <tr key={p.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{formatDate(p.createdAt)}</td>
                      <td className="py-2 pr-4 font-medium">{formatCurrency(p.amountCents)}</td>
                      <td className="py-2 pr-4">{p.paymentMethod ?? "—"}</td>
                      <td className="py-2 pr-4">{p.status}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                        {p.stripePaymentIntentId ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {team && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Team payments</CardTitle>
            <CardDescription>
              Team-level money for{" "}
              <a
                href={`/admin/teams/registrations/${team.id}`}
                className="text-primary hover:underline font-medium"
              >
                {team.teamName}
              </a>{" "}
              — this player's spot is covered by the team fee, not a
              per-player charge. Refunds of this money happen at the team
              level.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {team.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No team payments recorded.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 pr-4">Amount</th>
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Stripe PI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.payments.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">{formatDate(p.createdAt)}</td>
                        <td className="py-2 pr-4 font-medium">
                          {formatCurrency(p.amountCents)}
                        </td>
                        <td className="py-2 pr-4">{p.paymentType}</td>
                        <td className="py-2 pr-4">{p.status}</td>
                        <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                          {p.stripePaymentIntentId ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Admin actions</CardTitle>
          <CardDescription>
            Override customer-side policy gates. These actions are not reversible.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => setCancelOpen(true)}
            disabled={isCancelled}
          >
            <Ban className="w-4 h-4 mr-2" /> Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => setRefundOpen(true)}
            disabled={registration.amountPaidCents <= 0}
          >
            <DollarSign className="w-4 h-4 mr-2" /> Refund
          </Button>
          <Button
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" /> Delete
          </Button>
        </CardContent>
      </Card>

      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        registrationId={id}
        onDone={() => {
          setCancelOpen(false);
          void fetchDetail();
        }}
      />

      <RefundDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        registrationId={id}
        amountPaidCents={registration.amountPaidCents}
        onDone={() => {
          setRefundOpen(false);
          void fetchDetail();
        }}
      />

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        registrationId={id}
        amountPaidCents={registration.amountPaidCents}
        paymentStatus={registration.paymentStatus}
        onDone={() => {
          window.location.href = "/admin/registrations";
        }}
      />
    </div>
  );
}

function CancelDialog({
  open,
  onOpenChange,
  registrationId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registrationId: string;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleCancel() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${res.status})`);
      }
      toast.success("Registration cancelled");
      onDone();
      setReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel registration</DialogTitle>
          <DialogDescription>
            Marks the registration as cancelled. No money is moved — issue a refund separately
            if one is owed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cancel-reason">Reason (optional, internal note)</Label>
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. parent requested via email"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Back
          </Button>
          <Button onClick={handleCancel} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirm cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({
  open,
  onOpenChange,
  registrationId,
  amountPaidCents,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registrationId: string;
  amountPaidCents: number;
  onDone: () => void;
}) {
  const [amountDollars, setAmountDollars] = useState((amountPaidCents / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [alsoCancel, setAlsoCancel] = useState(true);
  // Admin-direct refund default is cash — this is the director-approved
  // exception path (owner policy: refunds default to credit everywhere
  // else, e.g. the customer-request approve dialog).
  const [asCredit, setAsCredit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Re-seed the amount field whenever the dialog reopens with a new paid amount.
  useEffect(() => {
    if (open) setAmountDollars((amountPaidCents / 100).toFixed(2));
  }, [open, amountPaidCents]);

  async function handleRefund() {
    const cents = Math.round(parseFloat(amountDollars || "0") * 100);
    if (Number.isNaN(cents) || cents < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (cents > amountPaidCents) {
      toast.error(`Cannot refund more than ${(amountPaidCents / 100).toFixed(2)}`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/registrations/${registrationId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountCents: cents,
          reason: reason.trim() || undefined,
          alsoCancel,
          asCredit,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${res.status})`);
      }
      toast.success(
        asCredit
          ? `Issued $${(cents / 100).toFixed(2)} as account credit`
          : `Refunded $${(cents / 100).toFixed(2)}`,
      );
      onDone();
      setReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue refund</DialogTitle>
          <DialogDescription>
            {asCredit
              ? "Issues an account credit the customer can apply to a future registration. No Stripe refund is made."
              : "Sends the refund directly through Stripe. The customer will receive an email."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="refund-amount">Amount (USD)</Label>
            <Input
              id="refund-amount"
              type="number"
              step="0.01"
              min="0"
              max={(amountPaidCents / 100).toFixed(2)}
              value={amountDollars}
              onChange={(e) => setAmountDollars(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Paid: ${(amountPaidCents / 100).toFixed(2)}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="refund-reason">Reason (internal note)</Label>
            <Textarea
              id="refund-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. parent requested due to schedule conflict"
              rows={3}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              id="also-cancel"
              checked={alsoCancel}
              onCheckedChange={(v) => setAlsoCancel(v === true)}
            />
            <span className="text-sm">Also cancel the registration</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              id="as-credit"
              checked={asCredit}
              onCheckedChange={(v) => setAsCredit(v === true)}
            />
            <span className="text-sm">Issue as store credit instead of a Stripe refund</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Back
          </Button>
          <Button onClick={handleRefund} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {asCredit ? "Issue credit" : "Process refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  registrationId,
  amountPaidCents,
  paymentStatus,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registrationId: string;
  amountPaidCents: number;
  paymentStatus: string;
  onDone: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [force, setForce] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const wouldBlock = amountPaidCents > 0 && paymentStatus !== "refunded";

  async function handleDelete() {
    if (confirmText !== "DELETE") {
      toast.error('Type "DELETE" to confirm');
      return;
    }
    setSubmitting(true);
    try {
      const url = `/api/admin/registrations/${registrationId}${force ? "?force=true" : ""}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${res.status})`);
      }
      toast.success("Registration deleted");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete registration</DialogTitle>
          <DialogDescription>
            Hard-deletes this row. There's no undo. Use this for junk rows that need to be
            cleared from the database — for normal cancellations, use Cancel instead.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {wouldBlock && (
            <div className="space-y-2">
              <ErrorBanner
                message={`This row has $${(amountPaidCents / 100).toFixed(
                  2,
                )} of unrefunded payment.`}
              />
              <div className="rounded-lg border border-border bg-cream-2 p-3 text-sm text-ink space-y-1">
                <p className="font-medium">Preferred path: refund first, then delete.</p>
                <p className="text-ink-muted">
                  Refunding (Admin actions → Refund) returns the money through Stripe and
                  keeps the books clean. Force-deleting skips the refund: the charge stays
                  live on the customer's card, and the payment record is kept but detached
                  from this registration. Reserve force for junk or duplicate rows where
                  the money is being handled some other way.
                </p>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="confirm-text">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </Label>
            <Input
              id="confirm-text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </div>
          {wouldBlock && (
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                id="force-delete"
                checked={force}
                onCheckedChange={(v) => setForce(v === true)}
              />
              <span className="text-sm">Force delete despite unrefunded payment</span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Back
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={submitting || confirmText !== "DELETE" || (wouldBlock && !force)}
          >
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
