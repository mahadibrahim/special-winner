import { useState, useEffect } from "react";
import {
  Target,
  Brain,
  Zap,
  Heart,
  X,
  Send,
  Loader2,
  Star,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Filter,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";

interface Skill {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  introductionAge: number | null;
  progressionLevels: Record<string, string> | null;
  observableBehaviors: string[] | null;
  commonMistakes: string[] | null;
  coachingTips: string[] | null;
  isCore: boolean;
  sortOrder: number;
  domain: {
    id: string;
    name: string;
    displayName: string;
    color: string | null;
    icon: string | null;
  };
  stage: {
    id: string;
    name: string;
    slug: string;
    ageMin: number;
    ageMax: number;
  };
}

interface Stage {
  id: string;
  name: string;
  slug: string;
  ageMin: number;
  ageMax: number;
}

interface Domain {
  id: string;
  name: string;
  displayName: string;
  color: string | null;
  icon: string | null;
}

interface Team {
  id: string;
  name: string;
  sport: {
    id: string;
    name: string;
  };
  season?: {
    id: string;
    name: string;
  } | null;
}

interface PlayerAssessmentFormProps {
  playerId: string;
  playerName: string;
  playerAge?: number;
  teams: Team[];
  isOpen: boolean;
  onClose: () => void;
  onAssessmentCreated?: () => void;
}

const DOMAIN_ICONS: Record<string, typeof Target> = {
  technical: Target,
  tactical: Brain,
  physical: Zap,
  psychological: Heart,
};

const LEVEL_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Emerging", color: "bg-red-500" },
  2: { label: "Developing", color: "bg-orange-500" },
  3: { label: "Competent", color: "bg-yellow-500" },
  4: { label: "Proficient", color: "bg-blue-500" },
  5: { label: "Advanced", color: "bg-green-500" },
};

const CONTEXT_OPTIONS = [
  { value: "practice", label: "Practice" },
  { value: "game", label: "Game" },
  { value: "scrimmage", label: "Scrimmage" },
  { value: "training", label: "Training" },
  { value: "test", label: "Test/Evaluation" },
];

export default function PlayerAssessmentForm({
  playerId,
  playerName,
  playerAge,
  teams,
  isOpen,
  onClose,
  onAssessmentCreated,
}: PlayerAssessmentFormProps) {
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(teams[0] || null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);

  // Filters
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCoreOnly, setShowCoreOnly] = useState(false);

  // Assessment form state
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [level, setLevel] = useState<number>(3);
  const [observationContext, setObservationContext] = useState("practice");
  const [notes, setNotes] = useState("");
  const [strengths, setStrengths] = useState<string[]>([]);
  const [areasForImprovement, setAreasForImprovement] = useState<string[]>([]);
  const [newStrength, setNewStrength] = useState("");
  const [newImprovement, setNewImprovement] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && selectedTeam?.sport?.id) {
      fetchSkillsData();
    }
  }, [isOpen, selectedTeam]);

  useEffect(() => {
    if (teams.length > 0 && !selectedTeam) {
      setSelectedTeam(teams[0]);
    }
  }, [teams, selectedTeam]);

  // Auto-select appropriate stage based on player age
  useEffect(() => {
    if (playerAge && stages.length > 0 && !selectedStageId) {
      const appropriateStage = stages.find(
        (s) => playerAge >= s.ageMin && playerAge <= s.ageMax
      );
      if (appropriateStage) {
        setSelectedStageId(appropriateStage.id);
      }
    }
  }, [playerAge, stages, selectedStageId]);

  const fetchSkillsData = async () => {
    if (!selectedTeam?.sport?.id) return;

    setIsLoadingSkills(true);
    setFetchError(null);
    try {
      const [domainsRes, stagesRes, skillsRes] = await Promise.all([
        fetch("/api/coach/skills/domains"),
        fetch("/api/coach/skills/stages"),
        fetch(`/api/coach/skills?sportId=${selectedTeam.sport.id}`),
      ]);

      if (!domainsRes.ok || !stagesRes.ok || !skillsRes.ok) {
        throw new Error("Failed to load skills library");
      }

      const [domainsData, stagesData, skillsData] = await Promise.all([
        domainsRes.json(),
        stagesRes.json(),
        skillsRes.json(),
      ]);

      setDomains(domainsData.domains || []);
      setStages(stagesData.stages || []);
      setSkills(skillsData.skills || []);
    } catch (err) {
      console.error("Error fetching skills data:", err);
      setFetchError("Could not load the skills library. Check your connection and try again.");
    } finally {
      setIsLoadingSkills(false);
    }
  };

  const filteredSkills = skills.filter((skill) => {
    if (selectedStageId && skill.stage.id !== selectedStageId) return false;
    if (selectedDomainId && skill.domain.id !== selectedDomainId) return false;
    if (showCoreOnly && !skill.isCore) return false;
    if (searchTerm && !skill.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // Group skills by domain
  const skillsByDomain = filteredSkills.reduce((acc, skill) => {
    const domainName = skill.domain.displayName;
    if (!acc[domainName]) {
      acc[domainName] = {
        domain: skill.domain,
        skills: [],
      };
    }
    acc[domainName].skills.push(skill);
    return acc;
  }, {} as Record<string, { domain: Skill["domain"]; skills: Skill[] }>);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSkill || !selectedTeam) return; // button is disabled in these states; belt-and-braces

    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/coach/assessments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyMemberId: playerId,
          skillId: selectedSkill.id,
          teamId: selectedTeam.id,
          seasonId: selectedTeam.season?.id,
          level,
          observationContext,
          notes: notes.trim() || undefined,
          strengths: strengths.length > 0 ? strengths : undefined,
          areasForImprovement: areasForImprovement.length > 0 ? areasForImprovement : undefined,
        }),
      });

      if (response.ok) {
        setSuccess(true);
        // Reset form for next assessment
        setSelectedSkill(null);
        setLevel(3);
        setNotes("");
        setStrengths([]);
        setAreasForImprovement([]);
        onAssessmentCreated?.();

        // Keep success message for 2 seconds
        setTimeout(() => setSuccess(false), 2000);
      } else {
        const data = await response.json();
        setError(data.error || "Failed to save assessment");
      }
    } catch (err) {
      setError("An error occurred while saving the assessment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const addStrength = () => {
    if (newStrength.trim()) {
      setStrengths([...strengths, newStrength.trim()]);
      setNewStrength("");
    }
  };

  const addImprovement = () => {
    if (newImprovement.trim()) {
      setAreasForImprovement([...areasForImprovement, newImprovement.trim()]);
      setNewImprovement("");
    }
  };

  const getDomainIcon = (domainName: string) => {
    const Icon = DOMAIN_ICONS[domainName] || Target;
    return Icon;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-cream border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
              <Target className="h-5 w-5 text-ink" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-ink">Skill Assessment</h2>
              <p className="text-sm text-ink-muted ph-mask">{playerName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-cream-2 transition-colors"
          >
            <X className="h-5 w-5 text-ink-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Team Selection */}
            {teams.length > 1 && (
              <div className="mb-6">
                <label className="block text-xs text-ink-muted mb-2">Team / Program</label>
                <select
                  value={selectedTeam?.id || ""}
                  onChange={(e) => {
                    const team = teams.find((t) => t.id === e.target.value);
                    setSelectedTeam(team || null);
                    setSelectedSkill(null);
                  }}
                  className="w-full px-3 py-2 bg-cream-2 border border-border rounded-lg text-ink text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name} ({team.sport.name})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedSkill ? (
              /* Assessment Form for Selected Skill */
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Selected Skill Header */}
                <div className="bg-cream-2 border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {(() => {
                        const Icon = getDomainIcon(selectedSkill.domain.name);
                        return (
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{ backgroundColor: `${selectedSkill.domain.color}20` }}
                          >
                            <Icon
                              className="h-5 w-5"
                              style={{ color: selectedSkill.domain.color || "#666" }}
                            />
                          </div>
                        );
                      })()}
                      <div>
                        <h3 className="font-medium text-ink">{selectedSkill.name}</h3>
                        <p className="text-sm text-ink-muted">
                          {selectedSkill.domain.displayName} • {selectedSkill.stage.name}
                        </p>
                        {selectedSkill.description && (
                          <p className="text-sm text-ink-muted mt-1">{selectedSkill.description}</p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedSkill(null)}
                      className="text-sm text-ink-muted hover:text-ink"
                    >
                      Change skill
                    </button>
                  </div>
                </div>

                {/* Level Selection */}
                <div>
                  <label className="block text-sm font-medium text-ink mb-3">
                    Assessment Level
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5].map((l) => {
                      const levelInfo = LEVEL_LABELS[l];
                      const isSelected = level === l;
                      return (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setLevel(l)}
                          className={`p-3 rounded-xl border transition-all ${
                            isSelected
                              ? `${levelInfo.color} border-transparent text-ink`
                              : "bg-cream-2 border-border text-ink-muted hover:bg-cream-3"
                          }`}
                        >
                          <div className="text-2xl font-bold">{l}</div>
                          <div className="text-xs">{levelInfo.label}</div>
                        </button>
                      );
                    })}
                  </div>
                  {selectedSkill.progressionLevels && selectedSkill.progressionLevels[level.toString()] && (
                    <div className="mt-3 p-3 bg-cream-2 rounded-lg border border-border">
                      <p className="text-sm text-ink-2">
                        <span className="font-medium text-ink">Level {level}:</span>{" "}
                        {selectedSkill.progressionLevels[level.toString()]}
                      </p>
                    </div>
                  )}
                </div>

                {/* Observation Context */}
                <div>
                  <label className="block text-xs text-ink-muted mb-2">Observation Context</label>
                  <div className="flex flex-wrap gap-2">
                    {CONTEXT_OPTIONS.map((ctx) => (
                      <button
                        key={ctx.value}
                        type="button"
                        onClick={() => setObservationContext(ctx.value)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                          observationContext === ctx.value
                            ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/50"
                            : "bg-cream-2 text-ink-muted hover:bg-cream-3"
                        }`}
                      >
                        {ctx.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Strengths */}
                <div>
                  <label className="block text-xs text-ink-muted mb-2">Observed Strengths</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newStrength}
                      onChange={(e) => setNewStrength(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addStrength())}
                      placeholder="Add a strength..."
                      className="flex-1 px-3 py-2 bg-cream-2 border border-border rounded-lg text-ink placeholder:text-ink-muted text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                    <Button type="button" onClick={addStrength} variant="outline" size="sm">
                      Add
                    </Button>
                  </div>
                  {strengths.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {strengths.map((s, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-400 rounded-lg text-sm ph-mask"
                        >
                          <TrendingUp className="h-3 w-3" />
                          {s}
                          <button
                            type="button"
                            onClick={() => setStrengths(strengths.filter((_, idx) => idx !== i))}
                            className="ml-1 hover:text-green-300"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Areas for Improvement */}
                <div>
                  <label className="block text-xs text-ink-muted mb-2">Areas for Improvement</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newImprovement}
                      onChange={(e) => setNewImprovement(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addImprovement())}
                      placeholder="Add an area to work on..."
                      className="flex-1 px-3 py-2 bg-cream-2 border border-border rounded-lg text-ink placeholder:text-ink-muted text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                    />
                    <Button type="button" onClick={addImprovement} variant="outline" size="sm">
                      Add
                    </Button>
                  </div>
                  {areasForImprovement.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {areasForImprovement.map((a, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-orange-500/10 text-orange-400 rounded-lg text-sm ph-mask"
                        >
                          <Target className="h-3 w-3" />
                          {a}
                          <button
                            type="button"
                            onClick={() =>
                              setAreasForImprovement(areasForImprovement.filter((_, idx) => idx !== i))
                            }
                            className="ml-1 hover:text-orange-300"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs text-ink-muted mb-2">
                    Additional Notes (visible to parents)
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any additional observations or context..."
                    rows={3}
                    className="w-full px-3 py-2 bg-cream-2 border border-border rounded-lg text-ink placeholder:text-ink-muted text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none ph-mask"
                  />
                  <p className="text-xs text-ink-faint mt-1">
                    Families see this on their development page — keep it warm and specific.
                  </p>
                </div>

                {/* Submit */}
                <div className="flex items-center justify-between pt-4 border-t border-border">
                  {!selectedTeam && (
                    <p className="text-sm text-amber-500">
                      No team available — this player is not on any of your teams.
                    </p>
                  )}
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  {success && (
                    <p className="text-sm text-green-400 flex items-center gap-2">
                      <Star className="h-4 w-4" />
                      Assessment saved!
                    </p>
                  )}
                  {!error && !success && <div />}
                  <Button
                    type="submit"
                    disabled={isSubmitting || !selectedSkill || !selectedTeam}
                    className="bg-emerald-600 hover:bg-emerald-700 text-ink"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Save Assessment
                      </>
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              /* Skill Selection */
              <div className="space-y-4">
                {/* Filters */}
                <div className="bg-cream-2 border border-border rounded-xl p-4 space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-ink">
                    <Filter className="h-4 w-4 text-ink-muted" />
                    Filter Skills
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Stage Filter */}
                    <div>
                      <label className="block text-xs text-ink-muted mb-1">Development Stage</label>
                      <select
                        value={selectedStageId || ""}
                        onChange={(e) => setSelectedStageId(e.target.value || null)}
                        className="w-full px-3 py-2 bg-cream-2 border border-border rounded-lg text-ink text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        <option value="">All Stages</option>
                        {stages.map((stage) => (
                          <option key={stage.id} value={stage.id}>
                            {stage.name} ({stage.ageMin}-{stage.ageMax})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Domain Filter */}
                    <div>
                      <label className="block text-xs text-ink-muted mb-1">Domain</label>
                      <select
                        value={selectedDomainId || ""}
                        onChange={(e) => setSelectedDomainId(e.target.value || null)}
                        className="w-full px-3 py-2 bg-cream-2 border border-border rounded-lg text-ink text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      >
                        <option value="">All Domains</option>
                        {domains.map((domain) => (
                          <option key={domain.id} value={domain.id}>
                            {domain.displayName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Search */}
                    <div>
                      <label className="block text-xs text-ink-muted mb-1">Search</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Search skills..."
                          className="w-full pl-9 pr-3 py-2 bg-cream-2 border border-border rounded-lg text-ink placeholder:text-ink-muted text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Core Skills Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showCoreOnly}
                      onChange={(e) => setShowCoreOnly(e.target.checked)}
                      className="w-4 h-4 rounded border-ink-faint/20 bg-cream-2 text-emerald-500 focus:ring-emerald-500/50"
                    />
                    <span className="text-sm text-ink-muted">Show core skills only</span>
                  </label>
                </div>

                {/* Skills List */}
                {isLoadingSkills ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
                  </div>
                ) : fetchError ? (
                  <div className="py-8 space-y-3 max-w-md mx-auto text-center">
                    <ErrorBanner message={fetchError} className="text-left" />
                    <Button type="button" variant="outline" onClick={fetchSkillsData}>
                      Retry
                    </Button>
                  </div>
                ) : filteredSkills.length === 0 ? (
                  <div className="text-center py-12 text-ink-muted">
                    <Target className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg">No skills found</p>
                    <p className="text-sm mt-1">Try adjusting your filters</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(skillsByDomain).map(([domainName, { domain, skills: domainSkills }]) => {
                      const Icon = getDomainIcon(domain.name);
                      return (
                        <div key={domain.id}>
                          <div className="flex items-center gap-2 mb-3">
                            <Icon
                              className="h-5 w-5"
                              style={{ color: domain.color || "#666" }}
                            />
                            <h3 className="font-medium text-ink">{domainName}</h3>
                            <span className="text-xs text-ink-muted">({domainSkills.length})</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {domainSkills.map((skill) => (
                              <button
                                key={skill.id}
                                onClick={() => setSelectedSkill(skill)}
                                className="flex items-center justify-between p-3 bg-cream-2 border border-border rounded-xl hover:bg-cream-3 hover:border-ink-faint/20 transition-all text-left group"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-ink truncate">
                                      {skill.name}
                                    </span>
                                    {skill.isCore && (
                                      <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded">
                                        Core
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-ink-muted mt-0.5">
                                    {skill.stage.name}
                                  </p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-ink-muted group-hover:text-ink transition-colors" />
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
