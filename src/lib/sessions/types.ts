export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export interface LiveSegment {
  order: number;
  name: string;
  type: string;
  durationMinutes: number;
  activityId?: string;
  activityName?: string;
  notes?: string;
  activitySkillIds: string[]; // resolved server-side; [] when no activity
  activityDiagram: string | null; // resolved server-side; ASCII setup diagram, null when absent
}

export interface LivePlayer {
  rosterId: string;
  familyMemberId: string;
  firstName: string;
  lastName: string;
  attendanceStatus: AttendanceStatus | null; // pre-recorded same-day rows
}

export interface LivePrompt {
  id: string;
  promptType: "question" | "reminder" | "tip" | "warning" | "encouragement";
  content: string;
  skillId: string | null; // null = generic during_practice prompt
  priority: number;
}

export interface CaptureInput {
  clientId: string;
  rosterId: string;
  kind: "glow" | "observation";
  skillId?: string | null;
  note?: string | null;
}

export interface LivePayload {
  session: {
    id: string;
    title: string;
    status: "draft" | "planned" | "in_progress" | "completed" | "cancelled";
    startedAt: string | null;
    scheduledDate: string;
    durationMinutes: number;
    objectives: string[];
    focusSkillIds: string[];
    preSessionNotes: string | null;
    prescribed: { attachmentId: string; distributorFirstName: string | null } | null;
    groupNoun: string;
    teamName: string;
  };
  segments: LiveSegment[];
  equipment: string[];
  prompts: LivePrompt[];
  roster: LivePlayer[];
  glowChips: { glows: string[]; grows: string[] };
  captures: Array<CaptureInput & { id: string; consumedAt: string | null }>;
}
