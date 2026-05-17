"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  FileText,
  Plus,
  Search,
  Edit2,
  Trash2,
  Save,
  Loader2,
  AlertCircle,
  ChevronLeft,
  Clock,
  GripVertical,
  X,
} from "lucide-react";

interface TemplateSegment {
  name: string;
  type: string;
  durationMinutes: number;
  description?: string;
  activitySuggestions?: string[];
}

interface Template {
  id: string;
  sportId: string;
  stageId: string;
  name: string;
  description?: string | null;
  totalDurationMinutes: number;
  structure?: TemplateSegment[] | null;
  equipmentNeeded?: string[] | null;
  coachingNotes?: string | null;
  isDefault: boolean;
  active: boolean;
  usageCount: number;
  createdAt: string;
  sport: { id: string; name: string };
  stage: { id: string; name: string; slug: string };
}

interface Sport {
  id: string;
  name: string;
}

interface Stage {
  id: string;
  name: string;
  slug: string;
}

const SEGMENT_TYPES = [
  { value: "warmup", label: "Warm-up" },
  { value: "technical", label: "Technical" },
  { value: "tactical", label: "Tactical" },
  { value: "game", label: "Game/Scrimmage" },
  { value: "conditioning", label: "Conditioning" },
  { value: "cooldown", label: "Cool-down" },
  { value: "fun", label: "Fun Activity" },
  { value: "other", label: "Other" },
];

export function TemplateEditor() {
  useHydrationBeacon();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Editor state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    sportId: "",
    stageId: "",
    name: "",
    description: "",
    totalDurationMinutes: "60",
    equipmentNeeded: "",
    coachingNotes: "",
    isDefault: false,
    active: true,
  });

  const [segments, setSegments] = useState<TemplateSegment[]>([
    { name: "Warm-up", type: "warmup", durationMinutes: 10 },
    { name: "Technical Skills", type: "technical", durationMinutes: 15 },
    { name: "Small-Sided Games", type: "game", durationMinutes: 25 },
    { name: "Cool-down", type: "cooldown", durationMinutes: 10 },
  ]);

  useEffect(() => {
    fetchTemplates();
  }, [sportFilter, stageFilter]);

  async function fetchTemplates() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("active", "false");
      if (sportFilter !== "all") params.set("sportId", sportFilter);
      if (stageFilter !== "all") params.set("stageId", stageFilter);

      const res = await fetch(`/api/admin/curriculum/templates?${params}`);
      const data = await res.json();

      setTemplates(data.templates || []);
      setSports(data.sports || []);
      setStages(data.stages || []);
    } catch (err) {
      setError("Failed to fetch templates");
    } finally {
      setLoading(false);
    }
  }

  function openEditor(template?: Template) {
    if (template) {
      setEditingTemplate(template);
      fetch(`/api/admin/curriculum/templates/${template.id}`)
        .then(res => res.json())
        .then(data => {
          const t = data.template;
          setFormData({
            sportId: t.sportId,
            stageId: t.stageId,
            name: t.name,
            description: t.description || "",
            totalDurationMinutes: t.totalDurationMinutes.toString(),
            equipmentNeeded: t.equipmentNeeded?.join("\n") || "",
            coachingNotes: t.coachingNotes || "",
            isDefault: t.isDefault,
            active: t.active,
          });
          setSegments(t.structure || []);
        });
    } else {
      setEditingTemplate(null);
      setFormData({
        sportId: sportFilter !== "all" ? sportFilter : "",
        stageId: stageFilter !== "all" ? stageFilter : "",
        name: "",
        description: "",
        totalDurationMinutes: "60",
        equipmentNeeded: "",
        coachingNotes: "",
        isDefault: false,
        active: true,
      });
      setSegments([
        { name: "Warm-up", type: "warmup", durationMinutes: 10 },
        { name: "Technical Skills", type: "technical", durationMinutes: 15 },
        { name: "Small-Sided Games", type: "game", durationMinutes: 25 },
        { name: "Cool-down", type: "cooldown", durationMinutes: 10 },
      ]);
    }
    setIsEditorOpen(true);
    setError(null);
  }

  function addSegment() {
    setSegments([...segments, { name: "", type: "other", durationMinutes: 10 }]);
  }

  function updateSegment(index: number, field: keyof TemplateSegment, value: any) {
    const newSegments = [...segments];
    newSegments[index] = { ...newSegments[index], [field]: value };
    setSegments(newSegments);
  }

  function removeSegment(index: number) {
    setSegments(segments.filter((_, i) => i !== index));
  }

  function calculateTotalDuration() {
    return segments.reduce((sum, s) => sum + s.durationMinutes, 0);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    try {
      const payload: any = {
        sportId: formData.sportId,
        stageId: formData.stageId,
        name: formData.name,
        totalDurationMinutes: calculateTotalDuration(),
        structure: segments.filter(s => s.name && s.durationMinutes > 0),
        isDefault: formData.isDefault,
        active: formData.active,
      };

      if (formData.description) payload.description = formData.description;
      if (formData.coachingNotes) payload.coachingNotes = formData.coachingNotes;
      if (formData.equipmentNeeded.trim()) {
        payload.equipmentNeeded = formData.equipmentNeeded.split("\n").filter(Boolean);
      }

      const url = editingTemplate
        ? `/api/admin/curriculum/templates/${editingTemplate.id}`
        : "/api/admin/curriculum/templates";

      const res = await fetch(url, {
        method: editingTemplate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save template");
      }

      setIsEditorOpen(false);
      fetchTemplates();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/admin/curriculum/templates/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete template");
      }

      setDeleteConfirm(null);
      fetchTemplates();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const filteredTemplates = templates.filter((template) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      template.name.toLowerCase().includes(query) ||
      template.description?.toLowerCase().includes(query) ||
      template.sport.name.toLowerCase().includes(query) ||
      template.stage.name.toLowerCase().includes(query)
    );
  });

  const getSegmentTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      warmup: "bg-orange-500/20 border-orange-500/30",
      technical: "bg-blue-500/20 border-blue-500/30",
      tactical: "bg-purple-500/20 border-purple-500/30",
      game: "bg-green-500/20 border-green-500/30",
      conditioning: "bg-yellow-500/20 border-yellow-500/30",
      cooldown: "bg-cyan-500/20 border-cyan-500/30",
      fun: "bg-pink-500/20 border-pink-500/30",
      other: "bg-cream-3 border-border",
    };
    return colors[type] || colors.other;
  };

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
              <FileText className="w-6 h-6 text-purple-600" />
              Practice Templates
            </h1>
            <p className="text-muted-foreground">
              Create reusable session structures for coaches
            </p>
          </div>
        </div>
        <Button onClick={() => openEditor()} className="bg-purple-600 hover:bg-purple-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Template
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
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-cream-2 border-border"
                />
              </div>
            </div>
            <Select value={sportFilter} onValueChange={setSportFilter}>
              <SelectTrigger className="w-[150px] bg-cream-2 border-border">
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
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-[180px] bg-cream-2 border-border">
                <SelectValue placeholder="All Stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Templates List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredTemplates.length === 0 ? (
        <Card className="bg-paper border border-border">
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No templates found</p>
            <Button onClick={() => openEditor()} variant="outline" className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="bg-paper border border-border hover:border-ink-muted/30 transition-colors">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <FileText className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-ink">{template.name}</h3>
                        {template.isDefault && (
                          <Badge variant="secondary" className="bg-purple-500/10 text-purple-400 border-0">
                            Default
                          </Badge>
                        )}
                        {!template.active && (
                          <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-400 border-0">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {template.description || "No description"}
                      </p>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        <Badge variant="secondary" className="bg-cream-2 text-ink-2 border-0">
                          {template.sport.name}
                        </Badge>
                        <Badge variant="secondary" className="bg-cream-2 text-ink-2 border-0">
                          {template.stage.name}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {template.totalDurationMinutes} min
                        </div>
                        {template.structure && (
                          <span className="text-xs text-muted-foreground">
                            {template.structure.length} segments
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditor(template)}
                      className="text-muted-foreground hover:text-ink-2"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm(template.id)}
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
        <DialogContent className="max-w-3xl bg-paper border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-ink">
              {editingTemplate ? "Edit Template" : "Create New Template"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate ? "Update the template structure" : "Design a reusable practice session structure"}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div className="grid gap-4 py-4">
            {/* Basic Info */}
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
                <Label>Development Stage *</Label>
                <Select
                  value={formData.stageId}
                  onValueChange={(value) => setFormData({ ...formData, stageId: value })}
                >
                  <SelectTrigger className="bg-cream-2 border-border">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Template Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Fundamentals Practice (60 min)"
                className="bg-cream-2 border-border"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What this template is designed for..."
                className="bg-cream-2 border-border"
              />
            </div>

            {/* Session Structure */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Session Structure</Label>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Total: {calculateTotalDuration()} min
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {segments.map((segment, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${getSegmentTypeColor(segment.type)}`}
                  >
                    <div className="flex items-center gap-3">
                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />

                      <Input
                        value={segment.name}
                        onChange={(e) => updateSegment(index, "name", e.target.value)}
                        placeholder="Segment name"
                        className="flex-1 bg-cream-2 border-border h-8"
                      />

                      <Select
                        value={segment.type}
                        onValueChange={(value) => updateSegment(index, "type", value)}
                      >
                        <SelectTrigger className="w-[140px] bg-cream-2 border-border h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SEGMENT_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          value={segment.durationMinutes}
                          onChange={(e) => updateSegment(index, "durationMinutes", parseInt(e.target.value) || 0)}
                          className="w-16 bg-cream-2 border-border h-8 text-center"
                        />
                        <span className="text-sm text-muted-foreground">min</span>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSegment(index)}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    <Input
                      value={segment.description || ""}
                      onChange={(e) => updateSegment(index, "description", e.target.value)}
                      placeholder="Optional description..."
                      className="mt-2 bg-cream-2 border-border h-8 text-sm"
                    />
                  </div>
                ))}

                <Button
                  variant="outline"
                  onClick={addSegment}
                  className="w-full border-dashed border-border hover:bg-cream-2"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Segment
                </Button>
              </div>
            </div>

            {/* Additional Info */}
            <div className="space-y-2">
              <Label>Equipment Needed (one per line)</Label>
              <Textarea
                value={formData.equipmentNeeded}
                onChange={(e) => setFormData({ ...formData, equipmentNeeded: e.target.value })}
                placeholder="Balls&#10;Cones&#10;Goals"
                className="bg-cream-2 border-border"
              />
            </div>

            <div className="space-y-2">
              <Label>Coaching Notes</Label>
              <Textarea
                value={formData.coachingNotes}
                onChange={(e) => setFormData({ ...formData, coachingNotes: e.target.value })}
                placeholder="Tips for coaches using this template..."
                className="bg-cream-2 border-border"
              />
            </div>

            {/* Toggles */}
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isDefault"
                  checked={formData.isDefault}
                  onCheckedChange={(checked) => setFormData({ ...formData, isDefault: !!checked })}
                />
                <Label htmlFor="isDefault" className="text-sm cursor-pointer">Default Template</Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData({ ...formData, active: !!checked })}
                />
                <Label htmlFor="active" className="text-sm cursor-pointer">Active</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditorOpen(false)} className="border-border">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formData.sportId || !formData.stageId || !formData.name || segments.length === 0}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {editingTemplate ? "Update Template" : "Create Template"}
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
            <DialogTitle className="text-ink">Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this template? This action cannot be undone.
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
