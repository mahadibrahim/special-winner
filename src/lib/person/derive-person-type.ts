import type { PersonType } from "./person-types";

export function derivePersonType(
  row: { parentUserId: string | null; selfUserId: string | null } | null,
  isUserRecord: boolean,
): PersonType {
  if (isUserRecord) return "parent";
  if (row?.parentUserId) return "child";
  return "adult";
}
