"use client"

import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

interface SkillData {
  name: string
  current: number
  previous: number
  history: number[]
}

interface SkillProgressChartProps {
  skills: SkillData[]
  className?: string
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 5)
  const min = Math.min(...data, 0)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100
    const y = 100 - ((value - min) / range) * 100
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`gradient-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="drop-shadow-sm"
      />
      <polygon
        points={`0,100 ${points} 100,100`}
        fill={`url(#gradient-${color})`}
      />
    </svg>
  )
}

function SkillBar({ skill }: { skill: SkillData }) {
  const trend = skill.current - skill.previous
  const trendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus
  const TrendIcon = trendIcon
  const trendColor = trend > 0 ? "text-emerald-400" : trend < 0 ? "text-red-400" : "text-ink-muted"

  const levelLabels = ["Beginner", "Developing", "Competent", "Proficient", "Advanced"]
  const levelColors = [
    "from-gray-500 to-gray-600",
    "from-blue-500 to-blue-600",
    "from-emerald-500 to-green-600",
    "from-amber-500 to-orange-500",
    "from-primary to-red-500",
  ]

  return (
    <div className="group p-4 rounded-xl bg-paper border border-border hover:border-border transition-all">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-medium text-ink text-sm">{skill.name}</h4>
          <p className="text-xs text-ink-muted">{levelLabels[skill.current - 1] || "Assessing"}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendIcon className={cn("w-3.5 h-3.5", trendColor)} />
          <span className={cn("text-xs font-medium", trendColor)}>
            {trend > 0 ? `+${trend}` : trend}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative h-2 bg-cream-3 rounded-full overflow-hidden mb-3">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full bg-gradient-to-r transition-all duration-500",
            levelColors[skill.current - 1] || levelColors[0]
          )}
          style={{ width: `${(skill.current / 5) * 100}%` }}
        />
        {/* Level markers */}
        <div className="absolute inset-0 flex">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex-1 border-r border-border last:border-0"
            />
          ))}
        </div>
      </div>

      {/* Mini Sparkline */}
      <div className="h-8 opacity-60 group-hover:opacity-100 transition-opacity">
        <MiniSparkline
          data={skill.history}
          color={skill.current >= 4 ? "#cc442c" : skill.current >= 3 ? "#22c55e" : "#3b82f6"}
        />
      </div>
    </div>
  )
}

export default function SkillProgressChart({ skills, className }: SkillProgressChartProps) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      {skills.map((skill) => (
        <SkillBar key={skill.name} skill={skill} />
      ))}
    </div>
  )
}

export function SkillRadarPlaceholder({ skills }: { skills: SkillData[] }) {
  // Simple radar-style visualization
  const centerX = 50
  const centerY = 50
  const maxRadius = 40

  const points = skills.map((skill, index) => {
    const angle = (index / skills.length) * Math.PI * 2 - Math.PI / 2
    const radius = (skill.current / 5) * maxRadius
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      labelX: centerX + Math.cos(angle) * (maxRadius + 12),
      labelY: centerY + Math.sin(angle) * (maxRadius + 12),
      name: skill.name,
      value: skill.current,
    }
  })

  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'

  return (
    <div className="relative aspect-square max-w-xs mx-auto">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Background rings */}
        {[1, 2, 3, 4, 5].map((level) => (
          <circle
            key={level}
            cx={centerX}
            cy={centerY}
            r={(level / 5) * maxRadius}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="0.5"
          />
        ))}

        {/* Axis lines */}
        {skills.map((_, index) => {
          const angle = (index / skills.length) * Math.PI * 2 - Math.PI / 2
          const endX = centerX + Math.cos(angle) * maxRadius
          const endY = centerY + Math.sin(angle) * maxRadius
          return (
            <line
              key={index}
              x1={centerX}
              y1={centerY}
              x2={endX}
              y2={endY}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="0.5"
            />
          )
        })}

        {/* Filled area */}
        <path
          d={pathData}
          fill="rgba(204, 68, 44, 0.2)"
          stroke="#cc442c"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r="2"
            fill="#cc442c"
            className="drop-shadow-lg"
          />
        ))}
      </svg>

      {/* Labels */}
      {points.map((point, index) => (
        <div
          key={index}
          className="absolute text-[10px] text-ink-muted whitespace-nowrap transform -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${point.labelX}%`,
            top: `${point.labelY}%`,
          }}
        >
          {point.name}
        </div>
      ))}
    </div>
  )
}
