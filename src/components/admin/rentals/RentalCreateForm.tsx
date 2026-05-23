"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { groupSpacesByLocation } from "@/lib/admin/group-spaces";
import { toast } from "sonner";

interface VenueOption {
  id: string;
  name: string;
  fieldCount: number;
  location: { id: string; name: string };
}

type PaymentMethod = "cash" | "comp" | "card_present" | "card_online";

const DURATION_OPTIONS = [
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
  { value: 240, label: "4 hours" },
];

export function RentalCreateForm() {
  useHydrationBeacon();

  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [venueId, setVenueId] = useState("");
  const [fieldNumber, setFieldNumber] = useState(1);
  const [startDt, setStartDt] = useState("");
  const [durationMin, setDurationMin] = useState(60);
  const [renterName, setRenterName] = useState("");
  const [renterEmail, setRenterEmail] = useState("");
  const [renterPhone, setRenterPhone] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // card_present result
  const [cpResult, setCpResult] = useState<{
    rentalId: string;
    clientSecret: string;
    amountCents: number;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/venues");
        if (res.ok) {
          const json = await res.json();
          setVenues((json.venues ?? []) as VenueOption[]);
        }
      } catch {
        /* venues nice-to-have */
      }
    })();
  }, []);

  const selectedVenue = venues.find((v) => v.id === venueId);
  const fieldCount = selectedVenue?.fieldCount ?? 1;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDt) {
      setError("Start date/time is required");
      return;
    }
    setBusy(true);
    setError(null);
    setCpResult(null);
    try {
      const startsAt = new Date(startDt).toISOString();
      const endsAt = new Date(
        new Date(startDt).getTime() + durationMin * 60_000,
      ).toISOString();

      const res = await fetch("/api/admin/rentals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          fieldNumber,
          startsAt,
          endsAt,
          renterName,
          renterEmail: renterEmail || null,
          renterPhone: renterPhone || null,
          partySize,
          purpose: purpose || null,
          notes: notes || null,
          paymentMethod,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Create failed");
        return;
      }
      if (paymentMethod === "card_present") {
        // Surface clientSecret for Terminal operator
        setCpResult({
          rentalId: json.rentalId,
          clientSecret: json.clientSecret,
          amountCents: json.amountCents,
        });
        toast.success("Hold created — charge on the Terminal reader");
        return;
      }
      // cash / comp / card_online — navigate to detail
      const rentalId = json.rental?.id;
      if (rentalId) window.location.href = `/admin/rentals/${rentalId}`;
    } finally {
      setBusy(false);
    }
  };

  if (cpResult) {
    return (
      <div className="max-w-xl space-y-4">
        <div className="rounded-xl border border-border bg-cream-2 p-5 space-y-3">
          <h2 className="font-semibold text-ink">Terminal charge required</h2>
          <p className="text-sm text-ink-muted">
            Charge on the Terminal reader. The booking will confirm automatically
            once payment succeeds.
          </p>
          <div className="text-sm space-y-1">
            <div>
              <span className="font-medium text-ink">Amount: </span>
              <span className="text-ink-muted">
                ${(cpResult.amountCents / 100).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="font-medium text-ink">Client secret: </span>
              <code className="text-xs break-all text-ink-muted">
                {cpResult.clientSecret}
              </code>
            </div>
          </div>
        </div>
        <Button asChild>
          <a href={`/admin/rentals/${cpResult.rentalId}`}>View rental</a>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-6">
      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="venue">Space</Label>
          <select
            id="venue"
            value={venueId}
            onChange={(e) => {
              setVenueId(e.target.value);
              setFieldNumber(1);
            }}
            required
            className="mt-1 w-full rounded border border-border px-3 py-2 bg-cream"
          >
            <option value="">Select a space…</option>
            {groupSpacesByLocation(venues).map((group) => (
              <optgroup key={group.locationName} label={group.locationName}>
                {group.spaces.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="field">Field</Label>
          <select
            id="field"
            value={fieldNumber}
            onChange={(e) => setFieldNumber(Number(e.target.value))}
            className="mt-1 w-full rounded border border-border px-3 py-2 bg-cream"
          >
            {Array.from({ length: fieldCount }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Field {n}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="start">Start</Label>
          <Input
            id="start"
            type="datetime-local"
            value={startDt}
            onChange={(e) => setStartDt(e.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor="duration">Duration</Label>
          <select
            id="duration"
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
            className="mt-1 w-full rounded border border-border px-3 py-2 bg-cream"
          >
            {DURATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="name">Renter name</Label>
          <Input
            id="name"
            value={renterName}
            onChange={(e) => setRenterName(e.target.value)}
            placeholder="Full name"
            required
          />
        </div>

        <div>
          <Label htmlFor="email">Email (optional)</Label>
          <Input
            id="email"
            type="email"
            value={renterEmail}
            onChange={(e) => setRenterEmail(e.target.value)}
            placeholder="renter@example.com"
          />
        </div>

        <div>
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input
            id="phone"
            type="tel"
            value={renterPhone}
            onChange={(e) => setRenterPhone(e.target.value)}
            placeholder="+1 (614) 555-0100"
          />
        </div>

        <div>
          <Label htmlFor="party">Party size</Label>
          <Input
            id="party"
            type="number"
            min={1}
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="purpose">Purpose (optional)</Label>
          <Input
            id="purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Practice, tournament prep…"
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Input
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes for staff"
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Payment method</legend>
        <div className="flex flex-wrap gap-4">
          {(["cash", "comp", "card_present", "card_online"] as PaymentMethod[]).map(
            (m) => (
              <label key={m} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="paymentMethod"
                  value={m}
                  checked={paymentMethod === m}
                  onChange={() => setPaymentMethod(m)}
                />
                {m.replace(/_/g, " ")}
              </label>
            ),
          )}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create rental"}
        </Button>
        <Button type="button" variant="outline" asChild disabled={busy}>
          <a href="/admin/rentals">Cancel</a>
        </Button>
      </div>
    </form>
  );
}
