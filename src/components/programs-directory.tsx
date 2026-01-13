"use client"

import { useState, useMemo, useEffect } from "react"
import { Search, MapPin, Loader2, SlidersHorizontal, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import ProgramCard from "@/components/program-card"
import { useSelectedLocation } from "@/components/location-selector"

interface Sport {
  id: string
  name: string
  slug: string
  icon: string | null
  color: string | null
}

interface Location {
  id: string
  name: string
  slug: string
  city: string | null
  state: string | null
}

interface Season {
  id: string
  name: string
  slug: string
  startDate: string
  endDate: string
  price: number
  deposit: number | null
  allowDeposit: boolean
  maxParticipants: number | null
  registeredCount: number
  spotsLeft: number | null
  scheduleNotes: string | null
  status: string
  program: {
    id: string
    name: string
    slug: string
    programType: string
  }
  sport: {
    id: string
    name: string
    slug: string
    icon: string | null
    color: string | null
  }
  location: {
    id: string
    name: string
    slug: string
    city: string | null
    state: string | null
  }
  ageGroup: {
    id: string
    name: string
    minAge: number
    maxAge: number
  } | null
}

export default function ProgramsDirectory() {
  const [seasons, setSeasons] = useState<Season[]>([])
  const [sports, setSports] = useState<Sport[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Use global location selector
  const { locationId: globalLocationId } = useSelectedLocation()
  const [selectedLocation, setSelectedLocation] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSports, setSelectedSports] = useState<string[]>([])
  const [ageRange, setAgeRange] = useState([3, 18])
  const [selectedSeason, setSelectedSeason] = useState("all")
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // Sync with global location selector
  useEffect(() => {
    if (globalLocationId) {
      setSelectedLocation(globalLocationId)
    }
  }, [globalLocationId])

  // Fetch filter options
  useEffect(() => {
    async function fetchFilters() {
      try {
        const response = await fetch("/api/public/filters")
        if (!response.ok) throw new Error("Failed to fetch filters")
        const data = await response.json()
        setSports(data.sports)
        setLocations(data.locations)
      } catch (err) {
        console.error("Error fetching filters:", err)
      }
    }
    fetchFilters()
  }, [])

  // Fetch seasons
  useEffect(() => {
    async function fetchSeasons() {
      setIsLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (selectedLocation !== "all") {
          params.set("location", selectedLocation)
        }
        params.set("status", "open")

        const response = await fetch(`/api/public/seasons?${params}`)
        if (!response.ok) throw new Error("Failed to fetch programs")
        const data = await response.json()
        setSeasons(data.seasons)
      } catch (err) {
        setError("Failed to load programs. Please try again.")
        console.error("Error fetching seasons:", err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchSeasons()
  }, [selectedLocation])

  // Get unique season names for filter
  const seasonOptions = useMemo(() => {
    const uniqueSeasons = new Set<string>()
    seasons.forEach((s) => {
      const match = s.name.match(/(Fall|Spring|Summer|Winter)\s+\d{4}/i)
      if (match) {
        uniqueSeasons.add(match[0])
      }
    })
    return [
      { value: "all", label: "All Seasons" },
      ...Array.from(uniqueSeasons).map((s) => ({ value: s, label: s })),
    ]
  }, [seasons])

  const filteredSeasons = useMemo(() => {
    return seasons.filter((season) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
          season.name.toLowerCase().includes(query) ||
          season.sport.name.toLowerCase().includes(query) ||
          season.program.name.toLowerCase().includes(query) ||
          (season.ageGroup?.name.toLowerCase().includes(query) ?? false)
        if (!matchesSearch) return false
      }

      // Sport filter
      if (selectedSports.length > 0 && !selectedSports.includes(season.sport.slug)) {
        return false
      }

      // Age range filter
      if (season.ageGroup) {
        const [minAge, maxAge] = ageRange
        if (season.ageGroup.maxAge < minAge || season.ageGroup.minAge > maxAge) {
          return false
        }
      }

      // Season name filter
      if (selectedSeason !== "all" && !season.name.includes(selectedSeason)) {
        return false
      }

      // Availability filter
      if (onlyAvailable && season.spotsLeft !== null && season.spotsLeft === 0) {
        return false
      }

      return true
    })
  }, [seasons, searchQuery, selectedSports, ageRange, selectedSeason, onlyAvailable])

  const toggleSport = (sportSlug: string) => {
    setSelectedSports((prev) =>
      prev.includes(sportSlug) ? prev.filter((s) => s !== sportSlug) : [...prev, sportSlug]
    )
  }

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (selectedSports.length > 0) count++
    if (ageRange[0] !== 3 || ageRange[1] !== 18) count++
    if (selectedSeason !== "all") count++
    if (onlyAvailable) count++
    return count
  }, [selectedSports, ageRange, selectedSeason, onlyAvailable])

  const clearAllFilters = () => {
    setSearchQuery("")
    setSelectedSports([])
    setAgeRange([3, 18])
    setSelectedSeason("all")
    setOnlyAvailable(false)
  }

  const FiltersContent = () => (
    <div className="space-y-8">
      {/* Sport Filter */}
      <div className="space-y-4">
        <h3 className="font-semibold text-sm uppercase tracking-wider text-white">Sport</h3>
        <div className="space-y-3">
          {sports.map((sport) => (
            <div key={sport.id} className="flex items-center space-x-3 group">
              <Checkbox
                id={`sport-${sport.slug}`}
                checked={selectedSports.includes(sport.slug)}
                onCheckedChange={() => toggleSport(sport.slug)}
                className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <Label
                htmlFor={`sport-${sport.slug}`}
                className="text-sm font-normal cursor-pointer flex items-center gap-2 text-gray-400 group-hover:text-white transition-colors"
              >
                {sport.icon && <span className="text-base">{sport.icon}</span>}
                {sport.name}
              </Label>
            </div>
          ))}
          {sports.length === 0 && (
            <p className="text-sm text-gray-500">No sports available</p>
          )}
        </div>
      </div>

      {/* Age Range Filter */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm uppercase tracking-wider text-white">Age Range</h3>
          <span className="text-sm text-primary font-medium">
            {ageRange[0]}-{ageRange[1]} years
          </span>
        </div>
        <Slider
          value={ageRange}
          onValueChange={setAgeRange}
          min={3}
          max={18}
          step={1}
          className="py-4"
        />
      </div>

      {/* Season Filter */}
      <div className="space-y-4">
        <h3 className="font-semibold text-sm uppercase tracking-wider text-white">Season</h3>
        <RadioGroup value={selectedSeason} onValueChange={setSelectedSeason}>
          {seasonOptions.map((season) => (
            <div key={season.value} className="flex items-center space-x-3 group">
              <RadioGroupItem
                value={season.value}
                id={`season-${season.value}`}
                className="border-white/20 text-primary"
              />
              <Label
                htmlFor={`season-${season.value}`}
                className="text-sm font-normal cursor-pointer text-gray-400 group-hover:text-white transition-colors"
              >
                {season.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* Availability Filter */}
      <div className="space-y-4">
        <h3 className="font-semibold text-sm uppercase tracking-wider text-white">Availability</h3>
        <div className="flex items-center space-x-3 group">
          <Checkbox
            id="only-available"
            checked={onlyAvailable}
            onCheckedChange={(checked) => setOnlyAvailable(checked === true)}
            className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
          />
          <Label
            htmlFor="only-available"
            className="text-sm font-normal cursor-pointer text-gray-400 group-hover:text-white transition-colors"
          >
            Only show programs with spots
          </Label>
        </div>
      </div>

      {/* Clear Filters */}
      {activeFilterCount > 0 && (
        <Button
          variant="outline"
          onClick={clearAllFilters}
          className="w-full border-white/10 text-gray-400 hover:text-white hover:bg-white/5"
        >
          <X className="w-4 h-4 mr-2" />
          Clear All Filters
        </Button>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Section Header */}
      <div className="py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Badge */}
          <div className="text-center mb-8">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Registration Open
            </span>
          </div>

          {/* Title */}
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-center text-white mb-4">
            Find Your Program
          </h2>
          <p className="text-center text-gray-400 max-w-2xl mx-auto mb-10">
            Browse our upcoming seasons and find the perfect program for your child.
            Filter by sport, age, and location to find what fits best.
          </p>

          {/* Search and Location Bar */}
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Location Selector */}
              <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                <SelectTrigger className="w-full sm:w-[200px] bg-white/5 border-white/10 text-white hover:bg-white/[0.07] focus:ring-primary/50">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-500" />
                    <SelectValue placeholder="Select location" />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a24] border-white/10">
                  <SelectItem value="all" className="text-gray-300 focus:bg-white/10 focus:text-white">
                    All Locations
                  </SelectItem>
                  {locations.map((loc) => (
                    <SelectItem
                      key={loc.id}
                      value={loc.slug}
                      className="text-gray-300 focus:bg-white/10 focus:text-white"
                    >
                      {loc.name}{loc.city ? `, ${loc.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  type="text"
                  placeholder="Search by sport, program, or age group..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-11 bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-primary/50 focus:ring-primary/50 hover:bg-white/[0.07] transition-colors"
                />
              </div>

              {/* Mobile Filter Toggle */}
              <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    className="lg:hidden bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white"
                  >
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="ml-2 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-[300px] bg-[#0a0a0f] border-r border-white/10 overflow-y-auto"
                >
                  <SheetHeader>
                    <SheetTitle className="text-white">Filters</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6">
                    <FiltersContent />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="flex gap-8">
          {/* Desktop Sidebar Filters */}
          <aside className="hidden lg:block w-[280px] shrink-0">
            <div className="sticky top-24">
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-primary" />
                    Filters
                  </h3>
                  {activeFilterCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-medium">
                      {activeFilterCount} active
                    </span>
                  )}
                </div>
                <FiltersContent />
              </div>
            </div>
          </aside>

          {/* Programs Grid */}
          <main className="flex-1 min-w-0">
            {/* Results count */}
            <div className="mb-6 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {isLoading
                  ? "Loading programs..."
                  : `${filteredSeasons.length} ${filteredSeasons.length === 1 ? "program" : "programs"} found`}
              </p>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="text-sm text-primary hover:text-primary/80 transition-colors hidden sm:block"
                >
                  Clear filters
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                <p className="text-gray-500">Loading programs...</p>
              </div>
            ) : error ? (
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-12">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                    <X className="w-8 h-8 text-destructive" />
                  </div>
                  <p className="text-lg font-medium text-white">{error}</p>
                  <Button
                    variant="outline"
                    onClick={() => window.location.reload()}
                    className="border-white/10 text-white hover:bg-white/5"
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            ) : filteredSeasons.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredSeasons.map((season) => (
                  <ProgramCard key={season.id} season={season} />
                ))}
              </div>
            ) : (
              <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-12">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                    <Search className="w-8 h-8 text-gray-500" />
                  </div>
                  <p className="text-lg font-medium text-white">No programs match your filters</p>
                  <p className="text-gray-500">Try adjusting your search or filter criteria</p>
                  <Button
                    variant="outline"
                    onClick={clearAllFilters}
                    className="mt-4 border-white/10 text-white hover:bg-white/5"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Clear All Filters
                  </Button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
