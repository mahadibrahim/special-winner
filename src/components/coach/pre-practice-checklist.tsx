import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ClipboardCheck,
  Loader2,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Users,
  Package,
  Target,
  Heart,
  RefreshCw,
} from "lucide-react";
import { CoachingTipCard } from "./coaching-tip-card";

interface ChecklistItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  category: "preparation" | "mindset" | "players";
}

interface CoachingTip {
  id: string;
  promptType: "question" | "reminder" | "tip" | "warning" | "encouragement";
  title?: string;
  content: string;
  isQuestionBased?: boolean;
  targetedBehavior?: string;
  tags?: string[];
}

const defaultChecklist: ChecklistItem[] = [
  {
    id: "equipment",
    label: "Equipment ready",
    description: "Balls, cones, pinnies - enough for everyone",
    icon: Package,
    category: "preparation",
  },
  {
    id: "space",
    label: "Space set up",
    description: "Fields/courts marked, stations prepared",
    icon: Target,
    category: "preparation",
  },
  {
    id: "focus",
    label: "Session focus defined",
    description: "What's the ONE skill to improve today?",
    icon: Target,
    category: "mindset",
  },
  {
    id: "individuals",
    label: "Individual attention planned",
    description: "Which 2-3 players need extra focus?",
    icon: Users,
    category: "players",
  },
  {
    id: "energy",
    label: "Positive energy ready",
    description: "Ready to greet every player by name",
    icon: Heart,
    category: "mindset",
  },
];

interface PrePracticeChecklistProps {
  sportId?: string;
  stageId?: string;
  onComplete?: () => void;
}

export function PrePracticeChecklist({
  sportId,
  stageId,
  onComplete,
}: PrePracticeChecklistProps) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [tips, setTips] = useState<CoachingTip[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    fetchTips();
  }, [sportId, stageId]);

  async function fetchTips() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        context: "pre_practice",
        limit: "3",
      });
      if (sportId) params.set("sportId", sportId);
      if (stageId) params.set("stageId", stageId);

      const res = await fetch(`/api/coach/prompts?${params}`);
      const data = await res.json();
      setTips(data.prompts || []);
    } catch (error) {
      console.error("Error fetching tips:", error);
    } finally {
      setLoading(false);
    }
  }

  function toggleItem(id: string) {
    const newChecked = new Set(checkedItems);
    if (newChecked.has(id)) {
      newChecked.delete(id);
    } else {
      newChecked.add(id);
    }
    setCheckedItems(newChecked);

    // Check if all items are complete
    if (newChecked.size === defaultChecklist.length) {
      onComplete?.();
    }
  }

  async function handleDismissTip(id: string, type: string) {
    try {
      await fetch("/api/coach/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId: id, dismissType: type }),
      });
      setTips(tips.filter((t) => t.id !== id));
    } catch (error) {
      console.error("Error dismissing tip:", error);
    }
  }

  const progress = (checkedItems.size / defaultChecklist.length) * 100;
  const isComplete = checkedItems.size === defaultChecklist.length;

  return (
    <Card className="bg-cream border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <ClipboardCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-ink">
                Pre-Practice Checklist
              </CardTitle>
              <p className="text-sm text-ink/50">
                {isComplete
                  ? "Ready to go!"
                  : `${checkedItems.size}/${defaultChecklist.length} complete`}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="text-ink/50"
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-cream-2 rounded-full mt-3 overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {/* Checklist Items */}
          <div className="space-y-2">
            {defaultChecklist.map((item) => {
              const Icon = item.icon;
              const isChecked = checkedItems.has(item.id);

              return (
                <div
                  key={item.id}
                  className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    isChecked
                      ? "bg-emerald-500/10 border border-emerald-500/20"
                      : "bg-cream-2 hover:bg-cream-3 border border-transparent"
                  }`}
                  onClick={() => toggleItem(item.id)}
                >
                  <Checkbox
                    checked={isChecked}
                    className="mt-0.5 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Icon
                        className={`w-4 h-4 ${
                          isChecked ? "text-emerald-400" : "text-ink/40"
                        }`}
                      />
                      <span
                        className={`font-medium ${
                          isChecked ? "text-emerald-400" : "text-ink"
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-sm text-ink/50 mt-0.5 ml-6">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Coaching Tips */}
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-ink/40" />
            </div>
          ) : tips.length > 0 ? (
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-medium text-ink/60">
                    Today's Coaching Insight
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchTips}
                  className="h-7 text-ink/40 hover:text-ink"
                >
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </div>
              {tips.map((tip) => (
                <CoachingTipCard
                  key={tip.id}
                  tip={tip}
                  variant="compact"
                  onDismiss={handleDismissTip}
                />
              ))}
            </div>
          ) : null}

          {/* Complete Button — only when the parent actually wired a handler
              (the coach dashboard renders this checklist bare, and a button
              that does nothing is worse than no button). */}
          {isComplete && onComplete && (
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={onComplete}
            >
              Start Practice
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
