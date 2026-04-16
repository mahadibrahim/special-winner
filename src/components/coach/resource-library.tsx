import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BookOpen,
  Video,
  FileText,
  Image,
  ExternalLink,
  Search,
  Loader2,
  Star,
  Eye,
  Clock,
  ChevronLeft,
  Filter,
  X,
} from "lucide-react";

interface Resource {
  id: string;
  resourceType: "video" | "article" | "diagram" | "document" | "external_link";
  title: string;
  description?: string;
  url?: string;
  content?: string;
  thumbnailUrl?: string;
  durationMinutes?: number;
  topic?: string;
  tags?: string[];
  source?: string;
  author?: string;
  viewCount: number;
  featured: boolean;
}

const typeIcons = {
  video: Video,
  article: FileText,
  diagram: Image,
  document: FileText,
  external_link: ExternalLink,
};

const typeLabels = {
  video: "Video",
  article: "Article",
  diagram: "Diagram",
  document: "Document",
  external_link: "External Link",
};

interface ResourceLibraryProps {
  sportId?: string;
  stageId?: string;
  skillId?: string;
  compact?: boolean;
  limit?: number;
  showFilters?: boolean;
  title?: string;
}

export function ResourceLibrary({
  sportId,
  stageId,
  skillId,
  compact = false,
  limit = 20,
  showFilters = true,
  title = "Coach Resources",
}: ResourceLibraryProps) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [showFeaturedOnly, setShowFeaturedOnly] = useState(false);

  useEffect(() => {
    fetchResources();
  }, [sportId, stageId, skillId, selectedTopic, selectedType, showFeaturedOnly]);

  async function fetchResources() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: limit.toString() });
      if (sportId) params.set("sportId", sportId);
      if (stageId) params.set("stageId", stageId);
      if (skillId) params.set("skillId", skillId);
      if (selectedTopic && selectedTopic !== "all") params.set("topic", selectedTopic);
      if (selectedType && selectedType !== "all") params.set("type", selectedType);
      if (showFeaturedOnly) params.set("featured", "true");
      if (searchQuery) params.set("search", searchQuery);

      const res = await fetch(`/api/coach/resources?${params}`);
      const data = await res.json();
      setResources(data.resources || []);
      setTopics(data.topics || []);
    } catch (error) {
      console.error("Error fetching resources:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleResourceView(resource: Resource) {
    setSelectedResource(resource);
    // Record view
    try {
      await fetch("/api/coach/resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceId: resource.id }),
      });
    } catch (error) {
      console.error("Error recording view:", error);
    }
  }

  const filteredResources = resources.filter((r) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      r.title.toLowerCase().includes(query) ||
      r.description?.toLowerCase().includes(query) ||
      r.tags?.some((t) => t.toLowerCase().includes(query))
    );
  });

  if (compact) {
    return (
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-ink/40" />
          </div>
        ) : filteredResources.length === 0 ? (
          <p className="text-sm text-ink/40 text-center py-4">No resources found</p>
        ) : (
          filteredResources.slice(0, 5).map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              onClick={() => handleResourceView(resource)}
              compact
            />
          ))
        )}
        <ResourceDetailModal
          resource={selectedResource}
          onClose={() => setSelectedResource(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/5">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-ink">{title}</h2>
            <p className="text-sm text-ink/50">
              {resources.length} resources available
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card className="bg-cream border-border">
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/40" />
                  <Input
                    placeholder="Search resources..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-cream-2 border-border"
                  />
                </div>
              </div>
              <Select value={selectedTopic} onValueChange={setSelectedTopic}>
                <SelectTrigger className="w-[150px] bg-cream-2 border-border">
                  <SelectValue placeholder="Topic" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Topics</SelectItem>
                  {topics.map((topic) => (
                    <SelectItem key={topic} value={topic}>
                      {topic.charAt(0).toUpperCase() + topic.slice(1).replace("-", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[150px] bg-cream-2 border-border">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="article">Articles</SelectItem>
                  <SelectItem value="video">Videos</SelectItem>
                  <SelectItem value="diagram">Diagrams</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant={showFeaturedOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setShowFeaturedOnly(!showFeaturedOnly)}
                className={showFeaturedOnly ? "bg-yellow-600 hover:bg-yellow-700" : "border-border"}
              >
                <Star className="w-4 h-4 mr-1" />
                Featured
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resources Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-ink/40" />
        </div>
      ) : filteredResources.length === 0 ? (
        <Card className="bg-cream border-border">
          <CardContent className="py-12 text-center">
            <BookOpen className="w-12 h-12 mx-auto text-ink/20 mb-4" />
            <p className="text-ink/50">No resources found</p>
            {searchQuery && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="mt-4 border-border"
              >
                Clear search
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredResources.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              onClick={() => handleResourceView(resource)}
            />
          ))}
        </div>
      )}

      {/* Resource Detail Modal */}
      <ResourceDetailModal
        resource={selectedResource}
        onClose={() => setSelectedResource(null)}
      />
    </div>
  );
}

// Individual Resource Card
function ResourceCard({
  resource,
  onClick,
  compact = false,
}: {
  resource: Resource;
  onClick: () => void;
  compact?: boolean;
}) {
  const Icon = typeIcons[resource.resourceType];

  if (compact) {
    return (
      <div
        className="flex items-center gap-3 p-3 rounded-lg bg-cream-2 hover:bg-cream-3 cursor-pointer transition-colors"
        onClick={onClick}
      >
        <div className="p-2 rounded-lg bg-primary/5">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-ink truncate">
            {resource.title}
          </h4>
          <p className="text-xs text-ink/40">
            {typeLabels[resource.resourceType]}
            {resource.durationMinutes && ` • ${resource.durationMinutes} min`}
          </p>
        </div>
        {resource.featured && (
          <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
        )}
      </div>
    );
  }

  return (
    <Card
      className="bg-cream border-border hover:border-border cursor-pointer transition-colors group"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/5 group-hover:bg-primary/10 transition-colors">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium text-ink group-hover:text-primary transition-colors line-clamp-2">
                {resource.title}
              </h3>
              {resource.featured && (
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 flex-shrink-0" />
              )}
            </div>
            {resource.description && (
              <p className="text-sm text-ink/50 mt-1 line-clamp-2">
                {resource.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-3 text-xs text-ink/40">
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {resource.viewCount}
              </span>
              {resource.durationMinutes && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {resource.durationMinutes} min
                </span>
              )}
              <Badge variant="secondary" className="bg-cream-2 text-ink/50 border-0">
                {typeLabels[resource.resourceType]}
              </Badge>
            </div>
            {resource.tags && resource.tags.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {resource.tags.slice(0, 3).map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="bg-cream-2 text-ink/40 border-0 text-xs"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Resource Detail Modal
function ResourceDetailModal({
  resource,
  onClose,
}: {
  resource: Resource | null;
  onClose: () => void;
}) {
  if (!resource) return null;

  const Icon = typeIcons[resource.resourceType];

  return (
    <Dialog open={!!resource} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-cream border-border">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/5">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-ink text-xl">
                {resource.title}
              </DialogTitle>
              {resource.source && (
                <p className="text-sm text-ink/50 mt-1">
                  Source: {resource.source}
                  {resource.author && ` • ${resource.author}`}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Meta info */}
          <div className="flex items-center gap-4 text-sm text-ink/50">
            <Badge variant="secondary" className="bg-cream-2 text-ink/60 border-0">
              {typeLabels[resource.resourceType]}
            </Badge>
            {resource.topic && (
              <Badge variant="secondary" className="bg-cream-2 text-ink/60 border-0">
                {resource.topic}
              </Badge>
            )}
            {resource.durationMinutes && (
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {resource.durationMinutes} minutes
              </span>
            )}
            <span className="flex items-center gap-1">
              <Eye className="w-4 h-4" />
              {resource.viewCount} views
            </span>
          </div>

          {/* Description */}
          {resource.description && (
            <p className="text-ink/70">{resource.description}</p>
          )}

          {/* Content or External Link */}
          {resource.content ? (
            <div className="prose prose-invert max-w-none">
              <div
                className="text-ink/80 leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{
                  __html: resource.content
                    .replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold text-ink mt-6 mb-3">$1</h1>')
                    .replace(/^## (.*$)/gm, '<h2 class="text-lg font-semibold text-ink mt-5 mb-2">$1</h2>')
                    .replace(/^### (.*$)/gm, '<h3 class="text-md font-medium text-ink mt-4 mb-2">$1</h3>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-ink">$1</strong>')
                    .replace(/^\- (.*$)/gm, '<li class="ml-4 text-ink/70">$1</li>')
                    .replace(/^(\d+)\. (.*$)/gm, '<li class="ml-4 text-ink/70">$2</li>')
                    .replace(/\n\n/g, '</p><p class="mt-3">')
                }}
              />
            </div>
          ) : resource.url ? (
            <div className="flex flex-col items-center py-8 gap-4">
              <p className="text-ink/50">This resource is hosted externally.</p>
              <Button
                onClick={() => window.open(resource.url, "_blank")}
                className="bg-primary hover:bg-primary/90"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open Resource
              </Button>
            </div>
          ) : null}

          {/* Tags */}
          {resource.tags && resource.tags.length > 0 && (
            <div className="flex gap-2 flex-wrap pt-4 border-t border-border">
              {resource.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="bg-cream-2 text-ink/50 border-0"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
