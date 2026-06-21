export interface VenueTodaySession {
  id: string;
  kind: "league" | "tournament" | "dropin" | "class" | "camp" | "rental" | "hold";
  spaceId: string;
  spaceName: string;
  title: string;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  booked: number;
  checkedIn: number;
  waiversOut: number;
  photosMissing: number;
  refAssigned: boolean | null;
}

export interface VenueAttentionItem {
  kind: "waiver" | "photo" | "ref" | "request" | "message";
  id: string;
  title: string;
  subtitle: string;
  sessionId?: string;
}

export interface VenueTodayPayload {
  date: string;
  locationId: string;
  locationName: string;
  spaces: { id: string; name: string }[];
  sessions: VenueTodaySession[];
  attention: VenueAttentionItem[];
}
