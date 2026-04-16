import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircleQuestion,
  Lightbulb,
  AlertTriangle,
  Heart,
  Bell,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Pause,
  Play,
} from "lucide-react";

interface CoachingTip {
  id: string;
  promptType: "question" | "reminder" | "tip" | "warning" | "encouragement";
  title?: string;
  content: string;
  isQuestionBased?: boolean;
  targetedBehavior?: string;
}

interface InSessionReminderProps {
  sportId?: string;
  stageId?: string;
  autoRotate?: boolean;
  rotateIntervalSeconds?: number;
}

const typeConfig = {
  question: {
    icon: MessageCircleQuestion,
    color: "text-primary",
    bg: "bg-primary/5",
  },
  reminder: {
    icon: Bell,
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
  },
  tip: {
    icon: Lightbulb,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-orange-400",
    bg: "bg-orange-500/10",
  },
  encouragement: {
    icon: Heart,
    color: "text-pink-400",
    bg: "bg-pink-500/10",
  },
};

export function InSessionReminder({
  sportId,
  stageId,
  autoRotate = true,
  rotateIntervalSeconds = 120, // 2 minutes default
}: InSessionReminderProps) {
  const [tips, setTips] = useState<CoachingTip[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetchTips();
  }, [sportId, stageId]);

  // Auto-rotate effect
  useEffect(() => {
    if (!autoRotate || isPaused || tips.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % tips.length);
    }, rotateIntervalSeconds * 1000);

    return () => clearInterval(interval);
  }, [autoRotate, isPaused, tips.length, rotateIntervalSeconds]);

  async function fetchTips() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        context: "during_practice",
        limit: "10",
      });
      if (sportId) params.set("sportId", sportId);
      if (stageId) params.set("stageId", stageId);

      const res = await fetch(`/api/coach/prompts?${params}`);
      const data = await res.json();
      setTips(data.prompts || []);
      setCurrentIndex(0);
    } catch (error) {
      console.error("Error fetching tips:", error);
    } finally {
      setLoading(false);
    }
  }

  function goToPrevious() {
    setCurrentIndex((prev) => (prev - 1 + tips.length) % tips.length);
  }

  function goToNext() {
    setCurrentIndex((prev) => (prev + 1) % tips.length);
  }

  async function handleDismiss() {
    if (!tips[currentIndex]) return;

    try {
      await fetch("/api/coach/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptId: tips[currentIndex].id,
          dismissType: "temporary",
        }),
      });
    } catch (error) {
      console.error("Error dismissing tip:", error);
    }

    // Remove from local state and move to next
    const newTips = tips.filter((_, i) => i !== currentIndex);
    setTips(newTips);
    if (currentIndex >= newTips.length) {
      setCurrentIndex(Math.max(0, newTips.length - 1));
    }
  }

  if (dismissed || loading || tips.length === 0) {
    if (dismissed) return null;
    if (loading) {
      return (
        <Card className="bg-cream border-border">
          <CardContent className="py-4 text-center">
            <div className="animate-pulse flex items-center justify-center gap-2 text-ink/40">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading coaching tips...</span>
            </div>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  const currentTip = tips[currentIndex];
  const config = typeConfig[currentTip.promptType];
  const Icon = config.icon;

  return (
    <Card className={`${config.bg} border-border relative overflow-hidden`}>
      {/* Progress dots */}
      {tips.length > 1 && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex gap-1">
          {tips.map((_, i) => (
            <button
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i === currentIndex ? "bg-ink" : "bg-ink/20"
              }`}
              onClick={() => setCurrentIndex(i)}
            />
          ))}
        </div>
      )}

      <CardContent className="py-5 px-4">
        <div className="flex items-start gap-3">
          {/* Navigation - Previous */}
          {tips.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={goToPrevious}
              className="h-8 w-8 p-0 text-ink/40 hover:text-ink flex-shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-md ${config.bg}`}>
                <Icon className={`w-4 h-4 ${config.color}`} />
              </div>
              {currentTip.title && (
                <span className="font-medium text-ink text-sm">
                  {currentTip.title}
                </span>
              )}
              {currentTip.isQuestionBased && (
                <Badge
                  variant="secondary"
                  className="bg-cream-3 text-ink/60 border-0 text-xs"
                >
                  Ask the player
                </Badge>
              )}
            </div>
            <p className="text-ink/80 text-sm leading-relaxed">
              {currentTip.content}
            </p>
          </div>

          {/* Navigation - Next */}
          {tips.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={goToNext}
              className="h-8 w-8 p-0 text-ink/40 hover:text-ink flex-shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            {autoRotate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsPaused(!isPaused)}
                className="h-7 text-xs text-ink/40 hover:text-ink"
              >
                {isPaused ? (
                  <>
                    <Play className="w-3 h-3 mr-1" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="w-3 h-3 mr-1" />
                    Pause
                  </>
                )}
              </Button>
            )}
            <span className="text-xs text-ink/30">
              {currentIndex + 1} of {tips.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchTips}
              className="h-7 text-xs text-ink/40 hover:text-ink"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              New
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-7 text-xs text-ink/40 hover:text-ink"
            >
              <X className="w-3 h-3 mr-1" />
              Got it
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Minimal floating version for overlay during practice
export function InSessionReminderFloat({
  sportId,
  stageId,
}: {
  sportId?: string;
  stageId?: string;
}) {
  const [tip, setTip] = useState<CoachingTip | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    fetchRandomTip();
    // Show a new tip every 3 minutes
    const interval = setInterval(fetchRandomTip, 180000);
    return () => clearInterval(interval);
  }, [sportId, stageId]);

  async function fetchRandomTip() {
    try {
      const params = new URLSearchParams({
        context: "during_practice",
        limit: "1",
      });
      if (sportId) params.set("sportId", sportId);
      if (stageId) params.set("stageId", stageId);

      const res = await fetch(`/api/coach/prompts?${params}`);
      const data = await res.json();
      if (data.prompts?.[0]) {
        setTip(data.prompts[0]);
        setVisible(true);
        // Auto-hide after 30 seconds
        setTimeout(() => setVisible(false), 30000);
      }
    } catch (error) {
      console.error("Error fetching tip:", error);
    }
  }

  if (!visible || !tip) return null;

  const config = typeConfig[tip.promptType];
  const Icon = config.icon;

  return (
    <div className="fixed bottom-4 right-4 max-w-sm animate-in slide-in-from-bottom-4 z-50">
      <Card className={`${config.bg} border-ink-faint/20 shadow-lg`}>
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <Icon className={`w-4 h-4 ${config.color} mt-0.5`} />
            <p className="text-sm text-ink/90 flex-1">{tip.content}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVisible(false)}
              className="h-6 w-6 p-0 text-ink/40 hover:text-ink"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
