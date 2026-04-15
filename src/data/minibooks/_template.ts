/**
 * Mini-Book Template
 * Copy this file and rename to [sport]-[skill].ts
 *
 * See DESIGN-SYSTEM.md for full documentation
 */

export const templateMiniBook = {
  // ===========================================
  // META
  // ===========================================
  meta: {
    title: 'The Path to Better [Skill]',
    subtitle: 'A Guide for Parents and Coaches',
    sport: '[sport]', // soccer, basketball, hockey, baseball
    skill: '[skill]', // dribbling, passing, shooting, etc.
  },

  // ===========================================
  // INTRODUCTION
  // ===========================================
  introduction: {
    hook: 'Opening hook that captures attention and establishes the promise of the guide...',
    promise:
      'What readers will learn and why it matters. This appears in the TOC section.',
    whatMakesThisDifferent: [
      'Evidence-based approach grounded in motor learning research',
      'Age-appropriate progressions based on developmental science',
      'Practical activities parents can do at home',
      'Focus on long-term development over short-term results',
    ],
  },

  // ===========================================
  // PART ONE: SCIENCE FOUNDATION
  // ===========================================
  scienceFoundation: {
    title: 'Part One: The Science of [Skill]',
    subtitle: 'What research tells us about how children learn',
    sections: [
      {
        title: 'Section Title',
        content: `Main content paragraphs here.

Second paragraph continues the discussion.

Use **bold** for emphasis.`,
        keyResearch: {
          finding: 'Key research finding quoted here',
          citation: 'Author et al. (Year). Journal Name, Volume(Issue), Pages.',
        },
        parentTakeaway: 'Practical takeaway for parents in one sentence.',
        implications: [
          'Implication 1',
          'Implication 2',
          'Implication 3',
        ],
        // Optional: practicalExample, forDribbling, balanceGuideline, etc.
      },
      // Add 3-5 sections covering key science topics
    ],
  },

  // ===========================================
  // PART TWO: MENTAL GAME
  // ===========================================
  mentalGame: {
    title: 'Part Two: The Mental Game',
    subtitle: 'Building the mindset for success',
    introduction: 'Introduction paragraph for this part...',
    sections: [
      {
        title: 'Section Title',
        content: 'Content here...',
        keyResearch: {
          finding: 'Research finding',
          citation: 'Citation',
        },
        // Optional: parentCoachBehaviors, confidenceProgression, etc.
      },
      // Add 2-4 sections on mental aspects
    ],
  },

  // ===========================================
  // PART THREE: TACTICAL AWARENESS
  // ===========================================
  tacticalAwareness: {
    title: 'Part Three: Reading the Game',
    subtitle: 'When and where to apply the skill',
    introduction: 'Introduction paragraph...',
    sections: [
      {
        title: 'Section Title',
        content: 'Content here...',
        // Optional: decisionTree, scanningDevelopment, zones, etc.
      },
      // Add 2-4 sections on tactical aspects
    ],
  },

  // ===========================================
  // PART FOUR: TECHNICAL PROGRESSION
  // ===========================================
  technicalProgression: {
    title: 'Part Four: The Practice',
    subtitle: 'Age-appropriate activities and progressions',
    introduction: 'Introduction paragraph...',
    stages: [
      {
        name: 'Foundation Stage',
        ages: 'Ages 4-6',
        focus: 'Main focus for this age group',
        researchBasis: 'Research citation supporting this approach',
        principles: [
          'Principle 1',
          'Principle 2',
          'Principle 3',
        ],
        activities: [
          {
            name: 'Activity Name',
            time: '5-10 min',
            description: 'How to run the activity',
            focus: 'What skill aspect this develops',
            externalCue: 'What to say to players (external focus)',
            variation: 'How to make it easier/harder',
            coachingNote: 'Important note for coaches',
          },
          // Add 3-5 activities per stage
        ],
        parentHomeActivities: [
          'Activity parents can do at home',
        ],
        signsOfProgress: [
          'Observable sign of development',
        ],
      },
      // Add 3-4 stages: Foundation (4-6), Development (7-9), Skill (10-12), Refinement (13+)
    ],
  },

  // ===========================================
  // PART FIVE: PARENT GUIDE
  // ===========================================
  parentGuide: {
    title: "Part Five: The Parent's Role",
    subtitle: 'How to support without undermining',
    introduction: 'Introduction paragraph...',
    sections: [
      {
        title: 'What to Do',
        items: [
          {
            action: 'Action title',
            why: 'Why this matters',
            how: 'How to do it',
          },
          // Add 4-6 positive actions
        ],
      },
      {
        title: 'What to Avoid',
        items: [
          {
            behavior: 'Behavior to avoid',
            why: 'Why it hurts development',
            alternative: 'What to do instead',
          },
          // Add 4-6 behaviors to avoid
        ],
      },
      // Add sections for conversations, home practice, etc.
    ],
  },

  // ===========================================
  // RESOURCES
  // ===========================================
  resources: {
    booksForParents: [
      {
        title: 'Book Title',
        author: 'Author Name',
        relevance: 'Why this book is relevant',
      },
      // Add 4-6 books
    ],
    booksForCoaches: [
      {
        title: 'Book Title',
        author: 'Author Name',
        relevance: 'Why this book is relevant',
      },
      // Add 4-6 books
    ],
    academicReferences: [
      'Full APA citation 1',
      'Full APA citation 2',
      // Add all citations used in the content
    ],
  },

  // ===========================================
  // INTERLUDES: PLAYER STORIES
  // ===========================================
  playerStories: [
    {
      title: 'Story Title',
      subtitle: 'Player Name and Theme',
      placement: 'after-science', // after-science, after-mental, in-progression
      content: `Story content in multiple paragraphs.

Continue the narrative here.`,
      image: null, // Future: path to image
      quote: {
        text: 'Memorable quote from the player',
        attribution: 'Player Name',
      },
    },
    {
      title: 'Second Story',
      subtitle: 'Another Player',
      placement: 'after-mental',
      content: 'Story content...',
      image: null,
      quote: {
        text: 'Quote',
        attribution: 'Player',
      },
    },
    {
      title: 'Third Story',
      subtitle: 'Third Player',
      placement: 'in-progression',
      content: 'Story content...',
      image: null,
      quote: {
        text: 'Quote',
        attribution: 'Player',
      },
    },
  ],

  // ===========================================
  // INTERLUDES: COACH WISDOM
  // ===========================================
  coachWisdom: [
    {
      title: 'Wisdom Title',
      coach: 'Coach Name',
      role: 'Team/Organization, Notable Achievement',
      placement: 'after-science',
      content: `Coach's insight and philosophy.

Continue with more detail.`,
      quote: {
        text: 'Memorable coaching quote',
        attribution: 'Coach Name',
      },
      keyPrinciple: 'One-sentence principle to remember',
    },
    {
      title: 'Second Wisdom',
      coach: 'Coach Name',
      role: 'Role',
      placement: 'after-mental',
      content: 'Content...',
      quote: {
        text: 'Quote',
        attribution: 'Coach',
      },
      keyPrinciple: 'Principle',
    },
    {
      title: 'Third Wisdom',
      coach: 'Coach Name',
      role: 'Role',
      placement: 'in-progression',
      content: 'Content...',
      quote: {
        text: 'Quote',
        attribution: 'Coach',
      },
      keyPrinciple: 'Principle',
    },
  ],
};
