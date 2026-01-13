"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"

interface ProgramFiltersProps {
  sports: string[]
  selectedSports: string[]
  onSportToggle: (sport: string) => void
  ageRange: number[]
  onAgeRangeChange: (range: number[]) => void
  seasons: Array<{ value: string; label: string }>
  selectedSeason: string
  onSeasonChange: (season: string) => void
  onlyAvailable: boolean
  onAvailabilityChange: (available: boolean) => void
}

export default function ProgramFilters({
  sports,
  selectedSports,
  onSportToggle,
  ageRange,
  onAgeRangeChange,
  seasons,
  selectedSeason,
  onSeasonChange,
  onlyAvailable,
  onAvailabilityChange,
}: ProgramFiltersProps) {
  return (
    <div className="space-y-8">
      {/* Sport Filter */}
      <div className="space-y-4">
        <h3 className="font-semibold text-base text-foreground">Sport</h3>
        <div className="space-y-3">
          {sports.map((sport) => (
            <div key={sport} className="flex items-center space-x-3">
              <Checkbox
                id={`sport-${sport}`}
                checked={selectedSports.includes(sport)}
                onCheckedChange={() => onSportToggle(sport)}
              />
              <Label htmlFor={`sport-${sport}`} className="text-sm font-normal cursor-pointer">
                {sport}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* Age Range Filter */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base text-foreground">Age Range</h3>
          <span className="text-sm text-muted-foreground">
            {ageRange[0]}-{ageRange[1]} years
          </span>
        </div>
        <Slider value={ageRange} onValueChange={onAgeRangeChange} min={5} max={13} step={1} className="py-4" />
      </div>

      {/* Season Filter */}
      <div className="space-y-4">
        <h3 className="font-semibold text-base text-foreground">Season</h3>
        <RadioGroup value={selectedSeason} onValueChange={onSeasonChange}>
          {seasons.map((season) => (
            <div key={season.value} className="flex items-center space-x-3">
              <RadioGroupItem value={season.value} id={`season-${season.value}`} />
              <Label htmlFor={`season-${season.value}`} className="text-sm font-normal cursor-pointer">
                {season.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* Availability Filter */}
      <div className="space-y-4">
        <h3 className="font-semibold text-base text-foreground">Availability</h3>
        <div className="flex items-center space-x-3">
          <Checkbox
            id="only-available"
            checked={onlyAvailable}
            onCheckedChange={(checked) => onAvailabilityChange(checked === true)}
          />
          <Label htmlFor="only-available" className="text-sm font-normal cursor-pointer">
            Only show programs with spots
          </Label>
        </div>
      </div>
    </div>
  )
}
