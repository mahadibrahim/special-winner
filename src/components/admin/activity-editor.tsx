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
  Dumbbell,
  Plus,
  Search,
  Edit2,
  Trash2,
  Save,
  Loader2,
  AlertCircle,
  ChevronLeft,
  Star,
  Clock,
  Users,
} from "lucide-react";

interface Activity {
  id: string;
  sportId: string;
  name: string;
  slug: string;
  description?: string | null;
  activityType: string;
  difficulty: string;
  minPlayers: number;
  maxPlayers?: number | null;
  durationMinutes: number;
  equipmentNeeded?: string[] | null;
  indoorSuitable: boolean;
  tags?: string[] | null;
  featured: boolean;
  active: boolean;
  usageCount: number;
  averageRating?: number | null;
  createdAt: string;
  sport: { id: string; name: string };
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

const ACTIVITY_TYPES = [
  { value: "warmup", label: "Warm-up" },
  { value: "technical", label: "Technical" },
  { value: "tactical", label: "Tactical" },
  { value: "game", label: "Game" },
  { value: "scrimmage", label: "Scrimmage" },
  { value: "conditioning", label: "Conditioning" },
  { value: "cooldown", label: "Cool-down" },
  { value: "fun", label: "Fun" },
];

const DIFFICULTIES = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export function ActivityEditor() {
  useHydrationBeacon();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Editor state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    sportId: "",
    name: "",
    slug: "",
    description: "",
    activityType: "technical",
    difficulty: "beginner",
    minPlayers: "1",
    maxPlayers: "",
    durationMinutes: "10",
    setupInstructions: "",
    howToPlay: "",
    coachingPoints: "",
    questionsToAsk: "",
    commonMistakes: "",
    makeEasier: "",
    makeHarder: "",
    equipmentNeeded: "",
    spaceRequired: "",
    indoorSuitable: true,
    tags: "",
    featured: false,
    active: true,
  });

  useEffect(() => {
    fetchActivities();
  }, [sportFilter, typeFilter, difficultyFilter]);

  async function fetchActivities() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("active", "false");
      if (sportFilter !== "all") params.set("sportId", sportFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (difficultyFilter !== "all") params.set("difficulty", difficultyFilter);

      const res = await fetch(`/api/admin/curriculum/activities?${params}`);
      const data = await res.json();

      setActivities(data.activities || []);
      setSports(data.sports || []);
      setStages(data.stages || []);
    } catch (err) {
      setError("Failed to fetch activities");
    } finally {
      setLoading(false);
    }
  }

  function openEditor(activity?: Activity) {
    if (activity) {
      setEditingActivity(activity);
      // Fetch full activity details
      fetch(`/api/admin/curriculum/activities/${activity.id}`)
        .then(res => res.json())
        .then(data => {
          const a = data.activity;
          setFormData({
            sportId: a.sportId,
            name: a.name,
            slug: a.slug,
            description: a.description || "",
            activityType: a.activityType,
            difficulty: a.difficulty,
            minPlayers: a.minPlayers.toString(),
            maxPlayers: a.maxPlayers?.toString() || "",
            durationMinutes: a.durationMinutes.toString(),
            setupInstructions: a.setupInstructions || "",
            howToPlay: a.howToPlay || "",
            coachingPoints: a.coachingPoints?.join("\n") || "",
            questionsToAsk: a.questionsToAsk?.join("\n") || "",
            commonMistakes: a.commonMistakes?.join("\n") || "",
            makeEasier: a.makeEasier || "",
            makeHarder: a.makeHarder || "",
            equipmentNeeded: a.equipmentNeeded?.join("\n") || "",
            spaceRequired: a.spaceRequired || "",
            indoorSuitable: a.indoorSuitable,
            tags: a.tags?.join(", ") || "",
            featured: a.featured,
            active: a.active,
          });
        });
    } else {
      setEditingActivity(null);
      setFormData({
        sportId: sportFilter !== "all" ? sportFilter : "",
        name: "",
        slug: "",
        description: "",
        activityType: "technical",
        difficulty: "beginner",
        minPlayers: "1",
        maxPlayers: "",
        durationMinutes: "10",
        setupInstructions: "",
        howToPlay: "",
        coachingPoints: "",
        questionsToAsk: "",
        commonMistakes: "",
        makeEasier: "",
        makeHarder: "",
        equipmentNeeded: "",
        spaceRequired: "",
        indoorSuitable: true,
        tags: "",
        featured: false,
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
        name: formData.name,
        slug: formData.slug || generateSlug(formData.name),
        activityType: formData.activityType,
        difficulty: formData.difficulty,
        minPlayers: parseInt(formData.minPlayers) || 1,
        durationMinutes: parseInt(formData.durationMinutes) || 10,
        howToPlay: formData.howToPlay,
        indoorSuitable: formData.indoorSuitable,
        featured: formData.featured,
        active: formData.active,
      };

      if (formData.description) payload.description = formData.description;
      if (formData.maxPlayers) payload.maxPlayers = parseInt(formData.maxPlayers);
      if (formData.setupInstructions) payload.setupInstructions = formData.setupInstructions;
      if (formData.makeEasier) payload.makeEasier = formData.makeEasier;
      if (formData.makeHarder) payload.makeHarder = formData.makeHarder;
      if (formData.spaceRequired) payload.spaceRequired = formData.spaceRequired;

      if (formData.coachingPoints.trim()) {
        payload.coachingPoints = formData.coachingPoints.split("\n").filter(Boolean);
      }
      if (formData.questionsToAsk.trim()) {
        payload.questionsToAsk = formData.questionsToAsk.split("\n").filter(Boolean);
      }
      if (formData.commonMistakes.trim()) {
        payload.commonMistakes = formData.commonMistakes.split("\n").filter(Boolean);
      }
      if (formData.equipmentNeeded.trim()) {
        payload.equipmentNeeded = formData.equipmentNeeded.split("\n").filter(Boolean);
      }
      if (formData.tags.trim()) {
        payload.tags = formData.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
      }

      const url = editingActivity
        ? `/api/admin/curriculum/activities/${editingActivity.id}`
        : "/api/admin/curriculum/activities";

      const res = await fetch(url, {
        method: editingActivity ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to save activity");
      }

      setIsEditorOpen(false);
      fetchActivities();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/admin/curriculum/activities/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete activity");
      }

      setDeleteConfirm(null);
      fetchActivities();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const filteredActivities = activities.filter((activity) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      activity.name.toLowerCase().includes(query) ||
      activity.description?.toLowerCase().includes(query) ||
      activity.sport.name.toLowerCase().includes(query)
    );
  });

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      warmup: "bg-orange-500/10 text-orange-400",
      technical: "bg-blue-500/10 text-blue-400",
      tactical: "bg-purple-500/10 text-purple-400",
      game: "bg-green-500/10 text-green-400",
      scrimmage: "bg-red-500/10 text-red-400",
      conditioning: "bg-yellow-500/10 text-yellow-400",
      cooldown: "bg-cyan-500/10 text-cyan-400",
      fun: "bg-pink-500/10 text-pink-400",
    };
    return colors[type] || "bg-cream-3 text-ink";
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
              <Dumbbell className="w-6 h-6 text-green-600" />
              Activities Management
            </h1>
            <p className="text-muted-foreground">
              Create and manage the game and drill library
            </p>
          </div>
        </div>
        <Button onClick={() => openEditor()} className="bg-green-600 hover:bg-green-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Activity
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
                  placeholder="Search activities..."
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
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px] bg-cream-2 border-border">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {ACTIVITY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
              <SelectTrigger className="w-[150px] bg-cream-2 border-border">
                <SelectValue placeholder="All Levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                {DIFFICULTIES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Activities List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredActivities.length === 0 ? (
        <Card className="bg-paper border border-border">
          <CardContent className="py-12 text-center">
            <Dumbbell className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No activities found</p>
            <Button onClick={() => openEditor()} variant="outline" className="mt-4">
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Activity
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredActivities.map((activity) => (
            <Card key={activity.id} className="bg-paper border border-border hover:border-ink-muted/30 transition-colors">
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-green-500/10">
                      <Dumbbell className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-ink">{activity.name}</h3>
                        {activity.featured && (
                          <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                        )}
                        {!activity.active && (
                          <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-400 border-0">
                            Inactive
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {activity.description || "No description"}
                      </p>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        <Badge variant="secondary" className="bg-cream-2 text-ink-2 border-0">
                          {activity.sport.name}
                        </Badge>
                        <Badge variant="secondary" className={getTypeColor(activity.activityType)}>
                          {activity.activityType}
                        </Badge>
                        <Badge variant="secondary" className="bg-cream-2 text-ink-2 border-0">
                          {activity.difficulty}
                        </Badge>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {activity.durationMinutes}m
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="w-3 h-3" />
                          {activity.minPlayers}{activity.maxPlayers ? `-${activity.maxPlayers}` : "+"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditor(activity)}
                      className="text-muted-foreground hover:text-ink-2"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm(activity.id)}
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
              {editingActivity ? "Edit Activity" : "Add New Activity"}
            </DialogTitle>
            <DialogDescription>
              {editingActivity ? "Update the activity details below" : "Fill in the details to create a new activity"}
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
                <Label>Activity Type *</Label>
                <Select
                  value={formData.activityType}
                  onValueChange={(value) => setFormData({ ...formData, activityType: value })}
                >
                  <SelectTrigger className="bg-cream-2 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
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
                  placeholder="e.g., Shark Attack"
                  className="bg-cream-2 border-border"
                />
              </div>

              <div className="space-y-2">
                <Label>Slug</Label>
                <Input
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="shark-attack"
                  className="bg-cream-2 border-border"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of the activity..."
                className="bg-cream-2 border-border"
              />
            </div>

            {/* Parameters */}
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <Select
                  value={formData.difficulty}
                  onValueChange={(value) => setFormData({ ...formData, difficulty: value })}
                >
                  <SelectTrigger className="bg-cream-2 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Duration (min) *</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.durationMinutes}
                  onChange={(e) => setFormData({ ...formData, durationMinutes: e.target.value })}
                  className="bg-cream-2 border-border"
                />
              </div>

              <div className="space-y-2">
                <Label>Min Players</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.minPlayers}
                  onChange={(e) => setFormData({ ...formData, minPlayers: e.target.value })}
                  className="bg-cream-2 border-border"
                />
              </div>

              <div className="space-y-2">
                <Label>Max Players</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.maxPlayers}
                  onChange={(e) => setFormData({ ...formData, maxPlayers: e.target.value })}
                  placeholder="Unlimited"
                  className="bg-cream-2 border-border"
                />
              </div>
            </div>

            {/* Instructions */}
            <div className="space-y-2">
              <Label>Setup Instructions</Label>
              <Textarea
                value={formData.setupInstructions}
                onChange={(e) => setFormData({ ...formData, setupInstructions: e.target.value })}
                placeholder="How to set up the activity..."
                className="bg-cream-2 border-border"
              />
            </div>

            <div className="space-y-2">
              <Label>How to Play *</Label>
              <Textarea
                value={formData.howToPlay}
                onChange={(e) => setFormData({ ...formData, howToPlay: e.target.value })}
                placeholder="Step-by-step instructions..."
                className="bg-cream-2 border-border min-h-[100px]"
              />
            </div>

            {/* Coaching */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Coaching Points (one per line)</Label>
                <Textarea
                  value={formData.coachingPoints}
                  onChange={(e) => setFormData({ ...formData, coachingPoints: e.target.value })}
                  placeholder="Key things to watch for..."
                  className="bg-cream-2 border-border"
                />
              </div>

              <div className="space-y-2">
                <Label>Questions to Ask (one per line)</Label>
                <Textarea
                  value={formData.questionsToAsk}
                  onChange={(e) => setFormData({ ...formData, questionsToAsk: e.target.value })}
                  placeholder="Where should you look?&#10;What can you do next?"
                  className="bg-cream-2 border-border"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Common Mistakes (one per line)</Label>
              <Textarea
                value={formData.commonMistakes}
                onChange={(e) => setFormData({ ...formData, commonMistakes: e.target.value })}
                placeholder="What to correct..."
                className="bg-cream-2 border-border"
              />
            </div>

            {/* Progressions */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Make it Easier</Label>
                <Textarea
                  value={formData.makeEasier}
                  onChange={(e) => setFormData({ ...formData, makeEasier: e.target.value })}
                  placeholder="How to simplify..."
                  className="bg-cream-2 border-border"
                />
              </div>

              <div className="space-y-2">
                <Label>Make it Harder</Label>
                <Textarea
                  value={formData.makeHarder}
                  onChange={(e) => setFormData({ ...formData, makeHarder: e.target.value })}
                  placeholder="How to increase challenge..."
                  className="bg-cream-2 border-border"
                />
              </div>
            </div>

            {/* Equipment and Space */}
            <div className="grid grid-cols-2 gap-4">
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
                <Label>Space Required</Label>
                <Input
                  value={formData.spaceRequired}
                  onChange={(e) => setFormData({ ...formData, spaceRequired: e.target.value })}
                  placeholder="e.g., 20x20 yards"
                  className="bg-cream-2 border-border"
                />
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label>Tags (comma separated)</Label>
              <Input
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                placeholder="dribbling, 1v1, agility"
                className="bg-cream-2 border-border"
              />
            </div>

            {/* Toggles */}
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="indoorSuitable"
                  checked={formData.indoorSuitable}
                  onCheckedChange={(checked) => setFormData({ ...formData, indoorSuitable: !!checked })}
                />
                <Label htmlFor="indoorSuitable" className="text-sm cursor-pointer">Indoor Suitable</Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="featured"
                  checked={formData.featured}
                  onCheckedChange={(checked) => setFormData({ ...formData, featured: !!checked })}
                />
                <Label htmlFor="featured" className="text-sm cursor-pointer">Featured</Label>
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
              disabled={saving || !formData.sportId || !formData.name || !formData.howToPlay}
              className="bg-green-600 hover:bg-green-700"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {editingActivity ? "Update Activity" : "Create Activity"}
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
            <DialogTitle className="text-ink">Delete Activity</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this activity? This action cannot be undone.
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
