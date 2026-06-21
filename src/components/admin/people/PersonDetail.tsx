"use client";

/**
 * PersonDetail — full-page Person 360 view at /admin/people/[id].
 *
 * Renders the same sections as PersonCard but in a wide page layout
 * (max-w-3xl centered column) rather than a slide-over sheet.
 *
 * Sections rendered by type:
 *   child  → Today + Registrations + Payments + Consents
 *   adult  → Today + Registrations + Payments + Membership
 *   parent → Family + AccountBilling
 */

import { usePerson } from "@/lib/hooks/use-person";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import {
  PersonHeader,
  TodaySection,
  RegistrationsSection,
  PaymentsSection,
  ConsentsSection,
  MembershipSection,
  FamilySection,
  AccountBillingSection,
} from "@/components/admin/person/PersonSections";

// ─── Design tokens (match PersonCard) ────────────────────────────────────────

const TYPE_ACCENT: Record<string, string> = {
  child: "#2f7d8a",
  adult: "#3a3550",
  parent: "#9a5a2a",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  personId: string;
  personAs: "family_member" | "user";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PersonDetail({ personId, personAs }: Props) {
  useHydrationBeacon();

  const { data: profile, isLoading, error } = usePerson({ id: personId, as: personAs });

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading && !profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <LoadingSkeleton rows={8} />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error && !profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <ErrorBanner message={error} />
      </div>
    );
  }

  if (!profile) return null;

  const accent = TYPE_ACCENT[profile.type] ?? "#1c1a17";

  // ── Loaded ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Back link */}
      <a
        href="/admin/people"
        className="inline-flex items-center gap-1 text-[13px] text-[#8a8175] hover:text-[#1c1a17] mb-6 font-[600] no-underline transition-colors"
      >
        ← People
      </a>

      {/* Profile card */}
      <div className="rounded-[14px] border border-[#e4ddcf] bg-[#fffdf8] overflow-hidden shadow-sm">
        {/* Accent bar */}
        <div
          className="h-[5px]"
          style={{ background: accent }}
          aria-hidden="true"
        />

        {/* Header */}
        <PersonHeader
          profile={profile}
          personAs={personAs}
        />

        {/* Body sections — same composition as PersonCard, by type */}

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

        {profile.type === "parent" && (
          <>
            <FamilySection
              family={profile.family}
              onOpenPerson={({ id, as: familyAs }) => {
                window.location.href = `/admin/people/${id}?as=${familyAs}`;
              }}
            />
            <AccountBillingSection
              payments={profile.payments}
              registrations={profile.registrations}
              last
            />
          </>
        )}
      </div>
    </div>
  );
}
