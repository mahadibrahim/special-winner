/**
 * Netlify Scheduled Function — expires drop-in pending-claim rows whose
 * promotion window has elapsed and promotes the next waitlister on each
 * affected session. Runs every 5 minutes — matches the cadence we use
 * for the activity-tracker tick (15-min reminder windows mean a 5-min
 * tick gives at most a 5-min slip in either direction).
 *
 * Returns 200 on success, 500 on uncaught error so Netlify's logs
 * surface failures without retrying — the next tick is 5 minutes away.
 */
import { schedule } from "@netlify/functions";
import { expireOverduePromotions } from "../../src/lib/dropin/promotion";

export const handler = schedule("*/5 * * * *", async () => {
  try {
    const result = await expireOverduePromotions();
    console.info(
      `[scheduled-expire-pending-claims] expired=${result.expired} promotedNext=${result.promotedNext}`,
    );
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error("[scheduled-expire-pending-claims]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
