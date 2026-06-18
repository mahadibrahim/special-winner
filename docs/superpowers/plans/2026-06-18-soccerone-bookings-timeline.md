# Unified Bookings Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two sparse sections on `/dashboard/bookings` with one chronological Upcoming/Past timeline of all bookings (drop-ins + field rentals), and make two cross-brand back-links resolve to `/pickup` for SoccerOne.

**Architecture:** A pure `normalizeBookings()` merges/sorts both booking sources into `{upcoming, past}` (unit-tested). A new client component `MyBookings` loads both endpoints with `Promise.allSettled`, renders them through the existing `DashboardCard` (hero on the first upcoming item), and owns the cancel/check-in actions. The shared `HoldCountdown` is extracted so both the new component and the existing `/dashboard/play` view can use it. A `useBrandId()` hook reads `<html data-brand>` for brand-correct links.

**Tech Stack:** Astro 5, React 19, TypeScript, Tailwind (brand tokens), Vitest (unit), Playwright (e2e), lucide-react icons.

## Global Constraints

- Brand tokens only — never hardcoded `stone`/`white`/etc. Use `text-ink`/`text-ink-2`/`text-ink-muted`/`bg-paper`/`bg-cream-2`/`bg-cream-3`/`border-border`. (These invert under `html[data-brand="soccerone"]`.)
- `CardType` ∈ `"league_game" | "tournament" | "pickup" | "class" | "field_rental"`; this feature uses `"pickup" | "class" | "field_rental"`.
- `StatusTone` ∈ `"confirmed" | "action" | "pending"`.
- No new API endpoints; reuse `/api/dropin/bookings`, `/api/rentals/bookings`, `/api/dropin/bookings/{id}/cancel`, `/api/rentals/bookings/{id}/cancel`, `/api/dashboard/check-in`.
- No DB/schema changes.
- Brand-aware routes: pickup listing is `/pickup` (SoccerOne) / `/dropin` (Aspire); rentals is `/rent` (SoccerOne) / `/rentals` (Aspire).
- Do NOT change `MyDropInBookings.tsx` or `MyFieldRentals.tsx` rendering — both are still used on `/dashboard/play`. (`MyFieldRentals` is edited only to import the extracted `HoldCountdown`.)
- Run a single unit test file with: `npm run test:unit -- <path>`.
- `npx tsc --noEmit` must stay clean (pre-existing `scripts/seed-2026-27-catalog.ts` error excluded).

---

### Task 1: Brand detection helper + hook

**Files:**
- Create: `src/lib/dashboard/brand.ts`
- Create: `src/lib/hooks/use-brand-id.ts`
- Test: `tests/unit/brand.test.ts`

**Interfaces:**
- Produces: `type BrandId = "aspire" | "soccerone"`; `brandFromDataAttr(value: string | null): BrandId`; `useBrandId(): BrandId`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/brand.test.ts
import { describe, it, expect } from "vitest";
import { brandFromDataAttr } from "@/lib/dashboard/brand";

describe("brandFromDataAttr", () => {
  it("returns soccerone only for the exact attribute value", () => {
    expect(brandFromDataAttr("soccerone")).toBe("soccerone");
  });
  it("defaults to aspire for null / unknown values", () => {
    expect(brandFromDataAttr(null)).toBe("aspire");
    expect(brandFromDataAttr("")).toBe("aspire");
    expect(brandFromDataAttr("aspire")).toBe("aspire");
    expect(brandFromDataAttr("SoccerOne")).toBe("aspire");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/brand.test.ts`
Expected: FAIL — cannot resolve `@/lib/dashboard/brand`.

- [ ] **Step 3: Write the pure helper**

```ts
// src/lib/dashboard/brand.ts
export type BrandId = "aspire" | "soccerone";

/** Resolve the brand from an <html data-brand> attribute value. */
export function brandFromDataAttr(value: string | null): BrandId {
  return value === "soccerone" ? "soccerone" : "aspire";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/brand.test.ts`
Expected: PASS (4 assertions).

- [ ] **Step 5: Write the hook**

```ts
// src/lib/hooks/use-brand-id.ts
import { useEffect, useState } from "react";
import { brandFromDataAttr, type BrandId } from "@/lib/dashboard/brand";

/**
 * Brand of the current page, read from <html data-brand> (set by BaseLayout).
 * Starts as "aspire" (matches SSR/first client render to avoid a hydration
 * mismatch) and resolves the real brand after mount.
 */
export function useBrandId(): BrandId {
  const [brand, setBrand] = useState<BrandId>("aspire");
  useEffect(() => {
    setBrand(brandFromDataAttr(document.documentElement.getAttribute("data-brand")));
  }, []);
  return brand;
}
```

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | grep -v seed-2026-27-catalog | head`
Expected: no output (clean).

- [ ] **Step 7: Commit**

```bash
git add src/lib/dashboard/brand.ts src/lib/hooks/use-brand-id.ts tests/unit/brand.test.ts
git commit -m "feat(dashboard): brand-id helper + useBrandId hook"
```

---

### Task 2: `normalizeBookings` pure function

**Files:**
- Create: `src/lib/dashboard/normalize-bookings.ts`
- Test: `tests/unit/normalize-bookings.test.ts`

**Interfaces:**
- Consumes: `CardType` from `@/lib/dashboard/card-types`, `StatusTone` from `@/lib/dashboard/dashboard-ui`.
- Produces:
  - `interface DropInBookingRow { id: string; sessionId: string; status: "confirmed"|"waitlisted"|"pending_claim"|"cancelled"|"no_show"; teamAssignment: string | null; checkedInAt: string | null; session: { sportOrClassLabel: string; formatLabel: string | null; startsAt: string; endsAt: string; venueName: string | null } }`
  - `interface FieldRentalRow { id: string; fieldNumber: number; startsAt: string; endsAt: string; status: "confirmed"|"pending_payment"|"cancelled"|"no_show"|"completed"; paymentStatus: string; amountPaidCents: number; partySize: number; checkedInAt: string | null; paymentExpiresAt: string | null; venueName: string }`
  - `type BookingKind = "dropin" | "rental"`
  - `interface BookingItem { id: string; kind: BookingKind; cardType: CardType; title: string; startsAt: string; endsAt: string | null; venueName: string | null; status: { label: string; tone: StatusTone }; isPast: boolean; dropin?: DropInBookingRow; rental?: FieldRentalRow }`
  - `normalizeBookings(dropins: DropInBookingRow[], rentals: FieldRentalRow[], now: number): { upcoming: BookingItem[]; past: BookingItem[] }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/normalize-bookings.test.ts
import { describe, it, expect } from "vitest";
import {
  normalizeBookings,
  type DropInBookingRow,
  type FieldRentalRow,
} from "@/lib/dashboard/normalize-bookings";

const NOW = new Date("2026-06-20T12:00:00Z").getTime();

function dropin(over: Partial<DropInBookingRow> & { startsAt: string }): DropInBookingRow {
  return {
    id: over.id ?? "d1",
    sessionId: over.sessionId ?? "s1",
    status: over.status ?? "confirmed",
    teamAssignment: over.teamAssignment ?? null,
    checkedInAt: over.checkedInAt ?? null,
    session: {
      sportOrClassLabel: over.session?.sportOrClassLabel ?? "Soccer",
      formatLabel: over.session?.formatLabel ?? "7v7",
      startsAt: over.startsAt,
      endsAt: over.session?.endsAt ?? over.startsAt,
      venueName: over.session?.venueName ?? "Field 1",
    },
  };
}
function rental(over: Partial<FieldRentalRow> & { startsAt: string }): FieldRentalRow {
  return {
    id: over.id ?? "r1",
    fieldNumber: over.fieldNumber ?? 2,
    startsAt: over.startsAt,
    endsAt: over.endsAt ?? over.startsAt,
    status: over.status ?? "confirmed",
    paymentStatus: over.paymentStatus ?? "paid",
    amountPaidCents: over.amountPaidCents ?? 8000,
    partySize: over.partySize ?? 10,
    checkedInAt: over.checkedInAt ?? null,
    paymentExpiresAt: over.paymentExpiresAt ?? null,
    venueName: over.venueName ?? "Worthington",
  };
}

describe("normalizeBookings", () => {
  it("interleaves drop-ins and rentals by time, upcoming ascending", () => {
    const { upcoming } = normalizeBookings(
      [dropin({ id: "d-late", startsAt: "2026-06-24T18:00:00Z" })],
      [rental({ id: "r-soon", startsAt: "2026-06-22T18:00:00Z" })],
      NOW,
    );
    expect(upcoming.map((i) => i.id)).toEqual(["r-soon", "d-late"]);
    expect(upcoming[0].kind).toBe("rental");
    expect(upcoming[1].kind).toBe("dropin");
  });

  it("routes cancelled/no_show and past-dated items to past, descending", () => {
    const { upcoming, past } = normalizeBookings(
      [
        dropin({ id: "d-cancelled", status: "cancelled", startsAt: "2026-06-25T18:00:00Z" }),
        dropin({ id: "d-old", startsAt: "2026-06-18T18:00:00Z" }),
      ],
      [rental({ id: "r-old", startsAt: "2026-06-10T18:00:00Z" })],
      NOW,
    );
    expect(upcoming).toEqual([]);
    expect(past.map((i) => i.id)).toEqual(["d-cancelled", "d-old", "r-old"]);
  });

  it("classifies a class-format drop-in as cardType 'class', else 'pickup'", () => {
    const { upcoming } = normalizeBookings(
      [
        dropin({ id: "p", startsAt: "2026-06-21T18:00:00Z" }),
        dropin({
          id: "c",
          startsAt: "2026-06-22T18:00:00Z",
          session: { sportOrClassLabel: "Finishing Clinic", formatLabel: null, startsAt: "", endsAt: "", venueName: null },
        }),
      ],
      [],
      NOW,
    );
    const byId = Object.fromEntries(upcoming.map((i) => [i.id, i]));
    expect(byId.p.cardType).toBe("pickup");
    expect(byId.c.cardType).toBe("class");
  });

  it("builds titles and maps status tones", () => {
    const { upcoming } = normalizeBookings(
      [dropin({ id: "d", status: "waitlisted", startsAt: "2026-06-21T18:00:00Z" })],
      [rental({ id: "r", status: "pending_payment", fieldNumber: 3, startsAt: "2026-06-22T18:00:00Z" })],
      NOW,
    );
    const byId = Object.fromEntries(upcoming.map((i) => [i.id, i]));
    expect(byId.d.title).toBe("Soccer · 7v7");
    expect(byId.d.status).toEqual({ label: "Waitlisted", tone: "pending" });
    expect(byId.r.title).toBe("Field 3");
    expect(byId.r.status).toEqual({ label: "Pending payment", tone: "action" });
  });

  it("returns empty arrays for empty input", () => {
    expect(normalizeBookings([], [], NOW)).toEqual({ upcoming: [], past: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- tests/unit/normalize-bookings.test.ts`
Expected: FAIL — cannot resolve `@/lib/dashboard/normalize-bookings`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/dashboard/normalize-bookings.ts
import type { CardType } from "@/lib/dashboard/card-types";
import type { StatusTone } from "@/lib/dashboard/dashboard-ui";

export interface DropInBookingRow {
  id: string;
  sessionId: string;
  status: "confirmed" | "waitlisted" | "pending_claim" | "cancelled" | "no_show";
  teamAssignment: string | null;
  checkedInAt: string | null;
  session: {
    sportOrClassLabel: string;
    formatLabel: string | null;
    startsAt: string;
    endsAt: string;
    venueName: string | null;
  };
}

export interface FieldRentalRow {
  id: string;
  fieldNumber: number;
  startsAt: string;
  endsAt: string;
  status: "confirmed" | "pending_payment" | "cancelled" | "no_show" | "completed";
  paymentStatus: string;
  amountPaidCents: number;
  partySize: number;
  checkedInAt: string | null;
  paymentExpiresAt: string | null;
  venueName: string;
}

export type BookingKind = "dropin" | "rental";

export interface BookingItem {
  id: string;
  kind: BookingKind;
  cardType: CardType;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  status: { label: string; tone: StatusTone };
  isPast: boolean;
  dropin?: DropInBookingRow;
  rental?: FieldRentalRow;
}

function dropInStatus(s: DropInBookingRow["status"]): { label: string; tone: StatusTone } {
  switch (s) {
    case "confirmed": return { label: "Confirmed", tone: "confirmed" };
    case "waitlisted": return { label: "Waitlisted", tone: "pending" };
    case "pending_claim": return { label: "Pending claim", tone: "action" };
    case "cancelled": return { label: "Cancelled", tone: "pending" };
    case "no_show": return { label: "No show", tone: "pending" };
  }
}

function rentalStatus(s: FieldRentalRow["status"]): { label: string; tone: StatusTone } {
  switch (s) {
    case "confirmed": return { label: "Confirmed", tone: "confirmed" };
    case "completed": return { label: "Completed", tone: "confirmed" };
    case "pending_payment": return { label: "Pending payment", tone: "action" };
    case "cancelled": return { label: "Cancelled", tone: "pending" };
    case "no_show": return { label: "No show", tone: "pending" };
  }
}

function isClass(d: DropInBookingRow): boolean {
  const fmt = d.session.formatLabel?.toLowerCase() ?? "";
  const label = d.session.sportOrClassLabel.toLowerCase();
  return fmt.includes("class") || label.includes("class") || label.includes("clinic");
}

export function normalizeBookings(
  dropins: DropInBookingRow[],
  rentals: FieldRentalRow[],
  now: number,
): { upcoming: BookingItem[]; past: BookingItem[] } {
  const items: BookingItem[] = [];

  for (const d of dropins) {
    const startsAt = d.session.startsAt;
    const terminal = d.status === "cancelled" || d.status === "no_show";
    items.push({
      id: d.id,
      kind: "dropin",
      cardType: isClass(d) ? "class" : "pickup",
      title: d.session.formatLabel
        ? `${d.session.sportOrClassLabel} · ${d.session.formatLabel}`
        : d.session.sportOrClassLabel,
      startsAt,
      endsAt: d.session.endsAt,
      venueName: d.session.venueName,
      status: dropInStatus(d.status),
      isPast: terminal || new Date(startsAt).getTime() <= now,
      dropin: d,
    });
  }

  for (const r of rentals) {
    const terminal = r.status === "cancelled" || r.status === "no_show";
    items.push({
      id: r.id,
      kind: "rental",
      cardType: "field_rental",
      title: `Field ${r.fieldNumber}`,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      venueName: r.venueName,
      status: rentalStatus(r.status),
      isPast: terminal || new Date(r.startsAt).getTime() <= now,
      rental: r,
    });
  }

  const asc = (a: BookingItem, b: BookingItem) =>
    new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();

  const upcoming = items.filter((i) => !i.isPast).sort(asc);
  const past = items.filter((i) => i.isPast).sort((a, b) => asc(b, a));
  return { upcoming, past };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- tests/unit/normalize-bookings.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/normalize-bookings.ts tests/unit/normalize-bookings.test.ts
git commit -m "feat(dashboard): normalizeBookings merge/sort for unified timeline"
```

---

### Task 3: Extract `HoldCountdown` into the shared shell

**Files:**
- Create: `src/components/dashboard/shell/HoldCountdown.tsx`
- Modify: `src/components/dashboard/MyFieldRentals.tsx` (remove the local `HoldCountdown`, import the shared one)

**Interfaces:**
- Produces: `HoldCountdown({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }): JSX.Element`.

- [ ] **Step 1: Create the shared component (verbatim move of the existing `HoldCountdown` from `MyFieldRentals.tsx`, lines ~38-81)**

```tsx
// src/components/dashboard/shell/HoldCountdown.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";

/**
 * Live countdown badge for a pending-payment rental hold. Re-renders every
 * second; when the deadline passes it shows "Hold expired" and fires onExpire
 * once so the parent can reload.
 */
export function HoldCountdown({
  expiresAt,
  onExpire,
}: {
  expiresAt: string;
  onExpire: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const firedExpireRef = useRef(false);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const deadline = new Date(expiresAt).getTime();
  const remainingMs = deadline - now;
  if (remainingMs <= 0) {
    if (!firedExpireRef.current) {
      firedExpireRef.current = true;
      window.setTimeout(onExpire, 0);
    }
    return (
      <Badge variant="outline" className="bg-cream-3 text-ink-2 border-border">
        Hold expired
      </Badge>
    );
  }
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  const urgent = remainingMs < 2 * 60 * 1000;
  return (
    <Badge
      variant="outline"
      className={
        urgent
          ? "bg-rose-500/10 text-rose-700 border-rose-500/20"
          : "bg-amber-500/10 text-amber-700 border-amber-500/20"
      }
    >
      Pay within {display}
    </Badge>
  );
}
```

- [ ] **Step 2: In `MyFieldRentals.tsx`, delete the local `HoldCountdown` definition and its now-unused imports (`useRef`; keep `useEffect`/`useState` only if still used elsewhere in the file — they are), and add the import**

Add near the other imports:
```tsx
import { HoldCountdown } from "@/components/dashboard/shell/HoldCountdown";
```
Delete the entire local `function HoldCountdown(...) { ... }` block (the one that renders the `Badge`).

- [ ] **Step 3: Verify types compile and nothing else references the removed local**

Run: `npx tsc --noEmit 2>&1 | grep -v seed-2026-27-catalog | head`
Expected: no output. (If it complains about an unused `useRef` import in `MyFieldRentals.tsx`, remove `useRef` from its `react` import.)

- [ ] **Step 4: Verify the production build is clean**

Run: `./scripts/with-bws.sh npm run build 2>&1 | tail -3`
Expected: `[build] Complete!`

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/shell/HoldCountdown.tsx src/components/dashboard/MyFieldRentals.tsx
git commit -m "refactor(dashboard): extract HoldCountdown to shared shell"
```

---

### Task 4: `MyBookings` unified timeline component

**Files:**
- Create: `src/components/dashboard/MyBookings.tsx`

**Interfaces:**
- Consumes: `normalizeBookings`, `DropInBookingRow`, `FieldRentalRow`, `BookingItem` from `@/lib/dashboard/normalize-bookings`; `HoldCountdown` from `@/components/dashboard/shell/HoldCountdown`; `useBrandId` from `@/lib/hooks/use-brand-id`; `DashboardCard` from `@/components/dashboard/shell/DashboardCard`; `directionsUrl` from `@/lib/dashboard/maps`.
- Produces: `export default function MyBookings(): JSX.Element`.

- [ ] **Step 1: Write the component**

```tsx
// src/components/dashboard/MyBookings.tsx
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { DashboardCard } from "@/components/dashboard/shell/DashboardCard";
import { HoldCountdown } from "@/components/dashboard/shell/HoldCountdown";
import { directionsUrl } from "@/lib/dashboard/maps";
import { useBrandId } from "@/lib/hooks/use-brand-id";
import {
  normalizeBookings,
  type BookingItem,
  type DropInBookingRow,
  type FieldRentalRow,
} from "@/lib/dashboard/normalize-bookings";

const SUB_HEADER_CLS =
  "text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-2";

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}
function isNearStart(iso: string): boolean {
  return Math.abs(new Date(iso).getTime() - Date.now()) <= 2 * 60 * 60 * 1000;
}

export default function MyBookings() {
  useHydrationBeacon();
  const brand = useBrandId();

  const [dropins, setDropins] = useState<DropInBookingRow[]>([]);
  const [rentals, setRentals] = useState<FieldRentalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [bothFailed, setBothFailed] = useState(false);
  const [dropinFailed, setDropinFailed] = useState(false);
  const [rentalFailed, setRentalFailed] = useState(false);
  const [checkingIn, setCheckingIn] = useState<Set<string>>(new Set());

  const reload = async () => {
    setLoading(true);
    const [d, r] = await Promise.allSettled([
      fetch("/api/dropin/bookings").then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }),
      fetch("/api/rentals/bookings").then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }),
    ]);
    const dOk = d.status === "fulfilled";
    const rOk = r.status === "fulfilled";
    setDropins(dOk ? (d.value.bookings ?? []) : []);
    setRentals(rOk ? (r.value.rentals ?? []) : []);
    setDropinFailed(!dOk);
    setRentalFailed(!rOk);
    setBothFailed(!dOk && !rOk);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  const cancelDropin = async (id: string) => {
    if (!window.confirm("Cancel this booking?")) return;
    const res = await fetch(`/api/dropin/bookings/${id}/cancel`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) return void toast.error(json.error ?? "Cancel failed");
    toast.success(json.refunded ? "Cancelled — refund issued" : "Cancelled (inside window — no refund)");
    await reload();
  };
  const cancelRental = async (id: string) => {
    if (!window.confirm("Cancel this rental?")) return;
    const res = await fetch(`/api/rentals/bookings/${id}/cancel`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) return void toast.error(json.error ?? "Cancel failed");
    toast.success("Rental cancelled");
    await reload();
  };
  const checkIn = async (kind: "drop_in_booking" | "field_rental", id: string) => {
    setCheckingIn((p) => new Set(p).add(id));
    try {
      const res = await fetch("/api/dashboard/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, targetId: id }),
      });
      const data = await res.json();
      if (!res.ok) return void toast.error(data.error ?? "Check-in failed");
      toast.success("Checked in");
      await reload();
    } finally {
      setCheckingIn((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  };

  const { upcoming, past } = normalizeBookings(dropins, rentals, Date.now());

  function actionFor(item: BookingItem): ReactNode {
    const checkedIn =
      item.dropin?.checkedInAt != null || item.rental?.checkedInAt != null;
    const near = isNearStart(item.startsAt);
    const checkInKind = item.kind === "dropin" ? "drop_in_booking" : "field_rental";
    return (
      <div className="flex flex-col items-end gap-1.5">
        {item.kind === "dropin" && (
          <Button asChild variant="outline" size="sm">
            <a href={`/dropin/${item.dropin!.sessionId}`}>Details</a>
          </Button>
        )}
        {checkedIn ? (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
            Here
          </Badge>
        ) : near ? (
          <Button size="sm" disabled={checkingIn.has(item.id)} onClick={() => checkIn(checkInKind, item.id)}>
            {checkingIn.has(item.id) ? "Checking in..." : "Check me in"}
          </Button>
        ) : null}
        {item.kind === "dropin" && item.dropin!.status === "confirmed" && (
          <Button variant="outline" size="sm" onClick={() => cancelDropin(item.id)}>Cancel</Button>
        )}
        {item.kind === "dropin" && item.dropin!.status === "waitlisted" && (
          <Button variant="outline" size="sm" onClick={() => cancelDropin(item.id)}>Leave waitlist</Button>
        )}
        {item.kind === "rental" && item.rental!.status !== "cancelled" && (
          <Button variant="outline" size="sm" onClick={() => cancelRental(item.id)}>Cancel</Button>
        )}
      </div>
    );
  }

  function bodyFor(item: BookingItem): ReactNode {
    if (item.kind === "dropin" && item.dropin!.teamAssignment) {
      return <div className="mt-1"><Badge variant="secondary">Team {item.dropin!.teamAssignment}</Badge></div>;
    }
    if (item.kind === "rental") {
      const r = item.rental!;
      return (
        <div className="flex items-center gap-2 flex-wrap mt-1">
          {r.status === "pending_payment" && r.paymentExpiresAt && (
            <HoldCountdown expiresAt={r.paymentExpiresAt} onExpire={() => void reload()} />
          )}
          <span className="text-[11px] text-ink-2">
            {r.partySize} {r.partySize === 1 ? "person" : "people"}
          </span>
        </div>
      );
    }
    return null;
  }

  if (loading) return <LoadingSkeleton />;
  if (bothFailed) return <ErrorBanner message="Couldn't load your bookings. Refresh to retry." />;

  const browseHref = brand === "soccerone" ? "/pickup" : "/dropin";
  const rentHref = brand === "soccerone" ? "/rent" : "/rentals";

  if (upcoming.length === 0 && past.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="font-display text-2xl text-ink">My Bookings</h2>
        <EmptyState title="No bookings yet" description="Book a pickup session or a field to get started.">
          <div className="flex flex-wrap gap-2">
            <Button asChild><a href={browseHref}>Browse pickup</a></Button>
            <Button asChild variant="outline"><a href={rentHref}>Book a field</a></Button>
          </div>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl text-ink leading-tight">My Bookings</h2>
        {upcoming.length > 0 && (
          <p className="text-sm text-ink-2 mt-0.5">{upcoming.length} upcoming</p>
        )}
      </div>

      {(dropinFailed || rentalFailed) && (
        <p className="text-[11px] text-ink-muted">
          Couldn&apos;t load {dropinFailed ? "drop-in bookings" : "field rentals"} — refresh to retry.
        </p>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-2">
          {past.length > 0 && <p className={SUB_HEADER_CLS}>Upcoming</p>}
          {upcoming.map((item, i) => (
            <DashboardCard
              key={`${item.kind}-${item.id}`}
              type={item.cardType}
              hero={i === 0}
              title={item.title}
              meta={fmtDateTime(item.startsAt)}
              venue={item.venueName ? { label: item.venueName, mapsUrl: directionsUrl({ name: item.venueName }) } : undefined}
              status={item.status}
              action={actionFor(item)}
            >
              {bodyFor(item)}
            </DashboardCard>
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          <p className={SUB_HEADER_CLS}>Past</p>
          {past.map((item) => (
            <DashboardCard
              key={`${item.kind}-${item.id}`}
              type={item.cardType}
              title={item.title}
              meta={fmtDateTime(item.startsAt)}
              status={item.status}
            />
          ))}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | grep -v seed-2026-27-catalog | head`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/MyBookings.tsx
git commit -m "feat(dashboard): MyBookings unified timeline component"
```

---

### Task 5: Wire the page + brand-aware "All sessions" back-link

**Files:**
- Modify: `src/pages/dashboard/bookings.astro`
- Modify: `src/components/dropin/SessionDetail.tsx`

**Interfaces:**
- Consumes: `MyBookings` (Task 4), `useBrandId` (Task 1).

- [ ] **Step 1: Replace the two sections in `bookings.astro`**

Replace the file body with:
```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import MyBookings from '@/components/dashboard/MyBookings';

// Middleware guards /dashboard/** for auth.
export const prerender = false;
---

<BaseLayout title="My Bookings — Aspire Sports">
  <main id="main-content" class="flex-1 pt-24 pb-16 px-4">
    <div class="max-w-3xl mx-auto">
      <MyBookings client:load />
    </div>
  </main>
</BaseLayout>
```

- [ ] **Step 2: Make the SessionDetail "All sessions" link brand-aware**

In `src/components/dropin/SessionDetail.tsx`, add to the imports:
```tsx
import { useBrandId } from "@/lib/hooks/use-brand-id";
```
Inside the component body (near the other hooks, e.g. after `useHydrationBeacon();`), add:
```tsx
  const brand = useBrandId();
  const allSessionsHref = brand === "soccerone" ? "/pickup" : "/dropin";
```
Change the back-link anchor from `href="/dropin"` to `href={allSessionsHref}`.

- [ ] **Step 3: Verify types compile + build**

Run: `npx tsc --noEmit 2>&1 | grep -v seed-2026-27-catalog | head`
Expected: no output.
Run: `./scripts/with-bws.sh npm run build 2>&1 | tail -3`
Expected: `[build] Complete!`

- [ ] **Step 4: Commit**

```bash
git add src/pages/dashboard/bookings.astro src/components/dropin/SessionDetail.tsx
git commit -m "feat(dashboard): render unified MyBookings; brand-aware All-sessions link"
```

---

### Task 6: E2E coverage for the unified timeline

**Files:**
- Create: `tests/e2e/soccerone-bookings.spec.ts`

**Interfaces:**
- Consumes: existing e2e helpers in `tests/utils/test-helpers.ts` (`signIn`, `waitForHydration`).

- [ ] **Step 1: Inspect existing e2e patterns to match host/brand + auth setup**

Read `tests/utils/test-helpers.ts` and an existing brand or dashboard spec (e.g. the brand-skin spec) to copy the SoccerOne-host base URL convention and the sign-in helper. Use the same parent test account from CLAUDE.md (`parent@test.aspiresports.com` / `TestParent123!`).

- [ ] **Step 2: Write the spec**

```ts
// tests/e2e/soccerone-bookings.spec.ts
import { test, expect } from "@playwright/test";
import { signIn, waitForHydration } from "../utils/test-helpers";

test("@dropin SoccerOne bookings page renders unified timeline with branded back-link", async ({ page }) => {
  await signIn(page, "parent@test.aspiresports.com", "TestParent123!");
  await page.goto("/dashboard/bookings", { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // Unified header present (not the old two-section layout).
  await expect(page.getByRole("heading", { name: "My Bookings" })).toBeVisible();

  // SoccerOne chrome is applied (header link to Pickup exists).
  await expect(page.getByRole("link", { name: /pickup/i }).first()).toBeVisible();
});
```

> Note: adjust the `signIn` signature and how the SoccerOne host is selected to match the existing helpers found in Step 1 (some suites set the host via `PLAYWRIGHT` project config or a `soccerone.localhost` base URL). If a seeded SoccerOne booking is required to assert a card, reuse the e2e seed fixtures (`npm run db:seed:e2e`) rather than creating data inline.

- [ ] **Step 3: Run the spec**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npx playwright test tests/e2e/soccerone-bookings.spec.ts`
Expected: PASS (dev server running; SoccerOne host configured per Step 1).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/soccerone-bookings.spec.ts
git commit -m "test(e2e): SoccerOne unified bookings timeline"
```

---

## Self-Review Notes

- **Spec coverage:** unified timeline (Task 2 + 4), single header + N upcoming (Task 4), hero first item (Task 4), combined empty state with brand-aware CTAs (Task 4), `Promise.allSettled` partial-failure handling (Task 4), `HoldCountdown` extraction (Task 3), `useBrandId` + both back-link fixes (Task 1, 4, 5), page wiring (Task 5), unit + e2e tests (Task 2, 6). `MyDropInBookings`/`MyFieldRentals` rendering untouched (only the `HoldCountdown` import in `MyFieldRentals`). All covered.
- **Types:** `BookingItem`, `DropInBookingRow`, `FieldRentalRow`, `BrandId` defined in Tasks 1–2 and consumed unchanged in Tasks 4–5.
- **Open detail (from spec):** Aspire rentals route confirmed at `/rentals`, so the "Book a field" CTA is brand-aware both ways (no Aspire-only suppression needed).
