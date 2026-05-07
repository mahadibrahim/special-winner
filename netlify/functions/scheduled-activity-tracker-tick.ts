/**
 * Netlify Scheduled Function — runs runActivityTrackerTick every 5 minutes.
 *
 * Cron schedule "*\/5 * * * *" matches the cadence the dispatch logic
 * was tuned for: pre_reminder fires 15min ahead, overdue_alert 15min
 * after, escalation 60min after — a 5-minute tick gives us at most a
 * 5-minute slip in either direction.
 *
 * Returns 200 on success and 500 on uncaught error so Netlify's logs
 * surface failures without retrying (the next tick is 5 minutes away,
 * which is the desired backoff).
 */
import { schedule } from "@netlify/functions";
import { runActivityTrackerTick } from "../../src/lib/activity-tracking/tick";

export const handler = schedule("*/5 * * * *", async () => {
  try {
    const result = await runActivityTrackerTick();
    console.info(
      `[scheduled-activity-tracker-tick] processed=${result.processed} fired=${result.fired} errors=${result.errors}`,
    );
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (err) {
    console.error("[scheduled-activity-tracker-tick]", err);
    return {
      statusCode: 500,
      body: err instanceof Error ? err.message : String(err),
    };
  }
});
