"use client";

/**
 * PersonSections — section components that compose the Person 360 card body.
 *
 * Exports:
 *   PersonHeader       — avatar, name, type-badge, flags, contact row
 *   TodaySection       — today's session(s) with status chips + mini-actions
 *   RegistrationsSection — registration list
 *   PaymentsSection    — payments & balance summary
 *   ConsentsSection    — waivers / COPPA consents chips
 *   MembershipSection  — membership plan + renewal
 *   FamilySection      — family roster rows (parent view)
 */

import { useRef, useState } from "react";
import { toast } from "sonner";
import type {
  PersonProfile,
  PersonType,
  PersonTodayItem,
  PersonRegistration,
  PersonPaymentsSummary,
  PersonFamilyMember,
} from "@/lib/person/person-types";
import { cn } from "@/lib/utils";
import { SendLinkActions } from "@/components/admin/check-in/SendLinkActions";

// ─── Design tokens (editorial cream/ink) ─────────────────────────────────────

const CHILD_ACCENT = "#2f7d8a";  // teal
const ADULT_ACCENT = "#3a3550";  // slate
const PARENT_ACCENT = "#9a5a2a"; // ochre

function accentColor(type: PersonType): string {
  if (type === "child") return CHILD_ACCENT;
  if (type === "adult") return ADULT_ACCENT;
  return PARENT_ACCENT;
}

function typeBadgeLabel(profile: PersonProfile): string {
  if (profile.type === "child") return `Child · age ${profile.age ?? "?"}`;
  if (profile.type === "adult") return "Adult player";
  return "Parent · account";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(isoDate: string | null): string {
  if (!isoDate) return "";
  const d = new Date(isoDate);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ─── StatusChip ───────────────────────────────────────────────────────────────

interface ChipProps {
  ok: boolean;
  okLabel: string;
  badLabel: string;
  warnVariant?: boolean; // amber instead of rose when not ok
}

export function StatusChip({ ok, okLabel, badLabel, warnVariant = true }: ChipProps) {
  if (ok) {
    return (
      <span className="text-[10.5px] font-bold rounded px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
        {okLabel}
      </span>
    );
  }
  if (warnVariant) {
    return (
      <span className="text-[10.5px] font-bold rounded px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">
        {badLabel}
      </span>
    );
  }
  return (
    <span className="text-[10.5px] font-bold rounded px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200">
      {badLabel}
    </span>
  );
}

// ─── SectionShell ─────────────────────────────────────────────────────────────

function SectionShell({
  title,
  last = false,
  children,
}: {
  title: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("px-[18px] py-[13px]", !last && "border-b border-[#efe9dc]")}>
      <h4 className="m-0 mb-[9px] text-[11px] tracking-[.1em] uppercase text-[#8a8175] font-[800]">
        {title}
      </h4>
      {children}
    </div>
  );
}

// ─── PersonHeader ─────────────────────────────────────────────────────────────

interface PersonHeaderProps {
  profile: PersonProfile;
  /** `as` param passed to the photo endpoint — determines upload target kind. */
  personAs: "family_member" | "user";
  onPhotoUploaded?: (url: string) => void;
}

export function PersonHeader({ profile, personAs, onPhotoUploaded }: PersonHeaderProps) {
  const accent = accentColor(profile.type);
  const contact = profile.contact;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local photo URL — initialised from profile, updated immediately after upload.
  const [photoUrl, setPhotoUrl] = useState<string | null>(profile.photoUrl ?? null);
  const [uploading, setUploading] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset the input so the same file can be re-selected after a failure.
    e.target.value = "";

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/admin/person/${profile.id}/photo?as=${personAs}`,
        { method: "POST", body: form },
      );
      if (res.ok) {
        const { url } = (await res.json()) as { url: string };
        setPhotoUrl(url);
        onPhotoUploaded?.(url);
      } else {
        console.error("[PersonHeader] photo upload failed", res.status);
      }
    } catch (err) {
      console.error("[PersonHeader] photo upload error", err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="px-[18px] py-[16px] border-b border-[#e4ddcf] relative">
      {/* Top: avatar + name block */}
      <div className="flex gap-[13px]">
        {/* Avatar: shows photo when present, colored-initials circle otherwise */}
        <div className="relative flex-shrink-0">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center font-[800] text-xl text-white overflow-hidden"
            style={{ background: accent }}
          >
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={profile.name}
                className="w-full h-full object-cover"
              />
            ) : (
              initials(profile.name)
            )}
          </div>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="sr-only"
            onChange={handleFileChange}
          />
          {/* Camera badge button */}
          <button
            type="button"
            aria-label="Upload photo"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "absolute -right-1 -bottom-1 w-[22px] h-[22px] rounded-full border-2 border-[#fffdf8] bg-[#1c1a17] text-[#fffdf8] flex items-center justify-center text-[11px] cursor-pointer transition-opacity",
              uploading && "opacity-50 cursor-not-allowed",
            )}
          >
            {uploading ? "…" : "📷"}
          </button>
        </div>

        <div className="min-w-0">
          <div className="text-[21px] font-[700] leading-[1.1] text-[#1c1a17]">
            {profile.name}
          </div>
          {/* Type badge */}
          <span
            className="inline-block text-[10px] font-[800] tracking-[.08em] uppercase rounded-full px-2 py-0.5 mt-1 text-white"
            style={{ background: accent }}
          >
            {typeBadgeLabel(profile)}
          </span>
          {/* Meta: birth date */}
          {profile.birthDate && (
            <div className="text-[12px] text-[#4b463e] mt-1">
              born {fmtDate(profile.birthDate)}
            </div>
          )}
        </div>
      </div>

      {/* Flags */}
      {profile.flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-[9px]">
          {profile.flags.map((flag, i) => {
            const isMed = flag.toLowerCase().includes("allergy") || flag.startsWith("⚠");
            const isOk = flag.toLowerCase().includes("member") || flag.toLowerCase().includes("active");
            return (
              <span
                key={i}
                className={cn(
                  "text-[11px] font-[700] rounded-full px-[9px] py-0.5 border",
                  isMed && "bg-[#f7e7e9] text-[#b3454f] border-[#eccfd3]",
                  isOk && !isMed && "bg-[#e8f3ec] text-[#2f7d4f] border-[#cfe6d7]",
                  !isMed && !isOk && "bg-[#f6f1e7] text-[#4b463e] border-[#e4ddcf]",
                )}
              >
                {flag}
              </span>
            );
          })}
        </div>
      )}

      {/* Contact row */}
      <div className="flex flex-wrap gap-4 mt-[12px] text-[13px]">
        {contact.isParentContact && (
          <span className="text-[#8a8175] text-[12px] self-center">
            parent: {contact.name}
          </span>
        )}
        {contact.phone && (
          <a
            href={`tel:${contact.phone}`}
            className="text-[#1c1a17] no-underline inline-flex items-center gap-1 hover:underline"
          >
            <span>📞</span> {contact.phone}
          </a>
        )}
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="text-[#1c1a17] no-underline inline-flex items-center gap-1 hover:underline"
          >
            <span>✉️</span> {contact.email}
          </a>
        )}
      </div>
    </div>
  );
}

// ─── TodaySection ─────────────────────────────────────────────────────────────

interface TodaySectionProps {
  today: PersonTodayItem[];
  personType: PersonType;
  /** If the person is a child, link actions are labeled "Send to parent" */
  isParentContact: boolean;
  /** Optional callback so callers can refetch after a check-in if needed. */
  onRefetch?: () => void;
  last?: boolean;
}

/**
 * Per-item mutable state — keyed by sessionId.
 * `checkedIn` overrides the server value after an optimistic check-in.
 */
interface ItemState {
  checkedIn: boolean;
  checkingIn: boolean;
  sendLinkOpen: boolean;
}

export function TodaySection({ today, personType, isParentContact, onRefetch, last }: TodaySectionProps) {
  // Keyed by sessionId.
  const [itemState, setItemState] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(
      today.map((item) => [
        item.sessionId,
        { checkedIn: item.checkedIn, checkingIn: false, sendLinkOpen: false },
      ]),
    ),
  );

  function getState(item: PersonTodayItem): ItemState {
    return itemState[item.sessionId] ?? {
      checkedIn: item.checkedIn,
      checkingIn: false,
      sendLinkOpen: false,
    };
  }

  function patchState(sessionId: string, patch: Partial<ItemState>) {
    setItemState((prev) => ({
      ...prev,
      [sessionId]: { ...getStateById(sessionId, prev), ...patch },
    }));
  }

  function getStateById(sessionId: string, map: Record<string, ItemState>): ItemState {
    return map[sessionId] ?? { checkedIn: false, checkingIn: false, sendLinkOpen: false };
  }

  async function handleCheckIn(item: PersonTodayItem) {
    if (!item.canCheckIn) return;
    const st = getState(item);
    if (st.checkedIn || st.checkingIn) return;

    patchState(item.sessionId, { checkingIn: true });
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
        patchState(item.sessionId, { checkedIn: true });
        onRefetch?.();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error — check-in failed");
    } finally {
      patchState(item.sessionId, { checkingIn: false });
    }
  }

  const sendLabel = isParentContact ? "Send to parent ▾" : "Send link ▾";

  return (
    <SectionShell title="Today" last={last}>
      {today.length === 0 ? (
        <p className="text-[12.5px] text-[#8a8175]">Nothing scheduled today.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {today.map((item) => {
            const st = getState(item);
            const isCheckedIn = st.checkedIn;
            const isCheckingIn = st.checkingIn;
            const canCheckIn = item.canCheckIn && !isCheckedIn;

            return (
              <div
                key={item.sessionId}
                className="border border-[#e4ddcf] rounded-[11px] px-[12px] py-[11px] bg-[#f6f1e7]"
              >
                {/* Title + time */}
                <div className="font-[700] text-[14px] flex items-center gap-1.5 text-[#1c1a17]">
                  🎯 {item.title}
                </div>
                <div className="text-[12px] text-[#8a8175] mt-0.5 mb-[8px]">
                  {item.timeLabel}
                </div>

                {/* Status chips */}
                <div className="flex flex-wrap gap-1.5 mb-[9px]">
                  <StatusChip ok={item.waiverSigned} okLabel="waiver ✓" badLabel="waiver out" />
                  <StatusChip ok={item.hasPhoto} okLabel="photo ✓" badLabel="no photo" />
                  <StatusChip ok={item.paid} okLabel="paid ✓" badLabel="unpaid" />
                  <StatusChip
                    ok={isCheckedIn}
                    okLabel="checked in ✓"
                    badLabel="not checked in"
                    warnVariant={false}
                  />
                </div>

                {/* Child callout */}
                {personType === "child" && (
                  <div className="text-[11px] font-[700] text-[#2f7d8a] mb-[7px]">
                    ↳ Send link sends to the parent
                  </div>
                )}

                {/* Mini actions */}
                <div className="flex gap-1.5">
                  {/* Check-in button */}
                  {isCheckedIn ? (
                    <span className="flex-1 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-lg px-3 py-[7px] text-[12px] font-[700] text-center">
                      Checked in ✓
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCheckIn(item)}
                      disabled={!canCheckIn || isCheckingIn}
                      title={
                        item.kind === "roster_entry"
                          ? "Game check-in isn't tracked"
                          : undefined
                      }
                      className="flex-1 border border-[#1c1a17] bg-[#1c1a17] text-[#fffdf8] rounded-lg px-3 py-[7px] text-[12px] font-[700] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCheckingIn ? "…" : "Check in"}
                    </button>
                  )}

                  {/* Send link — toggles SendLinkActions popover */}
                  <button
                    type="button"
                    onClick={() =>
                      patchState(item.sessionId, { sendLinkOpen: !st.sendLinkOpen })
                    }
                    className={cn(
                      "flex-1 border rounded-lg px-3 py-[7px] text-[12px] font-[700] cursor-pointer transition-colors",
                      st.sendLinkOpen
                        ? "border-[#1c1a17] bg-[#1c1a17] text-[#fffdf8]"
                        : "border-[#e4ddcf] bg-[#fffdf8] text-[#1c1a17]",
                    )}
                  >
                    {sendLabel}
                  </button>

                  <button
                    type="button"
                    className="flex-1 border border-[#e4ddcf] bg-[#fffdf8] text-[#1c1a17] rounded-lg px-3 py-[7px] text-[12px] font-[700] cursor-pointer"
                  >
                    Capture photo
                  </button>
                </div>

                {/* Send-link disclosure — shown when the button above is toggled */}
                {st.sendLinkOpen && (
                  <div className="mt-[9px] pt-[9px] border-t border-[#e4ddcf]">
                    <div className="text-[11px] text-[#8a8175] font-[700] mb-[5px] uppercase tracking-[.07em]">
                      {isParentContact ? "Send to parent" : "Send link"}
                    </div>
                    <SendLinkActions
                      kind={item.kind}
                      targetId={item.targetId}
                      onSent={() =>
                        patchState(item.sessionId, { sendLinkOpen: false })
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionShell>
  );
}

// ─── RegistrationsSection ─────────────────────────────────────────────────────

interface RegistrationsSectionProps {
  registrations: PersonRegistration[];
  last?: boolean;
}

export function RegistrationsSection({ registrations, last }: RegistrationsSectionProps) {
  return (
    <SectionShell title="Registrations" last={last}>
      {registrations.length === 0 ? (
        <p className="text-[12.5px] text-[#8a8175]">No registrations.</p>
      ) : (
        <div>
          {registrations.map((reg, i) => (
            <div
              key={reg.id}
              className={cn(
                "flex justify-between items-center py-[7px]",
                i > 0 && "border-t border-[#efe9dc]",
              )}
            >
              <div>
                <div className="text-[13.5px] font-[600] text-[#1c1a17]">{reg.label}</div>
                <div className="text-[11.5px] text-[#8a8175]">{reg.sublabel}</div>
              </div>
              <span
                className={cn(
                  "text-[11px] font-[700] rounded-lg px-2 py-0.5",
                  reg.paid
                    ? "bg-[#e8f3ec] text-[#2f7d4f]"
                    : "bg-[#f8efd6] text-[#b8860b]",
                )}
              >
                {reg.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

// ─── PaymentsSection ──────────────────────────────────────────────────────────

interface PaymentsSectionProps {
  payments: PersonPaymentsSummary;
  last?: boolean;
}

export function PaymentsSection({ payments, last }: PaymentsSectionProps) {
  return (
    <SectionShell title="Payments & balance" last={last}>
      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-[13.5px]">
          <span>Total paid (12 mo)</span>
          <b className="font-[700]">{fmtCents(payments.totalPaidCents)}</b>
        </div>
        <div className="flex justify-between text-[13.5px]">
          <span>Outstanding balance</span>
          <b
            className={cn(
              "font-[700]",
              payments.outstandingCents === 0 ? "text-[#2f7d4f]" : "text-[#b3454f]",
            )}
          >
            {fmtCents(payments.outstandingCents)}
          </b>
        </div>
        {payments.lastPayment && (
          <div className="flex justify-between text-[13.5px]">
            <span>Last payment</span>
            <span className="text-[#8a8175]">
              {fmtDate(payments.lastPayment.dateIso)} · {fmtCents(payments.lastPayment.amountCents)} ·{" "}
              {payments.lastPayment.method}
            </span>
          </div>
        )}
      </div>
    </SectionShell>
  );
}

// ─── ConsentsSection ─────────────────────────────────────────────────────────

interface ConsentsSectionProps {
  consents: { kind: string; granted: boolean }[];
  last?: boolean;
}

export function ConsentsSection({ consents, last }: ConsentsSectionProps) {
  return (
    <SectionShell title="Waivers & consents" last={last}>
      {consents.length === 0 ? (
        <p className="text-[12.5px] text-[#8a8175]">No consents recorded.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {consents.map((c, i) => (
            <StatusChip
              key={i}
              ok={c.granted}
              okLabel={`${c.kind} ✓`}
              badLabel={`${c.kind} pending`}
              warnVariant
            />
          ))}
        </div>
      )}
    </SectionShell>
  );
}

// ─── MembershipSection ───────────────────────────────────────────────────────

interface MembershipSectionProps {
  membership: PersonProfile["membership"];
  last?: boolean;
}

export function MembershipSection({ membership, last }: MembershipSectionProps) {
  return (
    <SectionShell title="Membership" last={last}>
      {!membership ? (
        <p className="text-[12.5px] text-[#8a8175]">No active membership.</p>
      ) : (
        <div>
          <div className="text-[13px] font-[600] text-[#1c1a17]">{membership.plan}</div>
          {membership.renewsIso && (
            <div className="text-[11px] text-[#8a8175] mt-0.5">
              Renews {fmtDate(membership.renewsIso)}
            </div>
          )}
        </div>
      )}
    </SectionShell>
  );
}

// ─── FamilySection ───────────────────────────────────────────────────────────

interface FamilySectionProps {
  family: PersonFamilyMember[];
  onOpenPerson: (args: { id: string; as: "family_member" | "user" }) => void;
  last?: boolean;
}

export function FamilySection({ family, onOpenPerson, last }: FamilySectionProps) {
  return (
    <SectionShell title="Family" last={last}>
      {family.length === 0 ? (
        <p className="text-[12.5px] text-[#8a8175]">No family members on file.</p>
      ) : (
        <div>
          {family.map((member, i) => (
            <button
              key={member.familyMemberId}
              type="button"
              onClick={() =>
                onOpenPerson({ id: member.familyMemberId, as: "family_member" })
              }
              className={cn(
                "w-full flex items-center gap-2 py-[6px] text-left hover:bg-[#f6f1e7] transition-colors rounded",
                i > 0 && "border-t border-[#efe9dc]",
              )}
            >
              {/* Avatar */}
              <div className="w-[26px] h-[26px] rounded-full bg-[#2f7d8a] text-white flex items-center justify-center text-[10px] font-[700] flex-shrink-0">
                {initials(member.name)}
              </div>
              {/* Name + summary */}
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-[600] text-[#1c1a17]">
                  {member.name}
                  {member.age !== null && <span className="text-[#8a8175] font-normal"> · {member.age}</span>}
                </div>
                {member.summary && (
                  <div className="text-[11px] text-[#8a8175] truncate">{member.summary}</div>
                )}
              </div>
              {/* View arrow */}
              <span className="text-[11px] text-[#1c1a17] bg-[#f6f1e7] border border-[#e4ddcf] rounded-md px-2 py-0.5 font-[700] flex-shrink-0">
                View ›
              </span>
            </button>
          ))}
        </div>
      )}
      {/* Callout: card pivots to family, not "today as a player" */}
      {family.length > 0 && (
        <div className="text-[11px] text-[#9a5a2a] font-[700] mt-[6px]">
          ↳ Card pivots to the family, not "today as a player"
        </div>
      )}
    </SectionShell>
  );
}

// ─── AccountBillingSection ───────────────────────────────────────────────────

interface AccountBillingSectionProps {
  payments: PersonPaymentsSummary;
  registrations: PersonRegistration[];
  last?: boolean;
}

export function AccountBillingSection({ payments, registrations, last }: AccountBillingSectionProps) {
  const outstanding = registrations.filter((r) => !r.paid).length;
  return (
    <SectionShell title="Account & billing" last={last}>
      <div className="text-[12px] text-[#8a8175]">
        Total paid (12 mo):{" "}
        <b className="text-[#1c1a17]">{fmtCents(payments.totalPaidCents)}</b>
        {" · "}
        {registrations.length} registration{registrations.length !== 1 ? "s" : ""}
        {" · "}
        {outstanding} outstanding
      </div>
    </SectionShell>
  );
}
