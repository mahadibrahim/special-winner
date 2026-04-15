# Minibook Design System

**Evidence-Based Youth Development Series**
Print-first design optimized for Amazon KDP, Lulu Direct, and Gumroad PDF

---

## Page Specifications

| Property | Value | Notes |
|----------|-------|-------|
| Trim Size | 6" × 9" | Standard KDP trade paperback |
| Inside Margin | 0.875" | Larger for binding gutter |
| Outside Margin | 0.625" | Standard |
| Top Margin | 0.75" | |
| Bottom Margin | 0.875" | Room for page numbers |

---

## Typography

### Font Stack

| Role | Font | Fallbacks | Usage |
|------|------|-----------|-------|
| Display | Crimson Pro | Georgia, Times New Roman | Titles, headings, drop caps |
| Body | Source Serif 4 | Georgia | Body text, quotes |
| Mono | JetBrains Mono | SF Mono, Consolas | Labels, citations, code |

### Type Scale (in points)

| Element | Size | Weight | Notes |
|---------|------|--------|-------|
| Book Title | 36pt | 700 | Cover page |
| Part Title | 28pt | 700 | Chapter dividers |
| Section Title | 16pt | 700 | Within chapters |
| Subsection | 11pt | 700 | Cards, boxes |
| Body | 10.5pt | 400 | Main text |
| Small | 9pt | 400 | Cards, lists |
| Tiny | 8pt | 400 | Citations, labels |
| Labels | 7pt | 700 | Uppercase, tracked |

### Line Heights

- Body text: 1.58 (comfortable reading)
- Tight (headings): 1.25
- Lists/cards: 1.45

### OpenType Features

```css
font-feature-settings: 'kern' 1, 'liga' 1, 'calt' 1, 'onum' 1;
```

---

## Color Palette

### Ink Colors (Print-Safe)

| Name | Hex | Usage |
|------|-----|-------|
| Ink Black | #1a1a1a | Primary text |
| Ink Dark | #2d2d2d | Secondary text |
| Ink Medium | #4a4a4a | Tertiary text |
| Ink Light | #6b6b6b | Captions |
| Ink Muted | #8a8a8a | Page numbers |

### Paper Colors

| Name | Hex | Usage |
|------|-----|-------|
| Paper White | #ffffff | Background |
| Paper Cream | #faf8f5 | Boxes, cards |
| Paper Warm | #f5f3f0 | Alternate backgrounds |

### Sport Accents

Each sport has a primary accent color that works well in both color and B&W printing:

| Sport | Primary | Light | Notes |
|-------|---------|-------|-------|
| Soccer | #1a5f2a | #e8f2ea | Dark green |
| Basketball | #b35a00 | #fff3e6 | Dark orange |
| Hockey | #1a3d5c | #e6f0f7 | Dark blue |
| Baseball | #8b1a1a | #f8e8e8 | Dark red |

### Semantic Colors

| Purpose | Color | Background |
|---------|-------|------------|
| Positive/Do | #1a5f2a | #e8f2ea |
| Negative/Avoid | #8b1a1a | #f8e8e8 |
| Highlight | #d4a853 | #f5e6c8 |

---

## Layout Components

### Cover Page

```
┌─────────────────────────────┐
│ ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ │ ← 4pt accent bar
│                             │
│ [Logo]     [Series Label]   │ ← Header row
│ ─────────────────────────── │
│                             │
│                             │
│        — SOCCER —           │ ← Sport indicator
│                             │
│     The Path to Better      │ ← Title (36pt)
│        Dribbling            │
│                             │
│   A Guide for Parents       │ ← Subtitle (italic)
│                             │
│                             │
│ ┌─────────────────────────┐ │
│ │   "Hook quote here..."  │ │ ← Tagline box
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

### Chapter Divider

```
┌─────────────────────────────┐
│              │              │ ← Decorative rule
│              │              │
│                             │
│         PART ONE            │ ← Label (mono, 8pt)
│                             │
│     The Science of          │ ← Title (28pt)
│        Learning             │
│                             │
│   Understanding how youth   │ ← Subtitle (italic)
│    develop skills           │
│                             │
│        ──── ✦ ────          │ ← Ornament
│                             │
└─────────────────────────────┘
```

### Research Box

```
┌─────────────────────────────┐
│ ▌ RESEARCH FINDING          │ ← Left border (2pt)
│ ▌                           │
│ ▌ "Quote from research..."  │ ← Italic
│ ▌                           │
│ ▌ — Author, Year            │ ← Citation (mono, tiny)
└─────────────────────────────┘
```

### Comparison Box

```
┌────────────┬────────────────┐
│ TRADITIONAL│ EVIDENCE-BASED │
│ (red bg)   │ (green bg)     │
├────────────┴────────────────┤
│ Why it works: explanation   │ ← Cream background
└─────────────────────────────┘
```

### Interlude: Player Story

```
════════════════════════════════ ← Gold top border (2pt)
│ PLAYER STORY                 │
│                              │
│ The Boy from Rosario         │ ← Title (15pt)
│ Lionel Messi and Close...    │ ← Subtitle (italic)
│                              │
│ Story content here...        │
│                              │
│ ┌──────────────────────────┐ │
│ │▌ "Quote from player..."  │ │ ← Quote box
│ │▌ — Player Name           │ │
│ └──────────────────────────┘ │
════════════════════════════════ ← Gold bottom border
```

### Interlude: Coach Wisdom

```
▌ COACH'S WISDOM               │ ← Green left border (4pt)
▌                              │
▌ Creating Dribblers           │ ← Title (15pt)
▌ Coach Name — Role            │ ← Role (mono)
▌                              │
▌ Content here...              │
▌                              │
▌ ┌──────────────────────────┐ │
▌ │▌ "Quote..."              │ │
▌ └──────────────────────────┘ │
▌                              │
▌ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
▌ │ KEY PRINCIPLE            │ │ ← Dashed border
▌ │ The main takeaway...     │ │
▌ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
```

---

## Content Guidelines

### No Emojis

Emojis don't render reliably in print. Use these alternatives:

| Instead of | Use |
|------------|-----|
| ⚽ 🏀 🏒 ⚾ | Text: "Soccer", "Basketball", etc. |
| 🔬 🧠 👁️ | Typographic ornament: ✦ |
| ✓ | Text: "✓" or checkmark character |
| ✗ | Text: "✗" or × character |
| 📚 | Label text: "RESEARCH FINDING" |

### Drop Caps

First paragraph of each main section gets a drop cap:
- Font: Crimson Pro
- Size: 42pt
- Color: Sport accent
- Float left with right padding

### Text Treatment

- Body text: Justified with hyphenation
- Lists: Left-aligned
- Quotes: Italic
- Citations: Mono, small, muted color

---

## Page Break Rules

### Always Break Before

- Chapter dividers (`section-divider`)
- Cover page
- Back cover

### Always Break After

- Chapter dividers
- Table of contents

### Avoid Breaking Inside

- Research boxes
- Activity cards
- Stage sections
- Interludes
- Do/Avoid items
- Tables

---

## File Structure

```
src/
├── data/minibooks/
│   ├── DESIGN-SYSTEM.md      ← This file
│   ├── soccer-dribbling.ts   ← Content data
│   ├── soccer-passing.ts
│   └── [sport]-[skill].ts    ← Future minibooks
├── pages/minibooks/
│   ├── soccer-dribbling.astro ← Page template
│   ├── soccer-passing.astro
│   └── [sport]-[skill].astro
└── styles/
    ├── minibook.css          ← Main styles
    └── print-guide.css       ← Shared print vars
```

---

## Creating a New Minibook

### 1. Create Data File

```typescript
// src/data/minibooks/[sport]-[skill].ts
export const [skill]MiniBook = {
  meta: {
    title: "The Path to Better [Skill]",
    subtitle: "A Guide for Parents and Coaches",
    sport: "[sport]",
    skill: "[skill]",
  },
  introduction: {
    hook: "Opening hook quote...",
    promise: "What readers will learn...",
    whatMakesThisDifferent: ["Point 1", "Point 2", "Point 3"],
  },
  scienceFoundation: { /* ... */ },
  mentalGame: { /* ... */ },
  tacticalAwareness: { /* ... */ },
  technicalProgression: { /* ... */ },
  parentGuide: { /* ... */ },
  resources: { /* ... */ },
  playerStories: [ /* 3 stories with placements */ ],
  coachWisdom: [ /* 3 coach insights with placements */ ],
};
```

### 2. Create Page File

Copy `soccer-dribbling.astro` and update:
- Import path
- Sport icon text
- TOC descriptions
- Back cover tagline

### 3. Sport-Specific Colors

Add CSS variables for new sports in `minibook.css`:

```css
.guide-basketball {
  --accent-primary: #b35a00;
  --accent-light: #fff3e6;
}
```

---

## Print Testing Checklist

- [ ] Open in browser at `/minibooks/[sport]-[skill]`
- [ ] Print to PDF (Cmd+P → Save as PDF)
- [ ] Check page breaks fall correctly
- [ ] Verify no orphaned headings
- [ ] Confirm drop caps render
- [ ] Test at actual 6×9 size
- [ ] Review in grayscale for B&W printing
- [ ] Check all text is readable at print size

---

## Platform-Specific Notes

### Amazon KDP

- Interior type: Fixed-layout PDF
- Bleed: Not required for this design (no edge-to-edge color)
- Cover: Separate file, 6.125" × 9.25" with bleed

### Lulu Direct

- Supports 6×9 trade paperback
- Can do color or B&W interior
- Higher quality paper options

### Gumroad (Digital)

- PDF optimized for screen reading
- Consider adding clickable TOC links
- Embedded fonts for consistency

---

*Last updated: January 2026*
