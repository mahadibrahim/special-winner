"use client"

import { useState, useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type ScaffoldChoice =
  | { type: "empty" }
  | { type: "clone"; sourceSeasonId: string }
  | { type: "bulk"; count: number }

interface PriorSeason {
  id: string
  name: string
  startDate: string
}

interface Props {
  priorSeasons: PriorSeason[]
  value: ScaffoldChoice
  onChange: (choice: ScaffoldChoice) => void
  /** Called whenever a clone source is selected, so the parent can pre-fill form fields. */
  onCloneSourceSelected?: (sourceSeasonId: string) => void
}

export function SeasonScaffoldPicker({
  priorSeasons,
  value,
  onChange,
  onCloneSourceSelected,
}: Props) {
  const [bulkCount, setBulkCount] = useState(value.type === "bulk" ? value.count : 0)

  // When prior seasons load, default to "clone" if any exist
  useEffect(() => {
    if (priorSeasons.length > 0 && value.type === "empty") {
      const newest = priorSeasons[0]
      onChange({ type: "clone", sourceSeasonId: newest.id })
      onCloneSourceSelected?.(newest.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priorSeasons.length])

  return (
    <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
      <Label className="text-sm font-semibold">Starting structure</Label>

      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="scaffold-mode"
            checked={value.type === "clone"}
            disabled={priorSeasons.length === 0}
            onChange={() => {
              if (priorSeasons.length > 0) {
                const id = priorSeasons[0].id
                onChange({ type: "clone", sourceSeasonId: id })
                onCloneSourceSelected?.(id)
              }
            }}
          />
          <span className={priorSeasons.length === 0 ? "text-muted-foreground" : ""}>
            Clone from a previous season
            {priorSeasons.length === 0 && " (none available)"}
          </span>
        </label>

        {value.type === "clone" && (
          <div className="ml-6 space-y-2">
            <Select
              value={value.sourceSeasonId}
              onValueChange={(id) => {
                onChange({ type: "clone", sourceSeasonId: id })
                onCloneSourceSelected?.(id)
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorSeasons.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({s.startDate})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="scaffold-mode"
            checked={value.type === "bulk"}
            onChange={() => onChange({ type: "bulk", count: bulkCount })}
          />
          <span>Bulk-create teams</span>
        </label>

        {value.type === "bulk" && (
          <div className="ml-6 space-y-2">
            <Label htmlFor="bulk-count" className="text-sm">How many teams?</Label>
            <Input
              id="bulk-count"
              type="number"
              min={0}
              max={50}
              value={bulkCount}
              onChange={(e) => {
                const n = parseInt(e.target.value || "0", 10)
                setBulkCount(n)
                onChange({ type: "bulk", count: n })
              }}
              className="w-32"
            />
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name="scaffold-mode"
            checked={value.type === "empty"}
            onChange={() => onChange({ type: "empty" })}
          />
          <span>Empty season (no teams)</span>
        </label>
      </div>
    </div>
  )
}
