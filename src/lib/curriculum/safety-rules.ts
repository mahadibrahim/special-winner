// Safety-gated curriculum content: skills that carry a hard age floor
// enforced regardless of ordinary stage guidance (see "Age guardrails
// (two-tier)" in docs/superpowers/specs/2026-07-10-program-blueprint-design.md).
//
// Pure, DB-free curated module -- same shape convention as reinforcement.ts:
// keyed by skill slug (natural key shared with CURRICULUM_CONTENT.skills),
// unit-tested for the invariant that every key here exists in the
// curriculum registry. Both the blueprint builder UI and the sequence-entry
// write endpoint evaluate from this single module; the rules are never
// duplicated client-side.
//
// First (and so far only) entry: heading-related soccer skills, per the
// US Soccer Player Safety Campaign's heading policy (no heading in
// training for players age 10 and under).

export interface SafetyRule {
  /** Youngest age this skill may safely be trained. Below this, blocked. */
  minAge: number;
  /** Plain-English rule text shown on the admin blueprint UI. No jargon,
   * no internal slugs -- this is read verbatim by directors/coaches. */
  rule: string;
  /** Citation for the governing policy, shown alongside `rule`. */
  source: string;
}

const HEADING_RULE: SafetyRule = {
  minAge: 11,
  rule: "No heading in training for players 10 and under",
  source: "US Soccer Player Safety Campaign heading policy",
};

export const SKILL_SAFETY_RULES: Record<string, SafetyRule> = {
  "heading-defensive": HEADING_RULE,
};

/** The safety rule for a skill slug, or null if the skill carries none. */
export function getSafetyRule(slug: string): SafetyRule | null {
  return SKILL_SAFETY_RULES[slug] ?? null;
}
