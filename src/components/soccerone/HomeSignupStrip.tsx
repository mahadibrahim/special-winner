"use client";

import { useState } from "react";

type Status = "idle" | "sending" | "done" | "error";

// Island styles itself — Astro scoped styles don't reach React islands.
const S = {
  strip: { background: "#101014", borderTop: "1px solid rgba(255,255,255,0.08)" } as React.CSSProperties,
  inner: {
    maxWidth: 1400,
    margin: "0 auto",
    padding: "2.5rem 2rem",
    display: "flex",
    alignItems: "center",
    gap: "2rem",
    flexWrap: "wrap",
  } as React.CSSProperties,
  text: { flex: 1, minWidth: 260 } as React.CSSProperties,
  title: {
    fontFamily: "var(--so-font-display)",
    fontSize: "1.75rem",
    lineHeight: 1,
    textTransform: "uppercase",
    letterSpacing: "0.01em",
    marginBottom: "0.375rem",
    color: "#fff",
  } as React.CSSProperties,
  sub: { fontSize: "0.9375rem", color: "rgba(255,255,255,0.45)" } as React.CSSProperties,
  form: { display: "flex", gap: "0.625rem", flexWrap: "wrap", alignItems: "center" } as React.CSSProperties,
  input: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 6,
    color: "#fff",
    fontFamily: "var(--so-font-body)",
    fontSize: "0.9375rem",
    padding: "0.8rem 1.1rem",
    width: 260,
    maxWidth: "100%",
  } as React.CSSProperties,
  btn: {
    background: "var(--so-lime)",
    color: "#0a0a0d",
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--so-font-body)",
    fontSize: "0.9375rem",
    fontWeight: 700,
    letterSpacing: "0.03em",
    padding: "0.8rem 1.5rem",
    borderRadius: 6,
  } as React.CSSProperties,
  or: {
    fontFamily: "var(--so-font-mono)",
    fontSize: "0.625rem",
    letterSpacing: "0.08em",
    color: "rgba(255,255,255,0.35)",
  } as React.CSSProperties,
  wa: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    border: "1.5px solid rgba(37,211,102,0.5)",
    color: "#4ade80",
    fontSize: "0.875rem",
    fontWeight: 600,
    textDecoration: "none",
    padding: "0.7rem 1.25rem",
    borderRadius: 6,
  } as React.CSSProperties,
  note: { width: "100%", fontSize: "0.8125rem", marginTop: "0.25rem" } as React.CSSProperties,
};

export default function HomeSignupStrip() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || status === "sending") return;
    setStatus("sending");
    try {
      const res = await fetch("/api/public/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, brand: "soccerone", source: "home-strip" }),
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section style={S.strip} data-testid="signup-strip">
      <div style={S.inner}>
        <div style={S.text}>
          <div style={S.title}>Never miss a kickoff.</div>
          <p style={S.sub}>
            Schedules, open-spot alerts, and a welcome code — plus first word when futsal opens.
          </p>
        </div>
        {status === "done" ? (
          <p style={{ ...S.note, color: "var(--so-lime)", width: "auto" }}>
            You're in — check your inbox for the welcome code.
          </p>
        ) : (
          <form style={S.form} onSubmit={submit}>
            <input
              type="email"
              required
              style={S.input}
              placeholder="you@email.com"
              aria-label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" style={S.btn} disabled={status === "sending"}>
              {status === "sending" ? "Signing up…" : "Sign Up"}
            </button>
            <span style={S.or}>OR</span>
            <a href="/join?src=home-whatsapp" style={S.wa}>
              Join on WhatsApp
            </a>
            {status === "error" && (
              <span style={{ ...S.note, color: "#fda4af" }}>
                That didn't go through — try again, or use the WhatsApp option.
              </span>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
