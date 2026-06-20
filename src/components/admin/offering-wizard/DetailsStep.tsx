"use client";
import { offeringFieldShown, type OfferingType } from "@/lib/admin/offering-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface OfferingDraft {
  name: string; slug: string; startDate: string; endDate: string;
  dailyStartTime: string; dailyEndTime: string;
  fullDayPrice: string; halfDayPrice: string; individualPrice: string; teamPrice: string;
  minAge: string; maxAge: string; capacity: string; deposit: string;
  divisionGender: string; skillLevel: string;
}

export function DetailsStep({
  type,
  value,
  onChange,
}: {
  type: OfferingType;
  value: OfferingDraft;
  onChange: (d: OfferingDraft) => void;
}) {
  const set = (k: keyof OfferingDraft, v: string) => onChange({ ...value, [k]: v });
  const show = (key: Parameters<typeof offeringFieldShown>[1]) => offeringFieldShown(type, key);

  return (
    <div className="space-y-4">
      <Field id="name" label="Name *">
        <Input id="name" value={value.name} onChange={(e) => set("name", e.target.value)} />
      </Field>

      {show("dateRange") && (
        <div className="grid grid-cols-2 gap-4">
          <Field id="startDate" label="Start date *">
            <Input id="startDate" type="date" value={value.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </Field>
          <Field id="endDate" label="End date *">
            <Input id="endDate" type="date" value={value.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </Field>
        </div>
      )}

      {show("dailyTimes") && (
        <div className="grid grid-cols-2 gap-4">
          <Field id="dailyStartTime" label="Daily start time">
            <Input id="dailyStartTime" type="time" value={value.dailyStartTime} onChange={(e) => set("dailyStartTime", e.target.value)} />
          </Field>
          <Field id="dailyEndTime" label="Daily end time">
            <Input id="dailyEndTime" type="time" value={value.dailyEndTime} onChange={(e) => set("dailyEndTime", e.target.value)} />
          </Field>
        </div>
      )}

      {show("fullDayPrice") && (
        <Field id="fullDayPrice" label="Full-day price ($) *">
          <Input id="fullDayPrice" type="number" step="0.01" min="0" value={value.fullDayPrice} onChange={(e) => set("fullDayPrice", e.target.value)} />
        </Field>
      )}
      {show("halfDayPrice") && (
        <Field id="halfDayPrice" label="Half-day price ($)">
          <Input id="halfDayPrice" type="number" step="0.01" min="0" value={value.halfDayPrice} onChange={(e) => set("halfDayPrice", e.target.value)} />
        </Field>
      )}
      {show("individualPrice") && (
        <Field id="individualPrice" label="Individual price ($) *">
          <Input id="individualPrice" type="number" step="0.01" min="0" value={value.individualPrice} onChange={(e) => set("individualPrice", e.target.value)} />
        </Field>
      )}
      {show("teamPrice") && (
        <Field id="teamPrice" label="Team price ($) *">
          <Input id="teamPrice" type="number" step="0.01" min="0" value={value.teamPrice} onChange={(e) => set("teamPrice", e.target.value)} />
        </Field>
      )}

      {show("ageRange") && (
        <div className="grid grid-cols-2 gap-4">
          <Field id="minAge" label="Youngest age *">
            <Input id="minAge" type="number" min="0" value={value.minAge} onChange={(e) => set("minAge", e.target.value)} />
          </Field>
          <Field id="maxAge" label="Oldest age *">
            <Input id="maxAge" type="number" min="0" value={value.maxAge} onChange={(e) => set("maxAge", e.target.value)} />
          </Field>
        </div>
      )}

      {(show("capacityKids") || show("capacityTeams")) && (
        <Field id="capacity" label={show("capacityTeams") ? "Max teams" : "Max participants"}>
          <Input id="capacity" type="number" min="0" value={value.capacity} onChange={(e) => set("capacity", e.target.value)} />
        </Field>
      )}

      {show("deposit") && (
        <Field id="deposit" label="Deposit ($)">
          <Input id="deposit" type="number" step="0.01" min="0" value={value.deposit} onChange={(e) => set("deposit", e.target.value)} />
        </Field>
      )}

      {show("divisions") && (
        <div className="grid grid-cols-2 gap-4">
          <Field id="divisionGender" label="Division (gender)">
            <Input id="divisionGender" value={value.divisionGender} onChange={(e) => set("divisionGender", e.target.value)} placeholder="coed / mens / womens" />
          </Field>
          <Field id="skillLevel" label="Skill level">
            <Input id="skillLevel" value={value.skillLevel} onChange={(e) => set("skillLevel", e.target.value)} placeholder="a / b / c / d / open" />
          </Field>
        </div>
      )}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
