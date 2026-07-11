import type { APIRoute } from "astro";
// The planner is a fully self-contained HTML document (inline CSS/JS, no
// external requests, its own noindex meta) — served verbatim as an endpoint
// rather than wrapped in BaseLayout. Source of truth is the ops repo
// (marketing/data/tools/fall-fill-planner-deploy.html); on tool updates,
// re-copy the deploy build over src/assets/partners/.
import planner from "@/assets/partners/fall-fill-planner-deploy.html?raw";

// Unlisted partner tool: shared directly with the facility owner, never
// linked from nav or sitemap. Contains planning assumptions (ad caps,
// conversion priors) that are fine for the partner but not for public
// promotion — hence the belt-and-suspenders noindex header on top of the
// document's own meta tag.
export const GET: APIRoute = () =>
  new Response(planner, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
