"use client";
import { useState } from "react";
import { interestRequestFor, type InterestRequestInput } from "@/lib/marketing/interest-request";

export type InterestStatus = "idle" | "sending" | "done" | "error";

/**
 * Submission state machine for the "email me when it opens" capture.
 * Endpoint choice lives in interestRequestFor (pure, unit-tested); this hook
 * only owns fetch + status. Both brand shells consume it so the behaviour
 * can never fork between Aspire and SoccerOne.
 */
export function useInterestCapture(slot: Omit<InterestRequestInput, "email">) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<InterestStatus>("idle");

  async function submit(e?: { preventDefault(): void }) {
    e?.preventDefault();
    if (!email || status === "sending" || status === "done") return;
    setStatus("sending");
    try {
      const req = interestRequestFor({ ...slot, email });
      const res = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return { email, setEmail, status, submit };
}
