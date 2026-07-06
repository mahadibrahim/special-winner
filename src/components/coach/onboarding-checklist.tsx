"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

interface OnboardingTask {
  key: string;
  label: string;
  description: string;
  kind: "manual" | "auto" | "admin_confirm";
  completed: boolean;
  completedAt: string | null;
}

export function OnboardingChecklist() {
  const [tasks, setTasks] = useState<OnboardingTask[] | null>(null);
  const [complete, setComplete] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/coach/onboarding");
      if (!res.ok) return; // fail-soft: card stays hidden rather than erroring
      const data = await res.json();
      setTasks(data.tasks);
      setComplete(data.complete);
    } catch {
      // fail-soft
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function completeTask(key: string) {
    setSavingKey(key);
    try {
      const res = await fetch("/api/coach/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskKey: key }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTasks(data.tasks);
      setComplete(data.complete);
    } catch {
      toast.error("Could not save — try again.");
    } finally {
      setSavingKey(null);
    }
  }

  // Visible until every task is complete, per the Phase 2 acceptance
  // criteria — once done, it disappears rather than collapsing.
  if (!tasks || complete) return null;

  const doneCount = tasks.filter((t) => t.completed).length;

  return (
    <Card
      className="bg-cream border-border"
      data-testid="onboarding-checklist"
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-lg text-ink">Getting started</CardTitle>
        <p className="text-sm text-ink/50">
          {doneCount}/{tasks.length} complete
        </p>
        <div className="h-1 bg-cream-2 rounded-full mt-2 overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${(doneCount / tasks.length) * 100}%` }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {tasks.map((task) => (
          <div
            key={task.key}
            className={`flex items-start gap-3 p-3 rounded-lg border ${
              task.completed
                ? "bg-primary/10 border-primary/20"
                : "bg-cream-2 border-transparent"
            }`}
          >
            {task.completed ? (
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
            ) : (
              <Circle className="w-4 h-4 mt-0.5 text-ink-faint flex-shrink-0" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">{task.label}</p>
              <p className="text-xs text-ink-muted mt-0.5">
                {task.description}
              </p>
              {!task.completed && task.kind === "manual" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 text-xs"
                  disabled={savingKey === task.key}
                  onClick={() => void completeTask(task.key)}
                >
                  {savingKey === task.key ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    "Mark as done"
                  )}
                </Button>
              ) : null}
              {!task.completed && task.kind === "admin_confirm" ? (
                <p className="text-xs text-ink-faint mt-1 italic">
                  Waiting for admin confirmation
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
