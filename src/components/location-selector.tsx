"use client"

import { useState, useEffect, useRef } from "react"
import { MapPin, ChevronDown, Check, Compass } from "lucide-react"

interface Location {
  id: string
  name: string
  area: string
  tagline: string
  coordinates: string
  pattern: "topo-hills" | "topo-valley" | "topo-plains"
}

// IDs match the `slug` of the corresponding `locations` row in the DB so
// the global `selectedLocation` value can be used directly as a filter
// against /api/public/seasons?location=<slug>.
const locations: Location[] = [
  {
    id: "worthington",
    name: "Worthington",
    area: "North Columbus",
    tagline: "Family + community soccer, year-round",
    coordinates: "40.0931° N",
    pattern: "topo-hills",
  },
  {
    id: "downtown",
    name: "Downtown",
    area: "OSU corridor",
    tagline: "Adult Express + late-night community leagues",
    coordinates: "39.9612° N",
    pattern: "topo-valley",
  },
]

const STORAGE_KEY = "aspire-selected-location"

interface LocationSelectorProps {
  mode?: "dropdown" | "cards"
  onLocationChange?: (locationId: string) => void
  className?: string
}

export default function LocationSelector({
  mode = "dropdown",
  onLocationChange,
  className = "",
}: LocationSelectorProps) {
  const [selectedId, setSelectedId] = useState<string>("worthington")
  const [isOpen, setIsOpen] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && locations.find((l) => l.id === stored)) {
      setSelectedId(stored)
    }
    setIsLoaded(true)
  }, [])

  // Close dropdown on outside click or Escape (keyboard a11y).
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  const handleSelect = (id: string) => {
    setSelectedId(id)
    localStorage.setItem(STORAGE_KEY, id)
    setIsOpen(false)
    onLocationChange?.(id)

    // Dispatch custom event for other components to listen
    window.dispatchEvent(new CustomEvent("location-change", { detail: { locationId: id } }))
  }

  const selectedLocation = locations.find((l) => l.id === selectedId)!

  if (mode === "cards") {
    return (
      <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${className}`}>
        {locations.map((location, index) => (
          <LocationCard
            key={location.id}
            location={location}
            isSelected={location.id === selectedId}
            onSelect={() => handleSelect(location.id)}
            delay={index * 100}
            isLoaded={isLoaded}
          />
        ))}
      </div>
    )
  }

  // Dropdown mode
  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={`Selected location: ${selectedLocation.name}. Click to change.`}
        className={`
          group flex items-center gap-2 px-3 py-2 rounded-lg
          bg-cream-2 hover:bg-cream-3 border border-border hover:border-primary/30
          transition-all duration-300
          ${isOpen ? "border-primary/50 bg-cream-3" : ""}
        `}
      >
        <div className="relative">
          <MapPin className="w-4 h-4 text-primary" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-primary rounded-full animate-pulse" />
        </div>
        <span className="text-sm font-medium text-ink">{selectedLocation.name}</span>
        <ChevronDown
          className={`w-4 h-4 text-ink-muted transition-transform duration-300 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown panel */}
      <div
        className={`
          absolute top-full left-0 mt-2 w-72 z-50
          transition-all duration-300 origin-top
          ${isOpen
            ? "opacity-100 scale-100 translate-y-0"
            : "opacity-0 scale-95 -translate-y-2 pointer-events-none"
          }
        `}
      >
        <div className="relative overflow-hidden rounded-xl border border-border bg-paper/98 backdrop-blur-xl shadow-2xl shadow-ink/10">
          {/* Header */}
          <div className="px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
            <div className="flex items-center gap-2 text-xs text-ink-muted uppercase tracking-wider">
              <Compass className="w-3 h-3" />
              Select Your Region
            </div>
          </div>

          {/* Location options */}
          <div className="p-2">
            {locations.map((location, index) => (
              <button
                key={location.id}
                onClick={() => handleSelect(location.id)}
                className={`
                  group w-full flex items-center gap-3 px-3 py-3 rounded-lg
                  transition-all duration-300
                  ${location.id === selectedId
                    ? "bg-primary/10 border border-primary/20"
                    : "hover:bg-cream-2 border border-transparent"
                  }
                `}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Topographic icon */}
                <div
                  className={`
                    relative w-10 h-10 rounded-lg overflow-hidden
                    ${location.id === selectedId ? "ring-2 ring-primary/50" : ""}
                  `}
                >
                  <TopoPattern pattern={location.pattern} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <MapPin
                      className={`w-4 h-4 transition-colors ${
                        location.id === selectedId ? "text-primary" : "text-ink-faint"
                      }`}
                    />
                  </div>
                </div>

                {/* Text content */}
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-semibold transition-colors ${
                        location.id === selectedId ? "text-ink" : "text-ink-2"
                      }`}
                    >
                      {location.name}
                    </span>
                    <span className="text-[10px] text-ink-faint font-mono">
                      {location.coordinates}
                    </span>
                  </div>
                  <div className="text-xs text-ink-muted">{location.area}</div>
                </div>

                {/* Check indicator */}
                {location.id === selectedId && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-3 h-3 text-cream" />
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-border bg-cream-2">
            <p className="text-[10px] text-ink-muted text-center">
              Programs and schedules vary by location
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

interface LocationCardProps {
  location: Location
  isSelected: boolean
  onSelect: () => void
  delay: number
  isLoaded: boolean
}

function LocationCard({ location, isSelected, onSelect, delay, isLoaded }: LocationCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`
        group relative overflow-hidden rounded-2xl p-6 text-left
        transition-all duration-500 ease-out
        ${isLoaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}
        ${isSelected
          ? "bg-gradient-to-br from-primary/15 to-primary/5 border-2 border-primary/40 scale-[1.02]"
          : "bg-paper border border-border hover:border-primary/30 hover:bg-cream-2 hover:scale-[1.01]"
        }
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Topographic background pattern */}
      <div className="absolute inset-0 opacity-30">
        <TopoPattern pattern={location.pattern} fullSize />
      </div>

      {/* Glow effect on selected */}
      {isSelected && (
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/20 rounded-full blur-3xl" />
      )}

      {/* Content */}
      <div className="relative z-10">
        {/* Header with icon */}
        <div className="flex items-start justify-between mb-4">
          <div
            className={`
              w-12 h-12 rounded-xl flex items-center justify-center
              transition-all duration-300
              ${isSelected
                ? "bg-primary shadow-lg shadow-primary/20"
                : "bg-cream-3 group-hover:bg-cream-3"
              }
            `}
          >
            <MapPin
              className={`w-6 h-6 transition-colors ${
                isSelected ? "text-cream" : "text-ink-muted group-hover:text-ink"
              }`}
            />
          </div>

          {/* Selection indicator */}
          <div
            className={`
              w-6 h-6 rounded-full border-2 flex items-center justify-center
              transition-all duration-300
              ${isSelected
                ? "border-primary bg-primary"
                : "border-ink-faint group-hover:border-ink-muted"
              }
            `}
          >
            {isSelected && <Check className="w-4 h-4 text-white" />}
          </div>
        </div>

        {/* Location name */}
        <h3
          className={`text-2xl font-bold mb-1 transition-colors ${
            isSelected ? "text-ink" : "text-ink-2 group-hover:text-ink"
          }`}
        >
          {location.name}
        </h3>

        {/* Area */}
        <p className="text-sm text-ink-muted mb-3">{location.area}</p>

        {/* Tagline */}
        <p
          className={`text-sm font-medium transition-colors ${
            isSelected ? "text-primary" : "text-ink-muted group-hover:text-ink-2"
          }`}
        >
          "{location.tagline}"
        </p>

        {/* Coordinates badge */}
        <div className="mt-4 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-cream-3 border border-border">
          <Compass className="w-3 h-3 text-ink-faint" />
          <span className="text-[10px] font-mono text-ink-faint">{location.coordinates}</span>
        </div>
      </div>

      {/* Hover shine effect */}
      <div
        className={`
          absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent
          -translate-x-full group-hover:translate-x-full transition-transform duration-1000
        `}
      />
    </button>
  )
}

interface TopoPatternProps {
  pattern: "topo-hills" | "topo-valley" | "topo-plains"
  fullSize?: boolean
}

function TopoPattern({ pattern, fullSize = false }: TopoPatternProps) {
  const getPath = () => {
    switch (pattern) {
      case "topo-hills":
        return (
          <>
            <circle cx="20" cy="20" r="8" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
            <circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
            <circle cx="20" cy="20" r="20" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
            <circle cx="32" cy="28" r="6" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.35" />
            <circle cx="32" cy="28" r="10" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.25" />
          </>
        )
      case "topo-valley":
        return (
          <>
            <path d="M0 15 Q 10 25, 20 15 T 40 15" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
            <path d="M0 20 Q 10 30, 20 20 T 40 20" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
            <path d="M0 25 Q 10 35, 20 25 T 40 25" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
            <path d="M0 10 Q 10 20, 20 10 T 40 10" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.25" />
          </>
        )
      case "topo-plains":
        return (
          <>
            <line x1="0" y1="10" x2="40" y2="12" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
            <line x1="0" y1="18" x2="40" y2="16" stroke="currentColor" strokeWidth="0.5" opacity="0.25" />
            <line x1="0" y1="26" x2="40" y2="28" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
            <line x1="0" y1="34" x2="40" y2="32" stroke="currentColor" strokeWidth="0.5" opacity="0.15" />
            <circle cx="30" cy="22" r="4" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
          </>
        )
    }
  }

  return (
    <svg
      className={`${fullSize ? "w-full h-full" : "w-full h-full"} text-primary`}
      viewBox="0 0 40 40"
      preserveAspectRatio={fullSize ? "xMidYMid slice" : "xMidYMid meet"}
    >
      <defs>
        <pattern id={`topo-${pattern}`} x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
          {getPath()}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#topo-${pattern})`} />
    </svg>
  )
}

// Hook to use selected location in other components
export function useSelectedLocation() {
  const [locationId, setLocationId] = useState<string>("worthington")

  useEffect(() => {
    // Initial load
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) setLocationId(stored)

    // Listen for changes
    const handleChange = (e: CustomEvent<{ locationId: string }>) => {
      setLocationId(e.detail.locationId)
    }

    window.addEventListener("location-change", handleChange as EventListener)
    return () => window.removeEventListener("location-change", handleChange as EventListener)
  }, [])

  return {
    locationId,
    location: locations.find((l) => l.id === locationId) || locations[0],
    locations,
  }
}
