/**
 * Benefit trio — why people play: fun, development, fitness.
 * Replaces operational stat/proof boxes (see design-system "Patterns").
 * Static content; no island needed — imported into index.astro without
 * a client directive. Plain function component rendered server-side.
 */
const BENEFITS = [
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
]

export default function BenefitTrio() {
  return (
    <section className="bg-paper border-y border-border">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16 py-12 lg:py-16 grid grid-cols-1 md:grid-cols-3 gap-8">
        {BENEFITS.map((b) => (
          <div key={b.title} className={`border-t-[3px] ${b.accent} pt-5`}>
            <h2 className="font-display italic text-2xl text-ink">{b.title}</h2>
            <p className="text-ink-muted mt-2 leading-relaxed">{b.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
