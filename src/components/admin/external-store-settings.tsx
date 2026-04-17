"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ExternalStoreValue {
  url: string;
  label: string;
  partnerName: "Squadlocker" | "BSN" | "Custom Ink" | "Other";
}

interface Props {
  value: ExternalStoreValue | null | undefined;
  onChange: (next: ExternalStoreValue | null) => void;
  headingClassName?: string;
}

const EMPTY: ExternalStoreValue = {
  url: "",
  label: "",
  partnerName: "Squadlocker",
};

export function ExternalStoreSettings({
  value,
  onChange,
  headingClassName,
}: Props) {
  const v: ExternalStoreValue = value ?? EMPTY;

  const set = (patch: Partial<ExternalStoreValue>) => {
    const next: ExternalStoreValue = { ...v, ...patch };
    // When both url and label are blank, treat as "cleared" and emit null so
    // the API call can DELETE the key.
    if (!next.url && !next.label) {
      onChange(null);
      return;
    }
    onChange(next);
  };

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="space-y-1">
        <h3 className={headingClassName ?? "text-lg font-semibold"}>
          External Team Store
        </h3>
        <p className="text-sm text-muted-foreground">
          Optional. Link parents to a third-party spirit-wear store (Squadlocker,
          BSN, Custom Ink, etc.). Leave blank to hide the store link on
          parent-facing pages.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="externalStoreLabel">Label shown to parents</Label>
        <Input
          id="externalStoreLabel"
          value={v.label}
          onChange={(e) => set({ label: e.target.value })}
          placeholder="Aspire Powell Team Store"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="externalStoreUrl">URL</Label>
        <Input
          id="externalStoreUrl"
          type="url"
          value={v.url}
          onChange={(e) => set({ url: e.target.value })}
          placeholder="https://teamstore.squadlocker.com/..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="externalStorePartner">Partner</Label>
        <Select
          value={v.partnerName}
          onValueChange={(pn) =>
            set({ partnerName: pn as ExternalStoreValue["partnerName"] })
          }
        >
          <SelectTrigger id="externalStorePartner">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Squadlocker">Squadlocker</SelectItem>
            <SelectItem value="BSN">BSN Sports</SelectItem>
            <SelectItem value="Custom Ink">Custom Ink</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
