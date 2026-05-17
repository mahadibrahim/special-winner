"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import {
  BookOpen,
  Dumbbell,
  FileText,
  Plus,
  ChevronRight,
  Target,
  Users,
  Clock,
  TrendingUp,
  Loader2,
} from "lucide-react";

interface CurriculumStats {
  skills: {
    total: number;
    active: number;
    bySport: { sport: string; count: number }[];
  };
  activities: {
    total: number;
    active: number;
    featured: number;
    byType: { type: string; count: number }[];
  };
  templates: {
    total: number;
    active: number;
    byStage: { stage: string; count: number }[];
  };
}

export function CurriculumManager() {
  useHydrationBeacon();
  const [stats, setStats] = useState<CurriculumStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        // Fetch counts from each API
        const [skillsRes, activitiesRes, templatesRes] = await Promise.all([
          fetch("/api/admin/curriculum/skills?active=false"),
          fetch("/api/admin/curriculum/activities?active=false"),
          fetch("/api/admin/curriculum/templates?active=false"),
        ]);

        const skillsData = await skillsRes.json();
        const activitiesData = await activitiesRes.json();
        const templatesData = await templatesRes.json();

        // Process stats
        const skills = skillsData.skills || [];
        const activities = activitiesData.activities || [];
        const templates = templatesData.templates || [];

        // Count by sport for skills
        const sportCounts: Record<string, number> = {};
        skills.forEach((s: any) => {
          const sportName = s.sport?.name || "Unknown";
          sportCounts[sportName] = (sportCounts[sportName] || 0) + 1;
        });

        // Count by type for activities
        const typeCounts: Record<string, number> = {};
        activities.forEach((a: any) => {
          typeCounts[a.activityType] = (typeCounts[a.activityType] || 0) + 1;
        });

        // Count by stage for templates
        const stageCounts: Record<string, number> = {};
        templates.forEach((t: any) => {
          const stageName = t.stage?.name || "Unknown";
          stageCounts[stageName] = (stageCounts[stageName] || 0) + 1;
        });

        setStats({
          skills: {
            total: skills.length,
            active: skills.filter((s: any) => s.active).length,
            bySport: Object.entries(sportCounts).map(([sport, count]) => ({ sport, count })),
          },
          activities: {
            total: activities.length,
            active: activities.filter((a: any) => a.active).length,
            featured: activities.filter((a: any) => a.featured).length,
            byType: Object.entries(typeCounts).map(([type, count]) => ({ type, count })),
          },
          templates: {
            total: templates.length,
            active: templates.filter((t: any) => t.active).length,
            byStage: Object.entries(stageCounts).map(([stage, count]) => ({ stage, count })),
          },
        });
      } catch (error) {
        console.error("Error fetching curriculum stats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sections = [
    {
      title: "Skills",
      description: "Manage the master skills library across all sports and domains",
      icon: Target,
      href: "/admin/curriculum/skills",
      color: "text-blue-600",
      bgColor: "bg-blue-500/10",
      stats: stats?.skills ? [
        { label: "Total Skills", value: stats.skills.total },
        { label: "Active", value: stats.skills.active },
      ] : [],
      breakdown: stats?.skills?.bySport.slice(0, 3) || [],
      breakdownLabel: "sport",
    },
    {
      title: "Activities",
      description: "Build and manage the game and drill library for practice sessions",
      icon: Dumbbell,
      href: "/admin/curriculum/activities",
      color: "text-green-600",
      bgColor: "bg-green-500/10",
      stats: stats?.activities ? [
        { label: "Total Activities", value: stats.activities.total },
        { label: "Active", value: stats.activities.active },
        { label: "Featured", value: stats.activities.featured },
      ] : [],
      breakdown: stats?.activities?.byType.slice(0, 4) || [],
      breakdownLabel: "type",
    },
    {
      title: "Practice Templates",
      description: "Create reusable session structures for coaches to build practices",
      icon: FileText,
      href: "/admin/curriculum/templates",
      color: "text-purple-600",
      bgColor: "bg-purple-500/10",
      stats: stats?.templates ? [
        { label: "Total Templates", value: stats.templates.total },
        { label: "Active", value: stats.templates.active },
      ] : [],
      breakdown: stats?.templates?.byStage.slice(0, 4) || [],
      breakdownLabel: "stage",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink mb-2">Curriculum Management</h1>
          <p className="text-muted-foreground">
            Manage skills, activities, and practice templates for your organization
          </p>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-paper border border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Target className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-ink">{stats?.skills.total || 0}</p>
                <p className="text-sm text-ink-muted">Total Skills</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-paper border border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-500/10">
                <Dumbbell className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-ink">{stats?.activities.total || 0}</p>
                <p className="text-sm text-ink-muted">Activities</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-paper border border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-purple-500/10">
                <FileText className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-ink">{stats?.templates.total || 0}</p>
                <p className="text-sm text-ink-muted">Templates</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-paper border border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-amber-500/10">
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-ink">
                  {((stats?.skills.active || 0) + (stats?.activities.active || 0) + (stats?.templates.active || 0))}
                </p>
                <p className="text-sm text-ink-muted">Active Items</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {sections.map((section) => (
          <Card key={section.title} className="bg-paper border border-border hover:border-ink-muted/30 transition-colors">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className={`p-3 rounded-lg ${section.bgColor}`}>
                  <section.icon className={`w-6 h-6 ${section.color}`} />
                </div>
                <a href={section.href}>
                  <Button variant="ghost" size="sm" className="text-ink-muted hover:text-ink">
                    Manage
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </a>
              </div>
              <CardTitle className="text-ink mt-4">{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Stats Row */}
              <div className="flex gap-4 mb-4">
                {section.stats.map((stat) => (
                  <div key={stat.label}>
                    <p className="text-xl font-semibold text-ink">{stat.value}</p>
                    <p className="text-xs text-ink-muted">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Breakdown */}
              {section.breakdown.length > 0 && (
                <div className="pt-4 border-t border-border">
                  <p className="text-xs text-ink-muted mb-2 uppercase tracking-wide">
                    By {section.breakdownLabel}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {section.breakdown.map((item: any) => (
                      <Badge
                        key={item[section.breakdownLabel] || item.sport || item.type || item.stage}
                        variant="secondary"
                        className="bg-cream-2 text-ink-2 border-0"
                      >
                        {item[section.breakdownLabel] || item.sport || item.type || item.stage}: {item.count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="mt-4 pt-4 border-t border-border">
                <a href={`${section.href}?action=new`}>
                  <Button variant="outline" size="sm" className="w-full border-border hover:bg-cream-2">
                    <Plus className="w-4 h-4 mr-2" />
                    Add {section.title.slice(0, -1)}
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Links */}
      <Card className="bg-paper border border-border">
        <CardHeader>
          <CardTitle className="text-ink flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            Quick Actions
          </CardTitle>
          <CardDescription>Common curriculum management tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <a href="/admin/curriculum/skills?action=new" className="block">
              <div className="p-4 rounded-lg bg-cream-2 hover:bg-cream-3 transition-colors">
                <Target className="w-5 h-5 text-blue-600 mb-2" />
                <p className="font-medium text-ink">Add New Skill</p>
                <p className="text-sm text-ink-muted">Create a skill for players to develop</p>
              </div>
            </a>

            <a href="/admin/curriculum/activities?action=new" className="block">
              <div className="p-4 rounded-lg bg-cream-2 hover:bg-cream-3 transition-colors">
                <Dumbbell className="w-5 h-5 text-green-600 mb-2" />
                <p className="font-medium text-ink">Add New Activity</p>
                <p className="text-sm text-ink-muted">Create a game or drill for practice</p>
              </div>
            </a>

            <a href="/admin/curriculum/templates?action=new" className="block">
              <div className="p-4 rounded-lg bg-cream-2 hover:bg-cream-3 transition-colors">
                <FileText className="w-5 h-5 text-purple-600 mb-2" />
                <p className="font-medium text-ink">Create Template</p>
                <p className="text-sm text-ink-muted">Build a reusable practice structure</p>
              </div>
            </a>

            <a href="/admin/curriculum/activities?featured=true" className="block">
              <div className="p-4 rounded-lg bg-cream-2 hover:bg-cream-3 transition-colors">
                <TrendingUp className="w-5 h-5 text-amber-600 mb-2" />
                <p className="font-medium text-ink">Featured Activities</p>
                <p className="text-sm text-ink-muted">View and manage featured content</p>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
