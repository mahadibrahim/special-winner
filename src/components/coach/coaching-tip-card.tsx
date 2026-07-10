import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Lightbulb,
  MessageCircleQuestion,
  AlertTriangle,
  Heart,
  Bell,
  X,
  ChevronRight,
  ThumbsUp,
} from "lucide-react";

interface CoachingTip {
  id: string;
  promptType: "question" | "reminder" | "tip" | "warning" | "encouragement";
  title?: string;
  content: string;
  isQuestionBased?: boolean;
  targetedBehavior?: string;
  tags?: string[];
}

interface CoachingTipCardProps {
  tip: CoachingTip;
  onDismiss?: (id: string, type: "temporary" | "permanent" | "helpful") => void;
  variant?: "default" | "compact" | "featured";
  showActions?: boolean;
}

const typeConfig = {
  question: {
    icon: MessageCircleQuestion,
    color: "text-primary",
    bg: "bg-primary/5",
    border: "border-primary/20",
    label: "Question",
  },
  reminder: {
    icon: Bell,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/20",
    label: "Reminder",
  },
  tip: {
    icon: Lightbulb,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    label: "Tip",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    label: "Watch Out",
  },
  encouragement: {
    icon: Heart,
    color: "text-pink-400",
    bg: "bg-pink-500/10",
    border: "border-pink-500/20",
    label: "Encouragement",
  },
};

export function CoachingTipCard({
  tip,
  onDismiss,
  variant = "default",
  showActions = true,
}: CoachingTipCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const config = typeConfig[tip.promptType];
  const Icon = config.icon;

  if (dismissed) return null;

  const handleDismiss = (type: "temporary" | "permanent" | "helpful") => {
    setDismissed(true);
    onDismiss?.(tip.id, type);
  };

  if (variant === "compact") {
    return (
      <div
        className={`flex items-start gap-3 p-3 rounded-lg ${config.bg} ${config.border} border`}
      >
        <Icon className={`w-4 h-4 ${config.color} mt-0.5 flex-shrink-0`} />
        <p className="text-sm text-ink/90 flex-1">{tip.content}</p>
        {showActions && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-ink/40 hover:text-ink"
            onClick={() => handleDismiss("temporary")}
          >
            <X className="w-3 h-3" />
          </Button>
        )}
      </div>
    );
  }

  if (variant === "featured") {
    return (
      <Card className={`${config.bg} ${config.border} border-2`}>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl ${config.bg}`}>
              <Icon className={`w-6 h-6 ${config.color}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge
                  variant="secondary"
                  className={`${config.bg} ${config.color} border-0 text-xs`}
                >
                  {config.label}
                </Badge>
                {tip.isQuestionBased && (
                  <Badge
                    variant="secondary"
                    className="bg-cream-2 text-ink/60 border-0 text-xs"
                  >
                    Guided Discovery
                  </Badge>
                )}
              </div>
              {tip.title && (
                <h3 className="font-semibold text-ink text-lg mb-2">
                  {tip.title}
                </h3>
              )}
              <p className="text-ink/80 leading-relaxed">{tip.content}</p>
              {tip.targetedBehavior && (
                <p className="text-xs text-ink/40 mt-3">
                  Focus: {tip.targetedBehavior}
                </p>
              )}
            </div>
            {showActions && (
              <div className="flex flex-col gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-ink/40 hover:text-emerald-400"
                  onClick={() => handleDismiss("helpful")}
                  title="Mark as helpful"
                >
                  <ThumbsUp className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-ink/40 hover:text-ink"
                  onClick={() => handleDismiss("temporary")}
                  title="Dismiss"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Default variant
  return (
    <Card className={`bg-cream ${config.border} border hover:border-border transition-colors`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${config.bg}`}>
            <Icon className={`w-4 h-4 ${config.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-medium ${config.color}`}>
                {config.label}
              </span>
              {tip.title && (
                <>
                  <span className="text-ink/20">•</span>
                  <span className="text-sm font-medium text-ink truncate">
                    {tip.title}
                  </span>
                </>
              )}
            </div>
            <p className="text-sm text-ink/70 leading-relaxed">{tip.content}</p>
            {tip.tags && tip.tags.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {tip.tags.slice(0, 3).map((tag) => (
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
          {showActions && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-ink/40 hover:text-ink flex-shrink-0"
              onClick={() => handleDismiss("temporary")}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
