"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { PatternPanel, emptyPatternState, toApiPattern } from "./PatternPanel";
import { SessionTable } from "./SessionTable";
import { PricePanel } from "./PricePanel";
import { fmtDay, fmtSessionDate, minuteToTimeInput } from "./format";
import type {
  BlockDiscount,
  BuilderDraft,
  ExtraSession,
  LocationOption,
  PatternFormState,
  PreviewQuote,
  PreviewResponse,
  SessionOverride,
  SessionRow,
  VenueOption,
} from "./types";

/**
 * The builder is one page with four panels rather than a wizard: the pattern,
 * the sessions and the money all have to be visible at once while someone is
 * on the phone.
 *
 * Every money figure comes from the generate-preview endpoint. Edits re-post
 * (debounced) instead of re-deriving totals client-side, so what the admin
 * reads is exactly what the create endpoint will commit.
 */

const EMPTY_QUOTE: PreviewQuote = {
  subtotalCents: 0,
  discountCents: 0,
  totalCents: 0,
  depositDueCents: 0,
  balanceDueCents: 0,
  balanceDueAt: null,
};

const DEFAULT_RATE_CARD = {
  depositPct: 25,
  balanceDueLeadDays: 30,
  blockHoldHours: 72,
  quoteMarkerTtlDays: 14,
};

type CommitMode = "draft" | "send_deposit" | "paid_offline" | "internal_reserve";

interface BlockBuilderProps {
  locations: LocationOption[];
  venues: VenueOption[];
  /** Org/location IANA timezone; the server re-anchors to it either way. */
  timeZone: string;
  /** Reserve mode fences inventory for facility programming: no money at all. */
  internal?: boolean;
  /** A draft reopened for re-pricing; committing retires it. */
  draft?: BuilderDraft | null;
}

export function BlockBuilder({
  locations,
  venues,
  timeZone,
  internal = false,
  draft = null,
}: BlockBuilderProps) {
  useHydrationBeacon();

  const [label, setLabel] = useState(draft?.label ?? "");
  const [renterName, setRenterName] = useState(draft?.renterName ?? "");
  const [renterEmail, setRenterEmail] = useState(draft?.renterEmail ?? "");
  const [renterPhone, setRenterPhone] = useState(draft?.renterPhone ?? "");
  const [partySize, setPartySize] = useState(draft?.partySize ?? 1);
  const [purpose, setPurpose] = useState(draft?.purpose ?? "");
  const [notes, setNotes] = useState(draft?.notes ?? "");

  const [pattern, setPattern] = useState<PatternFormState>(() =>
    draft
      ? {
          brand: draft.brand,
          locationId: draft.locationId,
          days: draft.days.map((d) => ({
            weekday: d.weekday,
            startTime: minuteToTimeInput(d.startMinute),
            durationMinutes: d.durationMinutes,
            venueIds: d.venueIds,
          })),
          firstDate: draft.firstDate,
          lastDate: draft.lastDate,
        }
      : emptyPatternState(),
  );
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [excludedKeys, setExcludedKeys] = useState<string[]>(draft?.excludedKeys ?? []);
  const [overrides, setOverrides] = useState<Record<string, SessionOverride>>(
    draft?.sessionOverrides ?? {},
  );
  const [extras, setExtras] = useState<ExtraSession[]>(draft?.extraSessions ?? []);

  const [discount, setDiscount] = useState<BlockDiscount>(draft?.discount ?? null);
  const [depositPct, setDepositPct] = useState(draft?.depositPct ?? DEFAULT_RATE_CARD.depositPct);
  const [offlineMethod, setOfflineMethod] = useState<"cash" | "comp">("cash");

  const [quote, setQuote] = useState<PreviewQuote>(EMPTY_QUOTE);
  const [rateCard, setRateCard] = useState(DEFAULT_RATE_CARD);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  // Bumped by every edit that changes the money, so one debounced effect can
  // watch a single primitive instead of five object identities.
  const [revision, setRevision] = useState(0);

  const excluded = useMemo(() => new Set(excludedKeys), [excludedKeys]);
  const locationVenues = useMemo(
    () => venues.filter((v) => v.locationId === pattern.locationId),
    [venues, pattern.locationId],
  );
  const venuesByLocation = useMemo(() => {
    const out: Record<string, VenueOption[]> = {};
    for (const v of venues) (out[v.locationId] ??= []).push(v);
    return out;
  }, [venues]);

  const bump = () => setRevision((r) => r + 1);

  const buildBody = (mode: CommitMode) => ({
    locationId: pattern.locationId,
    brand: pattern.brand,
    // The preview runs before the renter fields are filled in, and the
    // endpoints validate the whole create body; placeholders keep Generate
    // usable without weakening the commit-time checks below.
    label: label.trim() || "Untitled block",
    renterName: renterName.trim() || label.trim() || "TBD",
    renterEmail: renterEmail.trim() || null,
    renterPhone: renterPhone.trim() || null,
    partySize,
    purpose: purpose.trim() || null,
    notes: notes.trim() || null,
    pattern: toApiPattern(pattern, timeZone),
    excludedKeys,
    sessionOverrides: overrides,
    extraSessions: extras,
    discount,
    depositPct,
    mode,
    offlinePaymentMethod: mode === "paid_offline" ? offlineMethod : null,
  });

  /**
   * `fresh` is the Generate button: it rebuilds the roster from the pattern
   * and auto-unchecks whatever the ledger already claims. Otherwise the
   * response is merged into the existing roster, so rows the admin unchecked
   * stay on screen (unpriced) and can be checked back on.
   */
  const runPreview = async (fresh: boolean) => {
    if (fresh) setGenerating(true);
    try {
      const body = buildBody("draft");
      const res = await fetch("/api/admin/rentals/blocks/generate-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fresh ? { ...body, excludedKeys: [] } : body),
      });
      const json = (await res.json()) as PreviewResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Preview failed (HTTP ${res.status})`);
        return;
      }
      setError(null);
      setQuote({
        subtotalCents: json.subtotalCents,
        discountCents: json.discountCents,
        totalCents: json.totalCents,
        depositDueCents: json.depositDueCents,
        balanceDueCents: json.balanceDueCents,
        balanceDueAt: json.balanceDueAt,
      });
      if (json.rateCard) setRateCard(json.rateCard);

      if (fresh) {
        // Keys address the ROW, so the admin's skip-dates survive a
        // regenerate; whatever the ledger now claims joins them, unchecked.
        const kept = new Set(
          excludedKeys.filter((k) => json.sessions.some((s) => s.key === k)),
        );
        for (const s of json.sessions) if (s.conflict) kept.add(s.key);
        setRows(json.sessions.map((s) => ({ ...s, included: !kept.has(s.key) })));
        setExcludedKeys([...kept]);
        setHasGenerated(true);
        if (kept.size > 0) bump();
        return;
      }

      const byKey = new Map(json.sessions.map((s) => [s.key, s]));
      setRows((prev) => {
        const merged: SessionRow[] = prev.map((r) => {
          const next = byKey.get(r.key);
          return next ? { ...next, included: true } : { ...r, included: false };
        });
        for (const s of json.sessions) {
          if (!prev.some((r) => r.key === s.key)) merged.push({ ...s, included: true });
        }
        return merged.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      if (fresh) setGenerating(false);
    }
  };

  // Money-affecting edits re-price against the server rather than being
  // recomputed here; 300ms keeps a slider-ish discount input from flooding it.
  useEffect(() => {
    if (!hasGenerated || revision === 0) return;
    const timer = setTimeout(() => {
      void runPreview(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [revision]);

  const toggleSession = (key: string) => {
    setExcludedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
    bump();
  };

  const editSession = (key: string, patch: SessionOverride) => {
    setOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    bump();
  };

  const addOneOff = (session: ExtraSession) => {
    if (rows.some((r) => r.key === session.key) || extras.some((e) => e.key === session.key)) {
      toast.error("That session is already in the list");
      return;
    }
    setExtras((prev) => [...prev, session]);
    bump();
  };

  const commit = async (mode: CommitMode) => {
    if (!label.trim()) {
      setError("A label is required — it is how staff recognise the block.");
      return;
    }
    if (!internal && !renterName.trim()) {
      setError("A renter name is required.");
      return;
    }
    if (rows.length === 0 || rows.length === excludedKeys.length) {
      setError("Select at least one session.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/rentals/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(mode)),
      });
      const json = (await res.json()) as {
        blockId?: string;
        reservedCount?: number;
        error?: string;
        conflicts?: Array<{ key: string; reason: string }>;
      };

      if (res.status === 409 && json.conflicts?.length) {
        const conflicted = new Map(json.conflicts.map((c) => [c.key, c.reason]));
        setRows((prev) =>
          prev.map((r) =>
            conflicted.has(r.key)
              ? { ...r, included: false, conflict: { reason: conflicted.get(r.key)! } }
              : r,
          ),
        );
        setExcludedKeys((prev) => [
          ...new Set([...prev, ...json.conflicts!.map((c) => c.key)]),
        ]);
        const dates = json.conflicts
          .map((c) => {
            const row = rows.find((r) => r.key === c.key);
            return row ? fmtSessionDate(row.startsAt, timeZone) : c.key;
          })
          .join(", ");
        setError(`${json.error ?? "Some sessions are no longer available"}: ${dates}`);
        return;
      }
      if (!res.ok) {
        toast.error(json.error ?? `Save failed (HTTP ${res.status})`);
        return;
      }

      // The reopened draft is superseded by what just committed; cancelling it
      // drops its quote markers so the slot stops reading as double-quoted.
      if (draft) {
        await fetch(`/api/admin/rentals/blocks/${draft.blockId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cancel: true }),
        });
      }

      if (mode === "internal_reserve") {
        toast.success(`${json.reservedCount ?? 0} sessions reserved`);
        window.location.href = "/admin/rentals/blocks";
        return;
      }
      window.location.href = `/admin/rentals/blocks/${json.blockId}`;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = rows.filter((r) => !excluded.has(r.key)).length;

  return (
    <div className="space-y-5 max-w-5xl">
      {error && <ErrorBanner message={error} />}

      {/* Renter */}
      <section className="rounded-xl border border-border bg-cream-2 p-5 space-y-4">
        <h2 className="font-semibold text-ink">{internal ? "Reserve" : "Renter"}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={internal ? "sm:col-span-2" : ""}>
            <Label htmlFor="block-label">Label</Label>
            <Input
              id="block-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={internal ? "Winter league — Tue/Thu prime" : "Ohio Elite 03B — Winter Tuesdays"}
            />
          </div>
          {!internal && (
            <>
              <div>
                <Label htmlFor="block-renter-name">Renter name</Label>
                <Input
                  id="block-renter-name"
                  value={renterName}
                  onChange={(e) => setRenterName(e.target.value)}
                  placeholder="Full name"
                />
              </div>
              <div>
                <Label htmlFor="block-renter-email">Renter email</Label>
                <Input
                  id="block-renter-email"
                  type="email"
                  value={renterEmail}
                  onChange={(e) => setRenterEmail(e.target.value)}
                  placeholder="renter@example.com"
                />
              </div>
              <div>
                <Label htmlFor="block-renter-phone">Renter phone</Label>
                <Input
                  id="block-renter-phone"
                  type="tel"
                  value={renterPhone}
                  onChange={(e) => setRenterPhone(e.target.value)}
                  placeholder="+1 (614) 555-0100"
                />
              </div>
              <div>
                <Label htmlFor="block-party-size">Party size</Label>
                <Input
                  id="block-party-size"
                  type="number"
                  min={1}
                  value={partySize}
                  onChange={(e) => setPartySize(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div>
                <Label htmlFor="block-purpose">Purpose</Label>
                <Input
                  id="block-purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Winter training block"
                />
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <Label htmlFor="block-notes">Internal notes</Label>
            <Input
              id="block-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Not shown to the renter"
            />
          </div>
        </div>
      </section>

      <PatternPanel
        value={pattern}
        locations={locations}
        venuesByLocation={venuesByLocation}
        onChange={setPattern}
        onGenerate={() => void runPreview(true)}
        generating={generating}
      />

      <SessionTable
        sessions={rows}
        excludedKeys={excluded}
        venues={locationVenues}
        timeZone={timeZone}
        showMoney={!internal}
        onToggle={toggleSession}
        onEdit={editSession}
        onAddOneOff={addOneOff}
      />

      {!internal && (
        <PricePanel
          quote={quote}
          discount={discount}
          depositPct={depositPct}
          blockHoldHours={rateCard.blockHoldHours}
          balanceDueLeadDays={rateCard.balanceDueLeadDays}
          balanceDueLabel={quote.balanceDueAt ? fmtDay(quote.balanceDueAt, timeZone) : ""}
          onChange={(patch) => {
            if (patch.discount !== undefined) setDiscount(patch.discount);
            if (patch.depositPct !== undefined) setDepositPct(patch.depositPct);
            bump();
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        {internal ? (
          <Button onClick={() => void commit("internal_reserve")} disabled={saving || selectedCount === 0}>
            {saving ? "Reserving…" : "Reserve"}
          </Button>
        ) : (
          <>
            <Button onClick={() => void commit("send_deposit")} disabled={saving || selectedCount === 0}>
              {saving ? "Working…" : "Send deposit link"}
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => void commit("paid_offline")}
                disabled={saving || selectedCount === 0}
              >
                Mark paid offline
              </Button>
              <select
                value={offlineMethod}
                aria-label="Offline payment method"
                onChange={(e) => setOfflineMethod(e.target.value as "cash" | "comp")}
                className="rounded border border-border px-2 py-1.5 text-sm bg-cream"
              >
                <option value="cash">Cash</option>
                <option value="comp">Comp</option>
              </select>
            </div>
            <Button
              variant="outline"
              onClick={() => void commit("draft")}
              disabled={saving || selectedCount === 0}
            >
              Save draft
            </Button>
          </>
        )}
        <a href="/admin/rentals/blocks" className="text-sm text-ink-muted underline">
          Cancel
        </a>
      </div>
    </div>
  );
}
