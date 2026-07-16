// Request builder for every "email me when it opens" capture slot, both brands.
// Pure — no fetch, no React — so the endpoint-selection rule is unit-testable.
//
// Two backends, split deliberately:
//  - A specific forming season → POST /api/public/season-interest.
//    Per-division interest list; the server enforces status='forming' and
//    tenant ownership, and 404s anything else. Payload is exactly
//    { seasonId, email } — brand/source stay out of it.
//  - No specific season (a finder that filtered to zero results) → POST
//    /api/public/newsletter with a source tag. There is nothing to point
//    season-interest at, and it would 404; the newsletter list with a
//    per-slot source is the honest destination (same path the SoccerOne
//    home strip already uses).

export interface InterestRequestInput {
  /** Present → per-season interest; absent → general newsletter capture. */
  seasonId?: string;
  email: string;
  brand: "aspire" | "soccerone";
  /** Slot tag for the newsletter path, e.g. "leagues-empty-state". */
  source: string;
}

export interface InterestRequest {
  url: string;
  method: "POST";
  headers: { "Content-Type": "application/json" };
  body: string;
}

export function interestRequestFor(input: InterestRequestInput): InterestRequest {
  const base = {
    method: "POST" as const,
    headers: { "Content-Type": "application/json" as const },
  };
  if (input.seasonId) {
    return {
      ...base,
      url: "/api/public/season-interest",
      body: JSON.stringify({ seasonId: input.seasonId, email: input.email }),
    };
  }
  return {
    ...base,
    url: "/api/public/newsletter",
    body: JSON.stringify({ email: input.email, brand: input.brand, source: input.source }),
  };
}
