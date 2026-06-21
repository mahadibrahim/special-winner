"use client";

/**
 * PersonCard — adaptive right-side slide-over (Person 360).
 *
 * Opens a Sheet on the right when `target` is non-null. Uses `usePerson` to
 * load the PersonProfile, then renders `PersonHeader` + a type-specific body:
 *
 *   child  (teal)   → Today + Consents (COPPA). "Send to parent" link actions.
 *   adult  (slate)  → Today + Membership.
 *   parent (ochre)  → Family roster + Account & billing; primary CTA is "+ Walk-in for family".
 *
 * Loading → LoadingSkeleton inside the sheet.
 * Error   → ErrorBanner inside the sheet.
 */

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { usePerson } from "@/lib/hooks/use-person";
import type { PersonType } from "@/lib/person/person-types";
import {
  PersonHeader,
  TodaySection,
  RegistrationsSection,
  PaymentsSection,
  ConsentsSection,
  MembershipSection,
  FamilySection,
  AccountBillingSection,
} from "./PersonSections";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PersonCardTarget {
  id: string;
  as: "family_member" | "user";
}

interface Props {
  target: PersonCardTarget | null;
  onClose: () => void;
  /** Called when "Walk-in" / "Add to session" is triggered. Optional sessionId context. */
  onWalkIn: (sessionId?: string) => void;
  /** Called when a family row is clicked — caller should re-target the card. */
  onOpenPerson: (target: PersonCardTarget) => void;
}

// ─── Accent / type token helpers ─────────────────────────────────────────────

const TYPE_ACCENT: Record<PersonType, string> = {
  child: "#2f7d8a",
  adult: "#3a3550",
  parent: "#9a5a2a",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function PersonCard({ target, onClose, onWalkIn, onOpenPerson }: Props) {
  const { data: profile, isLoading, error } = usePerson(target);

  // Photo upload: the PersonHeader passes this up; we hold the override locally
  // so the card doesn't need to re-fetch just because a photo was added.
  const [_photoOverride, setPhotoOverride] = useState<string | null>(null);

  const isOpen = target !== null;

  // ── Check-in handler (fire-and-forget) ────────────────────────────────────
  const handleCheckIn = async (sessionId: string) => {
    if (!target) return;
    // FIXME: kind "roster_entry" is NOT accepted by /api/admin/check-in/check-in
    // (that endpoint only accepts drop_in_booking | field_rental). This is latent
    // in v1 because profile.today is always [] so this branch never fires. When
    // `today` is wired up, derive `kind` from the today item's row kind, or the
    // check-in POST will 400.
    await fetch("/api/admin/check-in/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "roster_entry",
        targetId: sessionId,
      }),
    }).catch(() => {/* optimistic — polling will correct */});
  };

  // ── Footer CTA set by type ─────────────────────────────────────────────────
  function FooterCTAs() {
    if (!profile) return null;
    const accent = TYPE_ACCENT[profile.type];
    const primaryStyle = {
      background: accent,
      borderColor: accent,
      color: "#fffdf8",
    } as React.CSSProperties;

    if (profile.type === "child") {
      return (
        <>
          <button
            type="button"
            onClick={() => profile.today[0] && handleCheckIn(profile.today[0].sessionId)}
            disabled={!profile.today.length}
            style={primaryStyle}
            className="flex-1 border rounded-[9px] px-3 py-[9px] text-[13px] font-[700] cursor-pointer disabled:opacity-40"
          >
            Check in
          </button>
          <button
            type="button"
            className="flex-1 border border-[#e4ddcf] bg-[#f6f1e7] text-[#1c1a17] rounded-[9px] px-3 py-[9px] text-[13px] font-[700] cursor-pointer"
          >
            Send to parent ▾
          </button>
          <button
            type="button"
            onClick={() => onWalkIn()}
            className="flex-1 border border-[#e4ddcf] bg-[#f6f1e7] text-[#1c1a17] rounded-[9px] px-3 py-[9px] text-[13px] font-[700] cursor-pointer"
          >
            Add
          </button>
        </>
      );
    }

    if (profile.type === "adult") {
      return (
        <>
          <button
            type="button"
            onClick={() => profile.today[0] && handleCheckIn(profile.today[0].sessionId)}
            disabled={!profile.today.length}
            style={primaryStyle}
            className="flex-1 border rounded-[9px] px-3 py-[9px] text-[13px] font-[700] cursor-pointer disabled:opacity-40"
          >
            Check in
          </button>
          <button
            type="button"
            className="flex-1 border border-[#e4ddcf] bg-[#f6f1e7] text-[#1c1a17] rounded-[9px] px-3 py-[9px] text-[13px] font-[700] cursor-pointer"
          >
            Send link ▾
          </button>
          <button
            type="button"
            onClick={() => onWalkIn()}
            className="flex-1 border border-[#e4ddcf] bg-[#f6f1e7] text-[#1c1a17] rounded-[9px] px-3 py-[9px] text-[13px] font-[700] cursor-pointer"
          >
            Add
          </button>
        </>
      );
    }

    // parent
    return (
      <>
        <button
          type="button"
          onClick={() => onWalkIn()}
          style={primaryStyle}
          className="flex-1 border rounded-[9px] px-3 py-[9px] text-[13px] font-[700] cursor-pointer"
        >
          + Walk-in for family
        </button>
        <button
          type="button"
          className="flex-1 border border-[#e4ddcf] bg-[#f6f1e7] text-[#1c1a17] rounded-[9px] px-3 py-[9px] text-[13px] font-[700] cursor-pointer"
        >
          Message
        </button>
      </>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-[430px] max-w-[94vw] p-0 flex flex-col bg-[#fffdf8] border-l border-[#e4ddcf] overflow-hidden gap-0"
      >
        {/* Accessible title (visually hidden — the name in the header is visible) */}
        <SheetTitle className="sr-only">
          {profile?.name ?? "Person profile"}
        </SheetTitle>

        {/* ── Loading state ─────────────────────────────────────────────── */}
        {isLoading && !profile && (
          <div className="flex-1 p-5">
            <LoadingSkeleton rows={6} />
          </div>
        )}

        {/* ── Error state ───────────────────────────────────────────────── */}
        {error && !isLoading && (
          <div className="flex-1 p-5">
            <ErrorBanner message={error} />
          </div>
        )}

        {/* ── Loaded ────────────────────────────────────────────────────── */}
        {profile && (
          <>
            {/* Accent bar at very top */}
            <div
              className="h-[5px] flex-shrink-0"
              style={{ background: TYPE_ACCENT[profile.type] }}
              aria-hidden="true"
            />

            {/* Header */}
            <PersonHeader
              profile={profile}
              onPhotoUploaded={(url) => setPhotoOverride(url)}
            />

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">
              {/* CHILD body */}
              {profile.type === "child" && (
                <>
                  <TodaySection
                    today={profile.today}
                    personType="child"
                    isParentContact={profile.contact.isParentContact}
                    onCheckIn={handleCheckIn}
                  />
                  <RegistrationsSection registrations={profile.registrations} />
                  <PaymentsSection payments={profile.payments} />
                  <ConsentsSection consents={profile.consents} last />
                </>
              )}

              {/* ADULT body */}
              {profile.type === "adult" && (
                <>
                  <TodaySection
                    today={profile.today}
                    personType="adult"
                    isParentContact={false}
                    onCheckIn={handleCheckIn}
                  />
                  <RegistrationsSection registrations={profile.registrations} />
                  <PaymentsSection payments={profile.payments} />
                  <MembershipSection membership={profile.membership} last />
                </>
              )}

              {/* PARENT body */}
              {profile.type === "parent" && (
                <>
                  <FamilySection
                    family={profile.family}
                    onOpenPerson={onOpenPerson}
                  />
                  <AccountBillingSection
                    payments={profile.payments}
                    registrations={profile.registrations}
                    last
                  />
                </>
              )}

              {/* "Open full profile" link */}
              <a
                href={`/admin/people/${profile.id}`}
                className="block text-center text-[12px] text-[#4b463e] py-[9px] font-[600] border-t border-[#efe9dc] hover:underline"
              >
                Open full profile →
              </a>
            </div>

            {/* Sticky footer actions */}
            <div className="flex-shrink-0 flex gap-2 px-[14px] py-[11px] border-t border-[#e4ddcf] bg-[#fffdf8]">
              <FooterCTAs />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
