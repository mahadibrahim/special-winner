"use client";
import { useInterestCapture } from "@/lib/hooks/use-interest-capture";

/**
 * SoccerOne-skinned "email me when it opens" capture. The Aspire twin is
 * components/leagues/interest-capture.tsx — same hook, different shell.
 * Behaviour changes go in useInterestCapture / interestRequestFor so both
 * brands move together.
 *
 * Styles are embedded (Astro scoped styles don't reach React islands —
 * that gap has caused a prod incident before) and reference only --so-*
 * tokens per soccerone-tokens.css rules.
 */
export default function SoccerOneInterestCapture({ seasonId, source, title, subtitle }: {
  seasonId?: string;
  source: string;
  title: string;
  subtitle?: string;
}) {
  const { email, setEmail, status, submit } = useInterestCapture({
    seasonId,
    brand: "soccerone",
    source,
  });

  return (
    <div className="so-icap" data-testid={status === "done" ? "interest-done" : "interest-capture"}>
      <style>{`
        .so-icap { border: 1px solid var(--so-lime-a25); border-radius: var(--so-radius-lg); background: var(--so-lime-a04); padding: 1.25rem; }
        .so-icap-t { font-family: var(--so-font-display); font-size: 1.25rem; color: #fff; text-transform: uppercase; letter-spacing: 0.01em; }
        .so-icap-s { font-size: 0.8125rem; color: rgba(255,255,255,0.45); margin-top: 0.25rem; }
        .so-icap-f { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.75rem; }
        .so-icap-i { flex: 1; min-width: 190px; background: var(--so-ink); border: 1px solid var(--so-lime-a20); border-radius: var(--so-radius-sm); padding: 0.6rem 0.8rem; color: #fff; font-family: var(--so-font-mono); font-size: 0.8rem; }
        .so-icap-i::placeholder { color: rgba(255,255,255,0.3); }
        .so-icap-i:focus { outline: none; border-color: var(--so-lime-a50); }
        .so-icap-b { background: var(--so-lime); color: var(--so-ink); font-family: var(--so-font-body); font-size: 0.8125rem; font-weight: 700; letter-spacing: 0.04em; border: none; border-radius: var(--so-radius-sm); padding: 0.6rem 1.1rem; cursor: pointer; }
        .so-icap-b:hover { background: var(--so-lime-bright); }
        .so-icap-b:disabled { opacity: 0.6; cursor: default; }
        .so-icap-err { font-size: 0.75rem; color: var(--so-amber); margin-top: 0.4rem; }
        .so-icap-done-t { font-family: var(--so-font-display); font-size: 1.15rem; color: var(--so-lime); text-transform: uppercase; }
        .so-icap-done-s { font-size: 0.8125rem; color: rgba(255,255,255,0.5); margin-top: 0.25rem; }
      `}</style>
      {status === "done" ? (
        <>
          <div className="so-icap-done-t">You're on the list.</div>
          <p className="so-icap-done-s">We'll email you the day registration opens — nothing else.</p>
        </>
      ) : (
        <form onSubmit={submit}>
          <div className="so-icap-t">{title}</div>
          {subtitle && <p className="so-icap-s">{subtitle}</p>}
          <div className="so-icap-f">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              aria-label="Email address"
              className="so-icap-i"
            />
            <button type="submit" disabled={status === "sending"} className="so-icap-b">
              {status === "sending" ? "Sending…" : "Notify me"}
            </button>
          </div>
          {status === "error" && (
            <p className="so-icap-err" role="alert">That didn't go through — check the address and try again.</p>
          )}
        </form>
      )}
    </div>
  );
}
