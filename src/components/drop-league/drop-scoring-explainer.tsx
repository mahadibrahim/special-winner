/**
 * Static visual component showing how Drop League scoring works.
 * Illustrates: Pitch Goals + Drop Goals = Final Score, using a match-card mockup.
 * No real data — purely illustrative.
 */
export function DropScoringExplainer() {
  return (
    <div className="max-w-3xl mx-auto">
      {/* Equation header */}
      <div className="flex items-center justify-center gap-3 flex-wrap mb-10 text-center">
        <div className="flex flex-col items-center">
          <span className="text-4xl font-display text-ink font-bold">2</span>
          <span className="text-xs font-semibold uppercase tracking-widest text-ink-muted mt-1">Pitch Goals</span>
        </div>
        <span className="text-2xl text-ink-muted font-light">+</span>
        <div className="flex flex-col items-center">
          <span className="text-4xl font-display text-primary-orange font-bold">4</span>
          <span className="text-xs font-semibold uppercase tracking-widest text-primary-orange mt-1">Drop Goals</span>
        </div>
        <span className="text-2xl text-ink-muted font-light">=</span>
        <div className="flex flex-col items-center">
          <span className="text-4xl font-display text-ink font-bold">6</span>
          <span className="text-xs font-semibold uppercase tracking-widest text-ink-muted mt-1">Final Score</span>
        </div>
      </div>

      {/* Match card mockup */}
      <div className="rounded-xl border border-border bg-paper shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="bg-ink px-6 py-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-cream/60">
            Drop League · Week 6 · Men&apos;s Division
          </span>
          <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary-orange">
            Final
          </span>
        </div>

        {/* Scores grid */}
        <div className="grid grid-cols-3 divide-x divide-border">
          {/* Home team */}
          <div className="px-6 py-6 text-center">
            <p className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">The Bolthorns</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">Pitch</span>
                <span className="font-mono font-bold text-ink">2</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-primary-orange font-medium">Drop Goals</span>
                <span className="font-mono font-bold text-primary-orange">4</span>
              </div>
              <div className="border-t border-border pt-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">Total</span>
                <span className="font-mono text-xl font-bold text-ink">6</span>
              </div>
            </div>
          </div>

          {/* VS divider */}
          <div className="flex items-center justify-center bg-cream-2 px-4 py-6">
            <span className="text-ink-muted text-sm font-semibold">vs</span>
          </div>

          {/* Away team */}
          <div className="px-6 py-6 text-center">
            <p className="text-sm font-semibold text-ink-muted uppercase tracking-wide mb-3">FC Prestige</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-muted">Pitch</span>
                <span className="font-mono font-bold text-ink">4</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-primary-orange font-medium">Drop Goals</span>
                <span className="font-mono font-bold text-primary-orange">1</span>
              </div>
              <div className="border-t border-border pt-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">Total</span>
                <span className="font-mono text-xl font-bold text-ink">5</span>
              </div>
            </div>
          </div>
        </div>

        {/* Result callout */}
        <div className="bg-cream-2 border-t border-border px-6 py-4">
          <p className="text-sm text-ink-muted text-center">
            The Bolthorns win <span className="font-semibold text-ink">6–5</span> — despite trailing{" "}
            <span className="font-semibold text-ink">2–4</span> on the pitch.
            Four Drop Goals sealed it.
          </p>
        </div>
      </div>

      {/* How Drop Goals are earned */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-cream-2 px-4 py-5">
          <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary-orange mb-2">Team Bonus</p>
          <p className="text-sm text-ink-muted">
            0.5 Drop Goal per player who recorded a loss that week — up to 5/match.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-cream-2 px-4 py-5">
          <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary-orange mb-2">Milestones</p>
          <p className="text-sm text-ink-muted">
            Hit 5% or 10% from your season-start weight and earn a one-time +3 Drop Goal bonus.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-cream-2 px-4 py-5">
          <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary-orange mb-2">Hat-Trick</p>
          <p className="text-sm text-ink-muted">
            Three weeks of progress (non-consecutive) earns +1 Drop Goal. Up to 4 per season.
          </p>
        </div>
      </div>

      <p className="text-xs text-ink-muted text-center mt-4">
        Drop Goals are calculated automatically from weigh-in data. Coaches enter only the pitch score.
      </p>
    </div>
  );
}
