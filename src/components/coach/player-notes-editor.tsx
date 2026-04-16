import { useState, useEffect } from "react";
import {
  Star,
  TrendingUp,
  Target,
  Heart,
  FileText,
  X,
  Send,
  Eye,
  EyeOff,
  Loader2,
  Calendar,
  User,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Team {
  id: string;
  name: string;
  color?: string | null;
}

interface Note {
  id: string;
  familyMemberId: string;
  teamId: string;
  coachUserId: string;
  category: string;
  title: string;
  content: string;
  visibleToParent: boolean;
  createdAt: string;
  updatedAt: string;
  teamName?: string;
  teamColor?: string;
}

interface PlayerNotesEditorProps {
  playerId: string;
  playerName: string;
  teams: Team[];
  isOpen: boolean;
  onClose: () => void;
  onNoteCreated?: (note: Note) => void;
}

const CATEGORIES = [
  { value: "progress", label: "Progress", icon: TrendingUp, color: "text-primary", bgColor: "bg-primary/5" },
  { value: "achievement", label: "Achievement", icon: Star, color: "text-yellow-400", bgColor: "bg-yellow-500/10" },
  { value: "focus", label: "Focus Area", icon: Target, color: "text-orange-400", bgColor: "bg-orange-500/10" },
  { value: "encouragement", label: "Encouragement", icon: Heart, color: "text-pink-400", bgColor: "bg-pink-500/10" },
  { value: "general", label: "General", icon: FileText, color: "text-ink-muted", bgColor: "bg-gray-500/10" },
];

export default function PlayerNotesEditor({
  playerId,
  playerName,
  teams,
  isOpen,
  onClose,
  onNoteCreated,
}: PlayerNotesEditorProps) {
  const [selectedTeam, setSelectedTeam] = useState<string>(teams[0]?.id || "");
  const [category, setCategory] = useState<string>("progress");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [visibleToParent, setVisibleToParent] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);

  useEffect(() => {
    if (isOpen && playerId) {
      fetchNotes();
    }
  }, [isOpen, playerId]);

  useEffect(() => {
    if (teams.length > 0 && !selectedTeam) {
      setSelectedTeam(teams[0].id);
    }
  }, [teams, selectedTeam]);

  const fetchNotes = async () => {
    setIsLoadingNotes(true);
    try {
      const response = await fetch(`/api/coach/players/${playerId}/notes`);
      if (response.ok) {
        const data = await response.json();
        setNotes(data.notes || []);
      }
    } catch (err) {
      console.error("Error fetching notes:", err);
    } finally {
      setIsLoadingNotes(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || !selectedTeam) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/coach/players/${playerId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeam,
          category,
          title: title.trim(),
          content: content.trim(),
          visibleToParent,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNotes((prev) => [data.note, ...prev]);
        setTitle("");
        setContent("");
        onNoteCreated?.(data.note);
      } else {
        const data = await response.json();
        setError(data.error || "Failed to create note");
      }
    } catch (err) {
      setError("An error occurred while creating the note");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCategoryIcon = (cat: string) => {
    const category = CATEGORIES.find((c) => c.value === cat);
    const Icon = category?.icon || FileText;
    return <Icon className={`h-4 w-4 ${category?.color || "text-ink-muted"}`} />;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
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
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-cream border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-ink" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-ink">Player Notes</h2>
              <p className="text-sm text-ink-muted">{playerName}</p>
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
          <div className="p-6 space-y-6">
            {/* New Note Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-cream-2 border border-border rounded-xl p-4 space-y-4">
                <h3 className="text-sm font-medium text-ink flex items-center gap-2">
                  <Send className="h-4 w-4 text-primary" />
                  Add New Note
                </h3>

                {/* Team Selection */}
                {teams.length > 1 && (
                  <div>
                    <label className="block text-xs text-ink-muted mb-2">Team</label>
                    <select
                      value={selectedTeam}
                      onChange={(e) => setSelectedTeam(e.target.value)}
                      className="w-full px-3 py-2 bg-cream-2 border border-border rounded-lg text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Category Selection */}
                <div>
                  <label className="block text-xs text-ink-muted mb-2">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map((cat) => {
                      const Icon = cat.icon;
                      const isSelected = category === cat.value;
                      return (
                        <button
                          key={cat.value}
                          type="button"
                          onClick={() => setCategory(cat.value)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                            isSelected
                              ? `${cat.bgColor} ${cat.color} ring-1 ring-current`
                              : "bg-cream-2 text-ink-muted hover:bg-cream-3"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {cat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs text-ink-muted mb-2">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Brief summary of the note..."
                    className="w-full px-3 py-2 bg-cream-2 border border-border rounded-lg text-ink placeholder:text-ink-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                {/* Content */}
                <div>
                  <label className="block text-xs text-ink-muted mb-2">Note Content</label>
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Write your feedback, observations, or encouragement..."
                    rows={4}
                    className="w-full px-3 py-2 bg-cream-2 border border-border rounded-lg text-ink placeholder:text-ink-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  />
                </div>

                {/* Visibility Toggle */}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setVisibleToParent(!visibleToParent)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all ${
                      visibleToParent
                        ? "bg-green-500/10 text-green-400"
                        : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    {visibleToParent ? (
                      <>
                        <Eye className="h-4 w-4" />
                        Visible to parent
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-4 w-4" />
                        Coach only
                      </>
                    )}
                  </button>

                  <Button
                    type="submit"
                    disabled={isSubmitting || !title.trim() || !content.trim()}
                    className="bg-primary hover:bg-primary/90 text-ink"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Add Note
                      </>
                    )}
                  </Button>
                </div>

                {error && (
                  <p className="text-sm text-red-400 mt-2">{error}</p>
                )}
              </div>
            </form>

            {/* Existing Notes */}
            <div>
              <h3 className="text-sm font-medium text-ink mb-4 flex items-center gap-2">
                <FileText className="h-4 w-4 text-ink-muted" />
                Previous Notes
                <span className="text-xs text-ink-muted">({notes.length})</span>
              </h3>

              {isLoadingNotes ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                </div>
              ) : notes.length === 0 ? (
                <div className="text-center py-8 text-ink-muted">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No notes yet for this player</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notes.map((note) => (
                    <div
                      key={note.id}
                      className="bg-cream-2 border border-border rounded-xl p-4"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getCategoryIcon(note.category)}
                          <span className="font-medium text-ink">{note.title}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-ink-muted">
                          {note.visibleToParent ? (
                            <Eye className="h-3 w-3" />
                          ) : (
                            <EyeOff className="h-3 w-3" />
                          )}
                          <Calendar className="h-3 w-3" />
                          {formatDate(note.createdAt)}
                        </div>
                      </div>
                      <p className="text-sm text-ink-2 whitespace-pre-wrap">
                        {note.content}
                      </p>
                      {note.teamName && (
                        <div className="mt-2 flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: note.teamColor || "#666" }}
                          />
                          <span className="text-xs text-ink-muted">{note.teamName}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
