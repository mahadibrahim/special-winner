"use client"

import { Calendar, MapPin, Users, ArrowRight, TrendingUp, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

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

// Fallback icons if not set in database
const fallbackIcons: Record<string, string> = {
  soccer: "⚽",
  basketball: "🏀",
  baseball: "⚾",
  football: "🏈",
  "t-ball": "🥎",
}

// Fallback colors if not set in database
const fallbackColors: Record<string, string> = {
  soccer: "#22c55e",
  basketball: "#f97316",
  baseball: "#dc2626",
  football: "#8b4513",
  "t-ball": "#eab308",
}

export default function ProgramCard({ season }: { season: Season }) {
  const icon = season.sport.icon || fallbackIcons[season.sport.slug] || "🏃"
  const color = season.sport.color || fallbackColors[season.sport.slug] || "#6b7280"

  // Calculate availability
  const hasCapacity = season.maxParticipants !== null
  const spotsLeft = season.spotsLeft ?? 0
  const totalSpots = season.maxParticipants ?? 0
  const filledPercent = hasCapacity && totalSpots > 0
    ? ((totalSpots - spotsLeft) / totalSpots) * 100
    : 0

  // Determine urgency level
  const isAlmostFull = hasCapacity && spotsLeft <= 5 && spotsLeft > 0
  const isFull = hasCapacity && spotsLeft === 0
  const isPopular = hasCapacity && filledPercent >= 60

  // Format location display
  const locationDisplay = season.location.city
    ? `${season.location.name}, ${season.location.city}`
    : season.location.name

  // Format schedule from dates or notes
  const scheduleDisplay = season.scheduleNotes || formatDateRange(season.startDate, season.endDate)

  return (
    <div className="group relative">
      {/* Card */}
      <div
        className="relative h-full bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.12] rounded-2xl overflow-hidden transition-all duration-500 flex flex-col"
        style={{
          boxShadow: `0 0 0 1px transparent`,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = `0 0 30px ${color}15, 0 0 60px ${color}08`
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = `0 0 0 1px transparent`
        }}
      >
        {/* Popular badge */}
        {isPopular && !isFull && (
          <div className="absolute top-4 right-4 z-10">
            <Badge className="bg-primary/90 text-primary-foreground border-0 gap-1 px-2.5 py-1">
              <TrendingUp className="w-3 h-3" />
              Popular
            </Badge>
          </div>
        )}

        {/* Content */}
        <div className="p-6 flex-1 flex flex-col">
          {/* Header with Icon */}
          <div className="flex items-start gap-4 mb-5">
            {/* Sport icon with glow */}
            <div className="relative">
              <div
                className="absolute inset-0 rounded-xl blur-xl opacity-0 group-hover:opacity-50 transition-opacity duration-500"
                style={{ backgroundColor: color }}
              />
              <div
                className="relative w-14 h-14 rounded-xl flex items-center justify-center text-2xl transition-transform duration-300 group-hover:scale-110"
                style={{
                  backgroundColor: `${color}15`,
                  border: `1px solid ${color}30`,
                }}
              >
                {icon}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <Badge
                variant="outline"
                className="mb-2 border-white/10 text-gray-400 bg-white/5"
              >
                {season.sport.name}
              </Badge>
              <h3 className="text-lg font-bold text-white leading-tight group-hover:text-primary transition-colors line-clamp-2">
                {season.name}
              </h3>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-3 mb-6 flex-1">
            {season.ageGroup && (
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 text-gray-500" />
                </div>
                <span className="text-gray-400">
                  Ages {season.ageGroup.minAge}-{season.ageGroup.maxAge}
                  <span className="text-gray-600 ml-1">({season.ageGroup.name})</span>
                </span>
              </div>
            )}

            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-gray-500" />
              </div>
              <span className="text-gray-400 truncate">{locationDisplay}</span>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-4 h-4 text-gray-500" />
              </div>
              <span className="text-gray-400">{scheduleDisplay}</span>
            </div>
          </div>

          {/* Price and Availability */}
          <div className="space-y-4">
            {/* Price */}
            <div className="flex items-end justify-between">
              <div>
                <span className="text-3xl font-bold text-white">${season.price}</span>
                {season.allowDeposit && season.deposit && (
                  <div className="text-sm text-gray-500 mt-1">
                    or <span className="text-primary font-medium">${season.deposit}</span> deposit
                  </div>
                )}
              </div>

              {/* Availability indicator */}
              {hasCapacity && (
                <div className="text-right">
                  {isFull ? (
                    <div className="flex items-center gap-1.5 text-destructive">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive"></span>
                      </span>
                      <span className="text-sm font-medium">Waitlist</span>
                    </div>
                  ) : isAlmostFull ? (
                    <div className="flex items-center gap-1.5 text-warning">
                      <Clock className="w-4 h-4" />
                      <span className="text-sm font-medium">{spotsLeft} spots left!</span>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">
                      {spotsLeft} of {totalSpots} spots
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Progress bar for availability */}
            {hasCapacity && !isFull && (
              <div className="relative h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                  style={{
                    width: `${filledPercent}%`,
                    backgroundColor: isAlmostFull ? 'var(--warning)' : color,
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* CTA Button */}
        <div className="p-6 pt-0">
          <Button
            className="w-full group/btn bg-white/5 hover:bg-primary text-white hover:text-primary-foreground border border-white/10 hover:border-primary rounded-xl py-6 transition-all duration-300"
            asChild
          >
            <a
              href={`/register/${season.id}`}
              className="flex items-center justify-center gap-2"
            >
              {isFull ? "Join Waitlist" : "Register Now"}
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover/btn:translate-x-1" />
            </a>
          </Button>
        </div>

        {/* Hover border glow effect */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background: `linear-gradient(135deg, ${color}10 0%, transparent 50%, ${color}05 100%)`,
          }}
        />
      </div>
    </div>
  )
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate)
  const end = new Date(endDate)

  const startMonth = start.toLocaleDateString("en-US", { month: "short" })
  const startDay = start.getDate()
  const endMonth = end.toLocaleDateString("en-US", { month: "short" })
  const endDay = end.getDate()
  const year = end.getFullYear()

  if (startMonth === endMonth) {
    return `${startMonth} ${startDay} - ${endDay}, ${year}`
  }
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`
}
