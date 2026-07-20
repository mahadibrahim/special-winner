"use client";

import { Badge } from "@/components/ui/badge";
import { deriveFillState, FILL_STATE_LABELS } from "@/lib/dropin/fill-state";

export interface SessionCardData {
  id: string;
  kind: "pickup" | "class";
  sportOrClassLabel: string;
  formatLabel: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  skillLevel: "recreational" | "intermediate" | "advanced" | "all_levels";
  audience: "adults" | "youth" | "all_ages";
  membersOnly: boolean;
  sessionRateCents: number | null;
  memberRateCents: number | null;
  venueId: string | null;
  venueName: string | null;
  /** Confirmed + pending-payment holds + pending-claim promotions — every
   *  status that occupies a real seat (see dropin/sessions/index.ts). */
  confirmedCount: number;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function priceLabel(
  s: SessionCardData,
  defaultSessionRateCents: number | null,
): string {
  const cents = s.sessionRateCents ?? defaultSessionRateCents;
  if (cents == null) return "Free";
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(0)}`;
}

interface SessionCardProps {
  session: SessionCardData;
  defaultSessionRateCents: number | null;
  fillAlertThresholdPct?: number;
  fillAlertWindowHours?: number;
}

export function SessionCard({
  session,
  defaultSessionRateCents,
  fillAlertThresholdPct,
  fillAlertWindowHours,
}: SessionCardProps) {
  const fillPct = Math.min(
    100,
    Math.round((session.confirmedCount / Math.max(1, session.capacity)) * 100),
  );
  const isFull = session.confirmedCount >= session.capacity;
  const fillState = deriveFillState({
    confirmedCount: session.confirmedCount,
    capacity: session.capacity,
    startsAt: new Date(session.startsAt),
    thresholdPct: fillAlertThresholdPct ?? 60,
    windowHours: fillAlertWindowHours ?? 24,
  });
  const fillLabel = FILL_STATE_LABELS[fillState];

  return (
    <a
      href={`/dropin/${session.id}`}
      className="block rounded-xl border border-stone-200 bg-white p-5 hover:border-stone-400 transition-colors shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold text-stone-900">
              {session.sportOrClassLabel}
            </span>
            {session.formatLabel && (
              <span className="text-sm text-stone-500">· {session.formatLabel}</span>
            )}
            <Badge variant="outline" className="text-xs">
              {session.kind === "pickup" ? "Pickup" : "Class"}
            </Badge>
          </div>
          <div className="mt-1 text-sm text-stone-600">
            {formatDate(session.startsAt)} · {formatTime(session.startsAt)}–
            {formatTime(session.endsAt)}
          </div>
          {session.venueName && (
            <div className="mt-0.5 text-sm text-stone-500">{session.venueName}</div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xl font-semibold text-stone-900">
            {priceLabel(session, defaultSessionRateCents)}
          </div>
          <div className="text-[11px] uppercase tracking-wider text-stone-400">
            per person
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
        <Badge variant="secondary" className="font-normal">
          {session.skillLevel.replace("_", " ")}
        </Badge>
        <Badge variant="secondary" className="font-normal">
          {session.audience.replace("_", " ")}
        </Badge>
        {session.membersOnly && (
          <Badge className="bg-amber-100 text-amber-900 border-amber-200 font-normal">
            Members only
          </Badge>
        )}
        {fillLabel && (
          <Badge
            className={
              fillState === "needs_players"
                ? "bg-amber-100 text-amber-900 border-amber-200 font-normal"
                : "font-normal"
            }
            variant={fillState === "needs_players" ? undefined : "secondary"}
          >
            {fillLabel}
          </Badge>
        )}
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-stone-500">
          <span>
            {session.confirmedCount} / {session.capacity}
            {isFull ? " · Full — join waitlist" : ""}
          </span>
          <span>{fillPct}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full rounded bg-stone-100 overflow-hidden">
          <div
            className={`h-full ${isFull ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>
    </a>
  );
}
