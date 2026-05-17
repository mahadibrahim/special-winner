"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Target,
  Plus,
  Search,
  Edit2,
  Trash2,
  Save,
  X,
  Loader2,
  AlertCircle,
  ChevronLeft,
} from "lucide-react";

interface Skill {
  id: string;
  sportId: string;
  domainId: string;
  stageId?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  introductionAge?: number | null;
  assessmentMethod: string;
  progressionLevels?: Record<number, string> | null;
  coachingTips?: string[] | null;
  commonMistakes?: string[] | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  sport: { id: string; name: string };
  domain: { id: string; name: string };
}

interface Sport {
  id: string;
  name: string;
}

interface Domain {
  id: string;
  name: string;
}

interface Stage {
  id: string;
  name: string;
  slug: string;
}

export function SkillEditor() {
  useHydrationBeacon();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Editor state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    sportId: "",
    domainId: "",
    stageId: "",
    name: "",
    slug: "",
    description: "",
    introductionAge: "",
    assessmentMethod: "observation",
    coachingTips: "",
    commonMistakes: "",
    sortOrder: "0",
    active: true,
  });

  useEffect(() => {
    fetchSkills();
  }, [sportFilter, domainFilter]);

  async function fetchSkills() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("active", "false"); // Get all skills including inactive
      if (sportFilter !== "all") params.set("sportId", sportFilter);
      if (domainFilter !== "all") params.set("domainId", domainFilter);

      const res = await fetch(`/api/admin/curriculum/skills?${params}`);
      const data = await res.json();

      setSkills(data.skills || []);
      setSports(data.sports || []);
      setDomains(data.domains || []);
      setStages(data.stages || []);
    } catch (err) {
      setError("Failed to fetch skills");
    } finally {
      setLoading(false);
    }
  }

  function openEditor(skill?: Skill) {
    if (skill) {
      setEditingSkill(skill);
      setFormData({
        sportId: skill.sportId,
        domainId: skill.domainId,
        stageId: skill.stageId || "",
        name: skill.name,
        slug: skill.slug,
        description: skill.description || "",
        introductionAge: skill.introductionAge?.toString() || "",
        assessmentMethod: skill.assessmentMethod,
        coachingTips: skill.coachingTips?.join("\n") || "",
        commonMistakes: skill.commonMistakes?.join("\n") || "",
        sortOrder: skill.sortOrder.toString(),
        active: skill.active,
      });
    } else {
      setEditingSkill(null);
      setFormData({
        sportId: sportFilter !== "all" ? sportFilter : "",
        domainId: domainFilter !== "all" ? domainFilter : "",
        stageId: "",
        name: "",
        slug: "",
        description: "",
        introductionAge: "",
        assessmentMethod: "observation",
        coachingTips: "",
        commonMistakes: "",
        sortOrder: "0",
        active: true,
      });
    }
    setIsEditorOpen(true);
    setError(null);
  }

  function generateSlug(name: string) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const payload: any = {
        sportId: formData.sportId,
        domainId: formData.domainId,
        name: formData.name,
        slug: formData.slug || generateSlug(formData.name),
        assessmentMethod: formData.assessmentMethod,
        sortOrder: parseInt(formData.sortOrder) || 0,
        active: formData.active,
      };

      if (formData.stageId) payload.stageId = formData.stageId;
      if (formData.description) payload.description = formData.description;
      if (formData.introductionAge) payload.introductionAge = parseInt(formData.introductionAge);
      if (formData.coachingTips.trim()) {
        payload.coachingTips = formData.coachingTips.split("\n").filter(Boolean);
      }
      if (formData.commonMistakes.trim()) {
        payload.commonMistakes = formData.commonMistakes.split("\n").filter(Boolean);
      }

      const url = editingSkill
        ? `/api/admin/curriculum/skills/${editingSkill.id}`
        : "/api/admin/curriculum/skills";

      const res = await fetch(url, {
        method: editingSkill ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save skill");
      }

      setIsEditorOpen(false);
      fetchSkills();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/admin/curriculum/skills/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete skill");
      }

      setDeleteConfirm(null);
      fetchSkills();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const filteredSkills = skills.filter((skill) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      skill.name.toLowerCase().includes(query) ||
      skill.description?.toLowerCase().includes(query) ||
      skill.sport.name.toLowerCase().includes(query) ||
      skill.domain.name.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href="/admin/curriculum">
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </a>
          <div>
            <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
              <Target className="w-6 h-6 text-primary" />
              Skills Management
            </h1>
            <p className="text-muted-foreground">
              Create and manage the master skills library
            </p>
          </div>
        </div>
        <Button onClick={() => openEditor()} className="bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" />
          Add Skill
        </Button>
      </div>

      {/* Filters */}
      <Card className="bg-paper border border-border">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search skills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-cream-2 border-border"
                />
              </div>
            </div>
            <Select value={sportFilter} onValueChange={setSportFilter}>
              <SelectTrigger className="w-[180px] bg-cream-2 border-border">
                <SelectValue placeholder="All Sports" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sports</SelectItem>
                {sports.map((sport) => (
                  <SelectItem key={sport.id} value={sport.id}>
                    {sport.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={domainFilter} onValueChange={setDomainFilter}>
              <SelectTrigger className="w-[180px] bg-cream-2 border-border">
                <SelectValue placeholder="All Domains" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                {domains.map((domain) => (
                  <SelectItem key={domain.id} value={domain.id}>
                    {domain.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Skills List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredSkills.length === 0 ? (
        <Card className="bg-paper border border-border">
          <CardContent className="py-12 text-center">
            <Target className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No skills found</p>
            <Button onClick={() => openEditor()} variant="outline" className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Skill
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredSkills.map((skill) => (
            <Card key={skill.id} className="bg-paper border border-border hover:border-ink-muted/30 transition-colors">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Target className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-ink">{skill.name}</h3>
                        {!skill.active && (
                          <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-400 border-0">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {skill.description || "No description"}
                      </p>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="secondary" className="bg-cream-2 text-ink-2 border-0">
                          {skill.sport.name}
                        </Badge>
                        <Badge variant="secondary" className="bg-cream-2 text-ink-2 border-0">
                          {skill.domain.name}
                        </Badge>
                        <Badge variant="secondary" className="bg-cream-2 text-ink-2 border-0">
                          {skill.assessmentMethod}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditor(skill)}
                      className="text-muted-foreground hover:text-ink-2"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm(skill.id)}
                      className="text-muted-foreground hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Editor Dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-2xl bg-paper border-border">
          <DialogHeader>
            <DialogTitle className="text-ink">
              {editingSkill ? "Edit Skill" : "Add New Skill"}
            </DialogTitle>
            <DialogDescription>
              {editingSkill ? "Update the skill details below" : "Fill in the details to create a new skill"}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sport *</Label>
                <Select
                  value={formData.sportId}
                  onValueChange={(value) => setFormData({ ...formData, sportId: value })}
                >
                  <SelectTrigger className="bg-cream-2 border-border">
                    <SelectValue placeholder="Select sport" />
                  </SelectTrigger>
                  <SelectContent>
                    {sports.map((sport) => (
                      <SelectItem key={sport.id} value={sport.id}>
                        {sport.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Domain *</Label>
                <Select
                  value={formData.domainId}
                  onValueChange={(value) => setFormData({ ...formData, domainId: value })}
                >
                  <SelectTrigger className="bg-cream-2 border-border">
                    <SelectValue placeholder="Select domain" />
                  </SelectTrigger>
                  <SelectContent>
                    {domains.map((domain) => (
                      <SelectItem key={domain.id} value={domain.id}>
                        {domain.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({
                    ...formData,
                    name: e.target.value,
                    slug: generateSlug(e.target.value)
                  })}
                  placeholder="e.g., Ball Control"
                  className="bg-cream-2 border-border"
                />
              </div>

              <div className="space-y-2">
                <Label>Slug</Label>
                <Input
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="ball-control"
                  className="bg-cream-2 border-border"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what this skill involves..."
                className="bg-cream-2 border-border min-h-[100px]"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Development Stage</Label>
                <Select
                  value={formData.stageId || "none"}
                  onValueChange={(value) => setFormData({ ...formData, stageId: value === "none" ? "" : value })}
                >
                  <SelectTrigger className="bg-cream-2 border-border">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">All Stages</SelectItem>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Introduction Age</Label>
                <Input
                  type="number"
                  min={3}
                  max={18}
                  value={formData.introductionAge}
                  onChange={(e) => setFormData({ ...formData, introductionAge: e.target.value })}
                  placeholder="e.g., 6"
                  className="bg-cream-2 border-border"
                />
              </div>

              <div className="space-y-2">
                <Label>Assessment Method</Label>
                <Select
                  value={formData.assessmentMethod}
                  onValueChange={(value) => setFormData({ ...formData, assessmentMethod: value })}
                >
                  <SelectTrigger className="bg-cream-2 border-border">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="observation">Observation</SelectItem>
                    <SelectItem value="test">Test</SelectItem>
                    <SelectItem value="game">Game</SelectItem>
                    <SelectItem value="self-report">Self-Report</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Coaching Cues (one per line)</Label>
              <Textarea
                value={formData.coachingTips}
                onChange={(e) => setFormData({ ...formData, coachingTips: e.target.value })}
                placeholder="Keep your eyes on the ball&#10;Use both feet&#10;Stay balanced"
                className="bg-cream-2 border-border min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Common Mistakes (one per line)</Label>
              <Textarea
                value={formData.commonMistakes}
                onChange={(e) => setFormData({ ...formData, commonMistakes: e.target.value })}
                placeholder="Looking down at the ball&#10;Only using dominant foot&#10;Losing balance"
                className="bg-cream-2 border-border min-h-[80px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                  className="bg-cream-2 border-border"
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.active ? "active" : "inactive"}
                  onValueChange={(value) => setFormData({ ...formData, active: value === "active" })}
                >
                  <SelectTrigger className="bg-cream-2 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditorOpen(false)} className="border-border">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formData.sportId || !formData.domainId || !formData.name}
              className="bg-primary hover:bg-primary/90"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {editingSkill ? "Update Skill" : "Create Skill"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="bg-paper border-border">
          <DialogHeader>
            <DialogTitle className="text-ink">Delete Skill</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this skill? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="border-border">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
