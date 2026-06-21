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

import React, { useState } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { usePerson } from "@/lib/hooks/use-person";
import type { PersonType } from "@/lib/person/person-types";
import { SendLinkActions } from "@/components/admin/check-in/SendLinkActions";
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

  // Photo upload: PersonHeader manages local photoUrl state internally;
  // we receive the callback here in case callers need to react to the change.
  // (Currently unused at the card level — the header updates itself immediately.)

  const isOpen = target !== null;

  // ── Footer send-link disclosure state ─────────────────────────────────────
  const [footerSendOpen, setFooterSendOpen] = useState(false);

  // ── Footer check-in state (applies to first today item) ───────────────────
  const [footerCheckedIn, setFooterCheckedIn] = useState(false);
  const [footerCheckingIn, setFooterCheckingIn] = useState(false);

  async function handleFooterCheckIn() {
    if (!profile?.today[0]) return;
    const item = profile.today[0];
    if (!item.canCheckIn) return;
    if (footerCheckedIn || footerCheckingIn) return;

    setFooterCheckingIn(true);
    try {
      const res = await fetch("/api/admin/check-in/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: item.kind, targetId: item.targetId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `Check-in failed (${res.status})`);
      } else {
        setFooterCheckedIn(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error — check-in failed");
    } finally {
      setFooterCheckingIn(false);
    }
  }

  // ── Footer CTA set by type ─────────────────────────────────────────────────
  function FooterCTAs() {
    if (!profile) return null;
    const accent = TYPE_ACCENT[profile.type];
    const primaryStyle = {
      background: accent,
      borderColor: accent,
      color: "#fffdf8",
    } as React.CSSProperties;

    const firstItem = profile.today[0];
    const canCheckIn =
      !!firstItem &&
      firstItem.canCheckIn &&
      !footerCheckedIn &&
      !firstItem.checkedIn;

    if (profile.type === "child") {
      return (
        <>
          <button
            type="button"
            onClick={handleFooterCheckIn}
            disabled={!canCheckIn || footerCheckingIn}
            style={primaryStyle}
            className="flex-1 border rounded-[9px] px-3 py-[9px] text-[13px] font-[700] cursor-pointer disabled:opacity-40"
          >
            {footerCheckedIn ? "Checked in ✓" : footerCheckingIn ? "…" : "Check in"}
          </button>
          <div className="flex-1 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setFooterSendOpen((v) => !v)}
              disabled={!firstItem}
              className="w-full border border-[#e4ddcf] bg-[#f6f1e7] text-[#1c1a17] rounded-[9px] px-3 py-[9px] text-[13px] font-[700] cursor-pointer disabled:opacity-40"
            >
              Send to parent ▾
            </button>
            {footerSendOpen && firstItem && (
              <div className="border border-[#e4ddcf] rounded-[9px] p-[10px] bg-[#fffdf8]">
                <SendLinkActions
                  kind={firstItem.kind}
                  targetId={firstItem.targetId}
                  onSent={() => setFooterSendOpen(false)}
                />
              </div>
            )}
          </div>
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
            onClick={handleFooterCheckIn}
            disabled={!canCheckIn || footerCheckingIn}
            style={primaryStyle}
            className="flex-1 border rounded-[9px] px-3 py-[9px] text-[13px] font-[700] cursor-pointer disabled:opacity-40"
          >
            {footerCheckedIn ? "Checked in ✓" : footerCheckingIn ? "…" : "Check in"}
          </button>
          <div className="flex-1 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setFooterSendOpen((v) => !v)}
              disabled={!firstItem}
              className="w-full border border-[#e4ddcf] bg-[#f6f1e7] text-[#1c1a17] rounded-[9px] px-3 py-[9px] text-[13px] font-[700] cursor-pointer disabled:opacity-40"
            >
              Send link ▾
            </button>
            {footerSendOpen && firstItem && (
              <div className="border border-[#e4ddcf] rounded-[9px] p-[10px] bg-[#fffdf8]">
                <SendLinkActions
                  kind={firstItem.kind}
                  targetId={firstItem.targetId}
                  onSent={() => setFooterSendOpen(false)}
                />
              </div>
            )}
          </div>
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
              personAs={target!.as}
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
