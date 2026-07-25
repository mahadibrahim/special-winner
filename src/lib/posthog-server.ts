import { PostHog } from "posthog-node";

export interface PostHogServerEnv {
  token?: string;
  host?: string;
  e2eTestEndpoints?: string;
  nodeEnv?: string;
}

export interface PostHogServerConfig {
  token: string;
  host: string | undefined;
  enabled: boolean;
}

/**
 * Decide whether server-side capture should be live. Test runs are detected
 * via E2E_TEST_ENDPOINTS (set by CI and local API-test dev servers) and
 * NODE_ENV=test — before this guard existed, test runs with a prod token in
 * .env flooded prod PostHog with @test.aspiresports.com events (~95% of all
 * server-side volume until 2026-06-15).
 */
export function resolvePostHogServerConfig(env: PostHogServerEnv): PostHogServerConfig {
  const token = env.token ?? "";
  const isTestRun = env.e2eTestEndpoints === "yes" || env.nodeEnv === "test";
  return { token, host: env.host, enabled: token.length > 0 && !isTestRun };
}

let posthogClient: PostHog | null = null;

/**
 * Get the PostHog server-side client.
 * Uses a singleton pattern to avoid creating multiple clients.
 *
 * Env is read process.env-first: import.meta.env is inlined at BUILD time on
 * Netlify, so a value rotated or added in the dashboard after the build reads
 * as undefined through import.meta.env (this broke Zernio SMS, PR #409).
 * When capture is off (no token, or a test run) the client is created
 * disabled — call sites can capture unconditionally.
 */
export function getPostHogServer(): PostHog {
  if (!posthogClient) {
    const config = resolvePostHogServerConfig({
      token: process.env.POSTHOG_PROJECT_TOKEN || import.meta.env.POSTHOG_PROJECT_TOKEN,
      host: process.env.POSTHOG_HOST || import.meta.env.POSTHOG_HOST,
      e2eTestEndpoints: process.env.E2E_TEST_ENDPOINTS,
      nodeEnv: process.env.NODE_ENV,
    });
    // posthog-node rejects an empty api key; the placeholder is never sent
    // because the client is disabled whenever the real token is absent.
    posthogClient = new PostHog(config.token || "phc_disabled", {
      host: config.host,
      flushAt: 1,
      flushInterval: 0,
    });
    if (!config.enabled) {
      void posthogClient.disable();
    }
  }
  return posthogClient;
}

/**
 * Await delivery of any captured-but-unsent events. Serverless platforms
 * freeze the function instance as soon as the response is returned, which
 * can drop in-flight capture requests — await this before returning from
 * routes whose events must not be lost (payments, checkouts). Fail-soft:
 * telemetry must never break the request.
 */
export async function flushPostHog(): Promise<void> {
  if (!posthogClient) return;
  try {
    await posthogClient.flush();
  } catch (err) {
    console.error("[posthog-server] flush failed", err);
  }
}

/**
 * Shutdown the PostHog client gracefully.
 * Call this when your server is shutting down.
 */
export async function shutdownPostHog(): Promise<void> {
  if (posthogClient) {
    await posthogClient.shutdown();
    posthogClient = null;
  }
}
