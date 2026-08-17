/**
 * Benefit trio — 3 columns, 3px coloured border-top, italic serif headline,
 * one supporting sentence. Documented pattern (design-system "Patterns");
 * replaces operational stat/proof boxes, because leading with tablestakes
 * (venues, refs, fees) is banned — those live in body copy.
 *
 * Static content, no island needed — import without a client directive.
 *
 * Accents follow the documented roles: primary/orange = adult, emerald =
 * youth, ochre = tertiary. A surface aimed at one audience should use that
 * audience's accent for all three columns rather than mixing.
 */

export interface Benefit {
  /** Tailwind border-top class, e.g. "border-t-emerald-600". */
  accent: string;
  title: string;
  body: string;
}

/** Mixed-audience default, used by the homepage. */
export const DEFAULT_BENEFITS: Benefit[] = [
  {
    accent: "border-t-primary",
    title: "Actually fun",
    body: "Post-game hangs, rivalries, people who notice when you're gone.",
  },
  {
    accent: "border-t-emerald-600",
    title: "You'll get better",
    body: "Real coaching for kids, competitive reps for adults.",
  },
  {
    accent: "border-t-ochre",
    title: "Fitness that sticks",
    body: "The workout you won't skip — your team is waiting.",
  },
];

export default function BenefitTrio({
  benefits = DEFAULT_BENEFITS,
}: {
  /** Omit for the mixed-audience default. */
  benefits?: Benefit[];
}) {
  return (
    <section className="bg-paper border-y border-border">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16 py-12 lg:py-16 grid grid-cols-1 md:grid-cols-3 gap-8">
        {benefits.map((b) => (
          <div key={b.title} className={`border-t-[3px] ${b.accent} pt-5`}>
            <h2 className="font-display italic text-2xl text-ink">{b.title}</h2>
            <p className="text-ink-muted mt-2 leading-relaxed">{b.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
