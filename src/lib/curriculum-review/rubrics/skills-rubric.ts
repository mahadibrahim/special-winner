/**
 * Skills Rubric
 *
 * Research-based evaluation criteria for skill content.
 * Aligned with:
 * - European: TDEQ-5, YPD Model, Danish ATDE
 * - American: Double-Goal Coach, ELM Feedback, Project Play, US Soccer PDI
 */

import type {
  Rubric,
  CriterionDefinition,
  AntiPattern,
  BestPractice,
  SkillContent,
  ScoreLevel,
  CriterionScore,
} from "../types";

// Helper function to safely check content
function asSkillContent(content: unknown): SkillContent {
  return content as SkillContent;
}

// ============================================================================
// CRITERIA DEFINITIONS
// ============================================================================

const levelDifferentiation: CriterionDefinition = {
  name: "Level Differentiation",
  key: "levelDifferentiation",
  weight: 0.12,
  description: "Are levels 1-5 clearly distinct and progressive?",
  frameworkSource: "YPD Model",
  evaluate: (content: unknown): CriterionScore => {
    const skill = asSkillContent(content);
    const guide = skill.comprehensiveGuide;

    if (!guide?.levelDetails) {
      return {
        score: 1,
        weight: 0.12,
        notes: "Missing level details - no progression defined",
        frameworkSource: "YPD Model",
      };
    }

    const levels = Object.keys(guide.levelDetails);
    if (levels.length < 5) {
      return {
        score: 2,
        weight: 0.12,
        notes: `Only ${levels.length} levels defined, need all 5`,
        frameworkSource: "YPD Model",
      };
    }

    // Check for clear progression in descriptions
    const hasDescriptions = levels.every(
      (l) => guide.levelDetails?.[Number(l)]?.description?.length > 50
    );
    const hasBehaviors = levels.every(
      (l) => (guide.levelDetails?.[Number(l)]?.observableBehaviors?.length ?? 0) >= 3
    );

    if (!hasDescriptions || !hasBehaviors) {
      return {
        score: 3,
        weight: 0.12,
        notes: "Levels defined but descriptions or behaviors incomplete",
        frameworkSource: "YPD Model",
      };
    }

    // Check for progression language
    const descriptions = levels.map((l) => guide.levelDetails?.[Number(l)]?.description || "");
    const hasProgression = descriptions.some((d) => /improv|develop|advanc|master/i.test(d));

    return {
      score: hasProgression ? 5 : 4,
      weight: 0.12,
      notes: hasProgression
        ? "Clear 5-level progression with distinct, observable differences"
        : "All levels defined but could better articulate progression",
      frameworkSource: "YPD Model",
    };
  },
  getImprovementSuggestion: (score: ScoreLevel): string => {
    const suggestions: Record<ScoreLevel, string> = {
      1: "Add comprehensive levelDetails with all 5 levels. Each level needs name, description, observableBehaviors, commonMistakes, coachingTips, and assessmentActivities.",
      2: "Complete all 5 levels. Currently missing some levels - the YPD model requires clear progression across all development stages.",
      3: "Enhance level descriptions to be more specific (50+ characters each) and add at least 3 observable behaviors per level.",
      4: "Add progression language to descriptions showing how players advance from level to level (e.g., 'building on previous...', 'now able to...').",
      5: "Excellent progression definition. Consider adding video examples for each level.",
    };
    return suggestions[score];
  },
};

const observableBehaviors: CriterionDefinition = {
  name: "Observable Behaviors",
  key: "observableBehaviors",
  weight: 0.10,
  description: "Are behaviors specific, measurable, observable?",
  frameworkSource: "TDEQ-5",
  evaluate: (content: unknown): CriterionScore => {
    const skill = asSkillContent(content);
    const behaviors = skill.observableBehaviors ?? [];
    const guide = skill.comprehensiveGuide;

    if (behaviors.length === 0 && !guide?.levelDetails) {
      return {
        score: 1,
        weight: 0.10,
        notes: "No observable behaviors defined",
        frameworkSource: "TDEQ-5",
      };
    }

    // Collect all behaviors
    const allBehaviors = [...behaviors];
    if (guide?.levelDetails) {
      Object.values(guide.levelDetails).forEach((level) => {
        allBehaviors.push(...(level.observableBehaviors || []));
      });
    }

    if (allBehaviors.length < 5) {
      return {
        score: 2,
        weight: 0.10,
        notes: `Only ${allBehaviors.length} behaviors - need more specific indicators`,
        frameworkSource: "TDEQ-5",
      };
    }

    // Check for specificity (measurable language)
    const measurablePatterns = /\d+|percent|times|seconds|feet|yards|consistently|always|never/i;
    const specificCount = allBehaviors.filter((b) => measurablePatterns.test(b)).length;
    const specificRatio = specificCount / allBehaviors.length;

    if (specificRatio < 0.3) {
      return {
        score: 3,
        weight: 0.10,
        notes: "Behaviors present but lack measurable specificity",
        evidence: allBehaviors.slice(0, 3),
        frameworkSource: "TDEQ-5",
      };
    }

    return {
      score: specificRatio > 0.6 ? 5 : 4,
      weight: 0.10,
      notes:
        specificRatio > 0.6
          ? "Highly specific, measurable observable behaviors"
          : "Good behaviors with some measurable indicators",
      evidence: allBehaviors.filter((b) => measurablePatterns.test(b)).slice(0, 3),
      frameworkSource: "TDEQ-5",
    };
  },
  getImprovementSuggestion: (score: ScoreLevel): string => {
    const suggestions: Record<ScoreLevel, string> = {
      1: "Add observable behaviors that coaches can see during practice. Use specific, measurable language.",
      2: "Expand to at least 10-15 observable behaviors across all levels. Each should be something a coach can actually see.",
      3: "Make behaviors more measurable. Instead of 'good control', say 'maintains ball within 2 feet while moving'.",
      4: "Add more quantifiable measures where possible (distances, frequencies, time).",
      5: "Excellent observable behaviors. Consider organizing by game situation (in possession, out of possession).",
    };
    return suggestions[score];
  },
};

const ageStageAlignment: CriterionDefinition = {
  name: "Age-Stage Alignment",
  key: "ageStageAlignment",
  weight: 0.10,
  description: "Do expectations match development stage?",
  frameworkSource: "US Soccer PDI",
  evaluate: (content: unknown): CriterionScore => {
    const skill = asSkillContent(content);
    const guide = skill.comprehensiveGuide;

    if (!guide?.ageExpectations) {
      return {
        score: 1,
        weight: 0.10,
        notes: "Missing age expectations - critical for development alignment",
        frameworkSource: "US Soccer PDI",
      };
    }

    const ages = ["ages6to8", "ages9to11", "ages12to14"] as const;
    const definedAges = ages.filter((age) => guide.ageExpectations?.[age]);

    if (definedAges.length < 3) {
      return {
        score: 2,
        weight: 0.10,
        notes: `Only ${definedAges.length}/3 age groups defined`,
        frameworkSource: "US Soccer PDI",
      };
    }

    // Check for meaningful differences between age groups
    const expectations = ages.map((age) => guide.ageExpectations?.[age]?.typicalLevel || "");
    const hasDifferentiation = new Set(expectations).size >= 2;
    const hasNotes = ages.every((age) => (guide.ageExpectations?.[age]?.notes?.length ?? 0) > 20);

    if (!hasDifferentiation) {
      return {
        score: 3,
        weight: 0.10,
        notes: "Age groups defined but expectations don't show clear progression",
        frameworkSource: "US Soccer PDI",
      };
    }

    return {
      score: hasNotes ? 5 : 4,
      weight: 0.10,
      notes: hasNotes
        ? "Clear age-appropriate expectations with detailed notes for each stage"
        : "Good age differentiation, notes could be more detailed",
      evidence: expectations,
      frameworkSource: "US Soccer PDI",
    };
  },
  getImprovementSuggestion: (score: ScoreLevel): string => {
    const suggestions: Record<ScoreLevel, string> = {
      1: "Add ageExpectations with typicalLevel and notes for ages 6-8, 9-11, and 12-14.",
      2: "Complete all three age groups. Young players (6-8) should have lower expectations than older (12-14).",
      3: "Differentiate expectations between age groups. A 7-year-old shouldn't be expected to perform like a 13-year-old.",
      4: "Expand notes for each age group to explain developmental considerations (attention span, physical development).",
      5: "Excellent age alignment. Consider adding biological maturation notes for 12-14 age group.",
    };
    return suggestions[score];
  },
};

const coachingTipsQuality: CriterionDefinition = {
  name: "Coaching Tips Quality",
  key: "coachingTipsQuality",
  weight: 0.08,
  description: "Tips use ELM framework (Effort, Learning, Mistakes)?",
  frameworkSource: "Double-Goal Coach",
  evaluate: (content: unknown): CriterionScore => {
    const skill = asSkillContent(content);
    const tips = skill.coachingTips ?? [];
    const guide = skill.comprehensiveGuide;

    // Collect all coaching tips
    const allTips = [...tips];
    if (guide?.levelDetails) {
      Object.values(guide.levelDetails).forEach((level) => {
        allTips.push(...(level.coachingTips || []));
      });
    }

    if (allTips.length === 0) {
      return {
        score: 1,
        weight: 0.08,
        notes: "No coaching tips provided",
        frameworkSource: "Double-Goal Coach",
      };
    }

    if (allTips.length < 5) {
      return {
        score: 2,
        weight: 0.08,
        notes: `Only ${allTips.length} tips - need more coaching guidance`,
        frameworkSource: "Double-Goal Coach",
      };
    }

    // Check for ELM alignment
    const effortPatterns = /effort|try|work|practice|keep going/i;
    const learningPatterns = /learn|improve|progress|develop|grow/i;
    const mistakesPatterns = /mistake|error|wrong|fix|correct|okay to/i;
    const positivePatterns = /great|good|nice|well done|excellent/i;

    const hasEffort = allTips.some((t) => effortPatterns.test(t));
    const hasLearning = allTips.some((t) => learningPatterns.test(t));
    const hasMistakes = allTips.some((t) => mistakesPatterns.test(t));
    const hasPositive = allTips.some((t) => positivePatterns.test(t));

    const elmScore = [hasEffort, hasLearning, hasMistakes].filter(Boolean).length;

    if (elmScore < 2) {
      return {
        score: 3,
        weight: 0.08,
        notes: "Tips present but don't fully embrace ELM framework (Effort, Learning, Mistakes)",
        frameworkSource: "Double-Goal Coach",
      };
    }

    return {
      score: hasPositive && elmScore === 3 ? 5 : 4,
      weight: 0.08,
      notes:
        elmScore === 3
          ? "Excellent coaching tips aligned with ELM framework"
          : "Good tips covering most ELM elements",
      evidence: allTips.slice(0, 3),
      frameworkSource: "Double-Goal Coach",
    };
  },
  getImprovementSuggestion: (score: ScoreLevel): string => {
    const suggestions: Record<ScoreLevel, string> = {
      1: "Add coaching tips that guide coaches on what to say. Include phrases emphasizing Effort, Learning, and Mistakes.",
      2: "Expand tips to at least 10-15 across all levels. Include specific phrases coaches can use.",
      3: "Ensure tips cover the ELM framework: praise Effort ('Great try!'), encourage Learning ('You're improving!'), normalize Mistakes ('Mistakes help us learn').",
      4: "Add more positive reinforcement language. The research shows 5:1 positive to corrective feedback works best.",
      5: "Excellent ELM-aligned tips. Consider adding situation-specific guidance (during games vs practice).",
    };
    return suggestions[score];
  },
};

const questionBasedCues: CriterionDefinition = {
  name: "Question-Based Cues",
  key: "questionBasedCues",
  weight: 0.08,
  description: "Does content include guiding questions, not just commands?",
  frameworkSource: "Constraints-Led",
  evaluate: (content: unknown): CriterionScore => {
    const skill = asSkillContent(content);
    const tips = skill.coachingTips ?? [];
    const guide = skill.comprehensiveGuide;

    // Collect all text content
    const allText = [...tips];
    if (guide?.levelDetails) {
      Object.values(guide.levelDetails).forEach((level) => {
        allText.push(...(level.coachingTips || []));
        allText.push(...(level.observableBehaviors || []));
      });
    }

    const totalContent = allText.join(" ");
    const questionCount = (totalContent.match(/\?/g) || []).length;
    const commandPatterns = /^(do|don't|always|never|make sure|you must)/gi;
    const commandCount = allText.filter((t) => commandPatterns.test(t.trim())).length;

    if (questionCount === 0) {
      return {
        score: 2,
        weight: 0.08,
        notes: "No guiding questions found - all directive commands",
        frameworkSource: "Constraints-Led",
      };
    }

    const questionRatio = questionCount / (questionCount + commandCount + 1);

    if (questionRatio < 0.2) {
      return {
        score: 3,
        weight: 0.08,
        notes: "Some questions but heavily command-focused",
        frameworkSource: "Constraints-Led",
      };
    }

    return {
      score: questionRatio > 0.4 ? 5 : 4,
      weight: 0.08,
      notes:
        questionRatio > 0.4
          ? "Excellent use of guiding questions to develop player thinking"
          : "Good balance of questions and guidance",
      evidence: allText.filter((t) => t.includes("?")).slice(0, 3),
      frameworkSource: "Constraints-Led",
    };
  },
  getImprovementSuggestion: (score: ScoreLevel): string => {
    const suggestions: Record<ScoreLevel, string> = {
      1: "Add guiding questions that develop player thinking. The Constraints-Led approach emphasizes discovery over instruction.",
      2: "Include questions like 'What did you notice?' or 'Where should you look?' instead of just telling players what to do.",
      3: "Increase the ratio of questions to commands. Aim for 40%+ guiding questions in coaching content.",
      4: "Add more open-ended questions that don't have one right answer to encourage player decision-making.",
      5: "Excellent question-based approach. Consider categorizing questions by situation (technical, tactical, decision-making).",
    };
    return suggestions[score];
  },
};

const commonMistakesCriterion: CriterionDefinition = {
  name: "Common Mistakes",
  key: "commonMistakes",
  weight: 0.06,
  description: "Are mistakes specific and recognize growth process?",
  frameworkSource: "ELM Framework",
  evaluate: (content: unknown): CriterionScore => {
    const skill = asSkillContent(content);
    const mistakes = skill.commonMistakes ?? [];
    const guide = skill.comprehensiveGuide;

    // Collect all mistakes
    const allMistakes = [...mistakes];
    if (guide?.levelDetails) {
      Object.values(guide.levelDetails).forEach((level) => {
        allMistakes.push(...(level.commonMistakes || []));
      });
    }

    if (allMistakes.length === 0) {
      return {
        score: 1,
        weight: 0.06,
        notes: "No common mistakes identified",
        frameworkSource: "ELM Framework",
      };
    }

    if (allMistakes.length < 5) {
      return {
        score: 2,
        weight: 0.06,
        notes: `Only ${allMistakes.length} mistakes - coaches need more to look for`,
        frameworkSource: "ELM Framework",
      };
    }

    // Check for growth-oriented language
    const growthPatterns = /often|typically|at first|initially|common|normal|usually/i;
    const growthOriented = allMistakes.filter((m) => growthPatterns.test(m)).length;
    const growthRatio = growthOriented / allMistakes.length;

    if (growthRatio < 0.2) {
      return {
        score: 3,
        weight: 0.06,
        notes: "Mistakes listed but could better normalize them as part of learning",
        frameworkSource: "ELM Framework",
      };
    }

    return {
      score: growthRatio > 0.4 ? 5 : 4,
      weight: 0.06,
      notes:
        growthRatio > 0.4
          ? "Mistakes presented as normal part of development"
          : "Good mistakes coverage with some growth language",
      evidence: allMistakes.slice(0, 3),
      frameworkSource: "ELM Framework",
    };
  },
  getImprovementSuggestion: (score: ScoreLevel): string => {
    const suggestions: Record<ScoreLevel, string> = {
      1: "Add common mistakes coaches should watch for. Include level-specific mistakes.",
      2: "Expand to at least 10-15 mistakes across levels. Be specific about what the mistake looks like.",
      3: "Frame mistakes as normal: 'Players often...' or 'It's common to...' This normalizes the learning process.",
      4: "Add more growth-oriented language showing mistakes are expected at each level.",
      5: "Excellent mistake coverage. Consider linking each mistake to specific correction strategies.",
    };
    return suggestions[score];
  },
};

const assessmentActivitiesCriterion: CriterionDefinition = {
  name: "Assessment Activities",
  key: "assessmentActivities",
  weight: 0.06,
  description: "Four-domain assessment (Technical/Tactical/Physical/Psych)?",
  frameworkSource: "TDEQ-5",
  evaluate: (content: unknown): CriterionScore => {
    const skill = asSkillContent(content);
    const guide = skill.comprehensiveGuide;

    if (!guide?.levelDetails) {
      return {
        score: 1,
        weight: 0.06,
        notes: "No assessment activities defined",
        frameworkSource: "TDEQ-5",
      };
    }

    // Collect assessment activities
    const activities: string[] = [];
    Object.values(guide.levelDetails).forEach((level) => {
      activities.push(...(level.assessmentActivities || []));
    });

    if (activities.length === 0) {
      return {
        score: 2,
        weight: 0.06,
        notes: "Level details exist but no assessment activities",
        frameworkSource: "TDEQ-5",
      };
    }

    // Check for variety in assessment contexts
    const gameContext = activities.some((a) => /game|match|scrimmage/i.test(a));
    const practiceContext = activities.some((a) => /practice|drill|exercise/i.test(a));
    const observationContext = activities.some((a) => /observe|watch|note/i.test(a));

    const contextCount = [gameContext, practiceContext, observationContext].filter(Boolean).length;

    if (contextCount < 2) {
      return {
        score: 3,
        weight: 0.06,
        notes: "Assessment activities present but limited to one context",
        frameworkSource: "TDEQ-5",
      };
    }

    return {
      score: contextCount === 3 ? 5 : 4,
      weight: 0.06,
      notes:
        contextCount === 3
          ? "Rich variety of assessment contexts (game, practice, observation)"
          : "Good assessment variety, could add more contexts",
      evidence: activities.slice(0, 3),
      frameworkSource: "TDEQ-5",
    };
  },
  getImprovementSuggestion: (score: ScoreLevel): string => {
    const suggestions: Record<ScoreLevel, string> = {
      1: "Add assessmentActivities to each level showing how to evaluate if a player is at that level.",
      2: "Include specific activities or situations where coaches can assess this skill.",
      3: "Add variety in assessment contexts: include game situations, practice drills, and observation methods.",
      4: "Ensure all three contexts are covered: game-based, practice-based, and observational assessment.",
      5: "Excellent assessment coverage. Consider adding peer assessment or self-assessment options.",
    };
    return suggestions[score];
  },
};

const redFlagsCriterion: CriterionDefinition = {
  name: "Red Flags",
  key: "redFlags",
  weight: 0.06,
  description: "Warning signs realistic and development-focused?",
  frameworkSource: "US AAP Guidelines",
  evaluate: (content: unknown): CriterionScore => {
    const skill = asSkillContent(content);
    const guide = skill.comprehensiveGuide;

    if (!guide?.redFlags || guide.redFlags.length === 0) {
      return {
        score: 1,
        weight: 0.06,
        notes: "No red flags defined for early intervention",
        frameworkSource: "US AAP Guidelines",
      };
    }

    if (guide.redFlags.length < 3) {
      return {
        score: 2,
        weight: 0.06,
        notes: `Only ${guide.redFlags.length} red flags - need more warning signs`,
        frameworkSource: "US AAP Guidelines",
      };
    }

    // Check for development-focused language
    const developmentPatterns = /weeks|months|progress|improve|support|help|additional/i;
    const developmentFocused = guide.redFlags.filter((rf) => developmentPatterns.test(rf)).length;
    const ratio = developmentFocused / guide.redFlags.length;

    if (ratio < 0.3) {
      return {
        score: 3,
        weight: 0.06,
        notes: "Red flags present but could be more development-focused",
        frameworkSource: "US AAP Guidelines",
      };
    }

    return {
      score: ratio > 0.6 ? 5 : 4,
      weight: 0.06,
      notes:
        ratio > 0.6
          ? "Excellent development-focused red flags for early intervention"
          : "Good red flags with development focus",
      evidence: guide.redFlags.slice(0, 3),
      frameworkSource: "US AAP Guidelines",
    };
  },
  getImprovementSuggestion: (score: ScoreLevel): string => {
    const suggestions: Record<ScoreLevel, string> = {
      1: "Add redFlags array with warning signs that indicate a player needs additional support.",
      2: "Expand to at least 3-5 red flags. Include time-based indicators (e.g., 'No improvement over 6+ weeks').",
      3: "Make red flags development-focused: emphasize support needed rather than labeling players as 'behind'.",
      4: "Add more specific timeframes and support recommendations for each red flag.",
      5: "Excellent red flags. Consider adding referral guidance for concerning patterns.",
    };
    return suggestions[score];
  },
};

const parentExplanationCriterion: CriterionDefinition = {
  name: "Parent Explanation",
  key: "parentExplanation",
  weight: 0.06,
  description: "Clear, jargon-free, development-focused (not rankings)?",
  frameworkSource: "Project Play",
  evaluate: (content: unknown): CriterionScore => {
    const skill = asSkillContent(content);
    const guide = skill.comprehensiveGuide;

    if (!guide?.parentExplanation) {
      return {
        score: 1,
        weight: 0.06,
        notes: "No parent explanation provided",
        frameworkSource: "Project Play",
      };
    }

    const explanation = guide.parentExplanation;

    if (explanation.length < 100) {
      return {
        score: 2,
        weight: 0.06,
        notes: "Parent explanation too brief to be meaningful",
        frameworkSource: "Project Play",
      };
    }

    // Check for jargon
    const jargonPatterns = /tactical|biomechanics|proprioception|periodization|macrocycle/i;
    const hasJargon = jargonPatterns.test(explanation);

    // Check for ranking/comparison language (negative)
    const rankingPatterns = /rank|compare|better than|worse than|behind|ahead of peers/i;
    const hasRanking = rankingPatterns.test(explanation);

    if (hasJargon || hasRanking) {
      return {
        score: 3,
        weight: 0.06,
        notes: hasRanking
          ? "Parent explanation includes ranking/comparison language - avoid this"
          : "Parent explanation contains jargon - simplify",
        frameworkSource: "Project Play",
      };
    }

    // Check for development-focused language
    const developmentPatterns = /develop|grow|learn|progress|journey|improve/i;
    const hasDevelopment = developmentPatterns.test(explanation);

    return {
      score: hasDevelopment ? 5 : 4,
      weight: 0.06,
      notes: hasDevelopment
        ? "Clear, jargon-free, development-focused parent explanation"
        : "Good explanation, could emphasize development journey more",
      evidence: [explanation.substring(0, 150) + "..."],
      frameworkSource: "Project Play",
    };
  },
  getImprovementSuggestion: (score: ScoreLevel): string => {
    const suggestions: Record<ScoreLevel, string> = {
      1: "Add parentExplanation that describes this skill in plain language parents can understand.",
      2: "Expand explanation to at least 2-3 sentences. Explain why this skill matters for their child's development.",
      3: "Remove jargon and comparison language. Focus on individual development, not rankings.",
      4: "Emphasize the development journey and how parents can support learning at home.",
      5: "Excellent parent communication. Consider adding FAQs parents commonly ask.",
    };
    return suggestions[score];
  },
};

const homeActivitiesCriterion: CriterionDefinition = {
  name: "Home Activities",
  key: "homeActivities",
  weight: 0.06,
  description: "Practical, fun, appropriate hours for age?",
  frameworkSource: "EU Multi-Sport",
  evaluate: (content: unknown): CriterionScore => {
    const skill = asSkillContent(content);
    const guide = skill.comprehensiveGuide;

    if (!guide?.homeActivities || guide.homeActivities.length === 0) {
      return {
        score: 1,
        weight: 0.06,
        notes: "No home activities provided for parent engagement",
        frameworkSource: "EU Multi-Sport",
      };
    }

    if (guide.homeActivities.length < 3) {
      return {
        score: 2,
        weight: 0.06,
        notes: `Only ${guide.homeActivities.length} home activities - parents need variety`,
        frameworkSource: "EU Multi-Sport",
      };
    }

    // Check for practical/fun indicators
    const funPatterns = /fun|game|play|challenge|together|family/i;
    const funActivities = guide.homeActivities.filter((a) => funPatterns.test(a)).length;
    const funRatio = funActivities / guide.homeActivities.length;

    if (funRatio < 0.3) {
      return {
        score: 3,
        weight: 0.06,
        notes: "Home activities present but could be more fun-focused",
        frameworkSource: "EU Multi-Sport",
      };
    }

    return {
      score: funRatio > 0.5 ? 5 : 4,
      weight: 0.06,
      notes:
        funRatio > 0.5
          ? "Excellent practical, fun home activities for families"
          : "Good home activities with some fun elements",
      evidence: guide.homeActivities.slice(0, 3),
      frameworkSource: "EU Multi-Sport",
    };
  },
  getImprovementSuggestion: (score: ScoreLevel): string => {
    const suggestions: Record<ScoreLevel, string> = {
      1: "Add homeActivities array with simple activities parents can do with their child.",
      2: "Expand to at least 3-5 activities. Keep them simple and requiring minimal equipment.",
      3: "Make activities more fun and game-like. Avoid drill-like activities for home practice.",
      4: "Add more family-friendly activities that multiple people can do together.",
      5: "Excellent home activities. Consider adding time guidelines (e.g., '10 minutes, 3x/week').",
    };
    return suggestions[score];
  },
};

const assessmentGuidance: CriterionDefinition = {
  name: "Assessment Guidance",
  key: "assessmentGuidance",
  weight: 0.05,
  description: "Clear frequency respecting development timeline?",
  frameworkSource: "YPD Model",
  evaluate: (content: unknown): CriterionScore => {
    const skill = asSkillContent(content);
    const guide = skill.comprehensiveGuide;

    const hasFrequency = guide?.assessmentFrequency;
    const hasDuration = guide?.assessmentDuration;
    const hasContext = guide?.bestAssessedIn && guide.bestAssessedIn.length > 0;

    const components = [hasFrequency, hasDuration, hasContext].filter(Boolean).length;

    if (components === 0) {
      return {
        score: 1,
        weight: 0.05,
        notes: "No assessment guidance provided",
        frameworkSource: "YPD Model",
      };
    }

    if (components === 1) {
      return {
        score: 2,
        weight: 0.05,
        notes: "Minimal assessment guidance - missing key components",
        frameworkSource: "YPD Model",
      };
    }

    if (components === 2) {
      return {
        score: 3,
        weight: 0.05,
        notes: "Good assessment guidance but missing one component",
        frameworkSource: "YPD Model",
      };
    }

    // All components present
    return {
      score: 5,
      weight: 0.05,
      notes: "Complete assessment guidance with frequency, duration, and context",
      evidence: [
        guide?.assessmentFrequency || "",
        guide?.assessmentDuration || "",
        ...(guide?.bestAssessedIn || []).slice(0, 2),
      ].filter(Boolean),
      frameworkSource: "YPD Model",
    };
  },
  getImprovementSuggestion: (score: ScoreLevel): string => {
    const suggestions: Record<ScoreLevel, string> = {
      1: "Add assessmentFrequency, assessmentDuration, and bestAssessedIn fields.",
      2: "Complete the missing assessment guidance components.",
      3: "Add the missing component: frequency, duration, or best contexts for assessment.",
      4: "All components present. Consider adding notes about observation across multiple sessions.",
      5: "Excellent assessment guidance. Consider adding seasonal assessment recommendations.",
    };
    return suggestions[score];
  },
};

const holisticFocus: CriterionDefinition = {
  name: "Holistic Focus",
  key: "holisticFocus",
  weight: 0.05,
  description: "Addresses psychological/social alongside technical?",
  frameworkSource: "Danish ATDE",
  evaluate: (content: unknown): CriterionScore => {
    const skill = asSkillContent(content);
    const domain = skill.domain?.name?.toLowerCase() || "";

    // For psychological/social skills, this is inherently covered
    if (domain === "psychological") {
      return {
        score: 5,
        weight: 0.05,
        notes: "Skill is in psychological domain - holistic development core focus",
        frameworkSource: "Danish ATDE",
      };
    }

    // For technical/physical/tactical skills, check if psychological elements mentioned
    const allText = JSON.stringify(skill).toLowerCase();
    const psychPatterns = /confidence|resilience|teamwork|communication|mental|focus|mindset|attitude|effort|coachability/;
    const hasPsych = psychPatterns.test(allText);

    if (!hasPsych) {
      return {
        score: 2,
        weight: 0.05,
        notes: "Technical skill without psychological/social development connection",
        frameworkSource: "Danish ATDE",
      };
    }

    // Count psychological references
    const psychMatches = allText.match(new RegExp(psychPatterns, "g")) || [];

    return {
      score: psychMatches.length >= 3 ? 5 : psychMatches.length >= 1 ? 4 : 3,
      weight: 0.05,
      notes:
        psychMatches.length >= 3
          ? "Strong connection to psychological/social development"
          : "Some holistic elements present",
      frameworkSource: "Danish ATDE",
    };
  },
  getImprovementSuggestion: (score: ScoreLevel): string => {
    const suggestions: Record<ScoreLevel, string> = {
      1: "Add psychological/social connections even for technical skills (confidence when mastering, resilience when struggling).",
      2: "Include references to how learning this skill builds confidence, resilience, or teamwork.",
      3: "Expand psychological connections throughout the skill content.",
      4: "Add more explicit links between technical development and psychological growth.",
      5: "Excellent holistic approach connecting technical and psychological development.",
    };
    return suggestions[score];
  },
};

const completeness: CriterionDefinition = {
  name: "Completeness",
  key: "completeness",
  weight: 0.05,
  description: "All required fields populated?",
  frameworkSource: "—",
  evaluate: (content: unknown): CriterionScore => {
    const skill = asSkillContent(content);

    const requiredFields = [
      { name: "name", value: skill.name },
      { name: "description", value: skill.description },
      { name: "progressionLevels", value: skill.progressionLevels },
      { name: "observableBehaviors", value: skill.observableBehaviors },
      { name: "commonMistakes", value: skill.commonMistakes },
      { name: "coachingTips", value: skill.coachingTips },
      { name: "comprehensiveGuide", value: skill.comprehensiveGuide },
    ];

    const filledFields = requiredFields.filter(
      (f) => f.value !== null && f.value !== undefined && f.value !== ""
    ).length;
    const ratio = filledFields / requiredFields.length;

    const missingFields = requiredFields.filter(
      (f) => f.value === null || f.value === undefined || f.value === ""
    );

    if (ratio < 0.5) {
      return {
        score: 1,
        weight: 0.05,
        notes: `Only ${filledFields}/${requiredFields.length} required fields populated`,
        evidence: missingFields.map((f) => f.name),
      };
    }

    if (ratio < 0.7) {
      return {
        score: 2,
        weight: 0.05,
        notes: `Missing fields: ${missingFields.map((f) => f.name).join(", ")}`,
        evidence: missingFields.map((f) => f.name),
      };
    }

    if (ratio < 0.9) {
      return {
        score: 3,
        weight: 0.05,
        notes: `Most fields complete, missing: ${missingFields.map((f) => f.name).join(", ")}`,
        evidence: missingFields.map((f) => f.name),
      };
    }

    if (ratio < 1) {
      return {
        score: 4,
        weight: 0.05,
        notes: `Nearly complete, missing: ${missingFields.map((f) => f.name).join(", ")}`,
        evidence: missingFields.map((f) => f.name),
      };
    }

    return {
      score: 5,
      weight: 0.05,
      notes: "All required fields populated",
    };
  },
  getImprovementSuggestion: (score: ScoreLevel): string => {
    const suggestions: Record<ScoreLevel, string> = {
      1: "Many required fields missing. Populate: name, description, progressionLevels, observableBehaviors, commonMistakes, coachingTips, comprehensiveGuide.",
      2: "Fill in the missing required fields identified in the evidence.",
      3: "Complete the remaining missing fields for full content.",
      4: "Nearly complete - fill in the last missing field(s).",
      5: "All required fields are populated.",
    };
    return suggestions[score];
  },
};

const consistency: CriterionDefinition = {
  name: "Consistency",
  key: "consistency",
  weight: 0.04,
  description: "Terminology consistent throughout?",
  frameworkSource: "—",
  evaluate: (content: unknown): CriterionScore => {
    const skill = asSkillContent(content);
    const allText = JSON.stringify(skill).toLowerCase();

    // Check for inconsistent terminology patterns
    const inconsistentPatterns = [
      { terms: ["player", "athlete", "child", "kid"], name: "player reference" },
      { terms: ["coach", "instructor", "teacher"], name: "coach reference" },
      { terms: ["level", "stage", "phase"], name: "progression reference" },
    ];

    const inconsistencies: string[] = [];
    for (const pattern of inconsistentPatterns) {
      const found = pattern.terms.filter((t) => allText.includes(t));
      if (found.length > 2) {
        inconsistencies.push(`${pattern.name}: uses '${found.join("', '")}'`);
      }
    }

    if (inconsistencies.length >= 2) {
      return {
        score: 2,
        weight: 0.04,
        notes: "Multiple terminology inconsistencies found",
        evidence: inconsistencies,
      };
    }

    if (inconsistencies.length === 1) {
      return {
        score: 3,
        weight: 0.04,
        notes: "Minor terminology inconsistency",
        evidence: inconsistencies,
      };
    }

    return {
      score: 5,
      weight: 0.04,
      notes: "Consistent terminology throughout",
    };
  },
  getImprovementSuggestion: (score: ScoreLevel): string => {
    const suggestions: Record<ScoreLevel, string> = {
      1: "Standardize terminology throughout. Pick one term for players, coaches, and levels.",
      2: "Fix terminology inconsistencies. Use 'player' consistently, 'coach' consistently, 'level' consistently.",
      3: "Minor inconsistency - standardize the identified term usage.",
      4: "Good consistency with minor variations.",
      5: "Excellent terminology consistency throughout.",
    };
    return suggestions[score];
  },
};

const domainAlignment: CriterionDefinition = {
  name: "Domain Alignment",
  key: "domainAlignment",
  weight: 0.03,
  description: "Content matches skill domain?",
  frameworkSource: "—",
  evaluate: (content: unknown): CriterionScore => {
    const skill = asSkillContent(content);
    const domain = skill.domain?.name?.toLowerCase() || "";
    const allText = JSON.stringify(skill).toLowerCase();

    const domainKeywords: Record<string, RegExp> = {
      technical: /technique|form|execution|mechanics|control|touch|movement/,
      tactical: /decision|position|awareness|read|anticipate|strategy|space/,
      physical: /strength|speed|agility|endurance|power|fitness|conditioning/,
      psychological: /confidence|resilience|focus|mental|attitude|mindset|teamwork/,
    };

    const expectedPattern = domainKeywords[domain];
    if (!expectedPattern) {
      return {
        score: 3,
        weight: 0.03,
        notes: "Unknown domain - cannot verify alignment",
      };
    }

    const matches = allText.match(expectedPattern) || [];

    if (matches.length < 3) {
      return {
        score: 2,
        weight: 0.03,
        notes: `Content may not align well with ${domain} domain`,
      };
    }

    if (matches.length < 5) {
      return {
        score: 4,
        weight: 0.03,
        notes: `Good alignment with ${domain} domain`,
      };
    }

    return {
      score: 5,
      weight: 0.03,
      notes: `Strong alignment with ${domain} domain`,
    };
  },
  getImprovementSuggestion: (score: ScoreLevel): string => {
    const suggestions: Record<ScoreLevel, string> = {
      1: "Content doesn't match the assigned domain. Review and update.",
      2: "Add more domain-specific content. Technical skills need technique focus, tactical need decision-making, etc.",
      3: "Unclear domain alignment - add more domain-specific language.",
      4: "Good domain alignment. Consider adding more domain-specific coaching tips.",
      5: "Excellent domain alignment throughout content.",
    };
    return suggestions[score];
  },
};

// ============================================================================
// ANTI-PATTERNS (Automatic Score Reduction)
// ============================================================================

const antiPatterns: AntiPattern[] = [
  {
    pattern: "Rankings/comparisons for U12",
    penalty: 1.0,
    source: "Project Play",
    detectFn: (content: unknown): string | null => {
      const text = JSON.stringify(content).toLowerCase();
      const patterns = /rank|compare to peers|better than other|worse than other|behind peers|ahead of peers/i;
      if (patterns.test(text)) {
        return "Content includes ranking or comparison language";
      }
      return null;
    },
  },
  {
    pattern: "Punishment-based language",
    penalty: 1.0,
    source: "US AAP",
    detectFn: (content: unknown): string | null => {
      const text = JSON.stringify(content).toLowerCase();
      const patterns = /run laps|push-ups as punishment|burpees for mistake|sit out|benched for/i;
      if (patterns.test(text)) {
        return "Content includes punishment-based coaching";
      }
      return null;
    },
  },
  {
    pattern: "Win at all costs language",
    penalty: 1.0,
    source: "Double-Goal Coach",
    detectFn: (content: unknown): string | null => {
      const text = JSON.stringify(content).toLowerCase();
      const patterns = /win at all costs|winning is everything|must win|can't lose/i;
      if (patterns.test(text)) {
        return "Content includes 'win at all costs' mentality";
      }
      return null;
    },
  },
  {
    pattern: "No guiding questions",
    penalty: 0.5,
    source: "Constraints-Led",
    detectFn: (content: unknown): string | null => {
      const text = JSON.stringify(content);
      const questionCount = (text.match(/\?/g) || []).length;
      if (questionCount === 0) {
        return "No guiding questions found - all directive commands";
      }
      return null;
    },
  },
  {
    pattern: "Missing psychological domain",
    penalty: 0.5,
    source: "TDEQ-5",
    detectFn: (content: unknown): string | null => {
      const skill = asSkillContent(content);
      const domain = skill.domain?.name?.toLowerCase() || "";

      // Only apply to non-psychological skills
      if (domain === "psychological") return null;

      const text = JSON.stringify(content).toLowerCase();
      const psychPatterns = /confidence|resilience|teamwork|communication|mental|mindset/;
      if (!psychPatterns.test(text)) {
        return "Technical/tactical skill without psychological connection";
      }
      return null;
    },
  },
];

// ============================================================================
// BEST PRACTICES (Automatic Score Boost)
// ============================================================================

const bestPractices: BestPractice[] = [
  {
    practice: "Multi-sport benefits referenced",
    bonus: 0.25,
    source: "Project Play",
    detectFn: (content: unknown): string | null => {
      const text = JSON.stringify(content).toLowerCase();
      const patterns = /multi-sport|other sports|cross-training|transfer|applicable to/i;
      if (patterns.test(text)) {
        return "References benefits of multi-sport participation";
      }
      return null;
    },
  },
  {
    practice: "Self-assessment component",
    bonus: 0.25,
    source: "TDEQ-5",
    detectFn: (content: unknown): string | null => {
      const text = JSON.stringify(content).toLowerCase();
      const patterns = /self-assess|self-reflect|ask yourself|how do you think|rate yourself/i;
      if (patterns.test(text)) {
        return "Includes athlete self-assessment component";
      }
      return null;
    },
  },
  {
    practice: "Biological maturation addressed",
    bonus: 0.25,
    source: "YPD Model",
    detectFn: (content: unknown): string | null => {
      const text = JSON.stringify(content).toLowerCase();
      const patterns = /maturation|growth spurt|biological age|early developer|late developer/i;
      if (patterns.test(text)) {
        return "Addresses biological maturation differences";
      }
      return null;
    },
  },
  {
    practice: "Mentorship/role model suggestions",
    bonus: 0.25,
    source: "Danish ATDE",
    detectFn: (content: unknown): string | null => {
      const text = JSON.stringify(content).toLowerCase();
      const patterns = /mentor|role model|older players|watch professionals|learn from/i;
      if (patterns.test(text)) {
        return "Includes mentorship or role model suggestions";
      }
      return null;
    },
  },
  {
    practice: "Parent 'what NOT to do' guidance",
    bonus: 0.25,
    source: "PCA Research",
    detectFn: (content: unknown): string | null => {
      const text = JSON.stringify(content).toLowerCase();
      const patterns = /don't coach from sideline|avoid comparing|don't criticize|parents should not/i;
      if (patterns.test(text)) {
        return "Provides parent 'what NOT to do' guidance";
      }
      return null;
    },
  },
];

// ============================================================================
// EXPORT RUBRIC
// ============================================================================

export const skillsRubric: Rubric = {
  name: "Skills Rubric",
  contentType: "skill",
  criteria: [
    levelDifferentiation,
    observableBehaviors,
    ageStageAlignment,
    coachingTipsQuality,
    questionBasedCues,
    commonMistakesCriterion,
    assessmentActivitiesCriterion,
    redFlagsCriterion,
    parentExplanationCriterion,
    homeActivitiesCriterion,
    assessmentGuidance,
    holisticFocus,
    completeness,
    consistency,
    domainAlignment,
  ],
  antiPatterns,
  bestPractices,
};
