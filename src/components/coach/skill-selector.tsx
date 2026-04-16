"use client"

import { useState, useMemo } from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Search,
  Target,
  Brain,
  Dumbbell,
  Activity,
  Check,
  Star,
  X,
} from "lucide-react"

interface Skill {
  id: string
  name: string
  description: string | null
  isCore: boolean
  sortOrder: number
  domain: {
    id: string
    name: string
    displayName: string
    color: string
  }
  stage: {
    id: string
    name: string
    slug: string
  }
}

interface Domain {
  id: string
  name: string
  displayName: string
  color: string
}

interface Stage {
  id: string
  name: string
  slug: string
  ageMin: number | null
  ageMax: number | null
}

interface SkillSelectorProps {
  skills: Skill[]
  domains: Domain[]
  stages: Stage[]
  selectedSkill: Skill | null
  onSelect: (skill: Skill) => void
  defaultStageId?: string
  className?: string
  multiple?: boolean
  selectedSkills?: Skill[]
  onMultiSelect?: (skills: Skill[]) => void
}

const DOMAIN_ICONS: Record<string, typeof Target> = {
  technical: Target,
  tactical: Brain,
  physical: Dumbbell,
  psychological: Activity,
}

function getDomainIcon(domainName: string) {
  return DOMAIN_ICONS[domainName.toLowerCase()] || Target
}

function SkillCard({
  skill,
  isSelected,
  onClick,
}: {
  skill: Skill
  isSelected: boolean
  onClick: () => void
}) {
  const DomainIcon = getDomainIcon(skill.domain.name)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full p-3 rounded-lg border text-left transition-all",
        "hover:border-ink-faint/20 hover:bg-cream-2",
        isSelected
          ? "border-primary/50 bg-primary/10"
          : "border-border bg-paper"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
            isSelected ? "bg-primary/20" : "bg-cream-3"
          )}
          style={{ backgroundColor: isSelected ? undefined : `${skill.domain.color}20` }}
        >
          {isSelected ? (
            <Check className="w-4 h-4 text-primary" />
          ) : (
            <DomainIcon className="w-4 h-4" style={{ color: skill.domain.color }} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className={cn(
              "font-medium text-sm truncate",
              isSelected ? "text-primary" : "text-ink"
            )}>
              {skill.name}
            </h4>
            {skill.isCore && (
              <Star className="w-3 h-3 text-amber-400 shrink-0" fill="currentColor" />
            )}
          </div>

          {skill.description && (
            <p className="text-xs text-ink-muted line-clamp-2 mt-0.5">
              {skill.description}
            </p>
          )}

          <div className="flex items-center gap-2 mt-2">
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 border-border"
              style={{
                backgroundColor: `${skill.domain.color}15`,
                color: skill.domain.color,
                borderColor: `${skill.domain.color}30`
              }}
            >
              {skill.domain.displayName}
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 bg-paper border-border text-ink-muted"
            >
              {skill.stage.name}
            </Badge>
          </div>
        </div>
      </div>
    </button>
  )
}

export default function SkillSelector({
  skills,
  domains,
  stages,
  selectedSkill,
  onSelect,
  defaultStageId,
  className,
  multiple = false,
  selectedSkills = [],
  onMultiSelect,
}: SkillSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStage, setFilterStage] = useState<string>(defaultStageId || "all")
  const [filterDomain, setFilterDomain] = useState<string>("all")
  const [showCoreOnly, setShowCoreOnly] = useState(false)

  // Filter skills
  const filteredSkills = useMemo(() => {
    let filtered = [...skills]

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (skill) =>
          skill.name.toLowerCase().includes(query) ||
          skill.description?.toLowerCase().includes(query)
      )
    }

    // Stage filter
    if (filterStage !== "all") {
      filtered = filtered.filter((skill) => skill.stage.id === filterStage)
    }

    // Domain filter
    if (filterDomain !== "all") {
      filtered = filtered.filter((skill) => skill.domain.id === filterDomain)
    }

    // Core only filter
    if (showCoreOnly) {
      filtered = filtered.filter((skill) => skill.isCore)
    }

    // Sort by domain then by sort order
    filtered.sort((a, b) => {
      if (a.domain.name !== b.domain.name) {
        return a.domain.name.localeCompare(b.domain.name)
      }
      return a.sortOrder - b.sortOrder
    })

    return filtered
  }, [skills, searchQuery, filterStage, filterDomain, showCoreOnly])

  // Group skills by domain
  const groupedSkills = useMemo(() => {
    const groups = new Map<string, { domain: Domain; skills: Skill[] }>()

    filteredSkills.forEach((skill) => {
      if (!groups.has(skill.domain.id)) {
        groups.set(skill.domain.id, {
          domain: skill.domain,
          skills: [],
        })
      }
      groups.get(skill.domain.id)!.skills.push(skill)
    })

    return Array.from(groups.values())
  }, [filteredSkills])

  const handleSkillClick = (skill: Skill) => {
    if (multiple && onMultiSelect) {
      const isAlreadySelected = selectedSkills.some((s) => s.id === skill.id)
      if (isAlreadySelected) {
        onMultiSelect(selectedSkills.filter((s) => s.id !== skill.id))
      } else {
        onMultiSelect([...selectedSkills, skill])
      }
    } else {
      onSelect(skill)
    }
  }

  const isSkillSelected = (skill: Skill) => {
    if (multiple) {
      return selectedSkills.some((s) => s.id === skill.id)
    }
    return selectedSkill?.id === skill.id
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Filters */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <Input
            placeholder="Search skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-paper border-border"
          />
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap gap-2">
          <Select value={filterStage} onValueChange={setFilterStage}>
            <SelectTrigger className="w-40 h-8 text-xs bg-paper border-border">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stage.name}
                  {stage.ageMin && stage.ageMax && (
                    <span className="text-ink-muted ml-1">
                      ({stage.ageMin}-{stage.ageMax})
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterDomain} onValueChange={setFilterDomain}>
            <SelectTrigger className="w-36 h-8 text-xs bg-paper border-border">
              <SelectValue placeholder="All Domains" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              {domains.map((domain) => (
                <SelectItem key={domain.id} value={domain.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: domain.color }}
                    />
                    {domain.displayName}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant={showCoreOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setShowCoreOnly(!showCoreOnly)}
            className={cn(
              "h-8 text-xs gap-1",
              !showCoreOnly && "bg-paper border-border"
            )}
          >
            <Star className={cn("w-3 h-3", showCoreOnly && "fill-current")} />
            Core Skills
          </Button>
        </div>

        {/* Selected count for multiple */}
        {multiple && selectedSkills.length > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
              {selectedSkills.length} selected
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onMultiSelect?.([])}
              className="h-6 text-xs text-ink-muted hover:text-ink gap-1"
            >
              <X className="w-3 h-3" />
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Skills list */}
      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
        {groupedSkills.length === 0 ? (
          <div className="text-center py-8">
            <Target className="w-8 h-8 text-ink-faint mx-auto mb-2" />
            <p className="text-sm text-ink-muted">No skills found</p>
            <p className="text-xs text-ink-faint mt-1">
              Try adjusting your filters
            </p>
          </div>
        ) : (
          groupedSkills.map(({ domain, skills: domainSkills }) => (
            <div key={domain.id}>
              <div className="flex items-center gap-2 mb-2 sticky top-0 bg-cream py-1 z-10">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: domain.color }}
                />
                <h3 className="text-xs font-medium text-ink-muted uppercase tracking-wider">
                  {domain.displayName}
                </h3>
                <span className="text-xs text-ink-faint">({domainSkills.length})</span>
              </div>

              <div className="grid gap-2">
                {domainSkills.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    isSelected={isSkillSelected(skill)}
                    onClick={() => handleSkillClick(skill)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer stats */}
      <div className="text-xs text-ink-faint pt-2 border-t border-border">
        Showing {filteredSkills.length} of {skills.length} skills
      </div>
    </div>
  )
}
